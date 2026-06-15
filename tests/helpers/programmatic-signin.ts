import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";

interface CapturedCookieOptions {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date | number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
}

interface CapturedCookie {
  name: string;
  value: string;
  options?: CapturedCookieOptions;
}

/**
 * Signs the given credentials into Supabase via `@supabase/ssr`'s server client,
 * captures the cookies that library would write, and injects them into a
 * Playwright BrowserContext.
 *
 * This is the only sign-in path used by the E2E suite. The Astro form / API
 * route cannot be driven through the React form because Playwright's input
 * events do not reliably trigger React 19 controlled-input onChange in the
 * Astro client:only context, so validate() sees empty state and
 * preventDefault()s the submission. Driving the form via page.request.post
 * is also unreliable because Playwright follows the 302 to /dashboard before
 * the dev server has finished writing chunked Set-Cookie headers from
 * applyServerStorage, leaving the browser jar empty. Capturing the cookies
 * @supabase/ssr would set and injecting them directly bypasses both problems.
 *
 * IMPORTANT — call this whenever a test needs an ISOLATED session (one that
 * is safe to sign out without affecting sibling parallel workers). Tests that
 * inherit the project-wide `storageState` share a `session_id` with every
 * other worker; revoking that session — even via `signOut({ scope: "local" })`
 * — invalidates the JWT for all of them server-side. The signout spec
 * (`auth-signout-redirect.spec.ts`) sets `test.use({ storageState: empty })`
 * and calls this helper in `beforeEach` precisely to avoid that.
 */
export async function programmaticSignInAndInject(
  context: BrowserContext,
  options: { email: string; password: string; supabaseUrl: string; supabaseKey: string; baseURL: string },
): Promise<void> {
  const captured: CapturedCookie[] = [];
  let resolveCookieFlush: () => void = () => undefined;
  const cookiesFlushed = new Promise<void>((r) => {
    resolveCookieFlush = r;
  });

  const supabase = createServerClient(options.supabaseUrl, options.supabaseKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const c of cookiesToSet) {
          captured.push(c as CapturedCookie);
        }
        resolveCookieFlush();
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: options.email,
    password: options.password,
  });
  if (error) {
    throw new Error(`programmaticSignIn: signInWithPassword failed (${error.message}).`);
  }

  // signInWithPassword resolves before the async onAuthStateChange listener
  // calls applyServerStorage -> setAll. Race the listener against a 5s timeout
  // so we fail loudly instead of silently injecting zero cookies.
  await Promise.race([
    cookiesFlushed,
    new Promise<void>((_, reject) =>
      setTimeout(() => {
        reject(new Error("programmaticSignIn: timed out waiting for session cookies (5s)"));
      }, 5000),
    ),
  ]);

  if (captured.length === 0) {
    throw new Error("programmaticSignIn: signInWithPassword succeeded but no cookies were captured.");
  }

  // Use `url:` instead of `domain+path` so Playwright derives the cookie scope
  // from the request URL. With explicit `domain: 'localhost'`, Chromium can
  // treat the cookie as a domain-match cookie and apply slightly different
  // SameSite=Lax semantics on `fetch` POSTs vs top-level GETs. The `url:` form
  // produces a host-only cookie sent on every same-origin request regardless
  // of method.
  const playwrightCookies = captured
    .filter((c) => c.value !== "")
    .map((c) => {
      const opts = c.options ?? {};
      const sameSite = ((opts.sameSite ?? "lax") as string).toLowerCase();
      const sameSiteValue: "Lax" | "Strict" | "None" =
        sameSite === "strict" ? "Strict" : sameSite === "none" ? "None" : "Lax";
      const expires =
        typeof opts.maxAge === "number"
          ? Math.floor(Date.now() / 1000) + opts.maxAge
          : opts.expires instanceof Date
            ? Math.floor(opts.expires.getTime() / 1000)
            : -1;
      return {
        name: c.name,
        value: c.value,
        url: options.baseURL,
        httpOnly: opts.httpOnly ?? false,
        secure: opts.secure ?? false,
        sameSite: sameSiteValue,
        expires,
      };
    });

  await context.addCookies(playwrightCookies);
}

/** Reads and validates the four env vars required by the E2E auth helper. */
export function requireE2EAuthEnv(): {
  email: string;
  password: string;
  supabaseUrl: string;
  supabaseKey: string;
} {
  const email = process.env.TEST_PARENT_A_EMAIL?.trim();
  const password = process.env.TEST_PARENT_A_PASSWORD?.trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_KEY?.trim();
  if (!email || !password || !supabaseUrl || !supabaseKey) {
    throw new Error(
      "E2E auth requires SUPABASE_URL, SUPABASE_KEY, TEST_PARENT_A_EMAIL, TEST_PARENT_A_PASSWORD in .env or .env.test.",
    );
  }
  return { email, password, supabaseUrl, supabaseKey };
}
