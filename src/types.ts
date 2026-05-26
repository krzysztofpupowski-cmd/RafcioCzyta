import type { Database } from "@/db/database.types";

export type { Database };

export type ReadingLevel = Database["public"]["Enums"]["reading_level"];
export type FlashcardStatus = Database["public"]["Enums"]["flashcard_status"];
export type PracticeAttemptOutcome = Database["public"]["Enums"]["practice_attempt_outcome"];

export type Child = Database["public"]["Tables"]["children"]["Row"];
export type ChildInsert = Database["public"]["Tables"]["children"]["Insert"];
export type ChildUpdate = Database["public"]["Tables"]["children"]["Update"];

export type FlashcardGeneration = Database["public"]["Tables"]["flashcard_generations"]["Row"];
export type FlashcardGenerationInsert = Database["public"]["Tables"]["flashcard_generations"]["Insert"];
export type FlashcardGenerationUpdate = Database["public"]["Tables"]["flashcard_generations"]["Update"];

export type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];
export type FlashcardInsert = Database["public"]["Tables"]["flashcards"]["Insert"];
export type FlashcardUpdate = Database["public"]["Tables"]["flashcards"]["Update"];

export type PracticeSession = Database["public"]["Tables"]["practice_sessions"]["Row"];
export type PracticeSessionInsert = Database["public"]["Tables"]["practice_sessions"]["Insert"];
export type PracticeSessionUpdate = Database["public"]["Tables"]["practice_sessions"]["Update"];

export type PracticeAttempt = Database["public"]["Tables"]["practice_attempts"]["Row"];
export type PracticeAttemptInsert = Database["public"]["Tables"]["practice_attempts"]["Insert"];
export type PracticeAttemptUpdate = Database["public"]["Tables"]["practice_attempts"]["Update"];
