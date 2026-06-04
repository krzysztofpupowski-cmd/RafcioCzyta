// database.types.ts is excluded from ESLint's project service (eslint.config.js); every
// type derived from Database (Child, ReadingLevel, etc.) is treated as an error type by
// @typescript-eslint here, so the unsafe-* and no-redundant-type-constituents rules are
// disabled file-wide. The Supabase JS client is typed against Database (see supabase.ts)
// so query results carry the right shape at the TS layer; the disables only hide the
// ESLint-side noise. See context/foundation/lessons.md L-001.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/db/database.types";
import type { StoredReadingLevel } from "@/lib/reading-level-form";

export type AppSupabase = SupabaseClient<Database>;

export async function getMyChild(supabase: AppSupabase, parentUserId: string) {
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("parent_user_id", parentUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function upsertMyChild(
  supabase: AppSupabase,
  input: {
    parentUserId: string;
    displayName: string;
    currentLevel: StoredReadingLevel | null;
  },
) {
  const existing = await getMyChild(supabase, input.parentUserId);

  if (existing) {
    const { data, error } = await supabase
      .from("children")
      .update({ display_name: input.displayName, current_level: input.currentLevel })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("children")
    .insert({
      parent_user_id: input.parentUserId,
      display_name: input.displayName,
      current_level: input.currentLevel,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: updated, error: updateError } = await supabase
        .from("children")
        .update({ display_name: input.displayName, current_level: input.currentLevel })
        .eq("parent_user_id", input.parentUserId)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      return updated;
    }

    throw new Error(error.message);
  }

  return data;
}
