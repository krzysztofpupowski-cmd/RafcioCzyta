import { Rating } from "ts-fsrs";
import { z } from "zod";

export const storedSrsStateSchema = z.object({
  difficulty: z.number(),
  due: z.number(),
  stability: z.number(),
  state: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  learning_steps: z.number().int(),
  scheduled_days: z.number(),
  elapsed_days: z.number(),
  last_review: z.number().nullable(),
});

export type StoredSrsState = z.infer<typeof storedSrsStateSchema>;

export const reviewRatingSchema = z.union([
  z.literal(Rating.Again),
  z.literal(Rating.Hard),
  z.literal(Rating.Good),
  z.literal(Rating.Easy),
]);

export type ReviewRating = z.infer<typeof reviewRatingSchema>;
