// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.

import type { Flashcard } from "@/types";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

export interface GeneratedFlashcardDTO {
  id: string;
  front_text: string;
  hint_text: string | null;
  level: StoredReadingLevel;
}

export type FlashcardSummaryDTO = GeneratedFlashcardDTO;

export interface DraftBatchDTO {
  generationId: string;
  requestedLevel: StoredReadingLevel;
  createdAt: string;
  cards: FlashcardSummaryDTO[];
}

export interface AcceptedFlashcardDTO extends FlashcardSummaryDTO {
  acceptedAt: string;
}

export interface AcceptBatchRequestBody {
  generationId: string;
}

export interface RejectBatchRequestBody {
  generationId: string;
}

export interface AcceptBatchSuccessResponse {
  ok: true;
  generationId: string;
  updatedCount: number;
  cards: AcceptedFlashcardDTO[];
}

export interface RejectBatchSuccessResponse {
  ok: true;
  generationId: string;
  updatedCount: number;
}

export interface FlashcardMutationErrorResponse {
  ok: false;
  error: string;
}

export type AcceptBatchResponse = AcceptBatchSuccessResponse | FlashcardMutationErrorResponse;
export type RejectBatchResponse = RejectBatchSuccessResponse | FlashcardMutationErrorResponse;

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

export function toFlashcardSummaryDTO(card: Flashcard): FlashcardSummaryDTO {
  return {
    id: card.id,
    front_text: card.front_text,
    hint_text: card.hint_text,
    level: card.level,
  };
}

export function toGeneratedFlashcardDTO(card: Flashcard): GeneratedFlashcardDTO {
  return toFlashcardSummaryDTO(card);
}

export function toAcceptedFlashcardDTO(card: Flashcard): AcceptedFlashcardDTO {
  return {
    ...toFlashcardSummaryDTO(card),
    acceptedAt: card.updated_at,
  };
}
