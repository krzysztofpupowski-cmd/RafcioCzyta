export const READING_LEVEL_FORM_VALUES = ["letters", "syllables", "words", "simple_sentences", "unknown"] as const;

export type ReadingLevelFormValue = (typeof READING_LEVEL_FORM_VALUES)[number];

/** DB enum values — the four concrete levels, excluding the wire-only "unknown" sentinel. */
export type StoredReadingLevel = Exclude<ReadingLevelFormValue, "unknown">;

/** Polish labels for the four concrete DB levels (single source of truth). */
export const STORED_LEVEL_LABELS: Record<StoredReadingLevel, string> = {
  letters: "Litery",
  syllables: "Sylaby",
  words: "Pojedyncze słowa",
  simple_sentences: "Proste zdania",
};

/**
 * Returns the Polish display label for a level primitive coming from Astro frontmatter.
 * Null (child selected "Nie wiem") resolves to the fallback "Litery (najprostszy start)".
 */
export function resolveDisplayLevel(level: string | null): string {
  if (!level) return "Litery (najprostszy start)";
  return STORED_LEVEL_LABELS[level as StoredReadingLevel];
}
