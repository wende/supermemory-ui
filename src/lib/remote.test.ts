import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `REMOTE` is a module-level const read from the environment at import time,
 * so every case re-imports the module with the env it needs.
 */
async function loadRemote(env: { url?: string; key?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("SUPERMEMORY_URL", env.url ?? "");
  vi.stubEnv("SUPERMEMORY_KEY", env.key ?? "");
  return import("./remote");
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://console.local/api/v4/memories", { headers });
}

/** A `fetch` stub whose recorded calls stay typed as (url, init). */
function stubFetch(respond: () => Response = () => new Response("{}")) {
  const spy = vi.fn((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(respond()),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("REMOTE / remoteConfigured", () => {
  it("is null when SUPERMEMORY_URL is unset", async () => {
    const { REMOTE, remoteConfigured } = await loadRemote();
    expect(REMOTE).toBeNull();
    expect(remoteConfigured()).toBe(false);
  });

  it("strips a trailing slash from the configured url", async () => {
    const { REMOTE, remoteConfigured } = await loadRemote({
      url: "https://engine.example.com/",
      key: "sk_test",
    });
    expect(REMOTE).toEqual({ url: "https://engine.example.com", key: "sk_test" });
    expect(remoteConfigured()).toBe(true);
  });

  it("defaults the key to an empty string when only the url is set", async () => {
    const { REMOTE } = await loadRemote({ url: "https://engine.example.com" });
    expect(REMOTE?.key).toBe("");
  });
});

describe("wantsRemote", () => {
  it("is always false when no live instance is configured", async () => {
    const { wantsRemote } = await loadRemote();
    expect(wantsRemote(req())).toBe(false);
    expect(wantsRemote(req({ "x-sm-backend": "remote" }))).toBe(false);
    expect(wantsRemote(req({ cookie: "sm_backend=remote" }))).toBe(false);
  });

  it("defaults to the live instance when configured and nothing opts out", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req())).toBe(true);
    expect(wantsRemote(req({ cookie: "theme=dark" }))).toBe(true);
  });

  it("honours the sm_backend cookie", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req({ cookie: "sm_backend=mock" }))).toBe(false);
    expect(wantsRemote(req({ cookie: "sm_backend=remote" }))).toBe(true);
  });

  it("reads the cookie from the middle and end of a cookie header", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req({ cookie: "a=1; sm_backend=mock; b=2" }))).toBe(false);
    expect(wantsRemote(req({ cookie: "a=1; sm_backend=mock" }))).toBe(false);
  });

  it("does not match a cookie whose name merely ends with sm_backend", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req({ cookie: "xsm_backend=mock" }))).toBe(true);
  });

  it("ignores an unrecognised cookie value", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req({ cookie: "sm_backend=banana" }))).toBe(true);
  });

  it("lets the x-sm-backend header override the cookie in both directions", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(
      wantsRemote(req({ "x-sm-backend": "mock", cookie: "sm_backend=remote" })),
    ).toBe(false);
    expect(
      wantsRemote(req({ "x-sm-backend": "remote", cookie: "sm_backend=mock" })),
    ).toBe(true);
  });

  it("matches the header case-insensitively", async () => {
    const { wantsRemote } = await loadRemote({ url: "https://engine.example.com" });
    expect(wantsRemote(req({ "x-sm-backend": "MOCK" }))).toBe(false);
  });
});

describe("proxy", () => {
  it("throws when no live instance is configured", async () => {
    const { proxy } = await loadRemote();
    await expect(proxy("/v3/documents/list")).rejects.toThrow(
      "SUPERMEMORY_URL is not set",
    );
  });

  it("attaches a bearer token and joins the path", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({
      url: "https://engine.example.com",
      key: "sk_live",
    });

    await proxy("/v4/search", { method: "POST", body: "{}" });

    const [url, init = {}] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://engine.example.com/v4/search");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk_live");
    expect(init.cache).toBe("no-store");
  });

  it("omits the authorization header when no key is configured", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({ url: "https://engine.example.com" });

    await proxy("/v4/search");

    const [, init = {}] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("adds a leading slash to a bare path", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({ url: "https://engine.example.com" });

    await proxy("v3/documents/list");

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://engine.example.com/v3/documents/list",
    );
  });

  it("defaults a non-FormData body to application/json", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({ url: "https://engine.example.com" });

    await proxy("/v3/documents", { method: "POST", body: '{"a":1}' });

    const [, init = {}] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("leaves FormData without a content-type so fetch can set the boundary", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({ url: "https://engine.example.com" });

    await proxy("/v3/documents/file", { method: "POST", body: new FormData() });

    const [, init = {}] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("does not overwrite an explicit content-type", async () => {
    const fetchMock = stubFetch();
    const { proxy } = await loadRemote({ url: "https://engine.example.com" });

    await proxy("/v3/documents", {
      method: "POST",
      body: "raw",
      headers: { "content-type": "text/plain" },
    });

    const [, init = {}] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).get("content-type")).toBe("text/plain");
  });
});

