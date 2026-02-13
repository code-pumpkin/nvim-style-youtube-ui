# nvim-style-youtube-ui

A userstyle + userscript combo that transforms YouTube into a NeoVim-inspired, keyboard-driven interface with an Ayu Dark color scheme. Strips away clutter (masthead, sidebar, Shorts, chips) and replaces it with a minimal, monospace, terminal-like experience with Vim-style leader-key navigation.

Designed to coexist with the [Tridactyl](https://github.com/tridactyl/tridactyl) browser extension — the leader key (`,`) is chosen to avoid conflicts.

---

## Preview

| Home Page | Watch Page (Panel Open) |
|---|---|
| Dark grid layout, 6 videos/row, line numbers, no avatars | Full-width player, overlay panels for comments/recs/info |

---

## Features

- **Ayu Dark theme** across all YouTube pages — custom CSS properties, monospace fonts (JetBrains Mono)
- **Vim modal system** — 4 modes: NORMAL, SEARCH, PANEL, LEADER (color-coded status bar)
- **Leader-key panels** — press `,` then a key to toggle overlay panels:
  - `,c` — Comments
  - `,e` — Recommendations
  - `,q` — Description (with stats: views, likes, dislikes, date)
  - `,i` — Info (title, channel, action buttons)
  - `,l` — Live Chat (live streams only)
  - `,,` — Search overlay
- **Vim-style search** — full-screen overlay with `/` prefix, live autocomplete from YouTube's suggestion API, highlighted matches
- **NeoVim status bar** — fixed bottom bar showing current mode, keybindings, and page context
- **Clutter removal** — hides masthead, sidebar, Shorts, chips, promoted content, merch shelves, community posts
- **No border-radius** — flat, terminal-aesthetic everywhere (except player controls)
- **No DOM reparenting** — panels use pure CSS overlays toggled via body classes; content stays in place so YouTube doesn't break
- **Channel pages** — channel avatar/icon visible, numbered tab indicators (`[1] Videos`, `[2] Playlists`, etc.)
- **Panel scrolling** — `Ctrl+j` / `Ctrl+k` to scroll inside open panels
- **`\` to go back** — returns to the previous page
- **`H` to go home** — SPA-style navigation to YouTube home (no page refresh)

---

## Requirements

| Tool | Purpose | Install |
|---|---|---|
| [Stylus](https://github.com/openstyles/stylus) | Injects the CSS (userstyle) | [Firefox](https://addons.mozilla.org/en-US/firefox/addon/styl-us/) · [Chrome](https://chrome.google.com/webstore/detail/stylus/clngdbkpkpeebahjckkjfobafhncgmne) |
| [Violentmonkey](https://violentmonkey.github.io/) | Runs the JS (userscript) | [Firefox](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) · [Chrome](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Monospace font used throughout | [Download](https://github.com/JetBrains/JetBrainsMono/releases) (optional — falls back to system monospace) |

> **Note:** Tampermonkey or Greasemonkey can be used instead of Violentmonkey for the userscript. The userstyle requires Stylus specifically (not Stylish).

---

## Installation

### 1. Install the CSS (Stylus)

1. Install the **Stylus** browser extension (links above)
2. Open the Stylus dashboard — click the Stylus icon → "Manage"
3. Click **"Write new style"** (or use the `+` button)
4. Copy the entire contents of [`youtube-nvim.user.css`](youtube-nvim.user.css) and paste it into the code editor
5. Give it a name (e.g. "YouTube NeoVim") and click **Save**
6. Make sure the style is enabled (toggle should be on)

> Alternatively, if you open the raw `youtube-nvim.user.css` file in your browser, Stylus may prompt you to install it directly.

### 2. Install the JS (Violentmonkey)

1. Install the **Violentmonkey** browser extension (links above)
2. Open the Violentmonkey dashboard — click the VM icon → "Open Dashboard"
3. Click the **`+`** button → **"New"**
4. Delete the template code and paste the entire contents of [`youtube-nvim.user.js`](youtube-nvim.user.js)
5. Press `Ctrl+S` to save
6. Make sure the script is enabled (toggle should be on)

> Alternatively, open the raw `.user.js` file URL in your browser and Violentmonkey will prompt to install it.

### 3. Reload YouTube

Navigate to `https://www.youtube.com` and the theme + keybindings should be active. You'll see the dark Ayu theme and a status bar at the bottom of the page.

---

## Keybindings

### Leader Key (`,`)

Press `,` to enter LEADER mode (1.5s timeout), then press a second key:

| Key | Action |
|---|---|
| `,c` | Toggle Comments panel |
| `,e` | Toggle Recommendations panel |
| `,q` | Toggle Description panel (views, likes, dislikes, date) |
| `,i` | Toggle Info panel (title, channel, actions) |
| `,l` | Toggle Live Chat panel (live streams only) |
| `,,` | Open search overlay |

### Global

| Key | Action |
|---|---|
| `Escape` | Close any open panel or search overlay |
| `\` | Go back to previous page |
| `H` | Go to YouTube home (SPA, no refresh) |
| `Ctrl+j` | Scroll down inside open panel |
| `Ctrl+k` | Scroll up inside open panel |

### Channel Pages

Tabs show numbered indicators so you know which key to press:

| Key | Action |
|---|---|
| `1` | `[1] Videos` tab |
| `2` | `[2] Playlists` tab |
| `3` | `[3] Live` tab |
| `4` | `[4] Home` tab |

### Watch Pages

`j`, `k`, `l`, `h` are blocked on watch pages to prevent YouTube's default seek/volume shortcuts from causing layout shifts.

---

## Modes

The status bar at the bottom shows the current mode:

| Mode | Color | Description |
|---|---|---|
| NORMAL | Green | Default browsing mode |
| SEARCH | Yellow | Search overlay is open |
| PANEL | Magenta | A panel overlay is open |
| LEADER | Accent (gold) | Waiting for second key after `,` |

---

## Roadmap

Features currently being worked on:

- **Your Channel UI** — a panel/overlay to display your own channel info and profile
- **Subscriptions List** — a way to view and navigate your subscription list without the sidebar
- **Ask / AI Chat** — integration with YouTube's Ask (YouChat) panel as an overlay

---

## Compatibility

- **Browser:** Firefox (primary target), Chrome/Chromium-based browsers
- **Tridactyl:** Leader key `,` is chosen specifically to avoid conflicts with Tridactyl's default bindings
- **Return YouTube Dislike:** If the [RYD extension](https://returnyoutubedislike.com/) is installed, the description panel will show dislike counts
- **YouTube Dark Mode:** The userstyle overrides YouTube's dark mode variables — works regardless of YouTube's theme setting

---

## Customization

### Colors

Edit the CSS custom properties in section 0 of `youtube-nvim.user.css`:

```css
:root {
    --nvim-bg:      #0b0e14;
    --nvim-bg-float:#131721;
    --nvim-border:  #1d222e;
    --nvim-fg:      #bfbdb6;
    --nvim-fg-dim:  #565b66;
    --nvim-accent:  #e6b450;
    --nvim-green:   #7fd962;
    --nvim-red:     #d95757;
    --nvim-yellow:  #ffb454;
    --nvim-cyan:    #73b8ff;
    --nvim-magenta: #d2a6ff;
}
```

### Videos Per Row

The home page defaults to 6 videos per row. Adjust the grid in section 5:

```css
ytd-rich-grid-renderer {
    --ytd-rich-grid-items-per-row: 6 !important;
}
```

### Leader Key Timeout

In `youtube-nvim.user.js`, the leader key timeout is 1500ms. Search for `1500` to change it.

---

## How It Works

The project is split into two independent files that work together:

**CSS (`youtube-nvim.user.css`)** handles all visual changes:
- Applies the Ayu Dark color palette via CSS custom properties
- Hides unwanted UI elements (masthead, sidebar, Shorts, chips, etc.)
- Defines the panel overlay system — panels are positioned off-screen by default and brought into view when `body` gets a class like `nvim-panel-comments`
- Provides a CSS-only fallback status bar via `body::after`

**JS (`youtube-nvim.user.js`)** handles all interactivity:
- Listens for keyboard events and manages the modal state machine
- Toggles `body` classes to activate CSS panel overlays — no DOM reparenting
- Creates the search overlay with live autocomplete (YouTube suggestion API via JSONP)
- Replaces the CSS fallback status bar with a dynamic one showing mode/context
- Injects stats (views, likes, dislikes, date) into the description panel
- Handles YouTube's SPA navigation via `yt-navigate-finish` events + MutationObserver

---

## Credits

Portions of the userstyle were inspired by or adapted from:

- [Roundless YouTube](https://userstyles.world/style/26523/roundless-youtube) by imluciddreaming — border-radius removal
- [Clean YouTube](https://userstyles.world/style/10175/clean-youtube) by 0ko ([source](https://codeberg.org/0ko/UserStyles)) — Shorts hiding selectors (MIT)
- [AdashimaaTube](https://userstyles.world/style/6944/old-youtube-layout-in-2021-2022) by sapondanaisriwan ([source](https://github.com/sapondanaisriwan/AdashimaaTube)) — grid layout approach (MIT)

---

## License

[MIT](LICENSE)
