# Mynah

Mynah is an offline-first AAC picture board for children who are non-speaking or minimally speaking. Your child taps every word themselves; Mynah only speaks the sequence they selected.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For an offline/PWA check, use a production build:

```bash
npm run build
npm run start
```

No home-screen installation is required for offline use. After the first online load, the service worker caches the app shell, loaded Next.js resources, install icons, and all 60 core-board symbols. A first-ever hard reload while already in airplane mode cannot work: the browser has no app shell or service worker cache yet.

## Core board

- 24 fixed core tiles are always visible and occupy permanent `pinned_index` slots.
- 36 fringe tiles are organised into six one-tap categories.
- Every tile carries one English label and English speech text (`en-US`).
- The `SuggestionRow` is separate from `CoreGrid`; it is the only place predictive tiles appear, so prediction cannot alter fixed core positions.

## Prediction safety and fallback

`POST /api/board` accepts the current `strip`, fringe/personal-only candidates, a scene, and local time. GPT-5.6 Structured Outputs returns up to four `{ tile_id, rank, reason }` suggestions. The server rejects submitted core candidates and drops returned IDs that were not in the candidate set, current-strip IDs, duplicates, invalid ranks, and unprompted distress candidates. Reasons are stored for caregivers and demos, never displayed to your child.

The board draws an on-device usage-count-and-grammar fallback before making a prediction request. Requests carry a monotonic sequence and strip hash; an old response is discarded and the previous request is aborted as soon as the strip changes. A bounded cache is keyed by the last two tile IDs, scene, and personal-vocabulary ID set, so repeated paths cost nothing and newly added personal tiles invalidate old paths. A 900ms server timeout, per-IP in-memory rate limit, and configurable daily ceiling (`MYNAH_BOARD_RATE_LIMIT`, `MYNAH_BOARD_DAILY_CEILING`) return the local fallback silently.

For the public Vercel deployment, set `OPENAI_API_KEY` server-side. `store: false` is used for prediction calls. The in-memory daily ceiling applies per warm function instance; a strictly global ceiling across Vercel instances will need a shared counter before high-traffic release.

## On-device data

Each tile tap updates its `count` and `last_used_at` in IndexedDB through `idb`. This stays on the device and never blocks the child’s tap. The board also stores every fallback, cached, and model prediction with strip state, suggested tile IDs/ranks/reasons, and the tile selected from a suggestion, enabling an on-device suggestion hit-rate and taps-saved analysis later. This stays on the device; only the transient candidate request reaches the prediction API.

## Voice and offline audio

Each of the 60 English tiles has a committed MP3 clip for each of three caregiver-selectable ElevenLabs voices. They live in `public/audio/en/<voice>/<tile_id>.mp3`, are pre-cached by the service worker, and play first on every tile tap. The selected voice is persisted in IndexedDB.

Sentence-strip playback requests a natural full-sentence MP3 from `/api/speak`. It falls back after 900ms, offline, or any error by playing the bundled tile clips in order with 120ms gaps; Web Speech is used only if cached audio itself is unavailable. Set `ELEVENLABS_API_KEY` in the production environment for `/api/speak`.

## Symbol attribution

The 60 PNG symbols in `public/symbols` are from [ARASAAC](https://arasaac.org), created by Sergio Palao, and are licensed under [Creative Commons BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). They are included locally for offline use and are not hotlinked. The full notice is in [LICENSE](LICENSE).

We chose ARASAAC because it provides a broad, recognisable AAC symbol set that can be bundled locally for a dependable offline demo. Its NonCommercial clause is suitable for this non-commercial Build Week submission, but a commercial release must obtain compatible symbol rights or replace these assets before distribution.
