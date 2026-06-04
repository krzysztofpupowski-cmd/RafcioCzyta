// database.types.ts is excluded from ESLint's project service (eslint.config.js); every
// type derived from Database (Child, ReadingLevel, etc.) is treated as an error type by
// @typescript-eslint here, so the unsafe-* and no-redundant-type-constituents rules are
// disabled file-wide. The Supabase JS client is typed against Database (see supabase.ts)
// so query results carry the right shape at the TS layer; the disables only hide the
// ESLint-side noise. See context/foundation/lessons.md L-001.
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { toPracticeCardDTO, type PracticeCardDTO } from "@/lib/dto/practice";
import type { StoredReadingLevel } from "@/lib/reading-level-form";
import { storedSrsStateSchema, type ReviewRating } from "@/lib/schemas/srs";
import { applyReview, fromStored } from "@/lib/services/srs-adapter";
import type { Flashcard } from "@/types";

import type { AppSupabase } from "./children";

export const PRACTICE_ERROR_NO_CHILD_LEVEL = "PRACTICE_ERROR_NO_CHILD_LEVEL";
export const PRACTICE_ERROR_NO_DUE_CARDS = "PRACTICE_ERROR_NO_DUE_CARDS";
export const PRACTICE_ERROR_SESSION_NOT_FOUND = "PRACTICE_ERROR_SESSION_NOT_FOUND";
export const PRACTICE_ERROR_CARD_NOT_IN_SESSION = "PRACTICE_ERROR_CARD_NOT_IN_SESSION";
export const PRACTICE_ERROR_CARD_ALREADY_REVIEWED = "PRACTICE_ERROR_CARD_ALREADY_REVIEWED";
export const PRACTICE_ERROR_INVALID_SRS_STATE = "PRACTICE_ERROR_INVALID_SRS_STATE";

const DUE_CARD_SELECT = "id, front_text, hint_text, level, srs_state, next_review_at";

export async function countDueCards(
  supabase: AppSupabase,
  input: { childId: string; level: StoredReadingLevel },
): Promise<number> {
  const nowIso = new Date().toISOString();

  const { count, error } = await supabase
    .from("flashcards")
    .select("*", { count: "exact", head: true })
    .eq("child_id", input.childId)
    .eq("status", "accepted")
    .eq("level", input.level)
    .not("next_review_at", "is", null)
    .lte("next_review_at", nowIso);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function startPracticeSession(
  supabase: AppSupabase,
  input: { childId: string; level: StoredReadingLevel },
): Promise<{ sessionId: string; cards: PracticeCardDTO[] }> {
  const nowIso = new Date().toISOString();

  const { data: dueCards, error: cardsError } = await supabase
    .from("flashcards")
    .select(DUE_CARD_SELECT)
    .eq("child_id", input.childId)
    .eq("status", "accepted")
    .eq("level", input.level)
    .not("next_review_at", "is", null)
    .lte("next_review_at", nowIso)
    .order("next_review_at", { ascending: true })
    .limit(10);

  if (cardsError) {
    throw new Error(cardsError.message);
  }

  if (!dueCards || dueCards.length === 0) {
    throw new Error(PRACTICE_ERROR_NO_DUE_CARDS);
  }

  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .insert({ child_id: input.childId })
    .select("id")
    .single();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  return {
    sessionId: session.id,
    cards: dueCards.map((row) => toPracticeCardDTO(row as Flashcard)),
  };
}

export async function recordPracticeReview(
  supabase: AppSupabase,
  input: { sessionId: string; childId: string; flashcardId: string; rating: ReviewRating },
): Promise<{ outcome: "correct" | "incorrect"; reviewedCount: number }> {
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("id, ended_at")
    .eq("id", input.sessionId)
    .eq("child_id", input.childId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session || session.ended_at != null) {
    throw new Error(PRACTICE_ERROR_SESSION_NOT_FOUND);
  }

  const { data: existingAttempt, error: attemptLookupError } = await supabase
    .from("practice_attempts")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("flashcard_id", input.flashcardId)
    .maybeSingle();

  if (attemptLookupError) {
    throw new Error(attemptLookupError.message);
  }

  if (existingAttempt) {
    throw new Error(PRACTICE_ERROR_CARD_ALREADY_REVIEWED);
  }

  const { data: flashcard, error: flashcardError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", input.flashcardId)
    .eq("child_id", input.childId)
    .eq("status", "accepted")
    .maybeSingle();

  if (flashcardError) {
    throw new Error(flashcardError.message);
  }

  if (!flashcard) {
    throw new Error(PRACTICE_ERROR_SESSION_NOT_FOUND);
  }

  const parsedSrs = storedSrsStateSchema.safeParse(flashcard.srs_state);
  if (!parsedSrs.success) {
    throw new Error(PRACTICE_ERROR_INVALID_SRS_STATE);
  }

  const reviewResult = applyReview(fromStored(parsedSrs.data), input.rating);
  const lastReviewedAt =
    reviewResult.last_reviewed_at instanceof Date
      ? reviewResult.last_reviewed_at.toISOString()
      : reviewResult.last_reviewed_at;

  const { error: updateError } = await supabase
    .from("flashcards")
    .update({
      srs_state: reviewResult.stored,
      next_review_at: reviewResult.nextReviewAt.toISOString(),
      reps_count: reviewResult.reps_count,
      last_reviewed_at: lastReviewedAt,
      mastery_score: reviewResult.mastery_score,
    })
    .eq("id", input.flashcardId)
    .eq("child_id", input.childId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: insertError } = await supabase.from("practice_attempts").insert({
    session_id: input.sessionId,
    flashcard_id: input.flashcardId,
    child_id: input.childId,
    outcome: reviewResult.practice_outcome,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { count, error: countError } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("session_id", input.sessionId);

  if (countError) {
    throw new Error(countError.message);
  }

  return {
    outcome: reviewResult.practice_outcome,
    reviewedCount: count ?? 0,
  };
}

export async function endPracticeSession(
  supabase: AppSupabase,
  input: { sessionId: string; childId: string },
): Promise<{ endedAt: string }> {
  const { data: session, error: fetchError } = await supabase
    .from("practice_sessions")
    .select("id, ended_at")
    .eq("id", input.sessionId)
    .eq("child_id", input.childId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!session) {
    throw new Error(PRACTICE_ERROR_SESSION_NOT_FOUND);
  }

  if (session.ended_at) {
    return { endedAt: session.ended_at };
  }

  const endedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("practice_sessions")
    .update({ ended_at: endedAt })
    .eq("id", input.sessionId)
    .eq("child_id", input.childId)
    .is("ended_at", null)
    .select("ended_at")
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (updated?.ended_at) {
    return { endedAt: updated.ended_at };
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("practice_sessions")
    .select("ended_at")
    .eq("id", input.sessionId)
    .eq("child_id", input.childId)
    .maybeSingle();

  if (refreshError) {
    throw new Error(refreshError.message);
  }

  if (!refreshed?.ended_at) {
    throw new Error(PRACTICE_ERROR_SESSION_NOT_FOUND);
  }

  return { endedAt: refreshed.ended_at };
}
