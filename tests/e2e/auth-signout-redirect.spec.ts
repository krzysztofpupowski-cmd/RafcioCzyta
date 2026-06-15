/**
 * Risk #2 — context/foundation/test-plan.md
 *
 * Sign-out must clear the Supabase session cookie; a subsequent /dashboard
 * visit must redirect to /auth/signin and never render protected content.
 *
 * Seed exemplar: tests/e2e/seed.spec.ts
 *
 * Isolation: This spec OPTS OUT of the project-wide storageState (set in
 * playwright.config.ts) and signs in programmatically in beforeEach to mint a
 * fresh, disposable session. Every other chromium worker shares the
 * setup-project session_id via storageState; if this spec signed THAT session
 * out (even via scope:"local"), gotrue would revoke the session_id server-side
 * and every sibling worker's JWT would immediately fail getUser() with
 * "Auth session missing!". Diagnosis lives in
 * context/changes/e2e-browser-coverage/change.md Notes.
 */
import { test, expect } from "@playwright/test";

import { programmaticSignInAndInject, requireE2EAuthEnv } from "../helpers/programmatic-signin";

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ context, baseURL }) => {
  const env = requireE2EAuthEnv();
  await programmaticSignInAndInject(context, {
    ...env,
    baseURL: baseURL ?? "http://localhost:4321",
  });
});

test("sign-out clears session cookie and subsequent /dashboard visit redirects to sign-in", async ({ page }) => {
  // Confirm authenticated state before sign-out
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Profil dziecka" })).toBeVisible();

  // Submit the sign-out form — real POST /api/auth/signout via Astro form action
  await page.getByRole("button", { name: "Wyloguj" }).click();

  // Sign-out handler clears the cookie and redirects to root
  await page.waitForURL("/");

  // Navigate to a protected route with the now-cleared cookie
  await page.goto("/dashboard");

  // Middleware must redirect to sign-in — cookie is gone, no protected content rendered
  await page.waitForURL(/\/auth\/signin$/);
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
