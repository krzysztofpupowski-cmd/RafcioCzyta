import { createEmptyCard, Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import {
  applyReview,
  fromStored,
  initSrsState,
  masteryScoreFromCard,
  ratingToPracticeOutcome,
  toStored,
} from "@/lib/services/srs-adapter";

describe("initSrsState", () => {
  it("returns reps_count 0, last_reviewed_at null, mastery_score 0", () => {
    const now = new Date();
    const result = initSrsState(now);

    expect(result.reps_count).toBe(0);
    expect(result.last_reviewed_at).toBeNull();
    expect(result.mastery_score).toBe(0);
    expect(result.stored.reps).toBe(0);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
  });
});

describe("applyReview", () => {
  const now = new Date();

  it("Again — advances state, mastery_score in [0,100]", () => {
    const card = createEmptyCard(now);
    const result = applyReview(card, Rating.Again, now);

    expect(result.reps_count).toBe(1);
    expect(result.last_reviewed_at).toBeInstanceOf(Date);
    expect(result.stored.reps).toBe(1);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.mastery_score).toBeGreaterThanOrEqual(0);
    expect(result.mastery_score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result.mastery_score)).toBe(true);
  });

  it("Hard — advances state, mastery_score in [0,100]", () => {
    const card = createEmptyCard(now);
    const result = applyReview(card, Rating.Hard, now);

    expect(result.reps_count).toBe(1);
    expect(result.last_reviewed_at).toBeInstanceOf(Date);
    expect(result.stored.reps).toBe(1);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.mastery_score).toBeGreaterThanOrEqual(0);
    expect(result.mastery_score).toBeLessThanOrEqual(100);
  });

  it("Good — nextReviewAt in the future", () => {
    const card = createEmptyCard(now);
    const result = applyReview(card, Rating.Good, now);

    expect(result.reps_count).toBe(1);
    expect(result.last_reviewed_at).toBeInstanceOf(Date);
    expect(result.stored.reps).toBe(1);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.nextReviewAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result.mastery_score).toBeGreaterThanOrEqual(0);
    expect(result.mastery_score).toBeLessThanOrEqual(100);
  });

  it("Easy — nextReviewAt in the future", () => {
    const card = createEmptyCard(now);
    const result = applyReview(card, Rating.Easy, now);

    expect(result.reps_count).toBe(1);
    expect(result.last_reviewed_at).toBeInstanceOf(Date);
    expect(result.stored.reps).toBe(1);
    expect(result.nextReviewAt).toBeInstanceOf(Date);
    expect(result.nextReviewAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result.mastery_score).toBeGreaterThanOrEqual(0);
    expect(result.mastery_score).toBeLessThanOrEqual(100);
  });
});

describe("ratingToPracticeOutcome", () => {
  it("Again → incorrect", () => {
    expect(ratingToPracticeOutcome(Rating.Again)).toBe("incorrect");
  });

  it("Hard → incorrect", () => {
    expect(ratingToPracticeOutcome(Rating.Hard)).toBe("incorrect");
  });

  it("Good → correct", () => {
    expect(ratingToPracticeOutcome(Rating.Good)).toBe("correct");
  });

  it("Easy → correct", () => {
    expect(ratingToPracticeOutcome(Rating.Easy)).toBe("correct");
  });
});

describe("masteryScoreFromCard", () => {
  const now = new Date();

  it("fresh card returns integer in [0, 100]", () => {
    const card = createEmptyCard(now);
    const score = masteryScoreFromCard(card, now);

    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("after one Good review, score matches applyReview result", () => {
    const card = createEmptyCard(now);
    const result = applyReview(card, Rating.Good, now);
    const expected = masteryScoreFromCard(fromStored(result.stored), now);

    expect(result.mastery_score).toBe(expected);
  });
});

describe("fromStored / toStored round-trip", () => {
  it("preserves difficulty, due, stability, state, reps, lapses", () => {
    const now = new Date();
    const card = createEmptyCard(now);
    const { card: reviewed } = (() => {
      const { stored } = applyReview(card, Rating.Good, now);
      return { card: fromStored(stored) };
    })();

    const stored = toStored(reviewed);
    const roundTripped = fromStored(stored);

    expect(roundTripped.difficulty).toBeCloseTo(reviewed.difficulty, 10);
    expect(roundTripped.due.getTime()).toBe(reviewed.due.getTime());
    expect(roundTripped.stability).toBeCloseTo(reviewed.stability, 10);
    expect(roundTripped.state).toBe(reviewed.state);
    expect(roundTripped.reps).toBe(reviewed.reps);
    expect(roundTripped.lapses).toBe(reviewed.lapses);
  });
});
