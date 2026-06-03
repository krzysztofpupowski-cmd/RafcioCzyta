const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OPENAI_API_KEY",
  "TEST_PARENT_A_EMAIL",
  "TEST_PARENT_A_PASSWORD",
  "TEST_PARENT_B_EMAIL",
  "TEST_PARENT_B_PASSWORD",
  "TEST_PARENT_B_GENERATION_ID",
  "TEST_PARENT_B_SESSION_ID",
] as const;

export type TestEnvKey = (typeof REQUIRED_KEYS)[number];

export function requireTestEnv(): Record<TestEnvKey, string> {
  const missing: TestEnvKey[] = [];

  for (const key of REQUIRED_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required test environment variables: ${missing.join(", ")}.\n` +
        "Copy .env.test.example to .env.test and fill in values for your hosted Supabase test project.",
    );
  }

  const result = {} as Record<TestEnvKey, string>;
  for (const key of REQUIRED_KEYS) {
    result[key] = process.env[key]?.trim() ?? "";
  }
  return result;
}
