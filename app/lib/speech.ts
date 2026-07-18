import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";

export type SpeechLanguage = "en-US";

let cachedVoices: SpeechSynthesisVoice[] = [];
let voiceListenerAttached = false;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function browserSpeech() {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function refreshVoices() {
  const speech = browserSpeech();
  cachedVoices = speech?.getVoices() ?? [];
  return cachedVoices;
}

export function prepareSpeechVoices() {
  const speech = browserSpeech();
  if (!speech) return Promise.resolve([]);

  const initialVoices = refreshVoices();
  if (initialVoices.length) return Promise.resolve(initialVoices);
  if (voicesReady) return voicesReady;

  voicesReady = new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      resolve(refreshVoices());
    };
    const timeout = window.setTimeout(finish, 1200);

    if (!voiceListenerAttached) {
      speech.addEventListener("voiceschanged", finish, { once: true });
      voiceListenerAttached = true;
    }
  });

  return voicesReady;
}

function voiceFor(language: SpeechLanguage) {
  const voices = refreshVoices();
  const languageBase = language.slice(0, 2).toLowerCase();

  return (
    voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(languageBase)) ??
    voices[0]
  );
}

export function speakText(text: string, language: SpeechLanguage, tappedAt = interactionNow()) {
  const speech = browserSpeech();
  if (!text || !speech || typeof SpeechSynthesisUtterance === "undefined") return false;

  // Start resolving on mount. If the browser is still loading voices on the first
  // tap, omitting utterance.voice invokes the browser's own default voice instead.
  void prepareSpeechVoices();
  const voice = voiceFor(language);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang || language;
  utterance.rate = 0.85;
  if (voice) utterance.voice = voice;
  utterance.onstart = () => recordInteractionMetric("tap_to_speech_start", tappedAt);

  speech.cancel();
  speech.speak(utterance);
  recordInteractionMetric("tap_to_speech_dispatch", tappedAt);
  return true;
}
