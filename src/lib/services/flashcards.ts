// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-condition */

import type { AppSupabase } from "./children";
import type { Flashcard } from "@/types";
import {
  toAcceptedFlashcardDTO,
  toFlashcardSummaryDTO,
  type AcceptedFlashcardDTO,
  type DraftBatchDTO,
} from "@/lib/dto/flashcards";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

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
    existing.push(card as Flashcard);
    cardsByGeneration.set(generationId, existing);
  }

  const batches: DraftBatchDTO[] = [];
  for (const generation of generations ?? []) {
    const cards = cardsByGeneration.get(generation.id);
    if (!cards || cards.length === 0) continue;

    batches.push({
      generationId: generation.id,
      requestedLevel: generation.requested_level as StoredReadingLevel,
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
  const { data, error } = await supabase
    .from("flashcards")
    .update({ status: "accepted" })
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

  return {
    updatedCount: data.length,
    cards: data.map(toAcceptedFlashcardDTO),
  };
}

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
