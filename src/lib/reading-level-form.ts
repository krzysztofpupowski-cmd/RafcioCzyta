export const READING_LEVEL_FORM_VALUES = ["letters", "syllables", "words", "simple_sentences", "unknown"] as const;

export type ReadingLevelFormValue = (typeof READING_LEVEL_FORM_VALUES)[number];
