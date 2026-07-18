export const attentionPhrase = {
  id: "attention",
  label: "Excuse me",
  speech: "Excuse me. I have something to say.",
} as const;

export const notThatPhrase = {
  id: "not-that",
  label: "Not that",
  speech: "That's not what I meant.",
} as const;

export const urgentPhrases = [
  { id: "bathroom", label: "Bathroom", speech: "Bathroom." },
  { id: "hurt", label: "I'm hurt", speech: "I'm hurt." },
  { id: "unwell", label: "I don't feel well", speech: "I don't feel well." },
  { id: "help", label: "Help me please", speech: "Help me please." },
  { id: "scared", label: "I'm scared", speech: "I'm scared." },
  { id: "finished", label: "I'm finished", speech: "I'm finished." },
] as const;

export const preGeneratedPhrases = [attentionPhrase, notThatPhrase, ...urgentPhrases] as const;

export type PreGeneratedPhrase = (typeof preGeneratedPhrases)[number];

export function phraseById(id: string) {
  return preGeneratedPhrases.find((phrase) => phrase.id === id);
}
