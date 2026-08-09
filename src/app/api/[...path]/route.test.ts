import { afterEach, describe, expect, it } from "vitest";
import {
  jsonResponse,
  readJson,
  restoreBackend,
  stubMockBackend,
  stubRemoteBackend,
} from "@/test/route-harness";

type Ctx = { params: Promise<{ path: string[] }> };

function ctx(...path: string[]): Ctx {
  return { params: Promise.resolve({ path }) };
}

function request(
  path: string,
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {},
) {
  return new Request(`http://console.local/api${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
  });
}

afterEach(() => restoreBackend());

describe("mock mode", () => {
  it("404s with a pointer at SUPERMEMORY_URL", async () => {
    stubMockBackend();
    const { GET } = await import("./route");

    const res = await GET(request("/v3/connections"), ctx("v3", "connections"));
    const { status, body } = await readJson<{ error: string; code: string }>(res);

    expect(status).toBe(404);
    expect(body.code).toBe("not_found");
    expect(body.error).toBe(
      "No mock handler for /v3/connections. Set SUPERMEMORY_URL to proxy to a live instance.",
    );
  });

  it("404s for every verb, not just GET", async () => {
    stubMockBackend();
    const route = await import("./route");

    for (const verb of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await route[verb](
        request("/v3/connections", { method: verb }),
        ctx("v3", "connections"),
      );
      expect(res.status).toBe(404);
    }
  });
});

describe("remote mode", () => {
  it("forwards the path, query string and method", async () => {
    const calls = stubRemoteBackend(() => jsonResponse({ ok: true }));
    const { GET } = await import("./route");

    await GET(
      request("/v3/connections?limit=5&cursor=abc"),
      ctx("v3", "connections"),
    );

    expect(calls[0]).toMatchObject({
      url: "https://engine.example.com/v3/connections?limit=5&cursor=abc",
      method: "GET",
    });
  });

  it("passes the upstream status and body straight through", async () => {
    stubRemoteBackend(() => jsonResponse({ items: [1, 2, 3] }, 207));
    const { POST } = await import("./route");

    const res = await POST(
      request("/v3/anything", { method: "POST", body: '{"a":1}' }),
      ctx("v3", "anything"),
    );

    expect(res.status).toBe(207);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await readJson(res)).toMatchObject({ body: { items: [1, 2, 3] } });
  });

  it("forwards a request body on writes", async () => {
    const calls = stubRemoteBackend(() => jsonResponse({}));
    const { PUT } = await import("./route");

    await PUT(
      request("/v3/anything", {
        method: "PUT",
        body: '{"a":1}',
        headers: { "content-type": "application/json" },
      }),
      ctx("v3", "anything"),
    );

    expect(calls[0]!.headers.get("content-type")).toBe("application/json");
    expect(calls[0]!.body).toEqual({ a: 1 });
  });

  it("never forwards a body on GET or HEAD", async () => {
    const calls = stubRemoteBackend(() => jsonResponse({}));
    const { GET } = await import("./route");

    await GET(request("/v3/anything"), ctx("v3", "anything"));

    expect(calls[0]!.body).toBeNull();
  });

  it("omits an empty body rather than forwarding a zero-length one", async () => {
    const calls = stubRemoteBackend(() => jsonResponse({}));
    const { POST } = await import("./route");

    await POST(request("/v3/anything", { method: "POST" }), ctx("v3", "anything"));

    expect(calls[0]!.body).toBeNull();
  });

  it("turns a transport failure into a 502", async () => {
    stubRemoteBackend(() => {
      throw new Error("connect ECONNREFUSED");
    });
    const { GET } = await import("./route");

    const res = await GET(request("/v3/anything"), ctx("v3", "anything"));

    expect(await readJson(res)).toMatchObject({
      status: 502,
      body: { error: "connect ECONNREFUSED" },
    });
  });

  /**
   * `new Response(buffer, { status: 204 })` throws, so a bodyless upstream
   * answer must not surface as an unhandled 500.
   */
  it("forwards a 204 from the live instance intact", async () => {
    stubRemoteBackend(() => new Response(null, { status: 204 }));
    const { DELETE } = await import("./route");

    const res = await DELETE(
      request("/v3/anything", { method: "DELETE" }),
      ctx("v3", "anything"),
    );

    expect(res.status).toBe(204);
  });

  it("routes back to the mock when the request opts out", async () => {
    stubRemoteBackend(() => jsonResponse({ ok: true }));
    const { GET } = await import("./route");

    const res = await GET(
      request("/v3/connections", { headers: { "x-sm-backend": "mock" } }),
      ctx("v3", "connections"),
    );

    expect(res.status).toBe(404);
  });
});
