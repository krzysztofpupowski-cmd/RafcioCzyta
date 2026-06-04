// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { postAcceptFlashcards } from "@/lib/api-handlers/flashcards-accept-post";
import { postRejectFlashcards } from "@/lib/api-handlers/flashcards-reject-post";
import { listDraftBatches } from "@/lib/services/flashcards";
import { startPracticeSession, PRACTICE_ERROR_NO_DUE_CARDS } from "@/lib/services/practice-session";
import { createClient } from "@/lib/supabase";
import type {
  AcceptBatchSuccessResponse,
  RejectBatchSuccessResponse,
  FlashcardMutationErrorResponse,
} from "@/lib/dto/flashcards";
import type { PracticeCardDTO } from "@/lib/dto/practice";
import type { AppSupabase } from "@/lib/services/children";

import { createApiContext } from "../helpers/api-context";
import { signInAs, type SignedInSession } from "../helpers/auth-session";
import { requireTestEnv } from "../helpers/env";

describe("flashcards-state-machine integration", () => {
  let session: SignedInSession;
  let supabase!: AppSupabase;
  let childId!: string;
  let acceptRejectGenId!: string;

  const cleanupGenIds: string[] = [];
  let adversarialCardId: string | null = null;
  let adversarialGenId: string | null = null;

  beforeAll(async () => {
    const env = requireTestEnv();
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

    acceptRejectGenId = env.TEST_PARENT_A_GENERATION_ID;
    cleanupGenIds.push(acceptRejectGenId);
    await supabase.from("flashcards").delete().eq("generation_id", acceptRejectGenId);
    await supabase.from("flashcard_generations").delete().eq("id", acceptRejectGenId);
    const { error: genError } = await supabase
      .from("flashcard_generations")
      .insert({ id: acceptRejectGenId, child_id: childId, requested_level: "letters" });
    if (genError) throw new Error(`beforeAll: failed to insert generation — ${genError.message}`);
    const { error: cardsError } = await supabase.from("flashcards").insert([
      {
        child_id: childId,
        generation_id: acceptRejectGenId,
        level: "letters",
        front_text: "accept-test-a",
        status: "draft",
      },
      {
        child_id: childId,
        generation_id: acceptRejectGenId,
        level: "letters",
        front_text: "accept-test-b",
        status: "draft",
      },
    ]);
    if (cardsError) throw new Error(`beforeAll: failed to insert cards — ${cardsError.message}`);
  });

  afterAll(async () => {
    for (const genId of cleanupGenIds) {
      await supabase.from("flashcards").delete().eq("generation_id", genId);
      await supabase.from("flashcard_generations").delete().eq("id", genId);
    }
    if (adversarialCardId) {
      await supabase.from("flashcards").delete().eq("id", adversarialCardId);
    }
    if (adversarialGenId) {
      await supabase.from("flashcard_generations").delete().eq("id", adversarialGenId);
    }
  });

  function makeAcceptContext(generationId: string) {
    return createApiContext({
      method: "POST",
      pathname: "/api/flashcards/accept",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify({ generationId }),
    });
  }

  function makeRejectContext(generationId: string) {
    return createApiContext({
      method: "POST",
      pathname: "/api/flashcards/reject",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify({ generationId }),
    });
  }

  it("case 1: accept happy path — draft → accepted, SRS state initialised", async () => {
    const response = await postAcceptFlashcards(makeAcceptContext(acceptRejectGenId));
    const body = (await response.json()) as AcceptBatchSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(2);
    expect(body.cards).toHaveLength(2);

    const { data } = await supabase
      .from("flashcards")
      .select("status, srs_state, next_review_at, reps_count")
      .eq("generation_id", acceptRejectGenId)
      .eq("child_id", childId);

    expect(data).toHaveLength(2);
    for (const card of data ?? []) {
      expect(card.status).toBe("accepted");
      expect(card.srs_state).not.toBeNull();
      expect(card.next_review_at).not.toBeNull();
      expect(card.reps_count).toBe(0);
    }
  });

  it("case 2: double accept → 404 — batch no longer awaiting acceptance", async () => {
    const { count: beforeAcceptedCount, error: beforeCountError } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("generation_id", acceptRejectGenId)
      .eq("status", "accepted");
    expect(beforeCountError).toBeNull();

    const response = await postAcceptFlashcards(makeAcceptContext(acceptRejectGenId));
    const body = (await response.json()) as FlashcardMutationErrorResponse;

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Ta partia nie oczekuje już na akceptację.");

    const { count: afterAcceptedCount, error: afterCountError } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("generation_id", acceptRejectGenId)
      .eq("status", "accepted");
    expect(afterCountError).toBeNull();
    expect(afterAcceptedCount).toBe(beforeAcceptedCount);
  });

  it("case 3: reject happy path — fresh draft batch moved to rejected", async () => {
    const genId = crypto.randomUUID();
    cleanupGenIds.push(genId);

    const { error: genError } = await supabase
      .from("flashcard_generations")
      .insert({ id: genId, child_id: childId, requested_level: "letters" });
    expect(genError).toBeNull();

    const { error: cardsError } = await supabase.from("flashcards").insert([
      { child_id: childId, generation_id: genId, level: "letters", front_text: "reject-test-a", status: "draft" },
      { child_id: childId, generation_id: genId, level: "letters", front_text: "reject-test-b", status: "draft" },
    ]);
    expect(cardsError).toBeNull();

    const response = await postRejectFlashcards(makeRejectContext(genId));
    const body = (await response.json()) as RejectBatchSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(2);

    const { data } = await supabase
      .from("flashcards")
      .select("status")
      .eq("generation_id", genId)
      .eq("child_id", childId);

    expect(data).toHaveLength(2);
    for (const card of data ?? []) {
      expect(card.status).toBe("rejected");
    }
  });

  it("case 4: draft card with past next_review_at excluded from practice queue (risk #4 adversarial)", async () => {
    adversarialGenId = crypto.randomUUID();

    const { error: genError } = await supabase
      .from("flashcard_generations")
      .insert({ id: adversarialGenId, child_id: childId, requested_level: "letters" });
    expect(genError).toBeNull();

    const { data: insertedCard, error: cardError } = await supabase
      .from("flashcards")
      .insert({
        child_id: childId,
        generation_id: adversarialGenId,
        level: "letters",
        front_text: "adversarial-draft",
        status: "draft",
        next_review_at: "2000-01-01T00:00:00Z",
      })
      .select("id")
      .single();

    expect(cardError).toBeNull();
    adversarialCardId = insertedCard?.id ?? null;

    let practiceResult: { sessionId: string; cards: PracticeCardDTO[] } | null = null;
    try {
      practiceResult = await startPracticeSession(supabase, { childId, level: "letters" });
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(PRACTICE_ERROR_NO_DUE_CARDS);
    }

    if (practiceResult) {
      expect(practiceResult.cards.map((c) => c.id)).not.toContain(adversarialCardId);
      await supabase.from("practice_sessions").delete().eq("id", practiceResult.sessionId);
    }
  });

  describe("case 5: listDraftBatches excludes accepted and rejected generations (risk #5)", () => {
    let acceptGenId: string;
    let rejectGenId: string;
    let liveGenId: string;

    beforeAll(async () => {
      acceptGenId = crypto.randomUUID();
      rejectGenId = crypto.randomUUID();
      liveGenId = crypto.randomUUID();

      const { error: insertGenerationsError } = await supabase.from("flashcard_generations").insert([
        { id: acceptGenId, child_id: childId, requested_level: "letters" },
        { id: rejectGenId, child_id: childId, requested_level: "letters" },
        { id: liveGenId, child_id: childId, requested_level: "letters" },
      ]);
      expect(insertGenerationsError).toBeNull();

      const { error: insertCardsError } = await supabase.from("flashcards").insert([
        {
          child_id: childId,
          generation_id: acceptGenId,
          level: "letters",
          front_text: "list-accept-a",
          status: "draft",
        },
        {
          child_id: childId,
          generation_id: rejectGenId,
          level: "letters",
          front_text: "list-reject-a",
          status: "draft",
        },
        { child_id: childId, generation_id: liveGenId, level: "letters", front_text: "list-live-a", status: "draft" },
      ]);
      expect(insertCardsError).toBeNull();

      const acceptResponse = await postAcceptFlashcards(makeAcceptContext(acceptGenId));
      const acceptBody = (await acceptResponse.json()) as AcceptBatchSuccessResponse;
      expect(acceptResponse.status).toBe(200);
      expect(acceptBody.ok).toBe(true);

      const rejectResponse = await postRejectFlashcards(makeRejectContext(rejectGenId));
      const rejectBody = (await rejectResponse.json()) as RejectBatchSuccessResponse;
      expect(rejectResponse.status).toBe(200);
      expect(rejectBody.ok).toBe(true);
    });

    afterAll(async () => {
      await supabase.from("flashcards").delete().eq("generation_id", acceptGenId);
      await supabase.from("flashcard_generations").delete().eq("id", acceptGenId);
      await supabase.from("flashcards").delete().eq("generation_id", rejectGenId);
      await supabase.from("flashcard_generations").delete().eq("id", rejectGenId);
      await supabase.from("flashcards").delete().eq("generation_id", liveGenId);
      await supabase.from("flashcard_generations").delete().eq("id", liveGenId);
    });

    it("accepted and rejected generations excluded; live draft generation included", async () => {
      const batches = await listDraftBatches(supabase, childId);
      const batchIds = batches.map((b) => b.generationId);

      expect(batchIds).not.toContain(acceptGenId);
      expect(batchIds).not.toContain(rejectGenId);
      expect(batchIds).toContain(liveGenId);
    });
  });

  it("case 6: reject unauthenticated → 401", async () => {
    const env = requireTestEnv();
    const context = createApiContext({
      method: "POST",
      pathname: "/api/flashcards/reject",
      body: JSON.stringify({ generationId: env.TEST_PARENT_A_GENERATION_ID }),
      locals: { user: null },
    });

    const response = await postRejectFlashcards(context);
    const body = (await response.json()) as FlashcardMutationErrorResponse;

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Musisz być zalogowany.");
  });

  it("case 7: reject cross-parent batch → 404 (IDOR guard)", async () => {
    const env = requireTestEnv();

    const response = await postRejectFlashcards(makeRejectContext(env.TEST_PARENT_B_GENERATION_ID));
    const body = (await response.json()) as FlashcardMutationErrorResponse;

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Ta partia nie oczekuje już na akceptację.");
  });
});
