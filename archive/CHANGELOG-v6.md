# v6 Changelog

## Overview

v6 is a full rework of the panel system, status bar, and watch page layout. The dual-bar (touchbar + statusbar) was replaced with a single 32px bar. The `info` and `desc` panels were merged into a single `details` panel. The color palette was darkened.

---

## CSS (`youtube-nvim.user.css`)

### 0. Palette — darkened

| Variable | v5 | v6 |
|---|---|---|
| `--bg` | `#0b0e14` | `#0a0c10` |
| `--bg-dark` | `#080b10` | `#080a0e` |
| `--bg-float` | `#131721` | `#0f1318` |
| `--fg` | `#bfbdb6` | `#e8e3da` |

All other accent colors (`--accent`, `--green`, `--red`, `--yellow`, `--cyan`, `--magenta`) are unchanged.

Added `--bar-h: 32px` as a CSS variable so all `calc(100vh - var(--bar-h))` expressions update automatically when JS sets it to `0px` in fullscreen.

### 1. Global / masthead / sidebar / chips

No structural changes. Masthead, sidebar, chips, and Shorts are still hidden. Backdrop-filter is still removed on home/search pages.

### 5. Home grid

No changes. Still 6 videos per row with line-number counters.

### 9. Watch page — theater mode

- Player containers capped at `calc(100vh - var(--bar-h))` so the bar is never covered.
- `#below` is collapsed to `height: 0; overflow: hidden` — hides title, description, comments, recs from the normal page flow.
- Exception: `body.nvim-panel-details #below` is restored to `height: auto; overflow: visible` so `#above-the-fold` can escape the collapsed container.
- `#above-the-fold`, `ytd-watch-metadata`, `#top-row`, `#bottom-row`, `#description`, `#description-inner`, `ytd-text-inline-expander`, `#snippet`, `#plain-snippet-text` are all `display: none` by default.
- `#comments`, `#secondary`, `ytd-live-chat-frame#chat` are moved offscreen with `position: fixed; left: -200vw; visibility: hidden` (not `display: none`) so they can be repositioned by panel CSS.

**Why `visibility: hidden` + offscreen instead of `display: none` for panels:**
`display: none` elements cannot be repositioned with `position: fixed`. The panel CSS overrides `left` and `top` to bring them into view — this only works if the element is already in the layout flow (even if invisible).

### 10. Panel overlays

All panels use `body.nvim-panel-X` classes toggled by JS. No DOM reparenting.

**Shared panel base:**
- `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%)`
- `width: 62vw; max-width: 860px; height: 68vh`
- `background: var(--bg-float); padding: 16px; z-index: 90000`
- `animation: panel-in 0.18s ease` — slides up 16px on open

**Panel border colors:**
- Comments: `var(--magenta)`
- Recs: `var(--cyan)`
- Details: `var(--accent)` (gold)
- Chat: `var(--magenta)`

**Backdrop removed** — panels float without any background dimming.

**Details panel specifics:**
- `#above-the-fold` is the panel container (overrides the `display: none` default with `position: fixed` + full panel styles).
- `#top-row` shown as `display: flex` (title, channel, action buttons).
- `#bottom-row` shown as `display: block`, but only `#description` is visible — all other children are `display: none`.
- `ytd-text-inline-expander`, `#description-inner`, `#description` get `max-height: none; overflow: visible; height: auto` — description is shown as-is (collapsed by default, user clicks `...more` to expand).
- `#expand` and `#collapse` buttons are hidden (`display: none`) to keep the panel clean.

**Stats bar (`#nvim-stats`) and title (`#nvim-title-inject`):**
- Injected by JS into `#above-the-fold` before YouTube's native content.
- Styled via CSS: `display: flex; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border)`.
- Color classes: `.views` → cyan, `.likes` → green, `.dislikes` → red, `.date` → yellow.

### 11. Single status bar

- Removed the dual-bar (touchbar + statusbar) from v5.
- CSS fallback bar via `body::after` — shows static hint text when JS hasn't loaded yet.
- `body.nvim-js-active::after { display: none }` — JS hides the CSS fallback once it builds the real bar.

**Fullscreen:**
```css
body:fullscreen #nvim-bar,
body:-webkit-full-screen #nvim-bar,
body:-moz-full-screen #nvim-bar { display: none !important; }

:fullscreen body { padding-bottom: 0 !important; }
:fullscreen #movie_player { max-height: 100vh !important; height: 100vh !important; }
:fullscreen ytd-watch-flexy { height: 100vh !important; max-height: 100vh !important; }
```

These rules hide the bar and remove the reserved space so the video fills the full viewport.

### 12. Search overlay

No structural changes from v5. Dark background (`rgba(0,0,0,0.88)`), `/` prefix, live autocomplete.

---

## JS (`youtube-nvim.user.js`)

### Color constants (`C` object)

