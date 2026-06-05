// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition */

import { Rating } from "ts-fsrs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postAcceptFlashcards } from "@/lib/api-handlers/flashcards-accept-post";
import { postPracticeEnd } from "@/lib/api-handlers/practice-end-post";
import { postPracticeReview } from "@/lib/api-handlers/practice-review-post";
import { postPracticeStart } from "@/lib/api-handlers/practice-start-post";
import type {
  EndPracticeSuccessResponse,
  PracticeErrorResponse,
  ReviewPracticeSuccessResponse,
  StartPracticeSuccessResponse,
} from "@/lib/dto/practice";
import type { AcceptBatchSuccessResponse } from "@/lib/dto/flashcards";
import { createClient } from "@/lib/supabase";
import type { AppSupabase } from "@/lib/services/children";

import { createApiContext } from "../helpers/api-context";
import { signInAs, type SignedInSession } from "../helpers/auth-session";

describe("practice-flow integration", () => {
  let session: SignedInSession;
  let supabase!: AppSupabase;
  let childId!: string;

  const cleanupGenIds: string[] = [];

  // shared state across the ordered happy-path cases
  let sessionId!: string;
  let card0Id!: string;
  let card1Id!: string;
  let card2Id!: string; // used for the INVALID_SRS_STATE case

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

    // Insert a generation with 3 draft cards and accept them to install real SRS state.
    const genId = crypto.randomUUID();
    cleanupGenIds.push(genId);

    const { error: genError } = await supabase
      .from("flashcard_generations")
      .insert({ id: genId, child_id: childId, requested_level: "letters" });
    if (genError) throw new Error(`beforeAll: failed to insert generation — ${genError.message}`);

    const { error: cardsError } = await supabase.from("flashcards").insert([
      { child_id: childId, generation_id: genId, level: "letters", front_text: "practice-flow-a", status: "draft" },
      { child_id: childId, generation_id: genId, level: "letters", front_text: "practice-flow-b", status: "draft" },
      { child_id: childId, generation_id: genId, level: "letters", front_text: "practice-flow-c", status: "draft" },
    ]);
    if (cardsError) throw new Error(`beforeAll: failed to insert cards — ${cardsError.message}`);

    // Accept the batch to install real SRS state via production handler.
    const acceptContext = createApiContext({
      method: "POST",
      pathname: "/api/flashcards/accept",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify({ generationId: genId }),
    });
    const acceptResponse = await postAcceptFlashcards(acceptContext);
    const acceptBody = (await acceptResponse.json()) as AcceptBatchSuccessResponse;
    if (acceptResponse.status !== 200) {
      throw new Error(`beforeAll: accept failed — ${JSON.stringify(acceptBody)}`);
    }

    // Force all cards to be definitively due by backdating next_review_at.
    const { error: updateError } = await supabase
      .from("flashcards")
      .update({ next_review_at: "2000-01-01T00:00:00Z" })
      .eq("generation_id", genId)
      .eq("child_id", childId);
    if (updateError) throw new Error(`beforeAll: failed to backdate next_review_at — ${updateError.message}`);

    // Fetch card IDs for use in tests.
    const { data: cardRows } = await supabase
      .from("flashcards")
      .select("id, front_text")
      .eq("generation_id", genId)
      .eq("child_id", childId)
      .order("front_text", { ascending: true });
    if (!cardRows || cardRows.length < 3) throw new Error("beforeAll: expected 3 cards");

    card0Id = cardRows[0].id;
    card1Id = cardRows[1].id;
    card2Id = cardRows[2].id;
  });

  afterAll(async () => {
    // Clean up any open sessions created during tests.
    if (sessionId) {
      await supabase.from("practice_attempts").delete().eq("session_id", sessionId);
      await supabase.from("practice_sessions").delete().eq("id", sessionId);
    }
    // Restore card2 in case the INVALID_SRS_STATE test left it malformed.
    // (cleanup of flashcards happens via generation cleanup below)
    for (const genId of cleanupGenIds) {
      await supabase.from("flashcards").delete().eq("generation_id", genId);
      await supabase.from("flashcard_generations").delete().eq("id", genId);
    }
  });

  function makeStartContext() {
    return createApiContext({
      method: "POST",
      pathname: "/api/practice/start",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
    });
  }

  function makeReviewContext(body: { sessionId: string; flashcardId: string; rating: number }) {
    return createApiContext({
      method: "POST",
      pathname: "/api/practice/review",
      headers: { Cookie: session.headers.get("Cookie") ?? "", "Content-Type": "application/json" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify(body),
    });
  }

  function makeEndContext(sid: string) {
    return createApiContext({
      method: "POST",
      pathname: "/api/practice/end",
      headers: { Cookie: session.headers.get("Cookie") ?? "", "Content-Type": "application/json" },
      cookies: session.cookies,
      locals: { user: session.user },
      body: JSON.stringify({ sessionId: sid }),
    });
  }

  it("case 1: start returns due cards and sessionId", async () => {
    const response = await postPracticeStart(makeStartContext());
    const body = (await response.json()) as StartPracticeSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.sessionId).toBe("string");
    expect(body.cards.length).toBeGreaterThanOrEqual(2);
    expect(body.totalCount).toBe(body.cards.length);

    sessionId = body.sessionId;
    const cardIds = body.cards.map((c) => c.id);
    expect(cardIds).toContain(card0Id);
    expect(cardIds).toContain(card1Id);
  });

  it("case 2: review #1 — Good rating → correct outcome, SRS advanced", async () => {
    const response = await postPracticeReview(
      makeReviewContext({ sessionId, flashcardId: card0Id, rating: Rating.Good }),
    );
    const body = (await response.json()) as ReviewPracticeSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("correct");
    expect(body.reviewedCount).toBe(1);

    const { data: card } = await supabase
      .from("flashcards")
      .select("srs_state, next_review_at, reps_count, last_reviewed_at, mastery_score")
      .eq("id", card0Id)
      .single();

    expect(card).not.toBeNull();
    expect(card!.srs_state).not.toBeNull();
    expect(card!.reps_count).toBeGreaterThanOrEqual(1);
    expect(card!.next_review_at).not.toBe("2000-01-01T00:00:00Z");
    expect(card!.last_reviewed_at).not.toBeNull();
    expect(card!.mastery_score).not.toBeNull();

    const { data: attempts } = await supabase
      .from("practice_attempts")
      .select("outcome")
      .eq("session_id", sessionId)
      .eq("flashcard_id", card0Id);

    expect(attempts).toHaveLength(1);
    expect(attempts![0].outcome).toBe("correct");
  });

  it("case 3: review #2 — Again rating → incorrect outcome, second attempt persisted", async () => {
    const response = await postPracticeReview(
      makeReviewContext({ sessionId, flashcardId: card1Id, rating: Rating.Again }),
    );
    const body = (await response.json()) as ReviewPracticeSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("incorrect");
    expect(body.reviewedCount).toBe(2);

    const { data: card } = await supabase
      .from("flashcards")
      .select("last_reviewed_at, srs_state")
      .eq("id", card1Id)
      .single();

    expect(card).not.toBeNull();
    expect(card!.last_reviewed_at).not.toBeNull();
    expect(card!.srs_state).not.toBeNull();

    const { data: attempts } = await supabase
      .from("practice_attempts")
      .select("outcome")
      .eq("session_id", sessionId)
      .order("answered_at", { ascending: true });

    expect(attempts).toHaveLength(2);
    const outcomes = (attempts ?? []).map((a) => a.outcome);
    expect(outcomes).toContain("correct");
    expect(outcomes).toContain("incorrect");
  });

  it("case 4: card already reviewed → 400 + Polish text", async () => {
    const response = await postPracticeReview(
      makeReviewContext({ sessionId, flashcardId: card0Id, rating: Rating.Good }),
    );
    const body = (await response.json()) as PracticeErrorResponse;

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Ta fiszka została już oceniona w tej sesji.");

    const { count } = await supabase
      .from("practice_attempts")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    expect(count).toBe(2);
  });

  it("case 5: invalid SRS state → 400 + Polish text, card unchanged", async () => {
    await supabase
      .from("flashcards")
      .update({ srs_state: { malformed: true } })
      .eq("id", card2Id)
      .eq("child_id", childId);

    const response = await postPracticeReview(
      makeReviewContext({ sessionId, flashcardId: card2Id, rating: Rating.Good }),
    );
    const body = (await response.json()) as PracticeErrorResponse;

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Nie udało się odczytać stanu powtórki tej fiszki.");

    const { data: card } = await supabase.from("flashcards").select("srs_state").eq("id", card2Id).single();

    expect(card).not.toBeNull();
    expect((card!.srs_state as Record<string, unknown>)?.malformed).toBe(true);
  });

  it("case 6: session not found → 404 + Polish text", async () => {
    const fakeSessionId = crypto.randomUUID();
    const response = await postPracticeReview(
      makeReviewContext({ sessionId: fakeSessionId, flashcardId: card0Id, rating: Rating.Good }),
    );
    const body = (await response.json()) as PracticeErrorResponse;

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Sesja ćwiczeniowa nie została znaleziona lub została zakończona.");
  });

  it("case 7: end idempotency — second end returns same endedAt", async () => {
    const response1 = await postPracticeEnd(makeEndContext(sessionId));
    const body1 = (await response1.json()) as EndPracticeSuccessResponse;

    expect(response1.status).toBe(200);
    expect(body1.ok).toBe(true);
    expect(typeof body1.endedAt).toBe("string");

    const firstEndedAt = body1.endedAt;

    const response2 = await postPracticeEnd(makeEndContext(sessionId));
    const body2 = (await response2.json()) as EndPracticeSuccessResponse;

    expect(response2.status).toBe(200);
    expect(body2.ok).toBe(true);
    expect(body2.endedAt).toBe(firstEndedAt);

    const { data: sessionRow } = await supabase
      .from("practice_sessions")
      .select("ended_at")
      .eq("id", sessionId)
      .single();

    expect(sessionRow?.ended_at).toBe(firstEndedAt);
  });

  it("case 8: practice start — no due cards → 404 + Polish text", async () => {
    // Move all accepted cards for this child to a future date so none are due.
    await supabase
      .from("flashcards")
      .update({ next_review_at: "2099-01-01T00:00:00Z" })
      .eq("child_id", childId)
      .eq("status", "accepted");

    const response = await postPracticeStart(makeStartContext());
    const body = (await response.json()) as PracticeErrorResponse;

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Brak fiszek do powtórki.");

    // Restore so future test runs aren't affected.
    await supabase
      .from("flashcards")
      .update({ next_review_at: "2000-01-01T00:00:00Z" })
      .eq("generation_id", cleanupGenIds[0])
      .eq("child_id", childId);
  });
});
