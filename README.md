# Mynah

**Live demo:** https://mynah-aac.vercel.app

Mynah is an offline-first AAC picture board for non-speaking and minimally speaking children aged 2–10.
It is built for a child to use directly, with no instructions required at the moment they need to communicate.
The AI never speaks for the child. It only reshapes the options.
Every utterance is spoken only after the child deliberately taps it.

## The problem

Many children begin with one word: “water,” “go,” “no.” Adults then have to guess what that word means, and the conversation can move on before the child has had time to say more. Mynah makes room for the child to build a message, interrupt when needed, and correct a listener without giving up control of what is said.

## What Mynah does

- **Fixed core board:** 24 core words stay in permanent positions, so motor planning can become fast and reliable rather than being disrupted by a changing layout.
- **Say More:** after one noun or verb, optional picture-only strips can offer up to three complete utterances with different intents.
- **Predictive suggestion row:** a separate row ranks fringe and personal words; it never reorders, replaces, or hides a core tile.
- **Custom “My words”:** caregivers can add familiar words with a device-only photo, emoji, or text symbol and a generated board-voice clip.
- **Conversation repair:** persistent controls say “Excuse me. I have something to say.”, “Wait — I’m still saying it.”, and “That’s not what I meant.”
- **Offline child voice:** committed ElevenLabs clips play from the device for each stock tile; no network is needed for normal tile taps.
- **English-only today:** the current submitted build deliberately ships English labels and speech only. Hindi data was removed rather than presenting incomplete bilingual support.

## How we used GPT-5.6

`/api/expand` uses GPT-5.6 Structured Outputs with a strict schema. Its `intent` enum (`request`, `comment`, `refusal`, `feeling`, `question`) makes the model consider different meanings instead of offering three versions of the same request. The server drops any utterance with an unknown tile ID, a missing seed tile, duplicate tiles, duplicate intents, or unprompted distress language.

`/api/board` uses GPT-5.6 only to rank the supplied fringe/personal candidates; it cannot generate vocabulary. A monotonic sequence token and sentence hash abort and discard stale responses when a child taps again. An on-device grammar-and-usage-count fallback appears immediately, including when offline.

GPT-5.6 is not allowed to invent words, reorder the fixed core grid, change the board without caregiver approval, or auto-speak anything.

The latest deployed `/api/expand` response is shown below. It is a real safe fallback response because `OPENAI_API_KEY` is not currently configured in the Vercel production environment; this README does not fabricate a model result.

```json
{
  "utterances": []
}
```

Once `OPENAI_API_KEY` is added to Vercel production, replace this with a recorded model response from the same endpoint before final submission.

## How we used Codex

Codex scaffolded the Next.js PWA, kept the core grid isolated from AI UI, bundled ARASAAC symbols and voice clips for offline use, added IndexedDB usage and interaction logs, and built the caregiver vocabulary flow. It also helped make concrete architectural decisions: keep prediction candidates fringe/personal-only; pre-generate stock speech instead of relying on Web Speech; and keep photos/audio blobs only in IndexedDB.

We also caught and fixed mistakes. The core board initially used a three-column layout at all widths, which put 24 tiles below the fold; it is now 6×4 at desktop landscape, 4×6 on portrait tablets, and 3 columns on phones. An early fallback also behaved alphabetically when usage was equal; it was changed to deterministic grammar-aware ranking with personal-word preference. The factual build and test history is in [CODEX_LOG.md](CODEX_LOG.md).

## Running it

```bash
npm install
npm run dev
# production check
npm run build
npm run start
```

Open `http://localhost:3000` for local development.

| Variable | Needed for | Required? |
| --- | --- | --- |
| `OPENAI_API_KEY` | GPT-5.6 prediction and Say More routes | Only for AI suggestions |
| `ELEVENLABS_API_KEY` | Natural sentence speech and caregiver-generated custom-word clips | Only for on-demand generation |
| `MYNAH_BOARD_RATE_LIMIT` / `MYNAH_BOARD_DAILY_CEILING` | Optional model-route budget tuning | No |
| `MYNAH_WORD_AUDIO_RATE_LIMIT` / `MYNAH_WORD_AUDIO_DAILY_CEILING` | Optional custom-voice budget tuning | No |

The app runs without any keys: the fixed board, bundled English voice clips, sentence construction, conversation-repair controls, and custom photo/emoji/text tiles still work offline. Without ElevenLabs, a new custom word saves and uses browser speech until a caregiver retries voice generation online.

### Offline/PWA check

1. Open the site once while online and wait for it to finish loading.
2. Hard-reload once while still online so the service worker has cached the app shell and audio bank.
3. Turn on airplane mode; do not install the app to the home screen.
4. Hard-reload, tap `I` → `want` → `water`, then tap the sentence strip.
5. Confirm that tile clips, the fixed board, and the sentence-strip fallback still work. A first-ever visit in airplane mode cannot work because there is no browser cache yet.

## Architecture

Next.js App Router PWA with Tailwind CSS, a service worker, ARASAAC PNGs, and pre-generated ElevenLabs MP3s in `public/`.
IndexedDB stores usage, optional AI logs, session replay, caregiver settings, personal-tile metadata, device-only photos, and generated custom-word audio.
`/api/board` ranks supplied candidates; `/api/expand` offers structured sentence strips; `/api/speak` and `/api/generate-word` are bounded server-side speech helpers.
The fixed `CoreGrid` is intentionally separate from the suggestion and expansion components.
Offline-first and on-device storage are child-safety choices: a child can communicate when a connection fails, and a family’s photos, history, and personal vocabulary are not sent to a cloud account.

## Safety & privacy

- No accounts and no cloud storage of child data.
- Caregiver photos never leave the device; only English text and a selected voice ID are sent for optional custom-word audio generation.
- No voice cloning.
- Core tiles cannot be edited or moved. Caregivers approve, edit, or hide only personal tiles.
- AI suggestions are optional, never spoken automatically, and do not make medical or diagnostic claims.

## Attribution

The bundled symbols are from [ARASAAC](https://arasaac.org), created by Sergio Palao, and licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). We chose ARASAAC because it offers a recognisable AAC symbol set that can be included locally for a dependable offline, non-commercial submission; its NonCommercial clause means a commercial release would need compatible symbol rights.

Stock and generated speech use [ElevenLabs](https://elevenlabs.io). Code and attribution terms are in [LICENSE](LICENSE).