describe("latency ring", () => {
  it("records a sample per proxied call and returns a copy", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}"));
    const { proxy, recentLatencies } = await loadRemote({
      url: "https://engine.example.com",
    });

    await proxy("/v4/search");
    await proxy("/v4/search");

    const first = recentLatencies();
    expect(first).toHaveLength(2);
    first.push(999);
    expect(recentLatencies()).toHaveLength(2);
  });

  it("caps the ring at 40 samples, keeping the most recent", async () => {
    const { recordLatency, recentLatencies } = await loadRemote();
    for (let i = 0; i < 45; i++) recordLatency(i);

    const ring = recentLatencies();
    expect(ring).toHaveLength(40);
    expect(ring[0]).toBe(5);
    expect(ring.at(-1)).toBe(44);
  });
});

describe("proxyJson", () => {
  it("serializes the json option and parses the response", async () => {
    const fetchMock = stubFetch(() =>
      new Response(JSON.stringify({ total: 3 }), { status: 200 }),
    );
    const { proxyJson } = await loadRemote({ url: "https://engine.example.com" });

    const res = await proxyJson<{ total: number }>("/v4/search", {
      method: "POST",
      json: { q: "kafka" },
    });

    expect(res).toEqual({ status: 200, ok: true, data: { total: 3 } });
    const [, init = {}] = fetchMock.mock.calls[0]!;
    expect(init.body).toBe('{"q":"kafka"}');
  });

  it("returns null data for an empty body", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    const { proxyJson } = await loadRemote({ url: "https://engine.example.com" });

    const res = await proxyJson("/v3/documents/doc_1", { method: "DELETE" });
    expect(res.data).toBeNull();
    expect(res.ok).toBe(true);
  });

  it("returns null data for a bodyless 204", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    const { proxyJson } = await loadRemote({ url: "https://engine.example.com" });

    const res = await proxyJson("/v3/documents/doc_1", { method: "DELETE" });
    expect(res).toEqual({ status: 204, ok: true, data: null });
  });

  it("wraps an unparseable body as { raw } rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );
    const { proxyJson } = await loadRemote({ url: "https://engine.example.com" });

    const res = await proxyJson("/v4/search", { method: "POST", json: {} });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(502);
    expect(res.data).toEqual({ raw: "<html>502 Bad Gateway</html>" });
  });

  it("reports ok:false for an error status with a parseable body", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: "nope" }), { status: 401 }),
    );
    const { proxyJson } = await loadRemote({ url: "https://engine.example.com" });

    const res = await proxyJson("/v4/search", { method: "POST", json: {} });
    expect(res).toMatchObject({ ok: false, status: 401, data: { error: "nope" } });
  });
});

describe("passthrough", () => {
  it("forwards status and content-type but drops other headers", async () => {
    const { passthrough } = await loadRemote({ url: "https://engine.example.com" });
    const upstream = new Response('{"ok":true}', {
      status: 207,
      headers: {
        "content-type": "application/json",
        "set-cookie": "session=leaky",
        "x-internal": "secret",
      },
    });

    const res = await passthrough(upstream);

    expect(res.status).toBe(207);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-internal")).toBeNull();
    expect(await res.text()).toBe('{"ok":true}');
  });

  it("survives a response with no content-type", async () => {
    const { passthrough } = await loadRemote({ url: "https://engine.example.com" });
    // A binary body leaves content-type unset, unlike a string body.
    const upstream = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    upstream.headers.delete("content-type");

    const res = await passthrough(upstream);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  /**
   * `new Response(buffer, { status: 204 })` throws — a live instance answering
   * 204/304 must not take the proxy down with it.
   */
  it("forwards a null-body status without throwing", async () => {
    const { passthrough } = await loadRemote({ url: "https://engine.example.com" });

    for (const status of [204, 205, 304]) {
      const res = await passthrough(new Response(null, { status }));
      expect(res.status).toBe(status);
      expect(res.body).toBeNull();
    }
  });
});

describe("remoteErrorMessage", () => {
  it("prefers `error`, then `message`, then the fallback", async () => {
    const { remoteErrorMessage } = await loadRemote();
    expect(remoteErrorMessage({ error: "bad tag" }, "fallback")).toBe("bad tag");
    expect(remoteErrorMessage({ message: "bad tag" }, "fallback")).toBe("bad tag");
    expect(
      remoteErrorMessage({ error: "first", message: "second" }, "fallback"),
    ).toBe("first");
  });

  it("trims and skips blank or non-string fields", async () => {
    const { remoteErrorMessage } = await loadRemote();
    expect(remoteErrorMessage({ error: "  spaced  " }, "fallback")).toBe("spaced");
    expect(remoteErrorMessage({ error: "   ", message: "used" }, "fallback")).toBe(
      "used",
    );
    expect(remoteErrorMessage({ error: 500 }, "fallback")).toBe("fallback");
  });

  it("falls back for non-object payloads", async () => {
    const { remoteErrorMessage } = await loadRemote();
    expect(remoteErrorMessage(null, "fallback")).toBe("fallback");
    expect(remoteErrorMessage("plain string", "fallback")).toBe("fallback");
    expect(remoteErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
