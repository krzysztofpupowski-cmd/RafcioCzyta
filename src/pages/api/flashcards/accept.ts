import type { APIRoute } from "astro";

import { postAcceptFlashcards } from "@/lib/api-handlers/flashcards-accept-post";

export const prerender = false;

export const POST: APIRoute = postAcceptFlashcards;
