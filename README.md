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
- The `SuggestionRow` is separate from `CoreGrid`; it currently renders no suggestions and will be the only place predictive tiles appear.

## On-device data

Each tile tap updates its `count` and `last_used_at` in IndexedDB through `idb`. This stays on the device and never blocks the child’s tap. Day 2 ranking can use these records as its offline fallback.

## Symbol attribution

The 60 PNG symbols in `public/symbols` are from [ARASAAC](https://arasaac.org), created by Sergio Palao, and are licensed under [Creative Commons BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). They are included locally for offline use and are not hotlinked. The full notice is in [LICENSE](LICENSE).

We chose ARASAAC because it provides a broad, recognisable AAC symbol set that can be bundled locally for a dependable offline demo. Its NonCommercial clause is suitable for this non-commercial Build Week submission, but a commercial release must obtain compatible symbol rights or replace these assets before distribution.
