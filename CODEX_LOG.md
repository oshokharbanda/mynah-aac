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

## 2026-07-18 — Day 2 prediction foundation

- Added the prediction-only `SuggestionRow` flow. It is separate from `CoreGrid`, capped at four, and only adds a tile after the child taps it. Core positions remain untouched.
- Added `/api/board` with GPT-5.6 Structured Outputs. Its result shape is `{ items: [{ tile_id, reason }] }`; array order is rank, reasons are capped at 80 characters, and reasons are never shown to the child.
- The client paints a local usage-and-grammar fallback first. It sends a monotonic request sequence and strip hash with the request; each tap, undo, and clear immediately aborts the prior request and clears old suggestions. Responses whose sequence or hash no longer match are discarded.
- Added server-side candidate validation, a 900ms OpenAI abort timeout, per-IP in-memory rate limiting, an in-memory daily ceiling, and a no-key fallback. All such conditions retain the local board fallback with no error UI. The in-memory ceiling is per warm server instance; a true cross-instance ceiling needs shared infrastructure before high-traffic use.
- IndexedDB schema is now version 2. It retains tile usage and adds prediction records with strip state, items/reasons, source (`fallback` or `model`), and a subsequently tapped suggestion ID. Prediction writes are queued so a very fast suggestion tap is still attributed after its record is stored.
- Verified production lint and build pass. In a local production run, the fallback rendered immediately; after tapping `I` then `want`, the strip read `Speak: I want` and the suggestion row contained noun tiles (`apple`, `baby`, `ball`, `banana`). The automated browser environment does not expose IndexedDB, so persistence content still requires a physical-device verification.
- Verified the no-key route contract with a loopback production POST: it returned `{"items":[],"source":"fallback"}` without exposing an error. A local UI check then selected `apple` from the row and produced `Speak: I want apple`; core tile count remained 24.

## 2026-07-18 — Prediction contract and cache revision

- Revised the payload to `strip: Tile[]`, fringe/personal-only candidates (`id`, `label_en`, `part_of_speech`, `origin`, `usage_count`), scene, and `HH:MM` local time. Core IDs are rejected server-side even if a public request tries to submit one.
- Revised Structured Outputs to the required strict `{ suggestions: [{ tile_id, rank, reason }] }` schema. Returned IDs are validated against the sent candidates, unknown/current/duplicate IDs are dropped, and suggestions are rendered in rank order.
- Retained the monotonic request sequence, full-strip hash, immediate abort on every strip change, and stale-response rejection. They are request metadata while the JSON body remains exactly the public contract.
- Added bounded client and server caches keyed by last two IDs + scene + personal-vocabulary IDs. The vocabulary component makes cached paths invalidate automatically when a caregiver adds a personal tile.
- Verified lint and production build pass. Loopback POST with the exact new payload returned `200`, `x-mynah-source: fallback`, and `{"suggestions":[]}` with no API key. A core ID supplied as a candidate received the same silent fallback and was not eligible for prediction. In the local production UI, `I → want` retained a non-empty noun fallback row (`apple`, `baby`, `ball`, `banana`) while the fixed core grid stayed at 24 tiles.

## 2026-07-19 — Offline voice banks

- Replaced primary Web Speech tile playback with committed ElevenLabs MP3 clips. Generated three complete English banks: 180 non-empty MP3s (60 tiles × Sarah, Liam, and Will), at 22.05kHz mono and 720KB total.
- The service worker imports the generated audio manifest and pre-caches every selected-voice clip. A tile tap starts its local clip first; Web Speech remains only as the final fallback when local audio cannot play.
- Added `/api/speak`, using Eleven Flash v2.5 with calm, low-style voice settings for full-sentence prosody. The client aborts it after 900ms; offline, slow, and error states concatenate cached clips with 120ms gaps instead of presenting an error or going silent.
- Added a three-option caregiver board-voice picker with a local preview and IndexedDB persistence. The available account catalog had no child voice; the names are presented plainly so a caregiver—not an inferred label—chooses by listening.
- Verified generated clips with the OS audio inspector, production lint/build, service-worker syntax, and a local `/api/speak` POST returning `200 audio/mpeg` for `I want water`.

