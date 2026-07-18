export const categoryIds = ["food", "people", "places", "feelings", "play", "needs", "my_words"] as const;

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
  speech_en: string;
  symbol: {
    provider: "arasaac" | "mulberry" | "text";
    localPath?: string;
    emoji?: string;
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
  { id: "my_words", label: "My words" },
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
): Tile => ({
  id,
  is_core: true,
  pinned_index,
  category: null,
  part_of_speech,
  label_en,
  speech_en: label_en,
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
): Tile => ({
  id,
  is_core: false,
  pinned_index: null,
  category,
  part_of_speech,
  label_en,
  speech_en: label_en,
  symbol: arasaac(id),
  origin: "core",
  approved: true,
  usage: { count: 0, last_used_at: null },
});

// Order and pinned_index are intentional motor-planning slots. Do not sort or reshuffle.
export const coreTiles: readonly Tile[] = [
  core("i", 0, "pronoun", "I"),
  core("you", 1, "pronoun", "you"),
  core("want", 2, "verb", "want"),
  core("more", 3, "adjective", "more"),
  core("stop", 4, "verb", "stop"),
  core("go", 5, "verb", "go"),
  core("help", 6, "verb", "help"),
  core("like", 7, "verb", "like"),
  core("not", 8, "negation", "not"),
  core("my", 9, "determiner", "my"),
  core("it", 10, "pronoun", "it"),
  core("that", 11, "determiner", "that"),
  core("put", 12, "verb", "put"),
  core("make", 13, "verb", "make"),
  core("look", 14, "verb", "look"),
  core("turn", 15, "verb", "turn"),
  core("big", 16, "adjective", "big"),
  core("little", 17, "adjective", "little"),
  core("good", 18, "adjective", "good"),
  core("bad", 19, "adjective", "bad"),
  core("yes", 20, "social", "yes"),
  core("no", 21, "negation", "no"),
  core("please", 22, "social", "please"),
  core("done", 23, "adjective", "done"),
];

export const fringeTiles: readonly Tile[] = [
  fringe("water", "food", "noun", "water"),
  fringe("eat", "food", "verb", "eat"),
  fringe("apple", "food", "noun", "apple"),
  fringe("banana", "food", "noun", "banana"),
  fringe("milk", "food", "noun", "milk"),
  fringe("snack", "food", "noun", "snack"),
  fringe("mom", "people", "noun", "mom"),
  fringe("dad", "people", "noun", "dad"),
  fringe("teacher", "people", "noun", "teacher"),
  fringe("friend", "people", "noun", "friend"),
  fringe("family", "people", "noun", "family"),
  fringe("baby", "people", "noun", "baby"),
  fringe("home", "places", "noun", "home"),
  fringe("school", "places", "noun", "school"),
  fringe("park", "places", "noun", "park"),
  fringe("bathroom", "places", "noun", "bathroom"),
  fringe("kitchen", "places", "noun", "kitchen"),
  fringe("bed", "places", "noun", "bed"),
  fringe("happy", "feelings", "adjective", "happy"),
  fringe("sad", "feelings", "adjective", "sad"),
  fringe("tired", "feelings", "adjective", "tired"),
  fringe("angry", "feelings", "adjective", "angry"),
  fringe("scared", "feelings", "adjective", "scared"),
  fringe("excited", "feelings", "adjective", "excited"),
  fringe("ball", "play", "noun", "ball"),
  fringe("book", "play", "noun", "book"),
  fringe("music", "play", "noun", "music"),
  fringe("toy", "play", "noun", "toy"),
  fringe("bubbles", "play", "noun", "bubbles"),
  fringe("draw", "play", "verb", "draw"),
  fringe("toilet", "needs", "noun", "toilet"),
  fringe("hurt", "needs", "verb", "hurt"),
  fringe("thirsty", "needs", "adjective", "thirsty"),
  fringe("hungry", "needs", "adjective", "hungry"),
  fringe("cold", "needs", "adjective", "cold"),
  fringe("hot", "needs", "adjective", "hot"),
];

export const allTiles = [...coreTiles, ...fringeTiles] as const;
