// ==UserScript==
// @name         YouTube Mindful v7 — Desktop
// @namespace    youtube-mindful
// @version      7.0.0
// @description  Mindful YouTube for desktop — keyboard-driven, inline panels, calm focus.
// @author       codePumpkin
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const C = {
        bgDark: "#080a0e", bgFloat: "#0f1318", border: "#2a3040", bgHover: "#1a2030",
        fg: "#e8e3da", fgDim: "#7a8394", fgDark: "#3d4452",
        accent: "#e6b450", green: "#7fd962", red: "#d95757",
        yellow: "#ffb454", cyan: "#73b8ff", magenta: "#d2a6ff",
    };

    const BAR_H = 32;
    const state = { mode: "NORMAL", panelOpen: null, leaderTimeout: null };

    const panelClasses = {
        comments: "mindful-panel-comments", recs: "mindful-panel-recs",
        details: "mindful-panel-details", chat: "mindful-panel-chat",
    };
    const panelLabels = { comments:"COMMENTS", recs:"RECOMMENDATIONS", details:"DETAILS", chat:"LIVE CHAT" };

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
        return !!document.querySelector("ytd-live-chat-frame#chat, .ytp-live-badge[disabled], .ytp-live");
    }

    function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

    function forceTheater() {
        if (!isWatch()) return;
        const flexy = document.querySelector("ytd-watch-flexy");
        if (!flexy || flexy.hasAttribute("theater") || flexy.hasAttribute("fullscreen")) return;
        const btn = document.querySelector(".ytp-size-button");
        if (btn) btn.click(); else flexy.setAttribute("theater", "");
    }

    function goHome() {
        if (location.pathname === "/") { flash("already home"); return; }
        const logo = document.querySelector("a#logo, ytd-topbar-logo-renderer a, a[href='/']");
        if (logo) { logo.click(); return; }
        location.href = "/";
    }

    // ── Stats injection ──
    function injectStats() {
        document.getElementById("mindful-stats")?.remove();
        document.getElementById("mindful-title-inject")?.remove();
        const get = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
        const title = get("ytd-watch-flexy h1.ytd-watch-metadata yt-formatted-string")
                   || get("ytd-watch-flexy #title h1 yt-formatted-string") || get("ytd-watch-flexy #title");
        const channel = get("ytd-watch-flexy ytd-channel-name a") || get("ytd-watch-flexy #channel-name a");
        const infoText = get("ytd-watch-flexy #info-container yt-formatted-string#info");
        let likes = "";
        const likeBtn = document.querySelector("ytd-watch-flexy like-button-view-model button, ytd-watch-flexy button[aria-label*='like' i]");
        if (likeBtn) { const m = (likeBtn.getAttribute("aria-label") || "").match(/([\d,]+)/); likes = m ? m[1] : ""; }

        const container = document.querySelector("ytd-watch-flexy #above-the-fold");
        if (!container) return;
        if (title) {
            const el = document.createElement("div"); el.id = "mindful-title-inject";
            el.innerHTML = `<div style="font-size:14px;font-weight:bold;color:${C.fg};margin-bottom:4px">${esc(title)}</div>${channel ? `<div style="font-size:11px;color:${C.cyan}">${esc(channel)}</div>` : ""}`;
            container.insertBefore(el, container.firstChild);
        }
        const bar = document.createElement("div"); bar.id = "mindful-stats";
        const parts = [];
        if (infoText) parts.push(`<span style="color:${C.cyan}">${esc(infoText)}</span>`);
        if (likes) parts.push(`<span style="color:${C.green}">${esc(likes)} likes</span>`);
        if (!parts.length) parts.push(`<span style="color:${C.fgDim}">stats unavailable</span>`);
        bar.innerHTML = parts.join(`<span style="color:${C.fgDark}"> · </span>`);
        const ref = document.getElementById("mindful-title-inject");
        if (ref) ref.after(bar); else container.insertBefore(bar, container.firstChild);
    }

    // ── Panel open/close — inline ──
    function openPanel(panel) {
        if (state.panelOpen) closePanel();
        if (panel === "chat" && !document.querySelector("ytd-live-chat-frame#chat")) { flash("no live chat"); return; }
        document.body.classList.add(panelClasses[panel]);
        state.panelOpen = panel; state.mode = "PANEL";
        if (panel === "recs") setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
        if (panel === "details") setTimeout(injectStats, 200);
        updateBar();
    }

    function closePanel() {
        if (!state.panelOpen) return;
        document.body.classList.remove(panelClasses[state.panelOpen]);
        if (state.panelOpen === "details") {
            document.getElementById("mindful-stats")?.remove();
            document.getElementById("mindful-title-inject")?.remove();
        }
        state.panelOpen = null; state.mode = "NORMAL"; updateBar();
    }

    function togglePanel(panel) { state.panelOpen === panel ? closePanel() : openPanel(panel); }

    function scrollPanel(dir) {
        if (!state.panelOpen) return;
        const targets = { comments:"ytd-watch-flexy #comments", recs:"ytd-watch-flexy #secondary",
                          details:"ytd-watch-flexy #above-the-fold", chat:"ytd-live-chat-frame#chat" };
        document.querySelector(targets[state.panelOpen])?.scrollBy({ top: dir === "down" ? 220 : -220, behavior: "smooth" });
    }

    // ── Search overlay ──
    let searchOverlay, searchInput, suggestBox, suggestDebounce;

    function buildSearch() {
        searchOverlay = document.createElement("div"); searchOverlay.id = "mindful-search-overlay";
        Object.assign(searchOverlay.style, { position:"fixed", inset:"0", background:"rgba(0,0,0,0.88)",
            zIndex:"1000000", display:"none", alignItems:"flex-start", justifyContent:"center", paddingTop:"25vh" });
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display:"flex", flexDirection:"column", width:"60%", maxWidth:"700px" });
        searchInput = document.createElement("input"); searchInput.type = "text"; searchInput.placeholder = "search youtube...";
        Object.assign(searchInput.style, { width:"100%", background:C.bgDark, border:"none",
            borderBottom:`2px solid ${C.accent}`, color:C.fg, fontFamily:'"JetBrains Mono",monospace', fontSize:"18px", padding:"10px 4px", outline:"none" });
        suggestBox = document.createElement("div");
        Object.assign(suggestBox.style, { width:"100%", background:C.bgDark, marginTop:"2px",
            maxHeight:"40vh", overflowY:"auto", display:"none", border:`1px solid ${C.border}`, borderTop:"none" });

        searchInput.addEventListener("keydown", e => {
            e.stopImmediatePropagation();
            if (e.key === "Enter") { const sel = suggestBox.querySelector(".sel"); const q = sel ? sel.dataset.q : searchInput.value.trim();
                if (q) location.href = `/results?search_query=${encodeURIComponent(q)}`; closeSearch();
            } else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
        });
        searchInput.addEventListener("input", () => { clearTimeout(suggestDebounce); suggestDebounce = setTimeout(() => fetchSuggest(searchInput.value.trim()), 150); });
        wrap.append(searchInput, suggestBox); searchOverlay.appendChild(wrap);
        searchOverlay.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
        document.body.appendChild(searchOverlay);
    }

    function fetchSuggest(q) {
        if (!q) { suggestBox.style.display = "none"; return; }
        const cb = "_ys" + Date.now(); const s = document.createElement("script");
        window[cb] = data => { delete window[cb]; s.remove(); if (data?.[1]) renderSuggest(data[1], q); };
        s.src = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&callback=${cb}`;
        document.head.appendChild(s);
        setTimeout(() => { if (window[cb]) { delete window[cb]; s.remove(); } }, 3000);
    }

    function renderSuggest(items, q) {
        suggestBox.innerHTML = ""; if (!items.length) { suggestBox.style.display = "none"; return; }
        items.forEach(item => {
            const text = Array.isArray(item) ? item[0] : String(item);
            const div = document.createElement("div"); div.dataset.q = text;
            Object.assign(div.style, { padding:"8px 12px", cursor:"pointer", fontFamily:'"JetBrains Mono",monospace', fontSize:"13px", color:C.fg, borderBottom:`1px solid ${C.border}` });
            const lo = text.toLowerCase(), lq = q.toLowerCase(), mi = lo.indexOf(lq);
            div.innerHTML = mi >= 0 ? `${esc(text.slice(0,mi))}<span style="color:${C.accent};font-weight:bold">${esc(text.slice(mi,mi+q.length))}</span>${esc(text.slice(mi+q.length))}` : esc(text);
            div.addEventListener("mouseenter", () => { clearSel(); div.classList.add("sel"); div.style.background=C.bgHover; });
            div.addEventListener("mouseleave", () => { div.classList.remove("sel"); div.style.background="transparent"; });
            div.addEventListener("click", () => { location.href=`/results?search_query=${encodeURIComponent(text)}`; closeSearch(); });
            suggestBox.appendChild(div);
        });
        suggestBox.style.display = "block";
    }

    function clearSel() { suggestBox.querySelectorAll(".sel").forEach(el => { el.classList.remove("sel"); el.style.background="transparent"; }); }
    function moveSuggest(dir) {
        const items = [...suggestBox.querySelectorAll("div")]; if (!items.length) return;
        const cur = suggestBox.querySelector(".sel"); let idx = cur ? items.indexOf(cur) : -1; clearSel();
        idx = (idx + dir + items.length) % items.length;
        items[idx].classList.add("sel"); items[idx].style.background = C.bgHover;
        items[idx].scrollIntoView({ block:"nearest" }); searchInput.value = items[idx].dataset.q;
    }

    function openSearch() { if (state.panelOpen) closePanel(); state.mode = "SEARCH"; searchOverlay.style.display = "flex"; searchInput.value = ""; searchInput.focus(); updateBar(); }
    function closeSearch() { state.mode = "NORMAL"; searchOverlay.style.display = "none"; searchInput.blur(); suggestBox.innerHTML = ""; suggestBox.style.display = "none"; updateBar(); }

    // ── Status bar ──
    let bar, barMode, barHints, barRight;

    function buildBar() {
        document.body.classList.add("mindful-js-active");
        bar = document.createElement("div"); bar.id = "mindful-bar";
        Object.assign(bar.style, { position:"fixed", bottom:"0", left:"0", right:"0",
            height:`${BAR_H}px`, lineHeight:`${BAR_H}px`, background:C.bgDark,
            fontFamily:'"JetBrains Mono","Fira Code",monospace', fontSize:"11px", padding:"0 10px",
            zIndex:"999999", borderTop:`1px solid ${C.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center", userSelect:"none" });

        barMode = document.createElement("span");
        Object.assign(barMode.style, { fontWeight:"bold", marginRight:"10px", padding:"2px 8px", fontSize:"11px" });
        barHints = document.createElement("span");
        Object.assign(barHints.style, { color:C.fgDim, flex:"1", textAlign:"center" });
        barRight = document.createElement("span");
        Object.assign(barRight.style, { color:C.fgDark, fontSize:"10px", marginLeft:"8px", whiteSpace:"nowrap" });

        bar.append(barMode, barHints, barRight);
        document.body.appendChild(bar);
        updateBar();
    }

    const modeColors = { NORMAL:C.green, SEARCH:C.yellow, PANEL:C.magenta, LEADER:C.accent };

    function updateBar() {
        if (!bar) return;
        barMode.textContent = state.mode;
        barMode.style.color = C.bgDark;
        barMode.style.background = modeColors[state.mode] || C.accent;

        if (state.mode === "LEADER") barHints.textContent = `c comm  e recs  d details${isLive() ? "  l chat" : ""}  , search`;
        else if (state.mode === "PANEL") barHints.textContent = "Ctrl+j/k scroll  Esc close";
        else if (isChannel()) barHints.textContent = "1 videos  2 playlists  3 live  4 home  , leader";
        else barHints.textContent = ", leader  \\ back  H home";

        let page = "HOME";
        if (isWatch()) page = "WATCH";
        else if (isSearch()) { const q = new URLSearchParams(location.search).get("search_query"); page = q ? `/ ${q}` : "SEARCH"; }
        else if (isChannel()) page = "CHANNEL";
        barRight.textContent = state.panelOpen ? `${page} › ${panelLabels[state.panelOpen]}` : page;
    }

    function flash(msg) {
        if (!barHints) return;
        barHints.textContent = msg; barHints.style.color = C.red;
        setTimeout(() => { barHints.style.color = C.fgDim; updateBar(); }, 2000);
    }

    // ── Leader + keyboard ──
    const tabMap = { "1":"Videos", "2":"Playlists", "3":"Live", "4":"Home" };
    function clickTab(title) {
        for (const t of document.querySelectorAll("yt-tab-shape")) {
            if ((t.getAttribute("tab-title") || t.textContent).trim().toLowerCase() === title.toLowerCase()) {
                (t.querySelector(".yt-tab-shape__tab, [role='tab']") || t).click(); flash(`→ ${title}`); return;
            }
        }
        flash(`tab "${title}" not found`);
    }

    function enterLeader() {
        if (state.panelOpen) { closePanel(); return; }
        state.mode = "LEADER"; updateBar();
        state.leaderTimeout = setTimeout(() => { if (state.mode === "LEADER") { state.mode = "NORMAL"; updateBar(); } }, 1500);
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
        state.mode = state.panelOpen ? "PANEL" : "NORMAL"; updateBar();
    }

    const WATCH_BLOCK = new Set(["j","k","l","h","c"]);

    function onKey(e) {
        if (isTyping() && state.mode !== "SEARCH") return;
        const key = e.key;
        if (state.mode === "SEARCH") { if (key === "," && document.activeElement !== searchInput) { e.preventDefault(); closeSearch(); } return; }
        if (isWatch() && !e.ctrlKey && !e.altKey && !e.metaKey && WATCH_BLOCK.has(key) && state.mode !== "LEADER") { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (state.mode === "LEADER") { e.preventDefault(); e.stopImmediatePropagation(); handleLeader(key); return; }
        if (key === "Escape") { if (state.panelOpen) { e.preventDefault(); closePanel(); } return; }
        if (state.mode === "PANEL" && e.ctrlKey && (key === "j" || key === "k")) { e.preventDefault(); scrollPanel(key === "j" ? "down" : "up"); return; }
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (key === ",") { e.preventDefault(); enterLeader(); return; }
        if (key === "\\") { e.preventDefault(); history.back(); return; }
        if (key === "H") { e.preventDefault(); goHome(); return; }
        if (isChannel() && tabMap[key]) { e.preventDefault(); clickTab(tabMap[key]); return; }
    }

    // ── SPA nav ──
    function onNav() {
        if (state.panelOpen) closePanel();
        if (state.mode === "SEARCH") closeSearch();
        state.mode = "NORMAL"; updateBar();
        setTimeout(forceTheater, 800);
    }

    // ── Init ──
    function init() {
        buildBar();
        buildSearch();

        const blockWatch = e => {
            if (isTyping()) return;
            if (isWatch() && !e.ctrlKey && !e.altKey && !e.metaKey && WATCH_BLOCK.has(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
        };
        window.addEventListener("keydown", onKey, true);
        document.addEventListener("keydown", onKey, true);
        ["keyup","keypress"].forEach(ev => { window.addEventListener(ev, blockWatch, true); document.addEventListener(ev, blockWatch, true); });

        window.addEventListener("yt-navigate-finish", onNav);
        document.addEventListener("fullscreenchange", () => {
            const fs = !!document.fullscreenElement;
            if (bar) bar.style.display = fs ? "none" : "flex";
            document.documentElement.style.setProperty("--bar-h", fs ? "0px" : "32px");
        });

        let lastUrl = location.href;
        new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; onNav(); } }).observe(document.body, { childList:true, subtree:true });
        setTimeout(forceTheater, 1000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