## 2026-07-19 — English-only communication shortcuts

- Added a persistent, pill-shaped attention control and a distinct correction control so neither can be confused with square vocabulary tiles. Each plays a committed offline English utterance.
- Added six deliberate whole-utterance urgent controls: bathroom, I’m hurt, I don’t feel well, help me please, I’m scared, and I’m finished. They are not prediction candidates and do not alter the child-selected vocabulary invariant.
- Added an on-device, current-session-only “Say it again” history limited to five spoken utterances. Caregiver tools provide an explicit end-session action that clears it.
- Generated 24 additional English-only ElevenLabs MP3s (eight whole utterances × three caregiver-selected voices), bringing the committed offline audio set to 204 files. They are included in service-worker cache version `mynah-core-v6`.
- Verified `npm run lint`, the production Next.js build, service-worker syntax, the English-only source scan, and the generated clips’ 22.05kHz mono MP3 format.

## 2026-07-19 — Core-grid fold correction

- Reworked the fixed core grid by viewport: 3 columns × 8 rows on a phone, 4 × 6 on portrait tablet, and 6 × 4 at 1024px and above. The child-mode Mynah heading is removed entirely.
- Measured the production build at exactly 1024 × 768: header 0px, quick communication controls 126px, sentence strip 62px, suggestions 115.69px, and core grid 368px (24 tiles at 156.16 × 86px). Including top padding and vertical gaps, the core grid ends at y=711.69px, leaving 56.31px visible with no scroll.
- Sentence construction now stays in one fixed 66px row on a 390px phone viewport. Undo is a 46px inline icon; Clear is a visibly smaller 36px icon and requires a second tap within four seconds.
- Verified the production build, lint, service-worker syntax, and rendered 3 × 8 / 4 × 6 / 6 × 4 breakpoint layouts through the local production server.

## 2026-07-19 — Say More (model verification pending)

- Added the guarded `/api/expand` route, picture-only Say More panel, caregiver on/off setting, and IndexedDB expansion records for offered utterances, intent, selection, and dismissal.
- Verified the no-key safety path in the production build: a valid `water` request returned `200`, `x-mynah-source: fallback`, and `{"utterances":[]}`. In the local child UI, one tapped `water` showed no panel and the next tap produced `water I` with no panel.
- Production currently has no `OPENAI_API_KEY`, so the required real model tests (water at meal, bed at 20:30), actual JSON samples, and p50 `/api/expand` response time cannot yet be recorded. No model JSON is fabricated here.

## 2026-07-19 — Conversation repair and visible sentence strip

- Added the offline whole-utterance repair phrase “Wait — I’m still saying it.” beside Attention and “That’s not what I meant.” The three are one visibly grouped, persistent conversation-repair set and have committed clips for Sarah, Liam, and Will.
- Reworked the sentence strip to show large local symbols with labels. Every newly landed tile receives a 120ms visual pulse; the sentence strip is updated before any selected Say More audio starts.
- Verified 207 committed offline MP3s, the audio manifest, lint, production build, service-worker syntax, and a 1024 × 768 rendered production layout. The 90px sentence strip leaves the 6 × 4 core grid fully visible, ending at y=747.69px.

## 2026-07-19 — Caregiver custom vocabulary (English-only)

