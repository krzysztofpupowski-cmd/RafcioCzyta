import type { APIRoute } from "astro";

import { postPracticeEnd } from "@/lib/api-handlers/practice-end-post";

export const prerender = false;

export const POST: APIRoute = postPracticeEnd;
