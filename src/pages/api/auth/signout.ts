import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    // scope:'local' clears the cookie on this device only. The default 'global'
    // scope also revokes the refresh token server-side, which terminates every
    // active session for this user across every device — undesirable both for
    // typical parent UX (signing out on the laptop shouldn't kick out the
    // tablet) and for parallel E2E tests (one worker's signout would invalidate
    // sessions held by sibling workers).
    await supabase.auth.signOut({ scope: "local" });
  }
  return context.redirect("/");
};