- Added the English-only “My words” caregiver flow: a required English word, locally stored square photo (or emoji/text symbol), part of speech, and optional existing fringe category. Custom tiles are `origin: "personal"`, approved, never touch the fixed core grid, appear in My words plus an optional selected fringe group, and hidden words remain stored but leave the board and AI candidates.
- Photos and generated MP3 blobs are stored only in IndexedDB. The UI explicitly states that photos never leave the device; `/api/generate-word` receives only normalized English text and the selected voice ID. New tiles save immediately. If generation is offline or fails, child mode uses Web Speech as a last resort and caregiver mode shows “voice pending — tap to retry.”
- `/api/generate-word` uses the server-only ElevenLabs key, removes newlines, enforces a 200-character limit, has an in-memory per-IP limiter and a 20/day warm-instance ceiling, and returns an MP3 for storage in IndexedDB. Five deployed English `Nani` generation requests returned `200 audio/mpeg`: 984ms, 477ms, 442ms, 661ms, and 538ms; measured client p50 was **538ms**. An over-200-character request returned the expected `400` without generating audio.
- Extended board and Say More candidate handling to include visible personal tiles; only custom ID, English label, and part of speech are sent to `/api/expand`, never photos or blobs. Server validation still drops unknown IDs, seedless utterances, and duplicates.
- Required device/UI tests are not marked passed: no child photo was supplied for a genuine “Nani with photo” test, and the controlled browser connection could not create a usable session for IndexedDB/airplane-mode testing. The production OpenAI checks also failed safely: real `water` at meal and `bed` at 20:30 requests both returned `200`, `x-mynah-source: fallback`, and `{"utterances":[]}`.
- Cause of the Say More failure was verified with Vercel’s environment-name listing: production has `ELEVENLABS_API_KEY` but **does not have `OPENAI_API_KEY`**. No model JSON or p50 `/api/expand` is fabricated while that key is absent.
- Verified `npm run lint`, the full production Next.js build, and deployed the feature to https://mynah-aac.vercel.app.

## 2026-07-19 — Public repository secrets audit

Audit was completed before creating or pushing a public GitHub repository. Commands were run against every reachable commit (`git log -p --all`) and results were recorded without printing any possible credential values:

```text
$ git log -p --all | grep -iE "sk_[a-zA-Z0-9]|xi-api-key"  # inspected as a count-only audit
Initial textual references: 32

$ git log -p --all --no-textconv | perl -ne '$n += () = /\bsk[-_][A-Za-z0-9_-]{16,}\b/g; END { print "$n\n" }'
OpenAI-style secret-value matches: 0

$ git log -p --all --no-textconv | grep -iEo 'xi-api-key[^[:alnum:]]{0,10}[A-Za-z0-9_-]{16,}' | wc -l
ElevenLabs header-value matches: 0

$ git log -p --all --no-textconv | grep -iEo '(OPENAI_API_KEY|ELEVENLABS_API_KEY)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9_-]{16,}' | wc -l
Assignment-style API credential value matches: 0

$ git log --all --format= --name-only -- '.env' '.env.*'
Tracked .env files: none

$ git rev-list --objects --all | awk '{print $2}' | rg '(^|/)\.env(\..*)?$' | wc -l
Historical .env file objects: 0

$ git ls-files | rg '^(node_modules|\.next|\.vercel)/' | wc -l
Tracked dependency/build paths: 0
```

The 32 initial textual references were source-code environment variable names (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`) and the literal HTTP header name `xi-api-key`, not credential values. `.gitignore` covers `.env*` (including `.env.local`) and local agent scratch files. `public/audio` has 207 committed MP3s and `public/symbols` has 60 committed PNGs.

Fresh-clone verification was run from an isolated clone with no `.env.local`, `node_modules`, `.next`, or `.vercel` directory present at clone time:

```text
$ git clone --no-local <local source> /private/tmp/mynah-aac-fresh-C4n0fW
$ npm install
added 359 packages

$ npm run build
Compiled successfully; TypeScript passed; static pages generated successfully.

$ npm run start -- -p 3100
Ready on http://localhost:3100

$ curl http://localhost:3100/
200 18136
board HTML contains caregiver entry

$ curl http://localhost:3100/audio/en/sarah/i.mp3
tile audio 200 1585
bundled tile audio reachable without environment keys
```

The temporary localhost server was stopped after the check. This verifies the stock board and bundled tile-audio path work from a clean clone without API keys; browser audio output itself remains subject to the judge device’s normal media settings.
