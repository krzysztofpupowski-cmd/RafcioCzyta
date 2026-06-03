import { describe, expect, it } from "vitest";

import { postAuthSignin } from "@/lib/api-handlers/auth-signin-post";
import { postChildren } from "@/lib/api-handlers/children-post";
import { postGenerateFlashcards } from "@/lib/api-handlers/flashcards-generate-post";
import { getMasterySummaryHandler } from "@/lib/api-handlers/mastery-summary-get";
import { postPracticeReview } from "@/lib/api-handlers/practice-review-post";
import { requireTestEnv } from "../helpers/env";
import { createApiContext, createCookieStore } from "../helpers/api-context";

describe("unauthenticated protected APIs", () => {
  it("postChildren redirects to sign-in with 303", async () => {
    const context = createApiContext({
      method: "POST",
      pathname: "/api/children",
      body: new FormData(),
    });

    const response = await postChildren(context);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toMatch(/\/auth\/signin$/);
  });

  it("postGenerate returns 401 JSON", async () => {
    const context = createApiContext({
      method: "POST",
      pathname: "/api/flashcards/generate",
    });

    const response = await postGenerateFlashcards(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("getMasterySummary returns 401 JSON", async () => {
    const context = createApiContext({
      method: "GET",
      pathname: "/api/mastery/summary",
    });

    const response = await getMasterySummaryHandler(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("postPracticeReview returns 401 JSON", async () => {
    const context = createApiContext({
      method: "POST",
      pathname: "/api/practice/review",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "00000000-0000-0000-0000-000000000001",
        flashcardId: "00000000-0000-0000-0000-000000000002",
        rating: "good",
      }),
    });

    const response = await postPracticeReview(context);
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });
});

describe("sign-in smoke", () => {
  it("postAuthSignin sets session cookies for Parent A", async () => {
    const env = requireTestEnv();
    const form = new FormData();
    form.set("email", env.TEST_PARENT_A_EMAIL);
    form.set("password", env.TEST_PARENT_A_PASSWORD);

    const cookies = createCookieStore();
    const context = createApiContext({
      method: "POST",
      pathname: "/api/auth/signin",
      body: form,
      cookies,
    });

    const response = await postAuthSignin(context);
    const location = response.headers.get("Location") ?? "";

    expect(location, "sign-in failed — check TEST_PARENT_A_* credentials and test project").not.toContain("error=");
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(location).toMatch(/\/dashboard$/);
    expect(cookies.headers()).toMatch(/sb-/);
  });
});
