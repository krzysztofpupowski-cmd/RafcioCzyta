import type { APIRoute } from "astro";

import { postPracticeStart } from "@/lib/api-handlers/practice-start-post";

export const prerender = false;

export const POST: APIRoute = postPracticeStart;
