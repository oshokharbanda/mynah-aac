export const voiceOptions = [
  { id: "sarah", providerId: "EXAVITQu4vr4xnSDxMaL", label: "Sarah" },
  { id: "liam", providerId: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam" },
  { id: "will", providerId: "bIHbv24MWmeRgasZH58o", label: "Will" },
] as const;

export type VoiceId = (typeof voiceOptions)[number]["id"];

export const DEFAULT_VOICE: VoiceId = "sarah";

export function isVoiceId(value: unknown): value is VoiceId {
  return voiceOptions.some((voice) => voice.id === value);
}

export function providerVoiceId(voice: VoiceId) {
  return voiceOptions.find((option) => option.id === voice)?.providerId ?? voiceOptions[0].providerId;
}
