import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
import { speakText } from "@/app/lib/speech";
import type { Tile } from "@/app/data/tiles";
import type { VoiceId } from "@/app/lib/audio-voices";
import { phraseById } from "@/app/lib/quick-phrases";

const CLIP_GAP_MS = 120;
let alertAudioContext: AudioContext | null = null;

function clipUrl(tileId: string, voice: VoiceId) {
  return `/audio/en/${voice}/${tileId}.mp3`;
}

function phraseUrl(phraseId: string, voice: VoiceId) {
  return `/audio/en/${voice}/system/${phraseId}.mp3`;
}

function applyAlertBoost(audio: HTMLAudioElement) {
  if (typeof AudioContext === "undefined") return;

  try {
    alertAudioContext ??= new AudioContext();
    const source = alertAudioContext.createMediaElementSource(audio);
    const gain = alertAudioContext.createGain();
    // This is intentionally modest: attention should be easier to hear, never harsh.
    gain.gain.value = 1.3;
    source.connect(gain).connect(alertAudioContext.destination);
    audio.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    void alertAudioContext.resume();
  } catch {
    // Some browsers disallow a media-element graph. Native maximum volume remains safe.
  }
}

function playAudio(url: string, onStart?: () => void, boosted = false) {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(url);
  audio.preload = "auto";
  if (boosted) applyAlertBoost(audio);
  if (onStart) audio.addEventListener("play", onStart, { once: true });
  return audio;
}

function playBlobAudio(blob: Blob, onStart?: () => void) {
  const url = URL.createObjectURL(blob);
  const audio = playAudio(url, onStart);
  if (audio) {
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
  } else {
    URL.revokeObjectURL(url);
  }
  return audio;
}

export function playTileClip(tile: Tile, voice: VoiceId, tappedAt = interactionNow()) {
  const audio = playAudio(clipUrl(tile.id, voice), () => recordInteractionMetric("tap_to_speech_start", tappedAt));
  if (!audio) return speakText(tile.speech_en, "en-US", tappedAt);

  audio.play().then(
    () => recordInteractionMetric("tap_to_speech_dispatch", tappedAt),
    () => {
      // Missing or unsupported local media gets the browser voice only as a last resort.
      speakText(tile.speech_en, "en-US", tappedAt);
    },
  );
  return true;
}

export function playPersonalTileClip(tile: Tile, audioBlob: Blob | undefined, tappedAt = interactionNow()) {
  if (!audioBlob) return speakText(tile.speech_en, "en-US", tappedAt);
  const audio = playBlobAudio(audioBlob, () => recordInteractionMetric("tap_to_speech_start", tappedAt));
  if (!audio) return speakText(tile.speech_en, "en-US", tappedAt);
  audio.play().then(
    () => recordInteractionMetric("tap_to_speech_dispatch", tappedAt),
    () => speakText(tile.speech_en, "en-US", tappedAt),
  );
  return true;
}

export function playPreGeneratedPhrase(phraseId: string, voice: VoiceId, raisedVolume = false) {
  const phrase = phraseById(phraseId);
  if (!phrase) return false;
  const audio = playAudio(phraseUrl(phraseId, voice), undefined, raisedVolume);
  if (!audio) return speakText(phrase.speech, "en-US");
  audio.volume = raisedVolume ? 1 : 0.9;
  audio.play().catch(() => {
    // Keep a local browser-voice escape hatch if the cached file is unavailable.
    speakText(phrase.speech, "en-US");
  });
  return true;
}

function waitForClip(audio: HTMLAudioElement) {
  return new Promise<boolean>((resolve) => {
    const finish = (played: boolean) => resolve(played);
    audio.addEventListener("ended", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });
    audio.play().catch(() => finish(false));
  });
}

export async function playCachedSentence(tiles: readonly Tile[], voice: VoiceId) {
  let playedAny = false;
  for (const tile of tiles) {
    const audio = playAudio(clipUrl(tile.id, voice));
    if (audio) playedAny = (await waitForClip(audio)) || playedAny;
    await new Promise((resolve) => window.setTimeout(resolve, CLIP_GAP_MS));
  }
  return playedAny;
}

export async function playSentenceClips(
  tiles: readonly Tile[],
  voice: VoiceId,
  personalAudio: ReadonlyMap<string, Blob>,
) {
  let playedAny = false;
  for (const tile of tiles) {
    const audio = tile.origin === "personal"
      ? (personalAudio.get(tile.id) ? playBlobAudio(personalAudio.get(tile.id)!) : null)
      : playAudio(clipUrl(tile.id, voice));
    if (audio) playedAny = (await waitForClip(audio)) || playedAny;
    await new Promise((resolve) => window.setTimeout(resolve, CLIP_GAP_MS));
  }
  return playedAny;
}

export async function playSentenceWithFallback(
  text: string,
  tiles: readonly Tile[],
  voice: VoiceId,
  tappedAt = interactionNow(),
  personalAudio = new Map<string, Blob>(),
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 900);

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Natural sentence audio is unavailable.");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = playAudio(url, () => recordInteractionMetric("tap_to_speech_start", tappedAt));
    if (!audio) throw new Error("Audio playback is unavailable.");
    await audio.play();
    recordInteractionMetric("tap_to_speech_dispatch", tappedAt);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
    return true;
  } catch {
    const playedClips = await playSentenceClips(tiles, voice, personalAudio);
    if (!playedClips) speakText(text, "en-US", tappedAt);
    return playedClips;
  } finally {
    window.clearTimeout(timeout);
  }
}
