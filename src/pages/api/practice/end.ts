// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { APIRoute } from "astro";
import { z } from "zod";

import type { EndPracticeSuccessResponse, PracticeErrorResponse } from "@/lib/dto/practice";
import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import { endPracticeSession, PRACTICE_ERROR_SESSION_NOT_FOUND } from "@/lib/services/practice-session";

export const prerender = false;

const bodySchema = z.object({
  sessionId: z.uuid(),
});

export const POST: APIRoute = async (context) => {
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
    const { endedAt } = await endPracticeSession(supabase, {
      sessionId: parsed.data.sessionId,
      childId: child.id,
    });

    return Response.json(
      {
        ok: true,
        sessionId: parsed.data.sessionId,
        endedAt,
      } satisfies EndPracticeSuccessResponse,
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === PRACTICE_ERROR_SESSION_NOT_FOUND) {
      return Response.json(
        {
          ok: false,
          error: "Sesja ćwiczeniowa nie została znaleziona.",
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
};
