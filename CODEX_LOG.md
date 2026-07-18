# Codex log

## 2026-07-18 — Offline core board

- Built the first Mynah slice: 24 permanent core tiles plus 36 fringe tiles in six one-tap categories, a sentence strip, one-tap undo/clear, and local Web Speech playback.
- Kept the core board in a dedicated `CoreGrid` component ordered by `pinned_index`. A future prediction row is a separate `SuggestionRow` above it, capped at four tiles, so AI cannot move, hide, replace, or reorder the core grid.
- Derived Fitzgerald colours from `part_of_speech`; colour is intentionally not stored in tile data, avoiding conflicts when personal or AI candidate tiles are added later.
- Bundled 60 ARASAAC PNGs in `public/symbols` instead of hotlinking. The service worker pre-caches these assets and the app shell for offline use. The default spoken language is Hindi (`hi-IN`); English and Hindi fields are both present on every tile for the later language toggle.
- Added 192px, 512px, and Apple touch PNG icons in addition to the source SVG, so installed tablet home screens use a native icon file.
- Initial scaffold used a Google-hosted font. Removed it because an offline board must not wait for a font network request, and now use the device sans-serif stack.
