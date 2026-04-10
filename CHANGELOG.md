# Changelog

## v6.0.0 — 2026-04-10

### Added
- Fullscreen support: status bar hides in fullscreen, `--bar-h` resets to `0px` so video fills the full viewport with no leftover gap
- Details panel (`d` in leader mode): shows title, channel, views/date, likes/dislikes injected by JS into `#above-the-fold`
- Clickable buttons in the status bar (DETAILS, RECS, COMM, SEARCH, HOME, BACK) with distinct colors

### Changed
- Replaced dual-bar (touchbar + statusbar) with a single 32px status bar
- Merged `info` + `desc` panels into one `details` panel (`,d`)
- Darkened palette: background `#0a0c10`, text `#e8e3da`
- `#secondary` hide rule: removed `clip-path: inset(50%)` which broke fixed positioning in panels
- `,c` comments key: was blocked by `WATCH_BLOCK` set — fixed with `state.mode !== "LEADER"` guard

### Removed
- Backdrop/overlay dimming behind panels
- CSS statusbar fallback (JS-only now, CSS fallback only shown before JS loads)

---

## v5.0.8 — earlier

See [archive/CHANGELOG-v5.md](archive/CHANGELOG-v5.md) for full v5 history.
