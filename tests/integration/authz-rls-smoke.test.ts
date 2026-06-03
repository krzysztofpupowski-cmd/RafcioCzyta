import { describe, expect, it } from "vitest";

import { createClient } from "@/lib/supabase";

import { signInAs } from "../helpers/auth-session";
import { requireTestEnv } from "../helpers/env";

describe("RLS smoke — children", () => {
  it("Parent A JWT cannot read Parent B child row by id", async () => {
    const env = requireTestEnv();
    const { cookies, headers } = await signInAs("A");

    const supabase = createClient(headers, cookies);
    if (!supabase) {
      throw new Error("Supabase client is not configured");
    }

    const query = await supabase.from("children").select("id").eq("id", env.TEST_PARENT_B_CHILD_ID).maybeSingle();

    if (query.error?.code === "PGRST205") {
      throw new Error(
        "Table public.children not found — apply supabase/migrations/*.sql to the test project (see tests/fixtures/README.md §0).",
      );
    }
    expect(query.error).toBeNull();
    expect(query.data).toBeNull();
  });
});
