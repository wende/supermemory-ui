/**
 * Server-only handle to a real supermemory instance.
 * When unset, route handlers keep serving the bundled mock.
 *
 * With SUPERMEMORY_URL set, callers can still force the mock via the
 * `sm_backend=mock` cookie (Settings toggle or `?mock` in the URL).
 */

import "server-only";

export const REMOTE = process.env.SUPERMEMORY_URL
  ? {
      url: process.env.SUPERMEMORY_URL.replace(/\/$/, ""),
      key: process.env.SUPERMEMORY_KEY ?? "",
    }
  : null;

export const BACKEND_COOKIE = "sm_backend";

/** True when a live instance is configured in env (regardless of UI preference). */
export function remoteConfigured(): boolean {
  return REMOTE != null;
}

/**
 * Per-request: use the live proxy unless the user opted into mock.
 * Prefer this over the bare `REMOTE` constant in route handlers.
 */
export function wantsRemote(req: Request): boolean {
  if (!REMOTE) return false;

  const header = req.headers.get("x-sm-backend")?.toLowerCase();
  if (header === "mock") return false;
  if (header === "remote") return true;

  const cookie = req.headers.get("cookie") ?? "";
  const match = new RegExp(
    `(?:^|;\\s*)${BACKEND_COOKIE}=(mock|remote)(?:;|$)`,
  ).exec(cookie);
  if (match?.[1] === "mock") return false;

  return true;
}

/** Recent proxied round-trip times (ms), capped for the stats dashboard. */
const latencyRing: number[] = [];
const LATENCY_CAP = 40;

export function recordLatency(ms: number) {
  latencyRing.push(ms);
  if (latencyRing.length > LATENCY_CAP) latencyRing.shift();
}

export function recentLatencies(): number[] {
  return latencyRing.slice();
}

export async function proxy(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!REMOTE) throw new Error("SUPERMEMORY_URL is not set");

  const headers = new Headers(init.headers);
  if (REMOTE.key) headers.set("authorization", `Bearer ${REMOTE.key}`);
  if (init.body !== undefined && !headers.has("content-type")) {
    if (!(init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
  }

  const url = `${REMOTE.url}${path.startsWith("/") ? path : `/${path}`}`;
  const started = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
    recordLatency(Math.round(performance.now() - started));
    return res;
  } catch (err) {
    // `fetch` uses TypeError for network-layer failures. Do not turn caller
    // cancellation or an unexpected programming error into a misleading 502;
    // those belong to the caller / route error boundary.
    if (!(err instanceof TypeError)) throw err;

    // The instance is unreachable (down, wrong URL, DNS/connection failure).
    // Answer with a synthetic error response instead of throwing, so callers
    // that already handle a non-ok response degrade gracefully instead of
    // crashing the route handler with an unhandled rejection.
    recordLatency(Math.round(performance.now() - started));
    const message = err instanceof Error ? err.message : "network error";
    return new Response(
      JSON.stringify({ error: message, code: "upstream_unreachable" }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

export async function proxyJson<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ status: number; data: T; ok: boolean }> {
  const { json, ...rest } = init;
  const res = await proxy(path, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = { raw: text } as T;
  }
  return { status: res.status, data, ok: res.ok };
}

/**
 * Statuses the fetch spec forbids a body on. Handing `new Response` even an
 * empty buffer for one of these throws, so they have to pass `null` through.
 */
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

/** Forward a Response body/status as a NextResponse-compatible Response. */
export async function passthrough(res: Response): Promise<Response> {
  const buf = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const nullBody = NULL_BODY_STATUS.has(res.status);
  return new Response(nullBody ? null : buf, { status: res.status, headers });
}

/** Prefer `error`, then `message`, from a live API error body. */
export function remoteErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown };
    if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
    if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  }
  return fallback;
}
