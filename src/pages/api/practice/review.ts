import type { APIRoute } from "astro";

import { postPracticeReview } from "@/lib/api-handlers/practice-review-post";

export const prerender = false;

export const POST: APIRoute = postPracticeReview;
