import type { APIRoute } from "astro";

import { postChildren } from "@/lib/api-handlers/children-post";

export const prerender = false;

export const POST: APIRoute = postChildren;
