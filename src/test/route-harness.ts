/**
 * Helpers for exercising the `/api/*` route handlers directly.
 *
 * Route handlers are plain `(Request) => Response` functions, so they run in
 * the node test environment without a server. Two things need managing:
 *
 *  - `REMOTE` in `lib/remote.ts` is read from the environment at import time,
 *    so remote-mode cases must stub the env and re-import the route.
 *  - mock-mode handlers `await delay(...)` to make loading states visible;
 *    `callRoute` runs the clock forward so the suite does not sit in real
 *    wall-clock latency.
 */

import { vi } from "vitest";

const REMOTE_URL = "https://engine.example.com";

export interface ProxiedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}

export type RemoteHandler = (
  call: ProxiedCall,
) => Response | Promise<Response>;

/** JSON `Response`, as a live instance would answer. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A `Request` aimed at one of this app's own API routes. */
export function apiRequest(
  path: string,
  init: { method?: string; json?: unknown; headers?: Record<string, string> } = {},
): Request {
  const { method = "POST", json, headers = {} } = init;
  return new Request(`http://console.local/api${path}`, {
    method,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
}

/**
 * Point the proxy at a stubbed live instance and reset the module registry so
 * the next `import()` of a route picks up the configured `REMOTE`.
 * Returns the list every proxied call is recorded into.
 */
export function stubRemoteBackend(
  handler: RemoteHandler,
  options: { url?: string } = {},
): ProxiedCall[] {
  const calls: ProxiedCall[] = [];

  vi.stubEnv("SUPERMEMORY_URL", options.url ?? REMOTE_URL);
  vi.stubEnv("SUPERMEMORY_KEY", "sk_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: ProxiedCall = {
        url: String(url),
        method: init.method ?? "GET",
        body: parseBody(init.body),
        headers: new Headers(init.headers),
      };
      calls.push(call);
      return handler(call);
    }),
  );
  vi.resetModules();

  return calls;
}

/** Ensure the next `import()` of a route sees no configured live instance. */
export function stubMockBackend(): void {
  vi.stubEnv("SUPERMEMORY_URL", "");
  vi.stubEnv("SUPERMEMORY_KEY", "");
  vi.resetModules();
}

/** Undo `stubRemoteBackend` / `stubMockBackend`. */
export function restoreBackend(): void {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
}

/**
 * Await a route handler without waiting out its simulated latency.
 * Fake timers are installed for the duration of the call only.
 */
export async function callRoute<T>(invoke: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const pending = invoke();
    // Long enough to clear the longest `delay()` in any handler.
    await vi.advanceTimersByTimeAsync(2000);
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

/** Read a handler's JSON response, with its status, in one step. */
export async function readJson<T = unknown>(
  res: Response,
): Promise<{ status: number; body: T }> {
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

/** Decode whatever the proxy handed `fetch` into something assertable. */
function parseBody(body: RequestInit["body"]): unknown {
  if (body == null) return null;

  let text: string;
  if (typeof body === "string") text = body;
  else if (body instanceof ArrayBuffer) text = new TextDecoder().decode(body);
  else if (ArrayBuffer.isView(body)) text = new TextDecoder().decode(body);
  else return body;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
