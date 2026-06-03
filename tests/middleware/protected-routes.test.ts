import { describe, expect, it, vi } from "vitest";

import { onRequest } from "@/middleware";
import { createApiContext } from "../helpers/api-context";

describe("middleware protected routes", () => {
  it("redirects unauthenticated /dashboard to sign-in", async () => {
    const context = createApiContext({ pathname: "/dashboard" });
    const next = vi.fn(() => Promise.resolve(new Response("ok")));

    const response = await onRequest(context, next);

    expect(next).not.toHaveBeenCalled();
    const res = response as Response;
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("Location") ?? "";
    expect(location).toMatch(/\/auth\/signin$/);
  });

  it("allows unauthenticated / to proceed", async () => {
    const context = createApiContext({ pathname: "/" });
    const next = vi.fn(() => Promise.resolve(new Response("ok")));

    const response = await onRequest(context, next);

    expect(next).toHaveBeenCalledOnce();
    expect((response as Response).status).toBe(200);
  });
});
