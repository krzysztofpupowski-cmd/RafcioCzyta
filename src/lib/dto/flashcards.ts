// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { Flashcard } from "@/types";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

export interface GeneratedFlashcardDTO {
  id: string;
  front_text: string;
  hint_text: string | null;
  level: StoredReadingLevel;
}

export interface GenerateFlashcardsSuccessResponse {
  ok: true;
  generationId: string;
  requestedLevel: StoredReadingLevel;
  cards: GeneratedFlashcardDTO[];
}

export interface GenerateFlashcardsErrorResponse {
  ok: false;
  error: string;
}

export type GenerateFlashcardsResponse = GenerateFlashcardsSuccessResponse | GenerateFlashcardsErrorResponse;

export function toGeneratedFlashcardDTO(card: Flashcard): GeneratedFlashcardDTO {
  return {
    id: card.id,
    front_text: card.front_text,
    hint_text: card.hint_text,
    level: card.level as StoredReadingLevel,
  };
}