Matches CSS palette exactly:
```js
const C = {
    bgDark: "#080a0e", bgFloat: "#0f1318", border: "#2a3040", bgHover: "#1a2030",
    fg: "#e8e3da", fgDim: "#7a8394", fgDark: "#3d4452",
    accent: "#e6b450", green: "#7fd962", red: "#d95757",
    yellow: "#ffb454", cyan: "#73b8ff", magenta: "#d2a6ff",
};
```

### Panel system

**`panelClasses`** — maps panel name → CSS body class:
```js
{ comments: "nvim-panel-comments", recs: "nvim-panel-recs", details: "nvim-panel-details", chat: "nvim-panel-chat" }
```

**`openPanel(panel)`:**
- Closes any currently open panel first.
- Adds `body.nvim-panel-X` class.
- For `recs`: fires a `resize` event after 80ms so YouTube's lazy-loaded recs render.
- For `details`: calls `injectStats()` after 200ms.

**`closePanel()`:**
- Removes the body class.
- For `details`: removes `#nvim-stats` and `#nvim-title-inject` injected elements.

**Backdrop removed** — `ensureBackdrop()` is a no-op stub.

### `injectStats()`

Injects two elements into `#above-the-fold` before YouTube's native content:

1. **`#nvim-title-inject`** — title (bold, 14px, `C.fg`) + channel name (11px, `C.cyan`), separated from stats by a border.
2. **`#nvim-stats`** — views/date from `ytd-watch-flexy #info-container yt-formatted-string#info`, likes from `like-button-view-model button` aria-label, dislikes from `dislike-button-view-model button` or `#return-youtube-dislike-number`.

Selectors used:
- Title: `ytd-watch-flexy h1.ytd-watch-metadata yt-formatted-string` → fallback `#title h1 yt-formatted-string` → fallback `#title`
- Channel: `ytd-watch-flexy ytd-channel-name a` → fallback `#channel-name a`
- Views + date: `ytd-watch-flexy #info-container yt-formatted-string#info` (single element containing "2.9M views · 1 year ago · playlist")
- Likes: `like-button-view-model button` aria-label regex `/([\d,]+)/`
- Dislikes: `dislike-button-view-model button` or `#return-youtube-dislike-number`

### `WATCH_BLOCK` fix

`c` was in `WATCH_BLOCK` and got blocked before reaching the LEADER handler. Fixed with a guard:
```js
if (isWatch() && !e.ctrlKey && !e.altKey && !e.metaKey && WATCH_BLOCK.has(key) && state.mode !== "LEADER") {
    e.preventDefault(); e.stopImmediatePropagation(); return;
}
```

### Theater mode

`forceTheater()` runs on page load and after every SPA navigation (800ms delay):
1. Checks if `ytd-watch-flexy` already has `theater` or `fullscreen` attribute — skips if so.
2. Clicks `.ytp-size-button` if present.
3. Falls back to `flexy.setAttribute("theater", "")`.

### Fullscreen handling

```js
document.addEventListener("fullscreenchange", () => {
    const fs = !!document.fullscreenElement;
    if (bar) bar.style.display = fs ? "none" : "flex";
    document.body.style.paddingBottom = fs ? "0" : "";
    document.documentElement.style.setProperty("--bar-h", fs ? "0px" : "32px");
});
```

Setting `--bar-h` to `0px` makes all `calc(100vh - var(--bar-h))` rules in the CSS resolve to `100vh`, so the player fills the full viewport without any leftover gap.

### Status bar (`buildBar()`)

Single 32px bar at the bottom. Three sections:

- **Left** — mode pill (`NORMAL` / `SEARCH` / `PANEL` / `LEADER`), color-coded background.
- **Center** — context hints (changes based on mode and page type).
- **Right** — clickable buttons (`DETAILS`, `RECS`, `COMM`, `SEARCH`, `HOME`, `BACK`) + page breadcrumb.

Button colors: DETAILS=gold, RECS=cyan, COMM=magenta, SEARCH=yellow, HOME=white, BACK=dim.
Watch-only buttons (`DETAILS`, `RECS`, `COMM`) are dimmed and non-interactive when not on a watch page.
Active panel button is highlighted in gold and bold.

### Search overlay

No structural changes from v5. JSONP autocomplete from `suggestqueries-clients6.youtube.com`. Arrow keys / Tab to navigate suggestions. Enter to search. Escape or `,` to close.

### SPA navigation (`onNav`)

Fires on `yt-navigate-finish` and also via `MutationObserver` watching `document.body` for URL changes. On each navigation:
1. Closes any open panel or search overlay.
2. Resets mode to `NORMAL`.
3. Calls `injectSearchBanner()` after 300ms.
4. Calls `forceTheater()` after 800ms.

---

## Commits

| Hash | Description |
|---|---|
| `8d50f9c` | v6 base: single bar, theater mode, merged details panel, dark palette |
| `aec7824` | v6-details branch: working panels, fullscreen bar hide, fixed `,c` comments |
| `fcb7b45` | Fix fullscreen gap: reset `--bar-h` to `0px` so video fills full viewport |
