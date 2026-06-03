import type { User } from "@supabase/supabase-js";

import { postAuthSignin } from "@/lib/api-handlers/auth-signin-post";
import { createClient } from "@/lib/supabase";

import { createApiContext, createCookieStore, type CookieStore } from "./api-context";
import { requireTestEnv } from "./env";

export type TestParent = "A" | "B";

export interface SignedInSession {
  cookies: CookieStore;
  headers: Headers;
  user: User;
}

export async function signInAs(parent: TestParent): Promise<SignedInSession> {
  const env = requireTestEnv();
  const email = parent === "A" ? env.TEST_PARENT_A_EMAIL : env.TEST_PARENT_B_EMAIL;
  const password = parent === "A" ? env.TEST_PARENT_A_PASSWORD : env.TEST_PARENT_B_PASSWORD;

  const cookies = createCookieStore();
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);

  const context = createApiContext({
    method: "POST",
    pathname: "/api/auth/signin",
    body: form,
    cookies,
  });

  const response = await postAuthSignin(context);
  const location = response.headers.get("Location") ?? "";

  if (location.includes("error=")) {
    throw new Error(`Sign-in failed for Parent ${parent}: ${location}`);
  }

  const headers = new Headers();
  const cookieHeader = cookies.headers();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const supabase = createClient(headers, cookies);
  if (!supabase) {
    throw new Error("Supabase client is not configured for tests");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(`No session after sign-in for Parent ${parent}${error ? `: ${error.message}` : ""}`);
  }

  return { cookies, headers, user };
}
