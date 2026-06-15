/**
 * Seed test — exemplar for /10x-e2e and Playwright Test Agents.
 *
 * Risk anchor: context/foundation/test-plan.md §6.3 — full browser path
 * (auth cookie → protected route → form POST → API → DB → SSR reload).
 */
import { test, expect } from "@playwright/test";

test("child profile persists after page reload", async ({ page }) => {
  const uniqueName = `E2E Child ${Date.now()}`;

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Profil dziecka" })).toBeVisible();

  const nameField = page.getByRole("textbox", { name: "Imię dziecka" });
  const originalName = await nameField.inputValue();
  const isCreating = !originalName.trim();

  await nameField.fill(uniqueName);
  await page.getByRole("radio", { name: "Litery" }).check();
  await page
    .getByRole("button", {
      name: isCreating ? "Utwórz profil dziecka" : "Zapisz profil dziecka",
    })
    .click();

  await page.waitForURL(/\/dashboard$/);
  await expect(nameField).toHaveValue(uniqueName);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Imię dziecka" })).toHaveValue(uniqueName);

  // Cleanup — restore pre-test profile so parallel reruns do not accumulate drift
  await page.getByRole("textbox", { name: "Imię dziecka" }).fill(originalName || "E2E Seed Child");
  await page.getByRole("button", { name: "Zapisz profil dziecka" }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole("textbox", { name: "Imię dziecka" })).toHaveValue(originalName || "E2E Seed Child");
});
