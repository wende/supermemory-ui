import { afterEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  callRoute,
  jsonResponse,
  readJson,
  restoreBackend,
  stubMockBackend,
  stubRemoteBackend,
} from "@/test/route-harness";
import type { SearchResponse } from "@/lib/types";

afterEach(async () => {
  const { resetDb } = await import("@/lib/store");
  resetDb();
  restoreBackend();
});

describe("mock mode", () => {
  it("rejects a missing or blank query with 400", async () => {
    stubMockBackend();
    const { POST } = await import("./route");

    for (const json of [{}, { q: "" }, { q: "   " }]) {
      const res = await callRoute(() => POST(apiRequest("/v4/search", { json })));
      expect(await readJson(res)).toMatchObject({
        status: 400,
        body: { error: "`q` is required." },
      });
    }
  });

  it("answers with scored results from the mock corpus", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { createMemory } = await import("@/lib/store");
    createMemory({
      memory: "Quantum sledding telemetry from the aurora beacon fleet.",
      containerTag: "sm_search_route",
    });

    const res = await callRoute(() =>
      POST(
        apiRequest("/v4/search", {
          json: { q: "quantum sledding", containerTags: ["sm_search_route"] },
        }),
      ),
    );
    const { status, body } = await readJson<SearchResponse>(res);

    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.results[0]!.memory).toContain("Quantum sledding");
    expect(body.timing).toBeGreaterThan(0);
  });

  it("trims the query before searching", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { createMemory } = await import("@/lib/store");
    createMemory({
      memory: "Quantum sledding telemetry from the aurora beacon fleet.",
      containerTag: "sm_search_route",
    });

    const res = await callRoute(() =>
      POST(
        apiRequest("/v4/search", {
          json: { q: "  quantum sledding  ", containerTags: ["sm_search_route"] },
        }),
      ),
    );
    expect((await readJson<SearchResponse>(res)).body.total).toBe(1);
  });
});

describe("remote mode", () => {
  it("fans out one request per container tag with a singular containerTag", async () => {
    const calls = stubRemoteBackend(() =>
      jsonResponse({ results: [], total: 0, timing: 4 }),
    );
    const { POST } = await import("./route");

    await POST(
      apiRequest("/v4/search", {
        json: { q: "kafka", containerTags: ["sm_a", "sm_b"], limit: 5 },
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => (c.body as { containerTag: string }).containerTag)).toEqual(
      expect.arrayContaining(["sm_a", "sm_b"]),
    );
    for (const call of calls) {
      expect(call.body).toMatchObject({ q: "kafka", limit: 5 });
      expect(call.body).not.toHaveProperty("containerTags");
    }
  });

  it("merges hits across tags, keeping the highest similarity per id", async () => {
    stubRemoteBackend((call) => {
      const tag = (call.body as { containerTag: string }).containerTag;
      return jsonResponse({
        timing: tag === "sm_a" ? 12 : 30,
        total: 1,
        results: [
          {
            id: "mem_shared",
            memory: "Shared hit",
            similarity: tag === "sm_a" ? 0.4 : 0.9,
          },
          { id: `mem_${tag}`, memory: tag, similarity: 0.5 },
        ],
      });
    });
    const { POST } = await import("./route");

    const res = await POST(
      apiRequest("/v4/search", {
        json: { q: "kafka", containerTags: ["sm_a", "sm_b"] },
      }),
    );
    const { body } = await readJson<SearchResponse>(res);

    expect(body.results.map((r) => r.id)).toEqual([
      "mem_shared",
      "mem_sm_a",
      "mem_sm_b",
    ]);
    expect(body.results[0]!.similarity).toBe(0.9);
    expect(body.total).toBe(3);
    // Timing is the slowest leg, since the legs run concurrently.
    expect(body.timing).toBe(30);
  });

  it("applies the limit after merging", async () => {
    stubRemoteBackend((call) => {
      const tag = (call.body as { containerTag: string }).containerTag;
      return jsonResponse({
        timing: 5,
        total: 2,
        results: [
          { id: `${tag}_1`, memory: "a", similarity: 0.9 },
          { id: `${tag}_2`, memory: "b", similarity: 0.8 },
        ],
      });
    });
    const { POST } = await import("./route");

    const res = await POST(
      apiRequest("/v4/search", {
        json: { q: "kafka", containerTags: ["sm_a", "sm_b"], limit: 3 },
      }),
    );
    const { body } = await readJson<SearchResponse>(res);

    expect(body.results).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it("succeeds when only some tags answer", async () => {
    stubRemoteBackend((call) => {
      const tag = (call.body as { containerTag: string }).containerTag;
      return tag === "sm_a"
        ? jsonResponse({ error: "unknown tag" }, 404)
        : jsonResponse({
            timing: 5,
            total: 1,
            results: [{ id: "mem_b", memory: "b", similarity: 0.7 }],
          });
    });
    const { POST } = await import("./route");

    const res = await POST(
      apiRequest("/v4/search", {
        json: { q: "kafka", containerTags: ["sm_a", "sm_b"] },
      }),
    );
    const { status, body } = await readJson<SearchResponse>(res);

    expect(status).toBe(200);
    expect(body.results.map((r) => r.id)).toEqual(["mem_b"]);
  });

  it("surfaces the upstream error when every tag fails", async () => {
    stubRemoteBackend(() => jsonResponse({ error: "index unavailable" }, 503));
    const { POST } = await import("./route");

    const res = await POST(
      apiRequest("/v4/search", { json: { q: "kafka", containerTags: ["sm_a"] } }),
    );

    expect(await readJson(res)).toMatchObject({
      status: 503,
      body: { error: "index unavailable" },
    });
  });

  it("discovers container tags when the caller asks for all spaces", async () => {
    const calls = stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/documents/list")) {
        return jsonResponse({
          memories: [{ containerTags: ["sm_discovered"] }],
          pagination: { totalPages: 1 },
        });
      }
      return jsonResponse({ results: [], total: 0, timing: 1 });
    });
    const { POST } = await import("./route");

    await POST(apiRequest("/v4/search", { json: { q: "kafka" } }));

    const searchCall = calls.find((c) => c.url.endsWith("/v4/search"))!;
    expect((searchCall.body as { containerTag: string }).containerTag).toBe(
      "sm_discovered",
    );
  });
});
