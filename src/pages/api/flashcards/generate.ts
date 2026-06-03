import type { APIRoute } from "astro";

import { postGenerateFlashcards } from "@/lib/api-handlers/flashcards-generate-post";

export const prerender = false;

export const POST: APIRoute = postGenerateFlashcards;
