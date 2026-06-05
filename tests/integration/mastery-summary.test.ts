// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { postAcceptFlashcards } from "@/lib/api-handlers/flashcards-accept-post";
import { getMasterySummaryHandler } from "@/lib/api-handlers/mastery-summary-get";
import type { MasterySummarySuccessResponse } from "@/lib/dto/mastery";
import { createClient } from "@/lib/supabase";
import type { AppSupabase } from "@/lib/services/children";

import { createApiContext } from "../helpers/api-context";
import { signInAs, type SignedInSession } from "../helpers/auth-session";
import { buildMasteredSrsState } from "../helpers/srs-fixture";

describe("mastery-summary integration", () => {
  let session: SignedInSession;
  let supabase!: AppSupabase;
  let childId!: string;

  const cleanupGenIds: string[] = [];

  beforeAll(async () => {
    session = await signInAs("A");
    const client = createClient(session.headers, session.cookies);
    if (!client) throw new Error("Supabase client not configured");
    supabase = client;

    const { data: childData } = await supabase
      .from("children")
      .select("id")
      .eq("parent_user_id", session.user.id)
      .maybeSingle();
    if (!childData) throw new Error("No child row found for Parent A — re-apply seed.sql");
    childId = childData.id;

    // Pre-delete any existing accepted cards for this child at level 'letters'
    // so each case starts from a deterministic empty state.
  });

  beforeEach(async () => {
    // Pre-delete accepted cards at level 'letters' so each case starts from a deterministic empty state.
    await supabase.from("flashcards").delete().eq("child_id", childId).eq("status", "accepted").eq("level", "letters");
  });

  afterAll(async () => {
    for (const genId of cleanupGenIds) {
      await supabase.from("flashcards").delete().eq("generation_id", genId);
      await supabase.from("flashcard_generations").delete().eq("id", genId);
    }
  });

  function makeGetContext() {
    return createApiContext({
      method: "GET",
      pathname: "/api/mastery/summary",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
    });
  }

  async function insertAndAccept(cardCount: number): Promise<string[]> {
    const genId = crypto.randomUUID();
    cleanupGenIds.push(genId);

    const { error: genError } = await supabase
      .from("flashcard_generations")
      .insert({ id: genId, child_id: childId, requested_level: "letters" });
    if (genError) throw new Error(`insertAndAccept: failed to insert generation — ${genError.message}`);

    const cards = Array.from({ length: cardCount }, (_, i) => ({
      child_id: childId,
      generation_id: genId,
      level: "letters" as const,
      front_text: `mastery-test-${genId.slice(0, 8)}-${i}`,
      status: "draft" as const,
    }));

    const { error: cardsError } = await supabase.from("flashcards").insert(cards);
    if (cardsError) throw new Error(`insertAndAccept: failed to insert cards — ${cardsError.message}`);

    const acceptContext = createApiContext({
      method: "POST",
      pathname: "/api/flashcards/accept",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify({ generationId: genId }),
    });
    const acceptResponse = await postAcceptFlashcards(acceptContext);
    if (acceptResponse.status !== 200) {
      throw new Error(`insertAndAccept: accept failed with status ${acceptResponse.status}`);
    }

    const { data: inserted } = await supabase
      .from("flashcards")
      .select("id")
      .eq("generation_id", genId)
      .eq("child_id", childId);

    return (inserted ?? []).map((r) => r.id);
  }

  it("case 1: no accepted cards → summary is all zeros", async () => {
    const response = await getMasterySummaryHandler(makeGetContext());
    const body = (await response.json()) as MasterySummarySuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual({ acceptedCount: 0, masteredCount: 0, percentMastered: 0 });
  });

  it("case 2: single mastered card → acceptedCount=1, masteredCount=1, percentMastered=100", async () => {
    const [cardId] = await insertAndAccept(1);
    const fixture = buildMasteredSrsState();

    await supabase
      .from("flashcards")
      .update({
        srs_state: fixture.stored,
        mastery_score: fixture.mastery_score,
        reps_count: fixture.reps_count,
        last_reviewed_at: fixture.last_reviewed_at,
        next_review_at: fixture.next_review_at,
      })
      .eq("id", cardId)
      .eq("child_id", childId);

    const response = await getMasterySummaryHandler(makeGetContext());
    const body = (await response.json()) as MasterySummarySuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual({ acceptedCount: 1, masteredCount: 1, percentMastered: 100 });
  });

  it("case 3: mixed — one mastered, one fresh → acceptedCount=2, masteredCount=1, percentMastered=50", async () => {
    const [card0Id, card1Id] = await insertAndAccept(2);
    const fixture = buildMasteredSrsState();

    // Install mastered state on first card only; second keeps initSrsState (mastery_score=0).
    await supabase
      .from("flashcards")
      .update({
        srs_state: fixture.stored,
        mastery_score: fixture.mastery_score,
        reps_count: fixture.reps_count,
        last_reviewed_at: fixture.last_reviewed_at,
        next_review_at: fixture.next_review_at,
      })
      .eq("id", card0Id)
      .eq("child_id", childId);

    // Confirm second card still has fresh (non-mastered) srs_state.
    const { data: freshCard } = await supabase.from("flashcards").select("mastery_score").eq("id", card1Id).single();
    expect(freshCard!.mastery_score).toBe(0);

    const response = await getMasterySummaryHandler(makeGetContext());
    const body = (await response.json()) as MasterySummarySuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual({ acceptedCount: 2, masteredCount: 1, percentMastered: 50 });
  });

  it("case 4: null srs_state skipped silently — acceptedCount=2, masteredCount=1, percentMastered=50", async () => {
    const [card0Id, card1Id] = await insertAndAccept(2);
    const fixture = buildMasteredSrsState();

    // Install mastered state on first card.
    await supabase
      .from("flashcards")
      .update({
        srs_state: fixture.stored,
        mastery_score: fixture.mastery_score,
        reps_count: fixture.reps_count,
        last_reviewed_at: fixture.last_reviewed_at,
        next_review_at: fixture.next_review_at,
      })
      .eq("id", card0Id)
      .eq("child_id", childId);

    // Null-out srs_state on second card — it remains accepted but has no SRS state.
    await supabase.from("flashcards").update({ srs_state: null }).eq("id", card1Id).eq("child_id", childId);

    const response = await getMasterySummaryHandler(makeGetContext());
    const body = (await response.json()) as MasterySummarySuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    // null srs_state card is counted in acceptedCount but skipped in masteredCount.
    expect(body.summary).toEqual({ acceptedCount: 2, masteredCount: 1, percentMastered: 50 });
  });
});
