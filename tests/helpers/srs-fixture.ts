import { createEmptyCard } from "ts-fsrs";
import { Rating } from "ts-fsrs";

import { MASTERY_THRESHOLD } from "@/lib/services/mastery-indicator";
import { applyReview, fromStored, masteryScoreFromCard } from "@/lib/services/srs-adapter";
import type { StoredSrsState } from "@/lib/schemas/srs";

const MAX_ITERATIONS = 20;

export interface MasteredSrsFixture {
  stored: StoredSrsState;
  mastery_score: number;
  reps_count: number;
  next_review_at: string;
  last_reviewed_at: string;
}

/**
 * Builds a deterministic mastered SRS state by applying Good ratings through
 * the production ts-fsrs scheduler until retrievability crosses MASTERY_THRESHOLD.
 * Throws if the threshold is not reached within MAX_ITERATIONS — this acts as
 * a loudly-failing canary if ts-fsrs tuning ever changes the retrievability curve.
 */
export function buildMasteredSrsState(now = new Date()): MasteredSrsFixture {
  let card = createEmptyCard(now);
  let lastResult: ReturnType<typeof applyReview> | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    lastResult = applyReview(card, Rating.Good, now);
    const score = masteryScoreFromCard(fromStored(lastResult.stored), now);
    if (score >= MASTERY_THRESHOLD) {
      return {
        stored: lastResult.stored,
        mastery_score: score,
        reps_count: lastResult.reps_count,
        next_review_at: lastResult.nextReviewAt.toISOString(),
        last_reviewed_at:
          lastResult.last_reviewed_at instanceof Date ? lastResult.last_reviewed_at.toISOString() : now.toISOString(),
      };
    }
    card = fromStored(lastResult.stored);
  }

  const finalScore = lastResult ? masteryScoreFromCard(fromStored(lastResult.stored), now) : 0;
  throw new Error(
    `buildMasteredSrsState: did not reach mastery in ${MAX_ITERATIONS} iterations (final score: ${finalScore}, threshold: ${MASTERY_THRESHOLD})`,
  );
}

/**
 * Verifies a stored state is actually mastered — useful for asserting the
 * helper result before writing it to the DB.
 */
export function assertMastered(stored: StoredSrsState, now = new Date()): void {
  const score = masteryScoreFromCard(fromStored(stored), now);
  if (score < MASTERY_THRESHOLD) {
    throw new Error(`assertMastered: score ${score} < threshold ${MASTERY_THRESHOLD}`);
  }
}
