// ==UserScript==
// @name         YouTube Minimal v6
// @namespace    youtube-nvim
// @version      6.0.0
// @description  Distraction-free YouTube. Single bar, merged panels, fluid UX.
// @author       codePumpkin
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const C = {
        bgDark: "#0b0e14", bgFloat: "#131721", border: "#1d222e", bgHover: "#1a1e29",
        fg: "#bfbdb6", fgDim: "#565b66", fgDark: "#484d58",
        accent: "#e6b450", green: "#7fd962", red: "#d95757",
        yellow: "#ffb454", cyan: "#73b8ff", magenta: "#d2a6ff",
    };

    const BAR_H = 32;

    const state = {
        mode: "NORMAL",       // NORMAL | SEARCH | PANEL | LEADER
        panelOpen: null,      // "comments" | "recs" | "details" | "chat" | null
        leaderTimeout: null,
    };

    const panelClasses = {
        comments: "nvim-panel-comments",
        recs:     "nvim-panel-recs",
        details:  "nvim-panel-details",
        chat:     "nvim-panel-chat",
    };

    const panelLabels = {
        comments: "COMMENTS",
        recs:     "RECOMMENDATIONS",
        details:  "DETAILS",
        chat:     "LIVE CHAT",
    };

    const panelScrollTargets = {
        comments: "ytd-watch-flexy #comments",
        recs:     "ytd-watch-flexy #secondary",
        details:  "ytd-watch-flexy #above-the-fold",
        chat:     "ytd-live-chat-frame#chat",
    };

    // ── Helpers ──
    const isWatch   = () => location.pathname === "/watch";
    const isSearch  = () => location.pathname === "/results";
    const isChannel = () => /^\/((@|channel\/|c\/|user\/).+)/.test(location.pathname);

    function isTyping() {
        const a = document.activeElement;
        if (!a) return false;
        const t = a.tagName.toLowerCase();
        return t === "input" || t === "textarea" || a.isContentEditable || a.id === "contenteditable-root";
    }

    function isLive() {
        if (document.querySelector("ytd-live-chat-frame#chat")) return true;
        if (document.querySelector(".ytp-live-badge[disabled], .ytp-live")) return true;
        return false;
    }

    function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

    // ── Navigation ──
    function goHome() {
        if (location.pathname === "/") { flash("already home"); return; }
        const logo = document.querySelector("a#logo, ytd-topbar-logo-renderer a, a[href='/']");
        if (logo) { logo.click(); return; }
        history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
    }

    // ── Stats injection for details panel ──
    function injectStats() {
        document.getElementById("nvim-stats")?.remove();
        const bar = document.createElement("div");
        bar.id = "nvim-stats";

        const get = (sel) => document.querySelector(sel)?.textContent?.trim() || "";

        let views = get("ytd-watch-flexy #info-strings yt-formatted-string");
        let date  = get("ytd-watch-flexy #info-strings yt-formatted-string:last-child");
        if (date === views) date = "";

        let likes = "";
        const likeBtn = document.querySelector("ytd-watch-flexy like-button-view-model button, ytd-watch-flexy button[aria-label*='like' i]");
        if (likeBtn) {
            const m = (likeBtn.getAttribute("aria-label") || "").match(/([\d,]+)/);
            likes = m ? m[1] : ((/\d/.test(likeBtn.textContent)) ? likeBtn.textContent.trim() : "");
        }

        let dislikes = "";
        const disBtn = document.querySelector("ytd-watch-flexy dislike-button-view-model button, #return-youtube-dislike-number");
        if (disBtn) {
            const m = (disBtn.getAttribute("aria-label") || "").match(/([\d,]+)/);
            dislikes = m ? m[1] : ((/\d/.test(disBtn.textContent)) ? disBtn.textContent.trim() : "");
        }

        const parts = [];
        if (views)    parts.push(`<span class="views v">${esc(views)}</span>`);
        if (likes)    parts.push(`<span class="likes v">${esc(likes)} 👍</span>`);
        if (dislikes) parts.push(`<span class="dislikes v">${esc(dislikes)} 👎</span>`);
        if (date)     parts.push(`<span class="date v">${esc(date)}</span>`);
        if (!parts.length) parts.push(`<span style="color:${C.fgDim}">stats unavailable</span>`);

        bar.innerHTML = parts.join(`<span style="color:${C.fgDark}"> │ </span>`);

        setTimeout(() => {
            const container = document.querySelector("ytd-watch-flexy #above-the-fold");
            if (container) container.insertBefore(bar, container.firstChild);
        }, 80);
    }

    // ── Panel open/close ──
    function openPanel(panel) {
        if (state.panelOpen) closePanel();

        if (panel === "chat" && !document.querySelector("ytd-live-chat-frame#chat")) {
            flash("no live chat here"); return;
        }

        document.body.classList.add(panelClasses[panel]);
        state.panelOpen = panel;
        state.mode = "PANEL";

        if (panel === "recs") {
            setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
        }

        if (panel === "details") {
            injectStats();
            setTimeout(() => {
                // Force expand description
                const expander = document.querySelector("ytd-text-inline-expander");
                if (expander) expander.setAttribute("is-expanded", "");
                document.querySelector("#expand, [slot='expand-button']")?.click();
            }, 150);
        }

        updateBar();
    }

    function closePanel() {
        if (!state.panelOpen) return;
        document.body.classList.remove(panelClasses[state.panelOpen]);
        if (state.panelOpen === "details") document.getElementById("nvim-stats")?.remove();
        state.panelOpen = null;
        state.mode = "NORMAL";
        updateBar();
    }

    function togglePanel(panel) {
        state.panelOpen === panel ? closePanel() : openPanel(panel);
    }

    function scrollPanel(dir) {
        if (!state.panelOpen) return;
        document.querySelector(panelScrollTargets[state.panelOpen])
            ?.scrollBy({ top: dir === "down" ? 220 : -220, behavior: "smooth" });
    }

    // ── Search overlay ──
    let searchOverlay, searchInput, suggestBox, suggestDebounce;

    function buildSearch() {
        searchOverlay = document.createElement("div");
        searchOverlay.id = "nvim-search-overlay";
        Object.assign(searchOverlay.style, {
            position:"fixed", inset:"0", background:"rgba(0,0,0,0.88)",
            zIndex:"1000000", display:"none", alignItems:"flex-start",
            justifyContent:"center", paddingTop:"25vh",
        });

        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display:"flex", flexDirection:"column", width:"60%", maxWidth:"700px" });

        const row = document.createElement("div");
        Object.assign(row.style, { display:"flex", alignItems:"center" });

        const slash = document.createElement("span");
        slash.textContent = "/";
        Object.assign(slash.style, { color:C.yellow, fontFamily:'"JetBrains Mono",monospace', fontSize:"22px", marginRight:"8px" });

        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "search youtube...";
        Object.assign(searchInput.style, {
            flex:"1", background:C.bgFloat, border:"none",
            borderBottom:`2px solid ${C.accent}`, color:C.fg,
            fontFamily:'"JetBrains Mono",monospace', fontSize:"18px",
            padding:"10px 4px", outline:"none",
        });

        suggestBox = document.createElement("div");
        Object.assign(suggestBox.style, {
            width:"100%", background:C.bgFloat, marginTop:"2px",
            maxHeight:"40vh", overflowY:"auto", display:"none",
            border:`1px solid ${C.border}`, borderTop:"none",
        });

        searchInput.addEventListener("keydown", e => {
            e.stopImmediatePropagation();
            if (e.key === "Enter") {
                const sel = suggestBox.querySelector(".sel");
                const q = sel ? sel.dataset.q : searchInput.value.trim();
                if (q) location.href = `/results?search_query=${encodeURIComponent(q)}`;
                closeSearch();
            } else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
            else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); moveSuggest(1); }
            else if (e.key === "ArrowUp"   || (e.key === "Tab" && e.shiftKey))  { e.preventDefault(); moveSuggest(-1); }
        });

        searchInput.addEventListener("input", () => {
            clearTimeout(suggestDebounce);
            suggestDebounce = setTimeout(() => fetchSuggest(searchInput.value.trim()), 150);
        });

        row.append(slash, searchInput);
        wrap.append(row, suggestBox);
        searchOverlay.appendChild(wrap);
        searchOverlay.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
        document.body.appendChild(searchOverlay);
    }

    function fetchSuggest(q) {
        if (!q) { suggestBox.style.display = "none"; return; }
        const cb = "_ys" + Date.now();
        const s = document.createElement("script");
        window[cb] = data => {
            delete window[cb]; s.remove();
            if (data?.[1]) renderSuggest(data[1], q);
        };
        s.src = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&callback=${cb}`;
        document.head.appendChild(s);
        setTimeout(() => { if (window[cb]) { delete window[cb]; s.remove(); } }, 3000);
    }

    function renderSuggest(items, q) {
        suggestBox.innerHTML = "";
        if (!items.length) { suggestBox.style.display = "none"; return; }
        items.forEach(item => {
            const text = Array.isArray(item) ? item[0] : String(item);
            const div = document.createElement("div");
            div.dataset.q = text;
            Object.assign(div.style, {
                padding:"8px 12px", cursor:"pointer",
                fontFamily:'"JetBrains Mono",monospace', fontSize:"13px",
                color:C.fg, borderBottom:`1px solid ${C.border}`,
            });
            const lo = text.toLowerCase(), lq = q.toLowerCase(), mi = lo.indexOf(lq);
            div.innerHTML = mi >= 0
                ? `${esc(text.slice(0,mi))}<span style="color:${C.accent};font-weight:bold">${esc(text.slice(mi,mi+q.length))}</span>${esc(text.slice(mi+q.length))}`
                : esc(text);
            div.addEventListener("mouseenter", () => { clearSel(); div.classList.add("sel"); div.style.background=C.bgHover; div.style.color=C.accent; });
            div.addEventListener("mouseleave", () => { div.classList.remove("sel"); div.style.background="transparent"; div.style.color=C.fg; });
            div.addEventListener("click", () => { location.href=`/results?search_query=${encodeURIComponent(text)}`; closeSearch(); });
            suggestBox.appendChild(div);
        });
        suggestBox.style.display = "block";
    }

    function clearSel() {
        suggestBox.querySelectorAll(".sel").forEach(el => {
            el.classList.remove("sel"); el.style.background="transparent"; el.style.color=C.fg;
        });
    }

    function moveSuggest(dir) {
        const items = [...suggestBox.querySelectorAll("div")];
        if (!items.length) return;
        const cur = suggestBox.querySelector(".sel");
        let idx = cur ? items.indexOf(cur) : -1;
        clearSel();
        idx = (idx + dir + items.length) % items.length;
        items[idx].classList.add("sel");
        items[idx].style.background = C.bgHover;
        items[idx].style.color = C.accent;
        items[idx].scrollIntoView({ block:"nearest" });
        searchInput.value = items[idx].dataset.q;
    }

    function openSearch() {
        if (state.panelOpen) closePanel();
        state.mode = "SEARCH";
        searchOverlay.style.display = "flex";
        searchInput.value = "";
        searchInput.focus();
        updateBar();
    }

    function closeSearch() {
        state.mode = "NORMAL";
        searchOverlay.style.display = "none";
        searchInput.blur();
        suggestBox.innerHTML = "";
        suggestBox.style.display = "none";
        clearTimeout(suggestDebounce);
        updateBar();
    }

    // ── Single status bar ──
    let bar, barMode, barHints, barRight;

    function buildBar() {
        document.body.classList.add("nvim-js-active");

        bar = document.createElement("div");
        bar.id = "nvim-bar";
        Object.assign(bar.style, {
            position:"fixed", bottom:"0", left:"0", right:"0",
            height:`${BAR_H}px`, lineHeight:`${BAR_H}px`,
            background:C.bgDark, fontFamily:'"JetBrains Mono","Fira Code",monospace',
            fontSize:"11px", padding:"0 10px", zIndex:"999999",
            borderTop:`1px solid ${C.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center",
            userSelect:"none",
        });

        barMode = document.createElement("span");
        Object.assign(barMode.style, { fontWeight:"bold", marginRight:"10px", padding:"2px 8px", fontSize:"11px" });

        barHints = document.createElement("span");
        Object.assign(barHints.style, { color:C.fgDim, flex:"1" });

        // Clickable buttons on the right side of the bar
        const btns = document.createElement("div");
        Object.assign(btns.style, { display:"flex", gap:"0", height:"100%", marginLeft:"8px" });

        const barButtons = [
            { label:"DETAILS", action:() => isWatch() && togglePanel("details"), color:C.accent },
            { label:"RECS",    action:() => isWatch() && togglePanel("recs"),    color:C.cyan   },
            { label:"COMM",    action:() => isWatch() && togglePanel("comments"),color:C.magenta},
            { label:"SEARCH",  action:() => openSearch(),                        color:C.yellow },
            { label:"HOME",    action:() => goHome(),                            color:C.fg     },
            { label:"BACK",    action:() => history.back(),                      color:C.fgDim  },
        ];

        barButtons.forEach(({ label, action, color }) => {
            const b = document.createElement("button");
            b.textContent = label;
            b.dataset.label = label;
            Object.assign(b.style, {
                background:"transparent", border:"none",
                borderLeft:`1px solid ${C.border}`,
                color, fontFamily:'"JetBrains Mono",monospace',
                fontSize:"10px", padding:"0 10px", cursor:"pointer",
                height:"100%", transition:"background 0.12s",
            });
            b.addEventListener("mouseenter", () => b.style.background = C.bgHover);
            b.addEventListener("mouseleave", () => b.style.background = "transparent");
            b.addEventListener("click", e => { e.preventDefault(); action(); });
            btns.appendChild(b);
        });

        barRight = document.createElement("span");
        Object.assign(barRight.style, { color:C.fgDark, fontSize:"10px", marginLeft:"8px", whiteSpace:"nowrap" });

        bar.append(barMode, barHints, btns, barRight);
        document.body.appendChild(bar);
        updateBar();
    }

    const modeColors = { NORMAL:C.green, SEARCH:C.yellow, PANEL:C.magenta, LEADER:C.accent };

    function updateBar() {
        if (!bar) return;

        barMode.textContent = state.mode;
        barMode.style.color = C.bgDark;
        barMode.style.background = modeColors[state.mode] || C.accent;

        if (state.mode === "LEADER") {
            barHints.textContent = `c comm  e recs  d details${isLive() ? "  l chat" : ""}  , search`;
        } else if (state.mode === "PANEL") {
            barHints.textContent = "Ctrl+j/k scroll  Esc close";
        } else if (isChannel()) {
            barHints.textContent = "1 videos  2 playlists  3 live  4 home  , leader";
        } else if (isWatch()) {
            barHints.textContent = ", leader  \\ back  H home";
        } else {
            barHints.textContent = ", leader  \\ back  H home";
        }

        // Dim watch-only buttons when not on watch page
        bar.querySelectorAll("button").forEach(b => {
            const watchOnly = ["DETAILS","RECS","COMM"].includes(b.dataset.label);
            b.style.opacity = (watchOnly && !isWatch()) ? "0.3" : "1";
            b.style.pointerEvents = (watchOnly && !isWatch()) ? "none" : "auto";
        });

        // Bold active panel button
        bar.querySelectorAll("button").forEach(b => b.style.fontWeight = "normal");
        const activeMap = { details:"DETAILS", recs:"RECS", comments:"COMM" };
        if (state.panelOpen && activeMap[state.panelOpen]) {
            const ab = [...bar.querySelectorAll("button")].find(b => b.dataset.label === activeMap[state.panelOpen]);
            if (ab) { ab.style.fontWeight = "bold"; ab.style.color = C.accent; }
        }

        let page = "HOME";
        if (isWatch()) page = "WATCH";
        else if (isSearch()) {
            const q = new URLSearchParams(location.search).get("search_query");
            page = q ? `/ ${q}` : "SEARCH";
        } else if (isChannel()) page = "CHANNEL";

        barRight.textContent = state.panelOpen ? `${page} › ${panelLabels[state.panelOpen]}` : page;
    }

    function flash(msg) {
        if (!barHints) return;
        const prev = barHints.textContent;
        barHints.textContent = msg;
        barHints.style.color = C.red;
        setTimeout(() => { barHints.style.color = C.fgDim; updateBar(); }, 2000);
    }

    // ── Channel tabs ──
    const tabMap = { "1":"Videos", "2":"Playlists", "3":"Live", "4":"Home" };

    function clickTab(title) {
        for (const t of document.querySelectorAll("yt-tab-shape")) {
            if ((t.getAttribute("tab-title") || t.textContent).trim().toLowerCase() === title.toLowerCase()) {
                (t.querySelector(".yt-tab-shape__tab, [role='tab']") || t).click();
                flash(`→ ${title}`); return;
            }
        }
        flash(`tab "${title}" not found`);
    }

    // ── Leader ──
    function enterLeader() {
        if (state.panelOpen) { closePanel(); return; }
        state.mode = "LEADER";
        updateBar();
        state.leaderTimeout = setTimeout(() => {
            if (state.mode === "LEADER") { state.mode = "NORMAL"; updateBar(); }
        }, 1500);
    }

    function handleLeader(key) {
        clearTimeout(state.leaderTimeout);
        if (isWatch()) {
            if (key === "c") { togglePanel("comments"); return; }
            if (key === "e") { togglePanel("recs"); return; }
            if (key === "d") { togglePanel("details"); return; }
            if (key === "l") { isLive() ? togglePanel("chat") : flash("not a live stream"); return; }
        }
        if (key === ",") { openSearch(); return; }
        state.mode = state.panelOpen ? "PANEL" : "NORMAL";
        updateBar();
    }

    // ── Keydown ──
    const WATCH_BLOCK = new Set(["j","k","l","h","c"]);

    function onKey(e) {
        if (isTyping() && state.mode !== "SEARCH") return;
        const key = e.key;

        if (state.mode === "SEARCH") {
            if (key === "," && document.activeElement !== searchInput) {
                e.preventDefault(); e.stopImmediatePropagation(); closeSearch();
            }
            return;
        }

        if (isWatch() && !e.ctrlKey && !e.altKey && !e.metaKey && WATCH_BLOCK.has(key)) {
            e.preventDefault(); e.stopImmediatePropagation(); return;
        }

        if (state.mode === "LEADER") {
            e.preventDefault(); e.stopImmediatePropagation(); handleLeader(key); return;
        }

        if (key === "Escape") {
            if (state.panelOpen) { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
            return;
        }

        if (state.mode === "PANEL" && e.ctrlKey && (key === "j" || key === "k")) {
            e.preventDefault(); e.stopImmediatePropagation();
            scrollPanel(key === "j" ? "down" : "up"); return;
        }

        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (key === ",") { e.preventDefault(); e.stopImmediatePropagation(); enterLeader(); return; }
        if (key === "\\") { e.preventDefault(); e.stopImmediatePropagation(); history.back(); return; }
        if (key === "H") { e.preventDefault(); e.stopImmediatePropagation(); goHome(); return; }
        if (isChannel() && tabMap[key]) { e.preventDefault(); e.stopImmediatePropagation(); clickTab(tabMap[key]); return; }
    }

    // ── SPA nav ──
    function onNav() {
        if (state.panelOpen) closePanel();
        if (state.mode === "SEARCH") closeSearch();
        state.mode = "NORMAL";
        updateBar();
        setTimeout(injectSearchBanner, 300);
    }

    function injectSearchBanner() {
        document.getElementById("nvim-search-banner")?.remove();
        if (!isSearch()) return;
        const q = new URLSearchParams(location.search).get("search_query");
        if (!q) return;

        const banner = document.createElement("div");
        banner.id = "nvim-search-banner";
        Object.assign(banner.style, {
            width:"100%", padding:"10px 14px", boxSizing:"border-box",
            background:C.bgDark, borderBottom:`1px solid ${C.border}`,
            fontFamily:'"JetBrains Mono",monospace', fontSize:"13px",
            color:C.fgDim, display:"flex", alignItems:"center", gap:"8px",
        });
        banner.innerHTML = `<span style="color:${C.yellow};font-size:15px;font-weight:bold">/</span><span style="color:${C.accent};font-weight:bold">${esc(q)}</span>`;

        const cnt = document.createElement("span");
        Object.assign(cnt.style, { color:C.fgDark, fontSize:"10px", marginLeft:"auto" });
        setTimeout(() => { cnt.textContent = `${document.querySelectorAll("ytd-search ytd-video-renderer").length} results`; }, 900);
        banner.appendChild(cnt);

        const target = document.querySelector("ytd-search ytd-section-list-renderer #contents, ytd-search #page-manager");
        if (target) target.insertBefore(banner, target.firstChild);
    }

    // ── Init ──
    function init() {
        buildBar();
        buildSearch();

        const blockWatch = e => {
            if (isTyping()) return;
            if (isWatch() && !e.ctrlKey && !e.altKey && !e.metaKey && WATCH_BLOCK.has(e.key)) {
                e.preventDefault(); e.stopImmediatePropagation();
            }
        };

        window.addEventListener("keydown", onKey, true);
        document.addEventListener("keydown", onKey, true);
        ["keyup","keypress"].forEach(ev => {
            window.addEventListener(ev, blockWatch, true);
            document.addEventListener(ev, blockWatch, true);
        });

        window.addEventListener("yt-navigate-finish", onNav);
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) { lastUrl = location.href; onNav(); }
        }).observe(document.body, { childList:true, subtree:true });

        setTimeout(injectSearchBanner, 500);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
