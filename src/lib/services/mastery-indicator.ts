// database.types.ts is excluded from ESLint's project service (eslint.config.js); every
// type derived from Database (Child, ReadingLevel, etc.) is treated as an error type by
// @typescript-eslint here, so the unsafe-* and no-redundant-type-constituents rules are
// disabled file-wide. The Supabase JS client is typed against Database (see supabase.ts)
// so query results carry the right shape at the TS layer; the disables only hide the
// ESLint-side noise. See context/foundation/lessons.md L-001.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-condition */

import type { MasterySummaryDTO } from "@/lib/dto/mastery";
import type { StoredReadingLevel } from "@/lib/reading-level-form";
import { storedSrsStateSchema } from "@/lib/schemas/srs";
import { fromStored, masteryScoreFromCard } from "@/lib/services/srs-adapter";

import type { AppSupabase } from "./children";

export const MASTERY_THRESHOLD = 90;

export const MASTERY_ERROR_NO_CHILD = "MASTERY_ERROR_NO_CHILD";
export const MASTERY_ERROR_NO_CHILD_LEVEL = "MASTERY_ERROR_NO_CHILD_LEVEL";

export async function getMasterySummary(
  supabase: AppSupabase,
  input: { childId: string; level: StoredReadingLevel },
): Promise<MasterySummaryDTO> {
  const { data: rows, error } = await supabase
    .from("flashcards")
    .select("srs_state")
    .eq("child_id", input.childId)
    .eq("status", "accepted")
    .eq("level", input.level);

  if (error) {
    throw new Error(error.message);
  }

  const acceptedCount = rows?.length ?? 0;
  let masteredCount = 0;
  const now = new Date();

  for (const row of rows ?? []) {
    if (row.srs_state == null) {
      continue;
    }

    const parsed = storedSrsStateSchema.safeParse(row.srs_state);
    if (!parsed.success) {
      // eslint-disable-next-line no-console -- plan requires server-side log on invalid srs_state
      console.warn("getMasterySummary: invalid srs_state, skipping row");
      continue;
    }

    const score = masteryScoreFromCard(fromStored(parsed.data), now);
    if (score >= MASTERY_THRESHOLD) {
      masteredCount += 1;
    }
  }

  const percentMastered = acceptedCount === 0 ? 0 : Math.round((masteredCount / acceptedCount) * 100);

  return { acceptedCount, masteredCount, percentMastered };
}
