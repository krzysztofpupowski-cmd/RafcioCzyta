import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { childProfileFormSchema, toCurrentLevel } from "@/lib/schemas/child";
import { upsertMyChild } from "@/lib/services/children";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin", 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Supabase nie jest skonfigurowany")}`, 303);
  }

  const form = await context.request.formData();
  const displayName = form.get("displayName") as string | null;
  const level = form.get("level") as string | null;

  const result = childProfileFormSchema.safeParse({ displayName, level });
  if (!result.success) {
    const firstError = result.error.issues[0]?.message ?? "Nieprawidłowe dane";
    return context.redirect(`/dashboard?error=${encodeURIComponent(firstError)}`, 303);
  }

  const currentLevel = toCurrentLevel(result.data.level);

  try {
    await upsertMyChild(supabase, {
      parentUserId: user.id,
      displayName: result.data.displayName,
      currentLevel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nie udało się zapisać profilu dziecka";
    return context.redirect(`/dashboard?error=${encodeURIComponent(message)}`, 303);
  }

  return context.redirect("/dashboard", 303);
};
