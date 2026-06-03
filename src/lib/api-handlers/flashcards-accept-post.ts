// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { APIContext } from "astro";
import { z } from "zod";

import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import { acceptBatch, FLASHCARD_ERROR_BATCH_EMPTY } from "@/lib/services/flashcards";
import type { AcceptBatchSuccessResponse, FlashcardMutationErrorResponse } from "@/lib/dto/flashcards";

const bodySchema = z.object({
  generationId: z.uuid(),
});

export async function postAcceptFlashcards(context: APIContext): Promise<Response> {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ ok: false, error: "Musisz być zalogowany." } satisfies FlashcardMutationErrorResponse, {
      status: 401,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      {
        ok: false,
        error: "Supabase nie jest skonfigurowany.",
      } satisfies FlashcardMutationErrorResponse,
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
      } satisfies FlashcardMutationErrorResponse,
      { status: 500 },
    );
  }

  if (!child) {
    return Response.json(
      {
        ok: false,
        error: "Najpierw utwórz profil dziecka, aby generować fiszki.",
      } satisfies FlashcardMutationErrorResponse,
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "Nieprawidłowe żądanie." } satisfies FlashcardMutationErrorResponse, {
      status: 400,
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Nieprawidłowe żądanie." } satisfies FlashcardMutationErrorResponse, {
      status: 400,
    });
  }

  try {
    const { updatedCount, cards } = await acceptBatch(supabase, {
      childId: child.id,
      generationId: parsed.data.generationId,
    });

    return Response.json(
      {
        ok: true,
        generationId: parsed.data.generationId,
        updatedCount,
        cards,
      } satisfies AcceptBatchSuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === FLASHCARD_ERROR_BATCH_EMPTY) {
      return Response.json(
        {
          ok: false,
          error: "Ta partia nie oczekuje już na akceptację.",
        } satisfies FlashcardMutationErrorResponse,
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: false,
        error: "Wystąpił błąd serwera. Spróbuj ponownie.",
      } satisfies FlashcardMutationErrorResponse,
      { status: 500 },
    );
  }
}
