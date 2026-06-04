import type { APIRoute } from "astro";

import { postRejectFlashcards } from "@/lib/api-handlers/flashcards-reject-post";

export const prerender = false;

export const POST: APIRoute = postRejectFlashcards;
