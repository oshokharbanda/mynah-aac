export const categoryIds = ["food", "people", "places", "feelings", "play", "needs"] as const;

export type CategoryId = (typeof categoryIds)[number];

export type Category = {
  id: CategoryId;
  label: string;
};

export type Tile = {
  id: string;
  is_core: boolean;
  pinned_index: number | null;
  category: CategoryId | null;
  part_of_speech:
    | "pronoun"
    | "verb"
    | "noun"
    | "adjective"
    | "social"
    | "question"
    | "negation"
    | "preposition"
    | "determiner";
  label_en: string;
  label_local: string;
  speech_en: string;
  speech_local: string;
  symbol: {
    provider: "arasaac" | "mulberry" | "text";
    localPath?: string;
    attribution: string;
    license: "CC-BY-NC-SA" | "CC-BY-SA";
  };
  origin: "core" | "personal" | "ai_candidate";
  approved: boolean;
  usage: { count: number; last_used_at: number | null };
};

export const categories: readonly Category[] = [
  { id: "food", label: "Food & drinks" },
  { id: "people", label: "People" },
  { id: "places", label: "Places" },
  { id: "feelings", label: "Feelings" },
  { id: "play", label: "Play" },
  { id: "needs", label: "Needs" },
];

const arasaac = (file: string) => ({
  provider: "arasaac" as const,
  localPath: `/symbols/${file}.png`,
  attribution: "ARASAAC, Sergio Palao",
  license: "CC-BY-NC-SA" as const,
});

const core = (
  id: string,
  pinned_index: number,
  part_of_speech: Tile["part_of_speech"],
  label_en: string,
  label_local: string,
  speech_local: string,
): Tile => ({
  id,
  is_core: true,
  pinned_index,
  category: null,
  part_of_speech,
  label_en,
  label_local,
  speech_en: label_en,
  speech_local,
  symbol: arasaac(id),
  origin: "core",
  approved: true,
  usage: { count: 0, last_used_at: null },
});

const fringe = (
  id: string,
  category: CategoryId,
  part_of_speech: Tile["part_of_speech"],
  label_en: string,
  label_local: string,
  speech_local = label_local,
): Tile => ({
  id,
  is_core: false,
  pinned_index: null,
  category,
  part_of_speech,
  label_en,
  label_local,
  speech_en: label_en,
  speech_local,
  symbol: arasaac(id),
  origin: "core",
  approved: true,
  usage: { count: 0, last_used_at: null },
});

// Order and pinned_index are intentional motor-planning slots. Do not sort or reshuffle.
export const coreTiles: readonly Tile[] = [
  core("i", 0, "pronoun", "I", "मैं", "मैं"),
  core("you", 1, "pronoun", "you", "तुम", "तुम"),
  core("want", 2, "verb", "want", "चाहिए", "चाहिए"),
  core("more", 3, "adjective", "more", "और", "और"),
  core("stop", 4, "verb", "stop", "रुको", "रुको"),
  core("go", 5, "verb", "go", "जाओ", "जाओ"),
  core("help", 6, "verb", "help", "मदद", "मदद"),
  core("like", 7, "verb", "like", "पसंद", "पसंद"),
  core("not", 8, "negation", "not", "नहीं", "नहीं"),
  core("my", 9, "determiner", "my", "मेरा", "मेरा"),
  core("it", 10, "pronoun", "it", "यह", "यह"),
  core("that", 11, "determiner", "that", "वह", "वह"),
  core("put", 12, "verb", "put", "रखो", "रखो"),
  core("make", 13, "verb", "make", "बनाओ", "बनाओ"),
  core("look", 14, "verb", "look", "देखो", "देखो"),
  core("turn", 15, "verb", "turn", "घुमाओ", "घुमाओ"),
  core("big", 16, "adjective", "big", "बड़ा", "बड़ा"),
  core("little", 17, "adjective", "little", "छोटा", "छोटा"),
  core("good", 18, "adjective", "good", "अच्छा", "अच्छा"),
  core("bad", 19, "adjective", "bad", "बुरा", "बुरा"),
  core("yes", 20, "social", "yes", "हाँ", "हाँ"),
  core("no", 21, "negation", "no", "नहीं", "नहीं"),
  core("please", 22, "social", "please", "कृपया", "कृपया"),
  core("done", 23, "adjective", "done", "हो गया", "हो गया"),
];

export const fringeTiles: readonly Tile[] = [
  fringe("water", "food", "noun", "water", "पानी"),
  fringe("eat", "food", "verb", "eat", "खाना"),
  fringe("apple", "food", "noun", "apple", "सेब"),
  fringe("banana", "food", "noun", "banana", "केला"),
  fringe("milk", "food", "noun", "milk", "दूध"),
  fringe("snack", "food", "noun", "snack", "नाश्ता"),
  fringe("mom", "people", "noun", "mom", "माँ"),
  fringe("dad", "people", "noun", "dad", "पापा"),
  fringe("teacher", "people", "noun", "teacher", "शिक्षक"),
  fringe("friend", "people", "noun", "friend", "दोस्त"),
  fringe("family", "people", "noun", "family", "परिवार"),
  fringe("baby", "people", "noun", "baby", "बच्चा"),
  fringe("home", "places", "noun", "home", "घर"),
  fringe("school", "places", "noun", "school", "स्कूल"),
  fringe("park", "places", "noun", "park", "पार्क"),
  fringe("bathroom", "places", "noun", "bathroom", "बाथरूम"),
  fringe("kitchen", "places", "noun", "kitchen", "रसोई"),
  fringe("bed", "places", "noun", "bed", "बिस्तर"),
  fringe("happy", "feelings", "adjective", "happy", "खुश"),
  fringe("sad", "feelings", "adjective", "sad", "उदास"),
  fringe("tired", "feelings", "adjective", "tired", "थका"),
  fringe("angry", "feelings", "adjective", "angry", "गुस्सा"),
  fringe("scared", "feelings", "adjective", "scared", "डरा"),
  fringe("excited", "feelings", "adjective", "excited", "उत्साहित"),
  fringe("ball", "play", "noun", "ball", "गेंद"),
  fringe("book", "play", "noun", "book", "किताब"),
  fringe("music", "play", "noun", "music", "संगीत"),
  fringe("toy", "play", "noun", "toy", "खिलौना"),
  fringe("bubbles", "play", "noun", "bubbles", "बुलबुले"),
  fringe("draw", "play", "verb", "draw", "बनाओ"),
  fringe("toilet", "needs", "noun", "toilet", "टॉयलेट"),
  fringe("hurt", "needs", "verb", "hurt", "दर्द"),
  fringe("thirsty", "needs", "adjective", "thirsty", "प्यासा"),
  fringe("hungry", "needs", "adjective", "hungry", "भूखा"),
  fringe("cold", "needs", "adjective", "cold", "ठंडा"),
  fringe("hot", "needs", "adjective", "hot", "गरम"),
];

export const allTiles = [...coreTiles, ...fringeTiles] as const;
