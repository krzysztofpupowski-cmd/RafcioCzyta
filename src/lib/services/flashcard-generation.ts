// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

export const FLASHCARD_ERROR_MISSING_API_KEY = "OpenAI API key is not configured.";
export const FLASHCARD_ERROR_TIMEOUT = "Flashcard generation timed out. Please try again.";
export const FLASHCARD_ERROR_GENERATION_FAILED = "Flashcard generation failed. Please try again later.";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { OPENAI_API_KEY } from "astro:env/server";

import type { AppSupabase } from "./children";
import type { Flashcard, FlashcardGeneration } from "@/types";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

const flashcardBatchSchema = z.object({
  cards: z.array(
    z.object({
      front_text: z.string(),
      hint_text: z.string().nullable(),
      level: z.enum(["letters", "syllables", "words", "simple_sentences"]),
    }),
  ),
});

const LEVEL_ORDER = ["letters", "syllables", "words", "simple_sentences"] as const;

function buildPrompt(level: StoredReadingLevel): string {
  const levelNames: Record<StoredReadingLevel, string> = {
    letters: "liter (pojedynczych liter lub prostych sylab jednosylabowych)",
    syllables: "sylab (dwu- lub trzyliterowych sylab i krótkich słów)",
    words: "słów (prostych wyrazów 3–5 liter)",
    simple_sentences: "prostych zdań (krótkich zdań złożonych z 3–5 słów)",
  };
  return `Jesteś pomocnym asystentem do nauki czytania dla małych dzieci. Wygeneruj dokładnie 8 fiszek do ćwiczenia czytania na poziomie ${levelNames[level]}.

Każda fiszka musi zawierać:
- front_text: tekst do przeczytania dopasowany do poziomu "${level}" (litera, sylaba, słowo lub zdanie)
- hint_text: krótka wskazówka lub opis (lub null jeśli niepotrzebna)
- level: MUSI mieć wartość "${level}" dla każdej karty

Zwróć dokładnie 8 fiszek. Pole level każdej karty MUSI być ustawione na "${level}".`;
}

export async function generateFlashcards(
  supabase: AppSupabase,
  input: { childId: string; requestedLevel: StoredReadingLevel },
): Promise<{ generation: FlashcardGeneration; cards: Flashcard[] }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured.");
  }

  const openaiProvider = createOpenAI({ apiKey: OPENAI_API_KEY });

  let batchOutput: z.infer<typeof flashcardBatchSchema>;
  try {
    const result = await generateText({
      model: openaiProvider("gpt-4o-mini"),
      output: Output.object({ schema: flashcardBatchSchema }),
      prompt: buildPrompt(input.requestedLevel),
      abortSignal: AbortSignal.timeout(9_500),
    });
    batchOutput = result.output;
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new Error("Flashcard generation timed out. Please try again.");
    }
    throw new Error("Flashcard generation failed. Please try again later.");
  }

  const filtered = batchOutput.cards.filter(
    (card) => LEVEL_ORDER.indexOf(card.level) <= LEVEL_ORDER.indexOf(input.requestedLevel),
  );

  const { data: generation, error: genError } = await supabase
    .from("flashcard_generations")
    .insert({
      child_id: input.childId,
      requested_level: input.requestedLevel,
      model: "openai:gpt-4o-mini",
      prompt_version: "1",
    })
    .select()
    .single();

  if (genError) {
    throw new Error(genError.message);
  }

  const { data: cards, error: cardsError } = await supabase
    .from("flashcards")
    .insert(
      filtered.map((card) => ({
        child_id: input.childId,
        generation_id: generation.id,
        front_text: card.front_text,
        hint_text: card.hint_text,
        level: card.level,
      })),
    )
    .select();

  if (cardsError) {
    throw new Error(cardsError.message);
  }

  return {
    generation: generation as FlashcardGeneration,
    cards: cards as Flashcard[],
  };
}
