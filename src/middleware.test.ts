import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

function visit(url: string) {
  return middleware(new NextRequest(new Request(`http://console.local${url}`)));
}

/** The `sm_backend` cookie the response asks the browser to store. */
function backendCookie(res: ReturnType<typeof middleware>) {
  return res.cookies.get("sm_backend");
}

describe("no backend flag", () => {
  it("passes the request through untouched", () => {
    const res = visit("/memories?q=kafka");

    expect(res.headers.get("location")).toBeNull();
    expect(backendCookie(res)).toBeUndefined();
  });
});

describe("opting into the mock", () => {
  it.each(["?mock", "?mock=1", "?mock=true", "?mock=anything"])(
    "treats %s as a request for mock data",
    (query) => {
      const res = visit(`/graph${query}`);

      expect(backendCookie(res)?.value).toBe("mock");
      expect(res.headers.get("location")).toBe("http://console.local/graph");
    },
  );
});

describe("opting into the live instance", () => {
  it.each(["?mock=0", "?mock=false", "?remote", "?remote=1"])(
    "treats %s as a request for the live backend",
    (query) => {
      const res = visit(`/graph${query}`);

      expect(backendCookie(res)?.value).toBe("remote");
      expect(res.headers.get("location")).toBe("http://console.local/graph");
    },
  );

  it("prefers ?remote when both flags are present", () => {
    expect(backendCookie(visit("/graph?mock=1&remote"))?.value).toBe("remote");
  });
});

describe("the redirect", () => {
  it("strips only the backend flags, preserving other query params", () => {
    const res = visit("/documents?type=pdf&mock=1&q=kafka");

    expect(res.headers.get("location")).toBe(
      "http://console.local/documents?type=pdf&q=kafka",
    );
  });

  it("keeps the path, including nested segments", () => {
    expect(visit("/spaces/sm_research?mock").headers.get("location")).toBe(
      "http://console.local/spaces/sm_research",
    );
  });

  it("is a redirect, not a rewrite", () => {
    expect(visit("/graph?mock").status).toBe(307);
  });
});

describe("the cookie", () => {
  it("is site-wide, long-lived and lax", () => {
    const cookie = backendCookie(visit("/graph?mock"))!;

    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(60 * 60 * 24 * 365);
    expect(cookie.sameSite).toBe("lax");
  });
});

describe("matcher", () => {
  // Next anchors matcher patterns against the whole pathname.
  const matcher = new RegExp(`^${config.matcher[0]!}$`);

  it("runs on page navigations", () => {
    for (const path of ["/", "/graph", "/spaces/sm_research"]) {
      expect(matcher.test(path)).toBe(true);
    }
  });

  it("skips static assets", () => {
    for (const path of [
      "/_next/static/chunk.js",
      "/_next/image?url=x",
      "/favicon.ico",
    ]) {
      expect(matcher.test(path)).toBe(false);
    }
  });

  it("runs on the API surface, which needs the cross-site guard", () => {
    expect(matcher.test("/api/v4/search")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Cross-site write guard                                              */
/* ------------------------------------------------------------------ */

function apiCall(
  method: string,
  headers: Record<string, string> = {},
  path = "/api/v3/settings/reset",
) {
  return middleware(
    new NextRequest(
      new Request(`http://console.local${path}`, {
        method,
        headers: { host: "console.local", ...headers },
      }),
    ),
  );
}

describe("cross-site writes to the API", () => {
  it("blocks a mutation a browser reports as cross-site", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(apiCall(method, { "sec-fetch-site": "cross-site" }).status).toBe(403);
    }
  });

  it("blocks a mutation whose Origin is another host", () => {
    expect(apiCall("POST", { origin: "https://evil.example" }).status).toBe(403);
  });

  it("blocks a mutation whose Origin is unparseable", () => {
    expect(apiCall("POST", { origin: "null" }).status).toBe(403);
  });

  it("allows same-origin and same-site writes from the console itself", () => {
    for (const site of ["same-origin", "same-site", "none"]) {
      expect(apiCall("POST", { "sec-fetch-site": site }).status).toBe(200);
    }
    expect(apiCall("POST", { origin: "http://console.local" }).status).toBe(200);
  });

  it("allows a write from a non-browser caller, which cannot be forged", () => {
    expect(apiCall("POST").status).toBe(200);
  });

  it("leaves reads alone even when they are cross-site", () => {
    expect(
      apiCall("GET", { "sec-fetch-site": "cross-site" }, "/api/health").status,
    ).toBe(200);
  });

  it("does not touch page navigations", () => {
    const res = middleware(
      new NextRequest(
        new Request("http://console.local/graph?mock", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    );
    expect(backendCookie(res)?.value).toBe("mock");
  });
});
