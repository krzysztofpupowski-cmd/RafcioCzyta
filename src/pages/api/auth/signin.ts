import type { APIRoute } from "astro";

import { postAuthSignin } from "@/lib/api-handlers/auth-signin-post";

export const POST: APIRoute = postAuthSignin;
