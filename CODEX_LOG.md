# Codex log

## 2026-07-18 — Offline core board

- Built the first Mynah slice: 24 permanent core tiles plus 36 fringe tiles in six one-tap categories, a sentence strip, one-tap undo/clear, and local Web Speech playback.
- Kept the core board in a dedicated `CoreGrid` component ordered by `pinned_index`. A future prediction row is a separate `SuggestionRow` above it, capped at four tiles, so AI cannot move, hide, replace, or reorder the core grid.
- Derived Fitzgerald colours from `part_of_speech`; colour is intentionally not stored in tile data, avoiding conflicts when personal or AI candidate tiles are added later.
- Bundled 60 ARASAAC PNGs in `public/symbols` instead of hotlinking. The service worker pre-caches these assets and the app shell for offline use.
- Added 192px, 512px, and Apple touch PNG icons in addition to the source SVG, so installed tablet home screens use a native icon file.
- Initial scaffold used a Google-hosted font. Removed it because an offline board must not wait for a font network request, and now use the device sans-serif stack.

## 2026-07-18 — Deployment and reliability fixes

- Deployed the first production build to https://mynah-aac.vercel.app.
- Changed the default voice to English (`en-US`). Voice discovery starts on page mount and listens for `voiceschanged`; an exact language voice, language-family voice, then any available voice are tried in order. If a browser exposes no named voice, the utterance deliberately uses the browser default rather than failing.
- Added IndexedDB (`idb`) usage records for every tile tap: `{ count, last_used_at }`. Writes run after state is queued and are deliberately non-blocking; no usage data leaves the device.
- Added a 3-tap caregiver entry on the Mynah wordmark and an in-app ARASAAC credits screen. Added an MIT code license with a separate CC BY-NC-SA notice for bundled pictograms.
- Updated the service worker to warm the current app resources after its first online load, including dynamically named Next.js chunks. No home-screen installation is required after that warm load.
- Measured on the final production build at a 390px-wide phone viewport: core tile `I` rendered at **103.66 × 128px**; tap to committed sentence-strip update was **1.90ms**; tap to Web Speech dispatch was **0.60ms**; the Web Speech `onstart` event arrived at **35.30ms**. All are within the 400ms tile and 150ms speech budgets.
- Voice finding: the controlled browser returned no named voices, but its browser-default fallback produced the 35.30ms `onstart` event. This confirms the no-named-voice fallback path rather than a silent failure.
- Offline verification result: a hard reload in airplane mode from a **cold cache fails by design**—there is no service worker or app shell cached before the first online visit. The controlled browser does not expose service-worker, IndexedDB, or network-offline controls, so it could not perform a physical warmed-cache / no-install airplane-mode run. This remains an explicit manual-device verification item; it is not marked as passed.
- Deployed these fixes to the production alias: https://mynah-aac.vercel.app (verified HTTP 200).

## 2026-07-18 — English-only tile pass

- Removed every second-language label and speech field from the tile schema and all 60 tile records. English (`en-US`) is now the only tile label and speech output.
- Each symbol now uses its English label as image alt text. The child-facing board shows one label per tile, and the 24 / 36 counters are removed.
- `not` and `no` now have distinct English speech strings matching their labels. With only English speech data, the prior duplicate-audio condition is gone.
- Checked source data for second-language fields and Devanagari characters: none remain. TypeScript also validates every tile record against the English-only schema.
- Measured on the updated production build at a 390px viewport: core tile `I` rendered at **103.66 × 128px**; tap to committed sentence-strip update was **2.80ms**; tap to Web Speech dispatch was **0.50ms**; Web Speech `onstart` arrived at **13.60ms**.
- IndexedDB usage persistence remains implemented as `{ count, last_used_at }` writes on every tap. The controlled browser used for measurements does not expose IndexedDB, so a direct storage read could not be performed there.
