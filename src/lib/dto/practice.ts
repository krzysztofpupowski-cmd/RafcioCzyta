// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.

import type { Flashcard } from "@/types";
import type { StoredReadingLevel } from "@/lib/reading-level-form";
import type { ReviewRating } from "@/lib/schemas/srs";

export interface PracticeCardDTO {
  id: string;
  front_text: string;
  hint_text: string | null;
  level: StoredReadingLevel;
}

export interface StartPracticeSuccessResponse {
  ok: true;
  sessionId: string;
  cards: PracticeCardDTO[];
  totalCount: number;
}

export interface ReviewPracticeRequestBody {
  sessionId: string;
  flashcardId: string;
  rating: ReviewRating;
}

export interface ReviewPracticeSuccessResponse {
  ok: true;
  outcome: "correct" | "incorrect";
  reviewedCount: number;
}

export interface EndPracticeRequestBody {
  sessionId: string;
}

export interface EndPracticeSuccessResponse {
  ok: true;
  sessionId: string;
  endedAt: string;
}

export interface PracticeErrorResponse {
  ok: false;
  error: string;
}

export type StartPracticeResponse = StartPracticeSuccessResponse | PracticeErrorResponse;
export type ReviewPracticeResponse = ReviewPracticeSuccessResponse | PracticeErrorResponse;
export type EndPracticeResponse = EndPracticeSuccessResponse | PracticeErrorResponse;

export function toPracticeCardDTO(card: Flashcard): PracticeCardDTO {
  return {
    id: card.id,
    front_text: card.front_text,
    hint_text: card.hint_text,
    level: card.level,
  };
}
