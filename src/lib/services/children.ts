// The project's createClient() returns SupabaseClient<any> (no Database generic passed in
// supabase.ts), so all .from() query results are untyped. The unsafe-* and
// no-redundant-type-constituents rules are disabled file-wide because every type derived
// from Database (Child, ReadingLevel) is treated as an error type by ESLint's project
// service (database.types.ts is in the ESLint ignores list). Type correctness is
// enforced by callers and Supabase RLS.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Child } from "@/types";
import type { toCurrentLevel } from "@/lib/schemas/child";

export type AppSupabase = SupabaseClient;

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

  return data as Child | null;
}

export async function upsertMyChild(
  supabase: AppSupabase,
  input: {
    parentUserId: string;
    displayName: string;
    currentLevel: ReturnType<typeof toCurrentLevel>;
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

    return data as Child;
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

      return updated as Child;
    }

    throw new Error(error.message);
  }

  return data as Child;
}
