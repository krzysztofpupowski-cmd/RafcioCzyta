import { z } from "zod";

import { READING_LEVEL_FORM_VALUES, type ReadingLevelFormValue } from "@/lib/reading-level-form";

export const childProfileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Imię dziecka jest wymagane")
    .max(80, "Imię nie może być dłuższe niż 80 znaków"),
  level: z.enum(READING_LEVEL_FORM_VALUES, {
    error: () => ({ message: "Wybierz poziom czytania" }),
  }),
});

export type ChildProfileFormData = z.infer<typeof childProfileFormSchema>;

// Returns null for "unknown" (the FR-002 "Nie wiem" choice), otherwise the literal value.
// Return type is intentionally inferred to avoid ESLint error-type cascades from Database imports.
export function toCurrentLevel(value: ReadingLevelFormValue) {
  if (value === "unknown") {
    return null;
  }
  return value;
}
