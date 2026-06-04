import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";

import { type StoredSrsState } from "@/lib/schemas/srs";

const scheduler = fsrs();

export function toStored(card: Card): StoredSrsState {
  return {
    difficulty: card.difficulty,
    due: card.due.getTime(),
    stability: card.stability,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    scheduled_days: card.scheduled_days,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- persisted for ts-fsrs Card round-trip until v6
    elapsed_days: card.elapsed_days,
    last_review: card.last_review?.getTime() ?? null,
  };
}

export function fromStored(stored: StoredSrsState): Card {
  return {
    difficulty: stored.difficulty,
    due: new Date(stored.due),
    stability: stored.stability,
    state: stored.state,
    reps: stored.reps,
    lapses: stored.lapses,
    learning_steps: stored.learning_steps,
    scheduled_days: stored.scheduled_days,
    elapsed_days: stored.elapsed_days,
    last_review: stored.last_review != null ? new Date(stored.last_review) : undefined,
  };
}

export function initSrsState(now = new Date()): {
  stored: StoredSrsState;
  nextReviewAt: Date;
  reps_count: 0;
  last_reviewed_at: null;
  mastery_score: 0;
} {
  const card = createEmptyCard(now);
  const stored = toStored(card);

  return {
    stored,
    nextReviewAt: card.due,
    reps_count: 0,
    last_reviewed_at: null,
    mastery_score: 0,
  };
}

export function previewReview(card: Card, now = new Date()) {
  return scheduler.repeat(card, now);
}

export function ratingToPracticeOutcome(rating: Grade): "correct" | "incorrect" {
  return rating <= Rating.Hard ? "incorrect" : "correct";
}

export function masteryScoreFromCard(card: Card, now = new Date()): number {
  return Math.round(scheduler.get_retrievability(card, now, false) * 100);
}

export function applyReview(card: Card, rating: Grade, now = new Date()) {
  const { card: nextCard } = scheduler.next(card, now, rating);

  return {
    stored: toStored(nextCard),
    nextReviewAt: nextCard.due,
    reps_count: nextCard.reps,
    last_reviewed_at: nextCard.last_review ?? now,
    mastery_score: masteryScoreFromCard(nextCard, now),
    practice_outcome: ratingToPracticeOutcome(rating),
  };
}

export function isDue(card: Card, now = new Date()): boolean {
  return card.due.getTime() <= now.getTime();
}
