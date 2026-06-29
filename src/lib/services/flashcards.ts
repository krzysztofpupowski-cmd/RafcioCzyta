// database.types.ts is excluded from ESLint's project service (eslint.config.js); every
// type derived from Database (Child, ReadingLevel, etc.) is treated as an error type by
// @typescript-eslint here, so the unsafe-* and no-redundant-type-constituents rules are
// disabled file-wide. The Supabase JS client is typed against Database (see supabase.ts)
// so query results carry the right shape at the TS layer; the disables only hide the
// ESLint-side noise. See context/foundation/lessons.md L-001.
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import type { AppSupabase } from "./children";
import type { Flashcard } from "@/types";
import {
  toAcceptedFlashcardDTO,
  toFlashcardSummaryDTO,
  type AcceptedFlashcardDTO,
  type DraftBatchDTO,
} from "@/lib/dto/flashcards";
import { initSrsState } from "@/lib/services/srs-adapter";

export const FLASHCARD_ERROR_BATCH_EMPTY = "FLASHCARD_ERROR_BATCH_EMPTY";

export async function listDraftBatches(supabase: AppSupabase, childId: string): Promise<DraftBatchDTO[]> {
  const { data: generations, error: genError } = await supabase
    .from("flashcard_generations")
    .select("id, requested_level, created_at")
    .eq("child_id", childId)
    .order("created_at", { ascending: true });

  if (genError) {
    throw new Error(genError.message);
  }

  const { data: draftCards, error: cardsError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("child_id", childId)
    .eq("status", "draft")
    .not("generation_id", "is", null);

  if (cardsError) {
    throw new Error(cardsError.message);
  }

  const cardsByGeneration = new Map<string, Flashcard[]>();
  for (const card of draftCards ?? []) {
    const generationId = card.generation_id;
    if (!generationId) continue;
    const existing = cardsByGeneration.get(generationId) ?? [];
    existing.push(card);
    cardsByGeneration.set(generationId, existing);
  }

  const batches: DraftBatchDTO[] = [];
  for (const generation of generations ?? []) {
    const cards = cardsByGeneration.get(generation.id);
    if (!cards || cards.length === 0) continue;

    batches.push({
      generationId: generation.id,
      requestedLevel: generation.requested_level,
      createdAt: generation.created_at,
      cards: cards.map(toFlashcardSummaryDTO),
    });
  }

  return batches;
}

export async function listAcceptedFlashcards(supabase: AppSupabase, childId: string): Promise<AcceptedFlashcardDTO[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select("*")
    .eq("child_id", childId)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(toAcceptedFlashcardDTO);
}

export async function acceptBatch(
  supabase: AppSupabase,
  input: { childId: string; generationId: string },
): Promise<{ updatedCount: number; cards: AcceptedFlashcardDTO[] }> {
  const { data: draftCards, error: selectError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("generation_id", input.generationId)
    .eq("child_id", input.childId)
    .eq("status", "draft");

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (!draftCards || draftCards.length === 0) {
    throw new Error(FLASHCARD_ERROR_BATCH_EMPTY);
  }

  const updatedCards: Flashcard[] = [];

  for (const card of draftCards) {
    const { stored, nextReviewAt, reps_count, last_reviewed_at, mastery_score } = initSrsState();

    const { data, error } = await supabase
      .from("flashcards")
      .update({
        status: "accepted",
        srs_state: stored,
        next_review_at: nextReviewAt.toISOString(),
        reps_count,
        last_reviewed_at,
        mastery_score,
      })
      .eq("id", card.id)
      .eq("child_id", input.childId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    updatedCards.push(data);
  }

  return {
    updatedCount: updatedCards.length,
    cards: updatedCards.map(toAcceptedFlashcardDTO),
  };
}

export async function backfillAcceptedCardsWithoutSrs(
  supabase: AppSupabase,
  childId: string,
): Promise<{ updatedCount: number }> {
  const { data: acceptedWithoutSrs, error: selectError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("child_id", childId)
    .eq("status", "accepted")
    .is("srs_state", null);

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (!acceptedWithoutSrs || acceptedWithoutSrs.length === 0) {
    return { updatedCount: 0 };
  }

  let updatedCount = 0;

  for (const card of acceptedWithoutSrs) {
    const { stored, nextReviewAt, reps_count, last_reviewed_at, mastery_score } = initSrsState();

    const { error } = await supabase
      .from("flashcards")
      .update({
        srs_state: stored,
        next_review_at: nextReviewAt.toISOString(),
        reps_count,
        last_reviewed_at,
        mastery_score,
      })
      .eq("id", card.id)
      .eq("child_id", childId);

    if (error) {
      throw new Error(error.message);
    }

    updatedCount += 1;
  }

  return { updatedCount };
}

/** Soft-delete: sets status to `rejected` so cards leave parent-facing lists and practice queues (see PRD §Model danych i operacje CRUD). */
export async function rejectBatch(
  supabase: AppSupabase,
  input: { childId: string; generationId: string },
): Promise<{ updatedCount: number }> {
  const { data, error } = await supabase
    .from("flashcards")
    .update({ status: "rejected" })
    .eq("generation_id", input.generationId)
    .eq("child_id", input.childId)
    .eq("status", "draft")
    .select();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error(FLASHCARD_ERROR_BATCH_EMPTY);
  }

  return { updatedCount: data.length };
}
