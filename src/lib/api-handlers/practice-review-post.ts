// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.

import type { APIContext } from "astro";
import { z } from "zod";

import type { PracticeErrorResponse, ReviewPracticeSuccessResponse } from "@/lib/dto/practice";
import { reviewRatingSchema } from "@/lib/schemas/srs";
import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import {
  PRACTICE_ERROR_CARD_ALREADY_REVIEWED,
  PRACTICE_ERROR_INVALID_SRS_STATE,
  PRACTICE_ERROR_SESSION_NOT_FOUND,
  recordPracticeReview,
} from "@/lib/services/practice-session";

const bodySchema = z.object({
  sessionId: z.uuid(),
  flashcardId: z.uuid(),
  rating: reviewRatingSchema,
});

export async function postPracticeReview(context: APIContext): Promise<Response> {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ ok: false, error: "Musisz być zalogowany." } satisfies PracticeErrorResponse, {
      status: 401,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      {
        ok: false,
        error: "Supabase nie jest skonfigurowany.",
      } satisfies PracticeErrorResponse,
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
      } satisfies PracticeErrorResponse,
      { status: 500 },
    );
  }

  if (!child) {
    return Response.json(
      {
        ok: false,
        error: "Najpierw utwórz profil dziecka, aby ćwiczyć fiszki.",
      } satisfies PracticeErrorResponse,
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "Nieprawidłowe żądanie." } satisfies PracticeErrorResponse, {
      status: 400,
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Nieprawidłowe żądanie." } satisfies PracticeErrorResponse, {
      status: 400,
    });
  }

  try {
    const { outcome, reviewedCount } = await recordPracticeReview(supabase, {
      sessionId: parsed.data.sessionId,
      childId: child.id,
      flashcardId: parsed.data.flashcardId,
      rating: parsed.data.rating,
    });

    return Response.json(
      {
        ok: true,
        outcome,
        reviewedCount,
      } satisfies ReviewPracticeSuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    if (!(err instanceof Error)) {
      return Response.json(
        {
          ok: false,
          error: "Wystąpił błąd serwera. Spróbuj ponownie.",
        } satisfies PracticeErrorResponse,
        { status: 500 },
      );
    }

    if (err.message === PRACTICE_ERROR_CARD_ALREADY_REVIEWED) {
      return Response.json(
        {
          ok: false,
          error: "Ta fiszka została już oceniona w tej sesji.",
        } satisfies PracticeErrorResponse,
        { status: 400 },
      );
    }

    if (err.message === PRACTICE_ERROR_INVALID_SRS_STATE) {
      return Response.json(
        {
          ok: false,
          error: "Nie udało się odczytać stanu powtórki tej fiszki.",
        } satisfies PracticeErrorResponse,
        { status: 400 },
      );
    }

    if (err.message === PRACTICE_ERROR_SESSION_NOT_FOUND) {
      return Response.json(
        {
          ok: false,
          error: "Sesja ćwiczeniowa nie została znaleziona lub została zakończona.",
        } satisfies PracticeErrorResponse,
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: false,
        error: "Wystąpił błąd serwera. Spróbuj ponownie.",
      } satisfies PracticeErrorResponse,
      { status: 500 },
    );
  }
}
