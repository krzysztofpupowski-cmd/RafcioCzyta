import { describe, it } from "vitest";

import { createClient } from "@/lib/supabase";

import { signInAs } from "../helpers/auth-session";
import { requireTestEnv } from "../helpers/env";

describe("fixtures preflight", () => {
  it("Parent A's seeded child row is reachable via authenticated app-client with RLS on", async () => {
    const env = requireTestEnv();
    const { cookies, headers, user } = await signInAs("A");

    const supabase = createClient(headers, cookies);
    if (!supabase) {
      throw new Error("Supabase client is not configured for tests");
    }

    const { data, error } = await supabase
      .from("children")
      .select("id")
      .eq("id", env.TEST_PARENT_A_CHILD_ID)
      .eq("parent_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    if (!data) {
      throw new Error(
        "Test project fixtures missing or stale. Apply migrations + tests/fixtures/seed.sql per tests/fixtures/README.md.",
      );
    }
  });
});
