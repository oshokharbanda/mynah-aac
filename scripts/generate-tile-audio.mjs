import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
const voices = [
  { id: "sarah", providerId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "liam", providerId: "TX3LPaxmHKxFdv7VOQHJ" },
  { id: "will", providerId: "bIHbv24MWmeRgasZH58o" },
];

// Keep this English-only manifest aligned with app/lib/quick-phrases.ts.
// These are deliberate, whole-utterance actions rather than vocabulary tiles.
const systemPhrases = [
  { id: "attention", text: "Excuse me. I have something to say." },
  { id: "not-that", text: "That's not what I meant." },
  { id: "bathroom", text: "Bathroom." },
  { id: "hurt", text: "I'm hurt." },
  { id: "unwell", text: "I don't feel well." },
  { id: "help", text: "Help me please." },
  { id: "scared", text: "I'm scared." },
  { id: "finished", text: "I'm finished." },
];

async function loadLocalEnvironment() {
  try {
    const contents = await readFile(".env.local", "utf8");
    const match = contents.match(/^ELEVENLABS_API_KEY=(?:"([^"]+)"|'([^']+)'|(.+))$/m);
    if (match) process.env.ELEVENLABS_API_KEY = match[1] ?? match[2] ?? match[3]?.trim();
  } catch {
    // CI can provide OPENAI_API_KEY directly.
  }
}

function tileManifest(source) {
  const tiles = [];
  for (const match of source.matchAll(/core\("([^"]+)",\s*\d+,\s*"[^"]+",\s*"([^"]+)"\)/g)) {
    tiles.push({ id: match[1], text: match[2] });
  }
  for (const match of source.matchAll(/fringe\("([^"]+)",\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"\)/g)) {
    tiles.push({ id: match[1], text: match[2] });
  }
  if (tiles.length !== 60) throw new Error(`Expected 60 tiles, found ${tiles.length}.`);
  return tiles;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function generateClip({ voice, text, output }) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.providerId}?output_format=mp3_22050_32`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        language_code: "en",
        voice_settings: { stability: 0.72, similarity_boost: 0.7, style: 0, speed: 0.9 },
      }),
    },
  );
  if (!response.ok) throw new Error(`ElevenLabs generation failed for ${output}: ${response.status}`);
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  await loadLocalEnvironment();
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is required to generate offline audio.");

  const tiles = tileManifest(await readFile("app/data/tiles.ts", "utf8"));
  const urls = [];

  for (const voice of voices) {
    const directory = path.join("public", "audio", "en", voice.id);
    await mkdir(directory, { recursive: true });
    for (const tile of tiles) {
      const output = path.join(directory, `${tile.id}.mp3`);
      urls.push(`/audio/en/${voice.id}/${tile.id}.mp3`);
      if (await exists(output)) continue;
      await generateClip({ voice, text: tile.text, output });
      process.stdout.write(`Generated ${voice.id}/${tile.id}\n`);
    }

    const systemDirectory = path.join(directory, "system");
    await mkdir(systemDirectory, { recursive: true });
    for (const phrase of systemPhrases) {
      const output = path.join(systemDirectory, `${phrase.id}.mp3`);
      urls.push(`/audio/en/${voice.id}/system/${phrase.id}.mp3`);
      if (await exists(output)) continue;
      await generateClip({ voice, text: phrase.text, output });
      process.stdout.write(`Generated ${voice.id}/system/${phrase.id}\n`);
    }
  }

  await writeFile(
    path.join("public", "audio-manifest.js"),
    `self.MYNAH_AUDIO_ASSETS = ${JSON.stringify(urls)};\n`,
  );
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
