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

After loading the page once while online, install it from the browser menu. The service worker caches the app shell and all 60 core-board symbols for offline use.

## Core board

- 24 fixed core tiles are always visible and occupy permanent `pinned_index` slots.
- 36 fringe tiles are organised into six one-tap categories.
- Every tile carries English and Hindi labels/speech fields. This first slice speaks Hindi through the device Web Speech API; the later language control will use the same data.
- The `SuggestionRow` is separate from `CoreGrid`; it currently renders no suggestions and will be the only place predictive tiles appear.

## Symbol attribution

The 60 PNG symbols in `public/symbols` are from [ARASAAC](https://arasaac.org), created by Sergio Palao, and are licensed under [Creative Commons BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). They are included locally for offline use and are not hotlinked.
