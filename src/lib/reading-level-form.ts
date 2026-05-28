export const READING_LEVEL_FORM_VALUES = ["letters", "syllables", "words", "simple_sentences", "unknown"] as const;

export type ReadingLevelFormValue = (typeof READING_LEVEL_FORM_VALUES)[number];

/** DB enum values — the four concrete levels, excluding the wire-only "unknown" sentinel. */
export type StoredReadingLevel = Exclude<ReadingLevelFormValue, "unknown">;
