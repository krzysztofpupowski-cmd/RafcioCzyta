import { describe, expect, it } from "vitest";

import { requireTestEnv } from "../helpers/env";

describe("test environment", () => {
  it("requireTestEnv() returns all required keys when .env.test is configured", () => {
    const env = requireTestEnv();

    expect(env.SUPABASE_URL).toMatch(/^https:\/\//);
    expect(env.SUPABASE_KEY.length).toBeGreaterThan(0);
    expect(env.OPENAI_API_KEY.length).toBeGreaterThan(0);
    expect(env.TEST_PARENT_A_EMAIL).toContain("@");
    expect(env.TEST_PARENT_B_CHILD_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(env.TEST_PARENT_B_GENERATION_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(env.TEST_PARENT_B_SESSION_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
