import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

import { postGenerateFlashcards } from "@/lib/api-handlers/flashcards-generate-post";
import { createClient } from "@/lib/supabase";
import type { GenerateFlashcardsSuccessResponse, GenerateFlashcardsErrorResponse } from "@/lib/dto/flashcards";

import { createApiContext } from "../helpers/api-context";
import { signInAs, type SignedInSession } from "../helpers/auth-session";
import { requireTestEnv } from "../helpers/env";
import { mockGenerateTextHappy, mockGenerateTextTimeout, mockGenerateTextFailure } from "../helpers/openai-mock";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn(() => ({})) },
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "stub-model")),
}));

const IN_LEVEL_CARDS = Array.from({ length: 8 }, (_, i) => ({
  front_text: String.fromCharCode(65 + i),
  hint_text: null,
  level: "letters" as const,
}));

const MIXED_CARDS = [
  ...Array.from({ length: 4 }, (_, i) => ({
    front_text: String.fromCharCode(65 + i),
    hint_text: null,
    level: "letters" as const,
  })),
  { front_text: "KOT", hint_text: null, level: "words" as const },
  { front_text: "DOM", hint_text: null, level: "words" as const },
  { front_text: "KOT MA DOM", hint_text: null, level: "simple_sentences" as const },
  { front_text: "ALA MA KOTA", hint_text: null, level: "simple_sentences" as const },
];

describe("flashcards-generate integration", () => {
  let session: SignedInSession;
  let generationIdToCleanUp: string | null = null;

  beforeAll(async () => {
    requireTestEnv();
    session = await signInAs("A");
  });

  afterEach(async () => {
    if (!generationIdToCleanUp) return;
    const supabase = createClient(session.headers, session.cookies);
    if (!supabase) return;
    await supabase.from("flashcards").delete().eq("generation_id", generationIdToCleanUp);
    await supabase.from("flashcard_generations").delete().eq("id", generationIdToCleanUp);
    generationIdToCleanUp = null;
  });

  function makeContext() {
    return createApiContext({
      method: "POST",
      pathname: "/api/flashcards/generate",
      headers: { Cookie: session.headers.get("Cookie") ?? "" },
      cookies: session.cookies,
      locals: { user: session.user },
    });
  }

  it("happy path: 200 with DTO shape and 8 draft rows persisted", async () => {
    mockGenerateTextHappy(IN_LEVEL_CARDS);

    const response = await postGenerateFlashcards(makeContext());
    const body = (await response.json()) as GenerateFlashcardsSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.generationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.requestedLevel).toBe("letters");
    expect(body.cards).toHaveLength(8);
    for (const card of body.cards) {
      expect(typeof card.id).toBe("string");
      expect(typeof card.front_text).toBe("string");
      expect(card.level).toBe("letters");
    }

    generationIdToCleanUp = body.generationId;
  });

  it("level filter wired: above-level cards dropped before persist", async () => {
    mockGenerateTextHappy(MIXED_CARDS);

    const response = await postGenerateFlashcards(makeContext());
    const body = (await response.json()) as GenerateFlashcardsSuccessResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cards).toHaveLength(4);
    for (const card of body.cards) {
      expect(card.level).toBe("letters");
    }

    generationIdToCleanUp = body.generationId;
  });

  it("timeout: 504 with Polish error text", async () => {
    mockGenerateTextTimeout();

    const response = await postGenerateFlashcards(makeContext());
    const body = (await response.json()) as GenerateFlashcardsErrorResponse;

    expect(response.status).toBe(504);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Generowanie fiszek przekroczyło 10 sekund. Spróbuj ponownie.");
  });

  it("generic failure: 503 with Polish error text", async () => {
    mockGenerateTextFailure();

    const response = await postGenerateFlashcards(makeContext());
    const body = (await response.json()) as GenerateFlashcardsErrorResponse;

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
  });

  it("missing API key: 500 with Polish error text, LLM never called", async () => {
    const env = requireTestEnv();

    vi.resetModules();
    vi.doMock("astro:env/server", () => ({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_KEY: env.SUPABASE_KEY,
      OPENAI_API_KEY: "",
    }));
    vi.doMock("ai", () => ({
      generateText: vi.fn(),
      Output: { object: vi.fn(() => ({})) },
    }));
    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn(() => vi.fn(() => "stub-model")),
    }));

    const { postGenerateFlashcards: postGenerateFresh } = await import("@/lib/api-handlers/flashcards-generate-post");

    const response = await postGenerateFresh(makeContext());
    const body = (await response.json()) as GenerateFlashcardsErrorResponse;

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Generator fiszek nie jest skonfigurowany. Skontaktuj się z administratorem.");

    vi.resetModules();
    vi.restoreAllMocks();
  });
});
