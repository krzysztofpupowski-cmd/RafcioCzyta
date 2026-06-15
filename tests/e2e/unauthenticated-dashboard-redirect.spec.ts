/**
 * Risk #2 — context/foundation/test-plan.md
 *
 * An unauthenticated caller must not reach protected dashboard routes.
 * Middleware redirects /dashboard → /auth/signin before SSR renders parent UI.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated user is redirected away from /dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await page.waitForURL(/\/auth\/signin$/);
  await expect(page).toHaveURL(/\/auth\/signin$/);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profil dziecka" })).not.toBeVisible();
});
