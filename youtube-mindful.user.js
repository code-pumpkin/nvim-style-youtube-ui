// ==UserScript==
// @name         YouTube Mindful v7
// @namespace    youtube-mindful
// @version      7.0.0
// @description  Mindful YouTube — sidebar nav, inline panels, button-driven.
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

    const state = { panelOpen: null };

    const panelClasses = {
        comments: "mindful-panel-comments",
        recs:     "mindful-panel-recs",
        details:  "mindful-panel-details",
        chat:     "mindful-panel-chat",
    };

    const isWatch   = () => location.pathname === "/watch";
    const isSearch  = () => location.pathname === "/results";
    const isMobile  = () => window.innerWidth <= 600;

    function isTyping() {
        const a = document.activeElement;
        if (!a) return false;
        const t = a.tagName.toLowerCase();
        return t === "input" || t === "textarea" || a.isContentEditable;
    }

    function isLive() {
        return !!document.querySelector("ytd-live-chat-frame#chat, .ytp-live-badge[disabled], .ytp-live");
    }

    function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

    // ── Force theater on watch pages ──
    function forceTheater() {
        if (!isWatch()) return;
        const flexy = document.querySelector("ytd-watch-flexy");
        if (!flexy || flexy.hasAttribute("theater") || flexy.hasAttribute("fullscreen")) return;
        const btn = document.querySelector(".ytp-size-button");
        if (btn) btn.click();
        else flexy.setAttribute("theater", "");
    }

    function goHome() {
        if (location.pathname === "/") return;
        const logo = document.querySelector("a#logo, ytd-topbar-logo-renderer a, a[href='/']");
        if (logo) { logo.click(); return; }
        location.href = "/";
    }

    // ── Stats injection for details panel ──
    function injectStats() {
        document.getElementById("mindful-stats")?.remove();
        document.getElementById("mindful-title-inject")?.remove();

        const get = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
        const title = get("ytd-watch-flexy h1.ytd-watch-metadata yt-formatted-string")
                   || get("ytd-watch-flexy #title h1 yt-formatted-string")
                   || get("ytd-watch-flexy #title");
        const channel = get("ytd-watch-flexy ytd-channel-name a") || get("ytd-watch-flexy #channel-name a");
        const infoText = get("ytd-watch-flexy #info-container yt-formatted-string#info");

        let likes = "";
        const likeBtn = document.querySelector("ytd-watch-flexy like-button-view-model button, ytd-watch-flexy button[aria-label*='like' i]");
        if (likeBtn) {
            const m = (likeBtn.getAttribute("aria-label") || "").match(/([\d,]+)/);
            likes = m ? m[1] : (/\d/.test(likeBtn.textContent) ? likeBtn.textContent.trim() : "");
        }

        const container = document.querySelector("ytd-watch-flexy #above-the-fold");
        if (!container) return;

        if (title) {
            const el = document.createElement("div");
            el.id = "mindful-title-inject";
            el.innerHTML = `<div style="font-size:14px;font-weight:bold;color:${C.fg};margin-bottom:4px">${esc(title)}</div>${channel ? `<div style="font-size:11px;color:${C.cyan}">${esc(channel)}</div>` : ""}`;
            container.insertBefore(el, container.firstChild);
        }

        const bar = document.createElement("div");
        bar.id = "mindful-stats";
        const parts = [];
        if (infoText) parts.push(`<span style="color:${C.cyan}">${esc(infoText)}</span>`);
        if (likes) parts.push(`<span style="color:${C.green}">${esc(likes)} likes</span>`);
        if (!parts.length) parts.push(`<span style="color:${C.fgDim}">stats unavailable</span>`);
        bar.innerHTML = parts.join(`<span style="color:${C.fgDark}"> · </span>`);
        const ref = document.getElementById("mindful-title-inject");
        if (ref) ref.after(bar); else container.insertBefore(bar, container.firstChild);
    }

    // ── Panel open/close — inline, not overlay ──
    function openPanel(panel) {
        if (state.panelOpen) closePanel();
        if (panel === "chat" && !document.querySelector("ytd-live-chat-frame#chat")) return;

        document.body.classList.add(panelClasses[panel]);
        state.panelOpen = panel;

        if (panel === "recs") setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
        if (panel === "details") setTimeout(injectStats, 200);

        updateSidebar();
    }

    function closePanel() {
        if (!state.panelOpen) return;
        document.body.classList.remove(panelClasses[state.panelOpen]);
        if (state.panelOpen === "details") {
            document.getElementById("mindful-stats")?.remove();
            document.getElementById("mindful-title-inject")?.remove();
        }
        state.panelOpen = null;
        updateSidebar();
    }

    function togglePanel(panel) {
        state.panelOpen === panel ? closePanel() : openPanel(panel);
    }

    // ── Search overlay ──
    let searchOverlay, searchInput, suggestBox, suggestDebounce;

    function buildSearch() {
        searchOverlay = document.createElement("div");
        searchOverlay.id = "mindful-search-overlay";
        Object.assign(searchOverlay.style, {
            position:"fixed", inset:"0", background:"rgba(0,0,0,0.88)",
            zIndex:"1000000", display:"none", alignItems:"flex-start",
            justifyContent:"center", paddingTop:"25vh",
        });

        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display:"flex", flexDirection:"column", width:"60%", maxWidth:"700px" });

        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "search youtube...";
        Object.assign(searchInput.style, {
            width:"100%", background:C.bgDark, border:"none",
            borderBottom:`2px solid ${C.accent}`, color:C.fg,
            fontFamily:'"JetBrains Mono",monospace', fontSize:"18px",
            padding:"10px 4px", outline:"none",
        });

        suggestBox = document.createElement("div");
        Object.assign(suggestBox.style, {
            width:"100%", background:C.bgDark, marginTop:"2px",
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
            else if (e.key === "ArrowDown") { e.preventDefault(); moveSuggest(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); moveSuggest(-1); }
        });

        searchInput.addEventListener("input", () => {
            clearTimeout(suggestDebounce);
            suggestDebounce = setTimeout(() => fetchSuggest(searchInput.value.trim()), 150);
        });

        wrap.append(searchInput, suggestBox);
        searchOverlay.appendChild(wrap);
        searchOverlay.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
        document.body.appendChild(searchOverlay);
    }

    function fetchSuggest(q) {
        if (!q) { suggestBox.style.display = "none"; return; }
        const cb = "_ys" + Date.now();
        const s = document.createElement("script");
        window[cb] = data => { delete window[cb]; s.remove(); if (data?.[1]) renderSuggest(data[1], q); };
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
                padding:"8px 12px", cursor:"pointer", fontFamily:'"JetBrains Mono",monospace',
                fontSize:"13px", color:C.fg, borderBottom:`1px solid ${C.border}`,
            });
            div.textContent = text;
            div.addEventListener("mouseenter", () => { clearSel(); div.classList.add("sel"); div.style.background=C.bgHover; });
            div.addEventListener("mouseleave", () => { div.classList.remove("sel"); div.style.background="transparent"; });
            div.addEventListener("click", () => { location.href=`/results?search_query=${encodeURIComponent(text)}`; closeSearch(); });
            suggestBox.appendChild(div);
        });
        suggestBox.style.display = "block";
    }

    function clearSel() { suggestBox.querySelectorAll(".sel").forEach(el => { el.classList.remove("sel"); el.style.background="transparent"; }); }

    function moveSuggest(dir) {
        const items = [...suggestBox.querySelectorAll("div")];
        if (!items.length) return;
        const cur = suggestBox.querySelector(".sel");
        let idx = cur ? items.indexOf(cur) : -1;
        clearSel();
        idx = (idx + dir + items.length) % items.length;
        items[idx].classList.add("sel");
        items[idx].style.background = C.bgHover;
        items[idx].scrollIntoView({ block:"nearest" });
        searchInput.value = items[idx].dataset.q;
    }

    function openSearch() {
        if (state.panelOpen) closePanel();
        searchOverlay.style.display = "flex";
        searchInput.value = "";
        searchInput.focus();
    }

    function closeSearch() {
        searchOverlay.style.display = "none";
        searchInput.blur();
        suggestBox.innerHTML = "";
        suggestBox.style.display = "none";
    }

    // ── Sidebar ──
    let sidebar;
    const sidebarButtons = [];

    function buildSidebar() {
        sidebar = document.createElement("div");
        sidebar.id = "mindful-sidebar";

        const btns = [
            { id:"home",    icon:"⌂", tooltip:"Home",           action: goHome },
            { id:"back",    icon:"←", tooltip:"Back",           action: () => history.back() },
            { id:"search",  icon:"⌕", tooltip:"Search",         action: openSearch },
            { id:"sep1",    sep: true },
            { id:"details", icon:"ℹ", tooltip:"Details",        action: () => isWatch() && togglePanel("details") },
            { id:"recs",    icon:"▤", tooltip:"Recommendations", action: () => isWatch() && togglePanel("recs") },
            { id:"comments",icon:"💬", tooltip:"Comments",       action: () => isWatch() && togglePanel("comments") },
            { id:"chat",    icon:"◉", tooltip:"Live Chat",      action: () => isWatch() && isLive() && togglePanel("chat") },
        ];

        btns.forEach(({ id, icon, tooltip, action, sep }) => {
            if (sep) {
                const s = document.createElement("div");
                s.className = "sidebar-sep";
                sidebar.appendChild(s);
                return;
            }
            const b = document.createElement("button");
            b.dataset.id = id;
            b.dataset.tooltip = tooltip;
            b.textContent = icon;
            b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); action(); });
            sidebar.appendChild(b);
            sidebarButtons.push(b);
        });

        document.body.appendChild(sidebar);
        updateSidebar();
    }

    function updateSidebar() {
        if (!sidebar) return;
        const watchOnly = ["details", "recs", "comments", "chat"];
        const activeMap = { details:"details", recs:"recs", comments:"comments", chat:"chat" };

        sidebarButtons.forEach(b => {
            const id = b.dataset.id;
            const isWO = watchOnly.includes(id);
            b.disabled = isWO && !isWatch();
            if (id === "chat") b.disabled = !isWatch() || !isLive();
            b.dataset.active = (state.panelOpen && activeMap[state.panelOpen] === id) ? "true" : "false";
        });
    }

    // ── Keyboard — minimal, just Escape to close ──
    function onKey(e) {
        if (isTyping()) return;
        if (e.key === "Escape") {
            if (searchOverlay.style.display === "flex") { closeSearch(); return; }
            if (state.panelOpen) { closePanel(); return; }
        }
    }

    // ── SPA nav ──
    function onNav() {
        if (state.panelOpen) closePanel();
        if (searchOverlay?.style.display === "flex") closeSearch();
        updateSidebar();
        setTimeout(forceTheater, 800);
    }

    // ── Init ──
    function init() {
        buildSidebar();
        buildSearch();

        document.body.style.overscrollBehavior = "none";

        // Touch debounce to prevent double-navigation
        if ("ontouchstart" in window) {
            let lastNav = 0;
            document.addEventListener("click", e => {
                const link = e.target.closest("a[href]");
                if (!link) return;
                const now = Date.now();
                if (now - lastNav < 400) { e.preventDefault(); e.stopImmediatePropagation(); return; }
                lastNav = now;
            }, true);
        }

        window.addEventListener("keydown", onKey, true);
        window.addEventListener("yt-navigate-finish", onNav);

        document.addEventListener("fullscreenchange", () => {
            if (sidebar) sidebar.style.display = document.fullscreenElement ? "none" : "flex";
        });

        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) { lastUrl = location.href; onNav(); }
        }).observe(document.body, { childList:true, subtree:true });

        setTimeout(forceTheater, 1000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
