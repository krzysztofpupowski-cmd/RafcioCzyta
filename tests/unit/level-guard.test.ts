import { describe, expect, it } from "vitest";

import { filterCardsByLevel } from "@/lib/services/flashcard-generation";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

interface MinimalCard {
  level: StoredReadingLevel;
  front_text: string;
}

describe("filterCardsByLevel", () => {
  it("returns all cards when every card is at or below the requested level", () => {
    const cards: MinimalCard[] = [
      { level: "letters", front_text: "A" },
      { level: "syllables", front_text: "BA" },
    ];
    const result = filterCardsByLevel(cards, "syllables");
    expect(result).toHaveLength(2);
    expect(result).toEqual(cards);
  });

  it("drops cards whose level is above the requested level", () => {
    const cards: MinimalCard[] = [
      { level: "letters", front_text: "A" },
      { level: "syllables", front_text: "BA" },
      { level: "words", front_text: "KOT" },
      { level: "simple_sentences", front_text: "KOT MA DOM" },
    ];
    const result = filterCardsByLevel(cards, "syllables");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.level)).toEqual(["letters", "syllables"]);
  });

  it("keeps only letters-level cards when requestedLevel is letters", () => {
    const cards: MinimalCard[] = [
      { level: "letters", front_text: "B" },
      { level: "simple_sentences", front_text: "ALA MA KOTA" },
    ];
    const result = filterCardsByLevel(cards, "letters");
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe("letters");
  });
});
