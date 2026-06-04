import { vi } from "vitest";
import { generateText } from "ai";

import type { StoredReadingLevel } from "@/lib/reading-level-form";

interface StubCard {
  front_text: string;
  hint_text: string | null;
  level: StoredReadingLevel;
}

/**
 * Call inside a test to make the next `generateText` call return a happy batch.
 * The test file must declare: `vi.mock("ai", ...)` and `vi.mock("@ai-sdk/openai", ...)`.
 */
export function mockGenerateTextHappy(cards: StubCard[]): void {
  vi.mocked(generateText).mockImplementationOnce(
    () => Promise.resolve({ output: { cards } }) as ReturnType<typeof generateText>,
  );
}

/**
 * Call inside a test to make the next `generateText` call throw a TimeoutError.
 * Production catches `err.name === "TimeoutError"`.
 */
export function mockGenerateTextTimeout(): void {
  vi.mocked(generateText).mockImplementationOnce(() => {
    throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  });
}

/**
 * Call inside a test to make the next `generateText` call throw a plain Error.
 */
export function mockGenerateTextFailure(message?: string): void {
  vi.mocked(generateText).mockImplementationOnce(() => {
    throw new Error(message ?? "stub LLM failure");
  });
}
