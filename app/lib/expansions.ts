import type { Tile } from "@/app/data/tiles";

export const expansionIntents = ["request", "comment", "refusal", "feeling", "question"] as const;

export type ExpansionIntent = (typeof expansionIntents)[number];

export type ExpansionUtterance = {
  tile_ids: string[];
  intent: ExpansionIntent;
};

export type ExpansionResponse = {
  utterances: ExpansionUtterance[];
};

export function canExpandTile(tile: Tile | undefined) {
  return tile?.part_of_speech === "noun" || tile?.part_of_speech === "verb";
}
