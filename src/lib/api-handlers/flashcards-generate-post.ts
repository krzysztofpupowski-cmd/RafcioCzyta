// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { APIContext } from "astro";

import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import {
  generateFlashcards,
  FLASHCARD_ERROR_MISSING_API_KEY,
  FLASHCARD_ERROR_TIMEOUT,
  FLASHCARD_ERROR_GENERATION_FAILED,
} from "@/lib/services/flashcard-generation";
import {
  toGeneratedFlashcardDTO,
  type GenerateFlashcardsSuccessResponse,
  type GenerateFlashcardsErrorResponse,
} from "@/lib/dto/flashcards";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

export async function postGenerateFlashcards(context: APIContext): Promise<Response> {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ ok: false, error: "Musisz być zalogowany." } satisfies GenerateFlashcardsErrorResponse, {
      status: 401,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      {
        ok: false,
        error: "Supabase nie jest skonfigurowany.",
      } satisfies GenerateFlashcardsErrorResponse,
      { status: 500 },
    );
  }

  let child: Awaited<ReturnType<typeof getMyChild>>;
  try {
    child = await getMyChild(supabase, user.id);
  } catch {
    return Response.json(
      {
        ok: false,
        error: "Nie udało się pobrać profilu dziecka. Spróbuj ponownie.",
      } satisfies GenerateFlashcardsErrorResponse,
      { status: 500 },
    );
  }

  if (!child) {
    return Response.json(
      {
        ok: false,
        error: "Najpierw utwórz profil dziecka, aby generować fiszki.",
      } satisfies GenerateFlashcardsErrorResponse,
      { status: 400 },
    );
  }

  const requestedLevel: StoredReadingLevel = (child.current_level as StoredReadingLevel | null) ?? "letters";

  try {
    const { generation, cards } = await generateFlashcards(supabase, {
      childId: child.id,
      requestedLevel,
    });

    return Response.json(
      {
        ok: true,
        generationId: generation.id,
        requestedLevel,
        cards: cards.map(toGeneratedFlashcardDTO),
      } satisfies GenerateFlashcardsSuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    if (!(err instanceof Error)) {
      return Response.json(
        {
          ok: false,
          error: "Wystąpił nieoczekiwany błąd.",
        } satisfies GenerateFlashcardsErrorResponse,
        { status: 500 },
      );
    }

    if (err.message === FLASHCARD_ERROR_MISSING_API_KEY) {
      return Response.json(
        {
          ok: false,
          error: "Generator fiszek nie jest skonfigurowany. Skontaktuj się z administratorem.",
        } satisfies GenerateFlashcardsErrorResponse,
        { status: 500 },
      );
    }

    if (err.message === FLASHCARD_ERROR_TIMEOUT) {
      return Response.json(
        {
          ok: false,
          error: "Generowanie fiszek przekroczyło 10 sekund. Spróbuj ponownie.",
        } satisfies GenerateFlashcardsErrorResponse,
        { status: 504 },
      );
    }

    if (err.message === FLASHCARD_ERROR_GENERATION_FAILED) {
      return Response.json(
        {
          ok: false,
          error: "Nie udało się wygenerować fiszek. Spróbuj ponownie.",
        } satisfies GenerateFlashcardsErrorResponse,
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: false,
        error: "Wystąpił błąd serwera. Spróbuj ponownie.",
      } satisfies GenerateFlashcardsErrorResponse,
      { status: 500 },
    );
  }
}
