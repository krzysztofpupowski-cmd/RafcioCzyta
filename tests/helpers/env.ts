const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OPENAI_API_KEY",
  "TEST_PARENT_A_EMAIL",
  "TEST_PARENT_A_PASSWORD",
  "TEST_PARENT_B_EMAIL",
  "TEST_PARENT_B_PASSWORD",
  "TEST_PARENT_B_CHILD_ID",
  "TEST_PARENT_B_GENERATION_ID",
  "TEST_PARENT_B_SESSION_ID",
] as const;

const UUID_KEYS = ["TEST_PARENT_B_CHILD_ID", "TEST_PARENT_B_GENERATION_ID", "TEST_PARENT_B_SESSION_ID"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TestEnvKey = (typeof REQUIRED_KEYS)[number];

export function requireTestEnv(): Record<TestEnvKey, string> {
  const missing: TestEnvKey[] = [];
  const invalidUuid: string[] = [];

  for (const key of REQUIRED_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    if ((UUID_KEYS as readonly string[]).includes(key) && !UUID_RE.test(value)) {
      invalidUuid.push(`${key}=${JSON.stringify(value)} (expected v4 UUID, e.g. 33333333-3333-4333-8333-333333333301)`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required test environment variables: ${missing.join(", ")}.\n` +
        "Copy .env.test.example to .env.test and fill in values for your hosted Supabase test project.",
    );
  }

  if (invalidUuid.length > 0) {
    throw new Error(`Invalid UUID in .env.test:\n${invalidUuid.join("\n")}`);
  }

  const result = {} as Record<TestEnvKey, string>;
  for (const key of REQUIRED_KEYS) {
    result[key] = process.env[key]?.trim() ?? "";
  }
  return result;
}
