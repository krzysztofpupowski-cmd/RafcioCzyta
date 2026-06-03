import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";

import { postAcceptFlashcards } from "@/lib/api-handlers/flashcards-accept-post";
import { postPracticeEnd } from "@/lib/api-handlers/practice-end-post";
import { postPracticeReview } from "@/lib/api-handlers/practice-review-post";

import { createApiContext } from "../helpers/api-context";
import { signInAs } from "../helpers/auth-session";
import { requireTestEnv } from "../helpers/env";

describe("cross-parent IDOR", () => {
  it("Parent A cannot accept Parent B draft generation", async () => {
    const env = requireTestEnv();
    const { cookies, headers, user } = await signInAs("A");

    const context = createApiContext({
      method: "POST",
      pathname: "/api/flashcards/accept",
      headers: {
        "Content-Type": "application/json",
        Cookie: headers.get("Cookie") ?? "",
      },
      body: JSON.stringify({ generationId: env.TEST_PARENT_B_GENERATION_ID }),
      cookies,
      locals: { user },
    });

    const response = await postAcceptFlashcards(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Ta partia nie oczekuje już na akceptację.");
  });

  it("Parent A cannot review Parent B practice session", async () => {
    const env = requireTestEnv();
    const { cookies, headers, user } = await signInAs("A");

    const context = createApiContext({
      method: "POST",
      pathname: "/api/practice/review",
      headers: {
        "Content-Type": "application/json",
        Cookie: headers.get("Cookie") ?? "",
      },
      body: JSON.stringify({
        sessionId: env.TEST_PARENT_B_SESSION_ID,
        flashcardId: "55555555-5555-4555-8555-555555555599",
        rating: Rating.Good,
      }),
      cookies,
      locals: { user },
    });

    const response = await postPracticeReview(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Sesja ćwiczeniowa nie została znaleziona lub została zakończona.");
  });

  it("Parent A cannot end Parent B practice session", async () => {
    const env = requireTestEnv();
    const { cookies, headers, user } = await signInAs("A");

    const context = createApiContext({
      method: "POST",
      pathname: "/api/practice/end",
      headers: {
        "Content-Type": "application/json",
        Cookie: headers.get("Cookie") ?? "",
      },
      body: JSON.stringify({ sessionId: env.TEST_PARENT_B_SESSION_ID }),
      cookies,
      locals: { user },
    });

    const response = await postPracticeEnd(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Sesja ćwiczeniowa nie została znaleziona.");
  });
});
