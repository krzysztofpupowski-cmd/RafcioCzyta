import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { test as setup, expect } from "@playwright/test";

import { programmaticSignInAndInject, requireE2EAuthEnv } from "../helpers/programmatic-signin";

const authFile = resolve(import.meta.dirname, "../../playwright/.auth/user.json");

setup("authenticate as Parent A", async ({ page, baseURL }) => {
  const env = requireE2EAuthEnv();

  await programmaticSignInAndInject(page.context(), {
    ...env,
    baseURL: baseURL ?? "http://localhost:4321",
  });

  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Profil dziecka" })).toBeVisible();

  await mkdir(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
