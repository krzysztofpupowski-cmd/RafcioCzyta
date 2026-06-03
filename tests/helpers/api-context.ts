import type { AstroCookies } from "astro";
import type { APIContext } from "astro";

export interface CookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string, options?: Record<string, unknown>): void;
  headers(): string;
}

export function createCookieStore(initial: Record<string, string> = {}): CookieStore {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    get(name) {
      const value = store.get(name);
      return value !== undefined ? { value } : undefined;
    },
    set(name, value) {
      store.set(name, value);
    },
    delete(name) {
      store.delete(name);
    },
    headers() {
      return [...store.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

export interface CreateApiContextOptions {
  method?: string;
  pathname?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  cookies?: CookieStore;
  locals?: Partial<App.Locals>;
}

export function createApiContext(options: CreateApiContextOptions = {}): APIContext {
  const { method = "GET", pathname = "/", body = null, cookies = createCookieStore(), locals = {} } = options;

  const baseUrl = "http://localhost";
  const url = new URL(pathname, baseUrl);
  const headerInit = new Headers(options.headers ?? {});

  const cookieHeader = cookies.headers();
  if (cookieHeader && !headerInit.has("Cookie")) {
    headerInit.set("Cookie", cookieHeader);
  }

  const requestInit: RequestInit = { method, headers: headerInit };
  if (body !== null && method !== "GET" && method !== "HEAD") {
    requestInit.body = body;
  }

  const request = new Request(url, requestInit);
  const site = new URL(baseUrl);

  const redirect = (path: string, status = 302): Response => {
    const location = path.startsWith("http") ? path : new URL(path, url).href;
    return Response.redirect(location, status);
  };

  return {
    request,
    url,
    cookies: cookies as unknown as AstroCookies,
    locals: { user: null, ...locals },
    params: {},
    site,
    generator: "vitest",
    redirect,
    clientAddress: "127.0.0.1",
    isPrerendered: false,
    currentLocale: undefined,
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    rewrite: undefined,
    originPathname: pathname,
    getActionResult: () => undefined,
    callAction: () => {
      throw new Error("callAction is not available in test context");
    },
  } as APIContext;
}
