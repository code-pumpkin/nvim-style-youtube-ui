// ==UserScript==
// @name         YouTube NeoVim v4
// @namespace    youtube-nvim
// @version      4.0.0
// @description  Vim-style YouTube. Leader key (,) avoids Tridactyl conflicts. CSS-only overlays, no DOM reparenting.
// @author       codePumpkin
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const C = {
        bgDark: "#0b0e14", bgFloat: "#131721", border: "#1d222e",
        fg: "#bfbdb6", fgDim: "#565b66", fgDark: "#484d58",
        accent: "#e6b450", green: "#7fd962", red: "#d95757",
        yellow: "#ffb454", cyan: "#73b8ff", magenta: "#d2a6ff",
    };

    // ── State ──
    const state = {
        mode: "NORMAL",       // NORMAL | SEARCH | PANEL | LEADER
        panelOpen: null,      // "comments" | "recs" | "info" | "desc" | null
        leaderTimeout: null,
    };

    const panelClasses = {
        comments: "nvim-panel-comments",
        recs:     "nvim-panel-recs",
        info:     "nvim-panel-info",
        desc:     "nvim-panel-desc",
        chat:     "nvim-panel-chat",
    };

    const panelLabels = {
        comments: "COMMENTS",
        recs:     "RECOMMENDATIONS",
        info:     "INFO",
        desc:     "DESCRIPTION",
        chat:     "LIVE CHAT",
    };

    const panelScrollTargets = {
        comments: "#comments",
        recs:     "ytd-watch-flexy #secondary",
        info:     "#above-the-fold",
        desc:     "#above-the-fold",
        chat:     "ytd-live-chat-frame#chat",
    };

    // ── Helpers ──
    function isWatchPage() { return location.pathname === "/watch"; }
    function isSearchPage() { return location.pathname === "/results"; }
    function isChannelPage() {
        const p = location.pathname;
        return p.startsWith("/@") || p.startsWith("/channel/") || p.startsWith("/c/") || p.startsWith("/user/");
    }

    function isTyping() {
        const a = document.activeElement;
        if (!a) return false;
        const t = a.tagName.toLowerCase();
        return t === "input" || t === "textarea" || a.isContentEditable || a.id === "contenteditable-root";
    }

    function isLiveStream() {
        // Check for live chat frame
        if (document.querySelector("ytd-live-chat-frame#chat")) return true;
        // Check for live badge
        if (document.querySelector(".ytp-live-badge[disabled]")) return true;
        if (document.querySelector(".ytp-live")) return true;
        // Check for "watching now" text in view count
        const viewCount = document.querySelector("ytd-watch-flexy .view-count, ytd-watch-flexy #info-strings");
        if (viewCount && /watching/i.test(viewCount.textContent)) return true;
        return false;
    }

    // ── SPA-style home navigation (no page refresh) ──
    function navigateHome() {
        if (location.pathname === "/") { flash("Already home"); return; }
        // Use YouTube's SPA navigation by finding and clicking the logo,
        // or fall back to pushState + yt-navigate event
        const logo = document.querySelector("a#logo, ytd-topbar-logo-renderer a, a[href='/']");
        if (logo) {
            logo.click();
            return;
        }
        // Fallback: use YouTube's internal navigation via yt-navigate event
        const nav = new CustomEvent("yt-navigate", { detail: { endpoint: { browseEndpoint: { browseId: "FEwhat_to_watch" } } } });
        document.dispatchEvent(nav);
        // Double fallback: pushState
        if (location.pathname !== "/") {
            history.pushState({}, "", "/");
            window.dispatchEvent(new PopStateEvent("popstate"));
        }
    }

    // ── Panel toggle (CSS class only) ──
    function togglePanel(panel) {
        if (state.panelOpen === panel) {
            closePanel();
        } else {
            openPanel(panel);
        }
    }

    // ── Desc panel stats (views, likes, dislikes) ──
    function injectDescStats() {
        // Remove old stats bar if present
        const old = document.getElementById("nvim-desc-stats");
        if (old) old.remove();

        const stats = document.createElement("div");
        stats.id = "nvim-desc-stats";

        // Views — from the info strings or view count element
        let views = "";
        const infoStrings = document.querySelector("ytd-watch-flexy #info-strings yt-formatted-string");
        if (infoStrings) {
            views = infoStrings.textContent.trim();
        } else {
            const viewEl = document.querySelector("ytd-watch-flexy .view-count, ytd-watch-flexy ytd-video-view-count-renderer span");
            if (viewEl) views = viewEl.textContent.trim();
        }

        // Likes — from the like button's aria-label or text
        let likes = "";
        const likeBtn = document.querySelector('ytd-watch-flexy like-button-view-model button, ytd-watch-flexy #top-level-buttons-computed ytd-toggle-button-renderer:first-child button, ytd-watch-flexy button[aria-label*="like" i]');
        if (likeBtn) {
            const ariaLabel = likeBtn.getAttribute("aria-label") || "";
            // aria-label is usually like "like this video along with 1,234 other people"
            const match = ariaLabel.match(/([\d,\.]+)/);
            if (match) {
                likes = match[1];
            } else {
                // Try the text content of the button
                const txt = likeBtn.textContent.trim();
                if (/\d/.test(txt)) likes = txt;
            }
        }
        // Fallback: segmented like button
        if (!likes) {
            const segLike = document.querySelector('ytd-watch-flexy ytd-menu-renderer yt-formatted-string#text[aria-label*="like" i], ytd-watch-flexy segmented-like-dislike-button-view-model .yt-spec-button-shape-next__button-text-content');
            if (segLike && /\d/.test(segLike.textContent)) likes = segLike.textContent.trim();
        }

        // Dislikes — YouTube hides these, but Return YouTube Dislike extension exposes them
        let dislikes = "";
        const dislikeBtn = document.querySelector('ytd-watch-flexy #top-level-buttons-computed ytd-toggle-button-renderer:nth-child(2) button, ytd-watch-flexy dislike-button-view-model button');
        if (dislikeBtn) {
            const ariaLabel = dislikeBtn.getAttribute("aria-label") || "";
            const match = ariaLabel.match(/([\d,\.]+)/);
            if (match) dislikes = match[1];
            else {
                const txt = dislikeBtn.textContent.trim();
                if (/\d/.test(txt)) dislikes = txt;
            }
        }
        // Fallback: RYD extension span
        if (!dislikes) {
            const ryd = document.querySelector("#return-youtube-dislike-number, .ryd-tooltip");
            if (ryd && /\d/.test(ryd.textContent)) dislikes = ryd.textContent.trim();
        }

        // Upload date
        let date = "";
        const dateEl = document.querySelector("ytd-watch-flexy #info-strings yt-formatted-string:last-child, ytd-watch-flexy ytd-video-primary-info-renderer .date");
        if (dateEl) {
            const txt = dateEl.textContent.trim();
            if (txt !== views) date = txt; // avoid duplicating views text
        }

        // Build the stats bar
        const parts = [];
        if (views) parts.push(`<span class="nvim-stat-views nvim-stat-value">${esc(views)}</span>`);
        if (likes) parts.push(`<span><span class="nvim-stat-likes nvim-stat-value">${esc(likes)}</span> likes</span>`);
        if (dislikes) parts.push(`<span><span class="nvim-stat-dislikes nvim-stat-value">${esc(dislikes)}</span> dislikes</span>`);
        if (date && date !== views) parts.push(`<span class="nvim-stat-date nvim-stat-value">${esc(date)}</span>`);

        if (parts.length === 0) {
            parts.push(`<span style="color:${C.fgDim}">stats unavailable</span>`);
        }

        stats.innerHTML = parts.join('<span style="color:' + C.fgDark + '">│</span>');

        // Insert at top of #above-the-fold (the desc overlay container)
        // Wait a tick for the panel CSS to take effect
        setTimeout(() => {
            const container = document.querySelector("ytd-watch-flexy #above-the-fold");
            if (container) {
                container.insertBefore(stats, container.firstChild);
            }
        }, 100);
    }

    function openPanel(panel) {
        // Close any existing panel first
        if (state.panelOpen) {
            closePanel();
        }

        // Live chat: check if it exists
        if (panel === "chat") {
            const chatFrame = document.querySelector("ytd-live-chat-frame#chat");
            if (!chatFrame) { flash("No live chat on this video"); return; }
        }

        document.body.classList.add(panelClasses[panel]);
        state.panelOpen = panel;
        state.mode = "PANEL";

        // For recs panel, nudge YouTube to refresh recommendations
        if (panel === "recs") {
            setTimeout(() => {
                const secondary = document.querySelector("ytd-watch-flexy #secondary");
                if (secondary) {
                    // Trigger a resize event so YouTube's IntersectionObserver re-evaluates
                    window.dispatchEvent(new Event("resize"));
                    // Also try to poke the continuation renderer to load fresh data
                    const contItems = secondary.querySelector("ytd-watch-next-secondary-results-renderer #items");
                    if (contItems && contItems.children.length === 0) {
                        // If empty, scroll the secondary into view briefly to trigger lazy load
                        secondary.scrollIntoView({ block: "nearest" });
                    }
                }
            }, 100);
        }

        // For desc panel, inject stats and force expand the description
        if (panel === "desc") {
            injectDescStats();
            // The panel is now visible via CSS class. Wait a tick, then expand.
            setTimeout(() => {
                // Try setting the attribute first
                const expander = document.querySelector("ytd-text-inline-expander");
                if (expander) {
                    expander.setAttribute("is-expanded", "");
                    expander.setAttribute("can-toggle", "");
                }
                // Then try clicking the expand button (now visible in the overlay)
                const btn = document.querySelector("#expand, tp-yt-paper-button#expand, [slot='expand-button']");
                if (btn) try { btn.click(); } catch (_) {}

                // Also try the structured-description expand
                const descExpand = document.querySelector("ytd-structured-description-content-renderer #expand");
                if (descExpand) try { descExpand.click(); } catch (_) {}

                // Force the truncated snippet to show full text
                const snippet = document.querySelector("ytd-text-inline-expander #snippet");
                const plain = document.querySelector("ytd-text-inline-expander #plain-snippet-text");
                if (snippet) snippet.style.cssText = "display:none!important";
                if (plain) plain.style.cssText = "display:block!important;max-height:none!important;overflow:visible!important;-webkit-line-clamp:unset!important";

                // Fallback: find the attributed string with full text
                const allStrings = document.querySelectorAll("ytd-text-inline-expander yt-attributed-string, ytd-text-inline-expander yt-formatted-string");
                allStrings.forEach(s => {
                    s.style.cssText = "display:block!important;max-height:none!important;overflow:visible!important;-webkit-line-clamp:unset!important";
                });
            }, 200);
        }

        updateStatusBar();
    }

    // ── Ask (YouChat) panel — removed, work in progress ──

    function closePanel() {
        if (state.panelOpen) {
            document.body.classList.remove(panelClasses[state.panelOpen]);
            // Clean up desc stats bar
            if (state.panelOpen === "desc") {
                const stats = document.getElementById("nvim-desc-stats");
                if (stats) stats.remove();
            }
        }
        state.panelOpen = null;
        state.mode = "NORMAL";
        updateStatusBar();
    }

    function scrollPanel(dir) {
        if (!state.panelOpen) return;
        const sel = panelScrollTargets[state.panelOpen];
        if (!sel) return;
        const el = document.querySelector(sel);
        if (el) {
            el.scrollBy({ top: dir === "down" ? 200 : -200, behavior: "smooth" });
        }
    }

    // ── Search overlay with YouTube suggestions ──
    let searchOverlay, searchInput, suggestionsBox;
    let suggestDebounce = null;

    function createSearchOverlay() {
        searchOverlay = document.createElement("div");
        searchOverlay.id = "nvim-search-overlay";
        Object.assign(searchOverlay.style, {
            position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
            background: "rgba(0,0,0,0.88)", zIndex: "1000000",
            display: "none", alignItems: "flex-start", justifyContent: "center", paddingTop: "25vh",
        });

        const container = document.createElement("div");
        Object.assign(container.style, { display: "flex", flexDirection: "column", width: "60%", maxWidth: "700px" });

        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display: "flex", alignItems: "center", width: "100%" });

        const pfx = document.createElement("span");
        pfx.textContent = "/";
        Object.assign(pfx.style, {
            color: C.yellow, fontFamily: '"JetBrains Mono",monospace', fontSize: "22px", marginRight: "8px",
        });

        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "search youtube...";
        Object.assign(searchInput.style, {
            flex: "1", background: C.bgFloat, border: "none",
            borderBottom: `2px solid ${C.accent}`, color: C.fg,
            fontFamily: '"JetBrains Mono",monospace', fontSize: "18px",
            padding: "10px 4px", outline: "none",
        });

        suggestionsBox = document.createElement("div");
        suggestionsBox.id = "nvim-suggestions";
        Object.assign(suggestionsBox.style, {
            width: "100%", background: C.bgFloat, marginTop: "2px",
            maxHeight: "40vh", overflowY: "auto", display: "none",
            border: `1px solid ${C.border}`, borderTop: "none",
        });

        searchInput.addEventListener("keydown", (e) => {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                const selected = suggestionsBox.querySelector(".nvim-suggest-selected");
                const q = selected ? selected.dataset.query : searchInput.value.trim();
                if (q) location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
                closeSearch();
            } else if (e.key === "Escape") {
                e.preventDefault();
                closeSearch();
            } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                moveSuggestion(1);
            } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
                e.preventDefault();
                moveSuggestion(-1);
            }
        });

        searchInput.addEventListener("input", () => {
            clearTimeout(suggestDebounce);
            suggestDebounce = setTimeout(() => fetchSuggestions(searchInput.value.trim()), 150);
        });

        wrap.append(pfx, searchInput);
        container.append(wrap, suggestionsBox);
        searchOverlay.appendChild(container);
        searchOverlay.addEventListener("click", (e) => { if (e.target === searchOverlay) closeSearch(); });
        document.body.appendChild(searchOverlay);
    }

    function fetchSuggestions(query) {
        if (!query) { suggestionsBox.style.display = "none"; return; }

        // YouTube's public suggestion API (JSONP-style, returns array)
        const script = document.createElement("script");
        const cbName = "_nvimSuggestCb" + Date.now();
        window[cbName] = (data) => {
            delete window[cbName];
            script.remove();
            if (!data || !data[1]) return;
            renderSuggestions(data[1], query);
        };
        script.src = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&callback=${cbName}`;
        document.head.appendChild(script);

        // Cleanup if it takes too long
        setTimeout(() => { if (window[cbName]) { delete window[cbName]; script.remove(); } }, 3000);
    }

    function renderSuggestions(items, query) {
        suggestionsBox.innerHTML = "";
        if (!items.length) { suggestionsBox.style.display = "none"; return; }

        items.forEach((item, idx) => {
            const text = Array.isArray(item) ? item[0] : String(item);
            const div = document.createElement("div");
            div.className = "nvim-suggest-item";
            div.dataset.query = text;
            Object.assign(div.style, {
                padding: "8px 12px", cursor: "pointer",
                fontFamily: '"JetBrains Mono",monospace', fontSize: "14px",
                color: C.fg, borderBottom: `1px solid ${C.border}`,
                transition: "background 0.1s",
            });

            // Highlight matching part
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            const matchIdx = lowerText.indexOf(lowerQuery);
            if (matchIdx >= 0) {
                const before = text.slice(0, matchIdx);
                const match = text.slice(matchIdx, matchIdx + query.length);
                const after = text.slice(matchIdx + query.length);
                div.innerHTML = `${esc(before)}<span style="color:${C.accent};font-weight:bold">${esc(match)}</span>${esc(after)}`;
            } else {
                div.textContent = text;
            }

            div.addEventListener("mouseenter", () => {
                clearSuggestionSelection();
                div.classList.add("nvim-suggest-selected");
                div.style.background = C.bgHover || "#1a1e29";
                div.style.color = C.accent;
            });
            div.addEventListener("mouseleave", () => {
                div.classList.remove("nvim-suggest-selected");
                div.style.background = "transparent";
                div.style.color = C.fg;
            });
            div.addEventListener("click", () => {
                location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`;
                closeSearch();
            });

            suggestionsBox.appendChild(div);
        });

        suggestionsBox.style.display = "block";
    }

    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    function clearSuggestionSelection() {
        suggestionsBox.querySelectorAll(".nvim-suggest-selected").forEach(el => {
            el.classList.remove("nvim-suggest-selected");
            el.style.background = "transparent";
            el.style.color = C.fg;
        });
    }

    function moveSuggestion(dir) {
        const items = Array.from(suggestionsBox.querySelectorAll(".nvim-suggest-item"));
        if (!items.length) return;
        const current = suggestionsBox.querySelector(".nvim-suggest-selected");
        let idx = current ? items.indexOf(current) : -1;
        clearSuggestionSelection();
        idx += dir;
        if (idx < 0) idx = items.length - 1;
        if (idx >= items.length) idx = 0;
        items[idx].classList.add("nvim-suggest-selected");
        items[idx].style.background = "#1a1e29";
        items[idx].style.color = C.accent;
        items[idx].scrollIntoView({ block: "nearest" });
        // Update input to show selected suggestion
        searchInput.value = items[idx].dataset.query;
    }

    function openSearch() {
        if (state.panelOpen) closePanel();
        state.mode = "SEARCH";
        searchOverlay.style.display = "flex";
        searchInput.value = "";
        searchInput.focus();
        updateStatusBar();
    }

    function closeSearch() {
        state.mode = "NORMAL";
        searchOverlay.style.display = "none";
        searchInput.blur();
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "none";
        clearTimeout(suggestDebounce);
        updateStatusBar();
    }

    // ── Status bar ──
    let statusBar, statusMode, statusHints, statusRight;

    function createStatusBar() {
        document.body.classList.add("nvim-js-active");

        statusBar = document.createElement("div");
        statusBar.id = "nvim-statusbar";
        Object.assign(statusBar.style, {
            position: "fixed", bottom: "0", left: "0", right: "0",
            height: "26px", lineHeight: "26px", background: C.bgDark,
            color: C.accent, fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace',
            fontSize: "12px", padding: "0 12px", zIndex: "999999",
            borderTop: `1px solid ${C.border}`, display: "flex",
            justifyContent: "space-between", alignItems: "center", userSelect: "none",
        });

        statusMode = document.createElement("span");
        statusMode.style.fontWeight = "bold";
        statusHints = document.createElement("span");
        statusHints.style.color = C.fgDim;
        statusHints.style.fontSize = "11px";
        statusRight = document.createElement("span");
        statusRight.style.color = C.fgDark;
        statusRight.style.fontSize = "11px";

        statusBar.append(statusMode, statusHints, statusRight);
        document.body.appendChild(statusBar);
        updateStatusBar();
    }

    function updateStatusBar() {
        if (!statusBar) return;
        const colors = { NORMAL: C.green, SEARCH: C.yellow, PANEL: C.magenta, LEADER: C.accent };

        statusMode.textContent = ` -- ${state.mode} -- `;
        statusMode.style.color = C.bgDark;
        statusMode.style.background = colors[state.mode] || C.accent;
        statusMode.style.padding = "0 8px";
        statusMode.style.marginRight = "12px";

        if (state.mode === "LEADER") {
            const live = isLiveStream() ? " | l chat" : "";
            statusHints.textContent = `c comm | e recs | q desc | i info${live} | , search`;
        } else if (state.mode === "PANEL") {
            statusHints.textContent = "Ctrl+j/k scroll | Esc or , close | ,, search";
        } else if (isWatchPage()) {
            statusHints.textContent = ", leader | \\ back | H home";
        } else if (isChannelPage()) {
            statusHints.textContent = "1 vids | 2 lists | 3 live | 4 home | , leader | \\ back | H home";
        } else {
            statusHints.textContent = ", leader | \\ back | H home";
        }

        let page = "HOME";
        if (isWatchPage()) page = "WATCH";
        else if (isSearchPage()) {
            const q = new URLSearchParams(location.search).get("search_query");
            page = q ? `SEARCH: ${q}` : "SEARCH";
        } else if (isChannelPage()) page = "CHANNEL";

        const panel = state.panelOpen ? ` | ${panelLabels[state.panelOpen]}` : "";
        statusRight.textContent = `${page}${panel}`;
    }

    function flash(msg) {
        if (!statusHints) return;
        const prev = statusHints.style.color;
        statusHints.textContent = msg;
        statusHints.style.color = C.red;
        setTimeout(() => { statusHints.style.color = prev; updateStatusBar(); }, 2000);
    }

    // ── Channel tabs ──
    const channelTabs = { "1": "Videos", "2": "Playlists", "3": "Live", "4": "Home" };

    function clickChannelTab(tabTitle) {
        const tabs = document.querySelectorAll("yt-tab-shape");
        for (const t of tabs) {
            const title = (t.getAttribute("tab-title") || t.textContent || "").trim();
            if (title.toLowerCase() === tabTitle.toLowerCase()) {
                const inner = t.querySelector(".yt-tab-shape__tab, [role='tab']") || t;
                inner.click();
                flash(`Tab: ${title}`);
                return;
            }
        }
        // Legacy paper tabs
        const paperTabs = document.querySelectorAll("tp-yt-paper-tab");
        for (const pt of paperTabs) {
            if (pt.textContent.trim().toLowerCase() === tabTitle.toLowerCase()) {
                pt.click(); flash(`Tab: ${tabTitle}`); return;
            }
        }
        flash(`Tab "${tabTitle}" not found`);
    }

    // ── Leader key handler ──
    function enterLeader() {
        // If a panel is open, first comma closes it instead of entering leader
        if (state.panelOpen) {
            closePanel();
            return;
        }
        state.mode = "LEADER";
        updateStatusBar();
        // Timeout: if no second key in 1.5s, cancel
        state.leaderTimeout = setTimeout(() => {
            if (state.mode === "LEADER") {
                state.mode = "NORMAL";
                updateStatusBar();
            }
        }, 1500);
    }

    function handleLeaderKey(key) {
        clearTimeout(state.leaderTimeout);

        if (isWatchPage()) {
            switch (key) {
                case "c": togglePanel("comments"); return true;
                case "e": togglePanel("recs"); return true;
                case "q": togglePanel("desc"); return true;
                case "i": togglePanel("info"); return true;
                case "l":
                    if (isLiveStream()) { togglePanel("chat"); }
                    else { flash("Not a live stream"); }
                    return true;
            }
        }

        if (key === ",") { openSearch(); return true; }

        // No match — back to previous mode
        state.mode = state.panelOpen ? "PANEL" : "NORMAL";
        updateStatusBar();
        return false;
    }

    // ── Main keydown ──
    function handleKeydown(e) {
        // Never intercept when typing in inputs
        if (isTyping() && state.mode !== "SEARCH") return;
        
        const key = e.key;
        
        // In SEARCH mode: allow comma to close if search input is not focused
        if (state.mode === "SEARCH") {
            if (key === "," && document.activeElement !== searchInput) {
                e.preventDefault();
                e.stopImmediatePropagation();
                closeSearch();
                return;
            }
            return; // search input handles its own keys
        }

        // Watch page: block j/l/k/h FIRST — YouTube's defaults cause layout shifts
        if (isWatchPage() && !e.ctrlKey && !e.altKey && !e.metaKey &&
            (key === "j" || key === "l" || key === "k" || key === "h")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }

        // Leader mode: waiting for second key
        if (state.mode === "LEADER") {
            e.preventDefault();
            e.stopImmediatePropagation();
            handleLeaderKey(key);
            return;
        }

        // Escape: close panel or do nothing
        if (key === "Escape") {
            if (state.panelOpen) {
                e.preventDefault();
                e.stopImmediatePropagation();
                closePanel();
            }
            return;
        }

        // Panel mode: Ctrl+j/k to scroll
        if (state.mode === "PANEL" && e.ctrlKey) {
            if (key === "j" || key === "k") {
                e.preventDefault();
                e.stopImmediatePropagation();
                scrollPanel(key === "j" ? "down" : "up");
                return;
            }
        }

        // Don't intercept modified keys (let Tridactyl handle them)
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // Comma = leader key
        if (key === ",") {
            e.preventDefault();
            e.stopImmediatePropagation();
            enterLeader();
            return;
        }

        // Backslash = go back (previous page)
        if (key === "\\") {
            e.preventDefault();
            e.stopImmediatePropagation();
            history.back();
            return;
        }

        // H = SPA-style home (no page refresh, like clicking YouTube logo)
        if (key === "H") {
            e.preventDefault();
            e.stopImmediatePropagation();
            navigateHome();
            return;
        }

        // Channel page: 1-4 switch tabs
        if (isChannelPage() && channelTabs[key]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            clickChannelTab(channelTabs[key]);
            return;
        }

        // Everything else: let Tridactyl handle it
    }

    // ── SPA navigation ──
    function onNavigate() {
        if (state.panelOpen) closePanel();
        if (state.mode === "SEARCH") closeSearch();
        state.mode = "NORMAL";
        updateStatusBar();
        // Inject search title if on search page
        setTimeout(injectSearchTitle, 300);
    }

    // ── Search page title banner ──
    function injectSearchTitle() {
        // Remove old one
        const old = document.getElementById("nvim-search-title");
        if (old) old.remove();

        if (!isSearchPage()) return;
        const q = new URLSearchParams(location.search).get("search_query");
        if (!q) return;

        const banner = document.createElement("div");
        banner.id = "nvim-search-title";
        Object.assign(banner.style, {
            width: "100%", padding: "12px 16px", boxSizing: "border-box",
            background: C.bgDark, borderBottom: `1px solid ${C.border}`,
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
            fontSize: "14px", color: C.fgDim, userSelect: "none",
            display: "flex", alignItems: "center", gap: "8px",
        });

        const icon = document.createElement("span");
        icon.textContent = "/";
        Object.assign(icon.style, { color: C.yellow, fontSize: "16px", fontWeight: "bold" });

        const text = document.createElement("span");
        text.textContent = q;
        Object.assign(text.style, { color: C.accent, fontWeight: "bold" });

        const count = document.createElement("span");
        Object.assign(count.style, { color: C.fgDark, fontSize: "11px", marginLeft: "auto" });
        // Count results after a short delay
        setTimeout(() => {
            const results = document.querySelectorAll("ytd-search ytd-video-renderer");
            count.textContent = `${results.length} results`;
        }, 1000);

        banner.append(icon, text, count);

        // Insert at top of search results
        const target = document.querySelector("ytd-search ytd-section-list-renderer #contents")
            || document.querySelector("ytd-search #page-manager");
        if (target) {
            target.insertBefore(banner, target.firstChild);
        }
    }

    // ── Init ──
    function init() {
        createStatusBar();
        createSearchOverlay();

        // Block jklh on watch page across all key event types
        function blockWatchKeys(e) {
            if (isTyping()) return;
            if (isWatchPage() && !e.ctrlKey && !e.altKey && !e.metaKey &&
                (e.key === "j" || e.key === "l" || e.key === "k" || e.key === "h")) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }

        window.addEventListener("keydown", handleKeydown, true);
        document.addEventListener("keydown", handleKeydown, true);
        window.addEventListener("keyup", blockWatchKeys, true);
        document.addEventListener("keyup", blockWatchKeys, true);
        window.addEventListener("keypress", blockWatchKeys, true);
        document.addEventListener("keypress", blockWatchKeys, true);

        window.addEventListener("yt-navigate-finish", onNavigate);

        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) { lastUrl = location.href; onNavigate(); }
        }).observe(document.body, { childList: true, subtree: true });

        // Initial check for search page
        setTimeout(injectSearchTitle, 500);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
