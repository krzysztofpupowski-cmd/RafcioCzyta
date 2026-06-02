// database.types.ts is excluded from ESLint's project service; all Database-derived
// types are error-typed here. Type safety is enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { APIRoute } from "astro";

import type { MasteryErrorResponse, MasterySummarySuccessResponse } from "@/lib/dto/mastery";
import { createClient } from "@/lib/supabase";
import { getMyChild } from "@/lib/services/children";
import { getMasterySummary } from "@/lib/services/mastery-indicator";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ ok: false, error: "Musisz być zalogowany." } satisfies MasteryErrorResponse, {
      status: 401,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json(
      {
        ok: false,
        error: "Supabase nie jest skonfigurowany.",
      } satisfies MasteryErrorResponse,
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
      } satisfies MasteryErrorResponse,
      { status: 500 },
    );
  }

  if (!child) {
    return Response.json(
      {
        ok: false,
        error: "Najpierw utwórz profil dziecka, aby śledzić opanowanie materiału.",
      } satisfies MasteryErrorResponse,
      { status: 400 },
    );
  }

  if (!child.current_level) {
    return Response.json(
      {
        ok: false,
        error: "Ustaw poziom czytania dziecka, aby śledzić opanowanie materiału.",
      } satisfies MasteryErrorResponse,
      { status: 400 },
    );
  }

  try {
    const summary = await getMasterySummary(supabase, {
      childId: child.id,
      level: child.current_level,
    });

    return Response.json({ ok: true, summary } satisfies MasterySummarySuccessResponse, {
      status: 200,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        error: "Wystąpił błąd serwera. Spróbuj ponownie.",
      } satisfies MasteryErrorResponse,
      { status: 500 },
    );
  }
};
