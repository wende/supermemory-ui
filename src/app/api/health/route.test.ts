import { afterEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  readJson,
  restoreBackend,
  stubMockBackend,
  stubRemoteBackend,
} from "@/test/route-harness";

interface Health {
  status: string;
  backend?: "mock" | "remote";
  remoteConfigured?: boolean;
  baseUrl: string;
  counts: { documents: number; memories: number; spaces: number };
}

const healthRequest = (headers?: Record<string, string>) =>
  apiRequest("/health", { method: "GET", headers });

afterEach(async () => {
  const { resetDb } = await import("@/lib/store");
  resetDb();
  restoreBackend();
});

describe("GET /api/health", () => {
  it("reports the mock backend and mock corpus counts", async () => {
    stubMockBackend();
    const { GET } = await import("./route");
    const { stats } = await import("@/lib/store");

    const { status, body } = await readJson<Health>(await GET(healthRequest()));
    const expected = stats();

    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      backend: "mock",
      remoteConfigured: false,
    });
    expect(body.counts).toEqual({
      documents: expected.documents,
      memories: expected.memories,
      forgotten: expected.forgotten,
      chunks: expected.chunks,
      spaces: expected.spaces,
    });
  });

  it("still reports remoteConfigured when the user has opted into the mock", async () => {
    stubRemoteBackend(() => new Response("{}"));
    const { GET } = await import("./route");

    const { body } = await readJson<Health>(
      await GET(healthRequest({ cookie: "sm_backend=mock" })),
    );

    expect(body.backend).toBe("mock");
    expect(body.remoteConfigured).toBe(true);
  });

  it("reports the live instance when the proxy answers", async () => {
    stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/documents/list")) {
        return new Response(
          JSON.stringify({
            memories: [{ id: "doc_1", containerTags: ["sm_live"], type: "text", status: "done", createdAt: "2026-08-01T00:00:00.000Z" }],
            pagination: { totalPages: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (call.url.includes("/v4/memories/list")) {
        return new Response(
          JSON.stringify({
            memoryEntries: [
              {
                id: "mem_1",
                memory: "live",
                version: 1,
                isForgotten: false,
                createdAt: "2026-08-01T00:00:00.000Z",
                documentIds: ["doc_1"],
              },
            ],
            pagination: { totalPages: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      });
    });
    const { GET } = await import("./route");

    const { body } = await readJson<Health>(await GET(healthRequest()));

    expect(body).toMatchObject({
      status: "ok",
      backend: "remote",
      remoteConfigured: true,
      baseUrl: "https://engine.example.com",
    });
    expect(body.counts).toMatchObject({ documents: 1, memories: 1, spaces: 1 });
  });

  it("degrades rather than failing when the live instance errors", async () => {
    stubRemoteBackend(() =>
      new Response(JSON.stringify({ error: "down" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const { GET } = await import("./route");

    const { status, body } = await readJson<Health>(await GET(healthRequest()));

    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
  });
});
