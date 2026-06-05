// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.

import type { APIContext } from "astro";

import type { PracticeErrorResponse, StartPracticeSuccessResponse } from "@/lib/dto/practice";
import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import { PRACTICE_ERROR_NO_DUE_CARDS, startPracticeSession } from "@/lib/services/practice-session";

export async function postPracticeStart(context: APIContext): Promise<Response> {
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

  if (!child.current_level) {
    return Response.json(
      {
        ok: false,
        error: "Ustaw poziom czytania dziecka, aby rozpocząć ćwiczenie.",
      } satisfies PracticeErrorResponse,
      { status: 400 },
    );
  }

  try {
    const { sessionId, cards } = await startPracticeSession(supabase, {
      childId: child.id,
      level: child.current_level,
    });

    return Response.json(
      {
        ok: true,
        sessionId,
        cards,
        totalCount: cards.length,
      } satisfies StartPracticeSuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === PRACTICE_ERROR_NO_DUE_CARDS) {
      return Response.json(
        {
          ok: false,
          error: "Brak fiszek do powtórki.",
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
