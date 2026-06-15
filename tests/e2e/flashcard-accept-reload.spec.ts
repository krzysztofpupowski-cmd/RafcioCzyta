/* eslint-disable */
/**
 * Risk #5 — context/foundation/test-plan.md
 *
 * FlashcardDashboardCard is client:only="react" — every post-mutation UI
 * transition is invisible to Vitest. listAcceptedFlashcards is called only from
 * dashboard.astro during SSR; it has never been exercised by any test.
 *
 * Strategy: seed a real draft batch via the Supabase JS client (so that
 * POST /api/flashcards/accept finds real DB rows), intercept the generate HTTP
 * call with page.route to feed the seeded batch into the UI without calling
 * OpenAI, accept the batch, verify the optimistic state update, then reload
 * and confirm that listAcceptedFlashcards (previously untested SSR path) still
 * surfaces the accepted cards.
 *
 * Seed exemplar: tests/e2e/seed.spec.ts
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Validates the minimal env vars needed for E2E DB seeding and returns them. */
function requireE2EEnv() {
  const keys = ["SUPABASE_URL", "SUPABASE_KEY", "TEST_PARENT_A_EMAIL", "TEST_PARENT_A_PASSWORD"] as const;
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing E2E env vars for flashcard-accept-reload: ${missing.join(", ")}.\n` +
        "Copy .env.test.example to .env.test and fill in values.",
    );
  }
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_KEY: process.env.SUPABASE_KEY!,
    TEST_PARENT_A_EMAIL: process.env.TEST_PARENT_A_EMAIL!,
    TEST_PARENT_A_PASSWORD: process.env.TEST_PARENT_A_PASSWORD!,
  };
}

let freshGenId = "";
let freshFrontText1 = "";
let freshFrontText2 = "";
let supabase: ReturnType<typeof createClient>;

test.beforeEach(async ({ page }, testInfo) => {
  const env = requireE2EEnv();
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  await supabase.auth.signInWithPassword({
    email: env.TEST_PARENT_A_EMAIL,
    password: env.TEST_PARENT_A_PASSWORD,
  });

  // Unique suffix prevents data collisions in consecutive or parallel runs
  const uniqueSuffix = `${Date.now()}-${testInfo.parallelIndex}`;
  freshFrontText1 = `e2e-card-${uniqueSuffix}-1`;
  freshFrontText2 = `e2e-card-${uniqueSuffix}-2`;

  // Query the child ID via RLS-scoped select — children has a unique index on
  // parent_user_id so .single() is safe after sign-in as Parent A.
  const { data: childRow } = await supabase.from("children").select("id").single();
  const childId = (childRow as { id: string }).id;

  const { data: gen } = await supabase
    .from("flashcard_generations")
    .insert({ child_id: childId, requested_level: "letters" })
    .select("id")
    .single();
  freshGenId = (gen as { id: string }).id;

  const { data: cards } = await supabase
    .from("flashcards")
    .insert([
      { child_id: childId, generation_id: freshGenId, level: "letters", front_text: freshFrontText1 },
      { child_id: childId, generation_id: freshGenId, level: "letters", front_text: freshFrontText2 },
    ])
    .select("id, front_text");

  // page.route must be registered before page.goto; Playwright resolves routes
  // lazily so registering here and calling goto in the test body is correct.
  // The mock returns freshGenId so the real POST /api/flashcards/accept can find
  // the seeded rows. If the SSR already loaded the batch (it will, since the rows
  // are in the DB before goto), handleGenerate's duplicate-guard no-ops silently.
  await page.route("/api/flashcards/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        generationId: freshGenId,
        requestedLevel: "letters",
        cards: (cards as Array<{ id: string; front_text: string }>).map((c) => ({
          id: c.id,
          front_text: c.front_text,
          hint_text: null,
          level: "letters",
        })),
      }),
    }),
  );
});

test.afterEach(async () => {
  if (!freshGenId) return;
  await supabase.from("flashcards").delete().eq("generation_id", freshGenId);
  await supabase.from("flashcard_generations").delete().eq("id", freshGenId);
  freshGenId = "";
});

test(
  "accept batch updates optimistic UI and persists through SSR reload via listAcceptedFlashcards",
  async ({ page }) => {
    // Confirm child profile exists — Generuj button is only rendered when childExists is true
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Generuj 8 fiszek" })).toBeVisible();

    // Click Generate — intercepted by page.route; mock response feeds seeded draft batch to UI.
    // Even if SSR already loaded the batch, handleGenerate's duplicate-guard keeps the state
    // consistent; the fresh batch panel remains visible either way.
    await page.getByRole("button", { name: "Generuj 8 fiszek" }).click();

    // Wait for our fresh batch to be present in the prepared tab.
    // exact: true is required because Astro's dev-toolbar Inspect panel renders a
    // <code> element containing the island's serialized props (which include
    // freshFrontText1 as a substring); without exact:true, getByText resolves to
    // both the card <p> and the dev-toolbar <code>, triggering a strict-mode violation.
    await expect(page.getByText(freshFrontText1, { exact: true })).toBeVisible();

    // Scope the accept click to the specific batch panel containing our unique text,
    // guarding against any pre-existing draft batches in the UI.
    const freshBatchSection = page.getByRole("region").filter({ hasText: freshFrontText1 });

    // Wait for the real /api/flashcards/accept round-trip explicitly so the
    // visibility assertions don't race the fetch, and so a failed POST surfaces
    // with body context instead of a generic "still visible" timeout.
    const acceptResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/flashcards/accept") && r.request().method() === "POST",
    );
    await freshBatchSection.getByRole("button", { name: /Akceptuj partię/ }).click();
    const acceptResponse = await acceptResponsePromise;
    if (acceptResponse.status() !== 200) {
      const body = await acceptResponse.text();
      throw new Error(
        `POST /api/flashcards/accept returned ${acceptResponse.status()} (expected 200). Body: ${body.slice(0, 500)}`,
      );
    }

    // Assert the accepted batch left the prepared tab — unique card <p> no longer
    // rendered. exact: true again excludes the dev-toolbar's static props snapshot.
    // (Not checking for the global empty state because other draft batches may still exist.)
    await expect(page.getByText(freshFrontText1, { exact: true })).not.toBeVisible();
    await expect(page.getByText(freshFrontText2, { exact: true })).not.toBeVisible();

    // Navigate to Zaakceptowane tab; confirm optimistic state shows our accepted cards
    await page.getByRole("tab", { name: "Zaakceptowane" }).click();
    await expect(page.getByRole("tabpanel").getByText(freshFrontText1, { exact: true })).toBeVisible();

    // Reload — triggers SSR re-render; dashboard.astro calls listDraftBatches + listAcceptedFlashcards
    await page.reload();

    // activeTab resets to "prepared" on every full page load; navigate back to accepted tab.
    // Playwright auto-waits until the React component hydrates and the tab is actionable.
    await page.getByRole("tab", { name: "Zaakceptowane" }).click();

    // The same unique accepted cards are still visible — proves listAcceptedFlashcards
    // returns the accepted rows and the SSR path was exercised correctly.
    await expect(page.getByRole("tabpanel").getByText(freshFrontText1, { exact: true })).toBeVisible();
  },
);
