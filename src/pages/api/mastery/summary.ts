import type { APIRoute } from "astro";

import { getMasterySummaryHandler } from "@/lib/api-handlers/mastery-summary-get";

export const prerender = false;

export const GET: APIRoute = getMasterySummaryHandler;
