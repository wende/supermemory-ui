import { afterEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  jsonResponse,
  readJson,
  restoreBackend,
  stubRemoteBackend,
} from "@/test/route-harness";
import type { MemoryEntry, MemoryListResponse } from "@/lib/types";

type Route = typeof import("./route");

async function loadRoute(): Promise<Route> {
  return import("./route");
}

function entry(id: string, updatedAt: string, spaceId: string): MemoryEntry {
  return {
    id,
    memory: `memory ${id}`,
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: null,
    createdAt: updatedAt,
    updatedAt,
    spaceId,
    orgId: "remote",
    sourceCount: 0,
    parentMemoryId: null,
    rootMemoryId: null,
    forgetAfter: null,
    forgetReason: null,
    metadata: null,
    memoryRelations: null,
    temporalContext: null,
    history: [],
    documentIds: [],
  };
}

afterEach(() => {
  restoreBackend();
});

describe("POST /api/v4/memories/list (remote, multiple spaces)", () => {
  it("merges every space into one list sorted by updatedAt, not grouped by space", async () => {
    // Each space's own page is already sorted newest-first — but space "a" has
    // the newest overall entry and space "b" the second-newest, so a naive
    // concat-by-tag would put every "a" entry ahead of every "b" entry.
    stubRemoteBackend((call) => {
      const body = call.body as { containerTags: string[] };
      const tag = body.containerTags[0];
      if (tag === "sm_a") {
        return jsonResponse({
          memoryEntries: [
            entry("a1", "2026-08-10T00:00:00.000Z", "sm_a"),
            entry("a2", "2026-08-08T00:00:00.000Z", "sm_a"),
          ],
          pagination: { currentPage: 1, limit: 100, totalItems: 2, totalPages: 1 },
        } satisfies MemoryListResponse);
      }
      return jsonResponse({
        memoryEntries: [
          entry("b1", "2026-08-09T00:00:00.000Z", "sm_b"),
          entry("b2", "2026-08-07T00:00:00.000Z", "sm_b"),
        ],
        pagination: { currentPage: 1, limit: 100, totalItems: 2, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: { containerTags: ["sm_a", "sm_b"], sort: "updatedAt" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(body.memoryEntries.map((m) => m.id)).toEqual([
      "a1",
      "b1",
      "a2",
      "b2",
    ]);
    expect(body.pagination.totalItems).toBe(4);
  });

  it("honours order: asc across the merged, multi-space list", async () => {
    stubRemoteBackend((call) => {
      const body = call.body as { containerTags: string[] };
      const tag = body.containerTags[0];
      if (tag === "sm_a") {
        return jsonResponse({
          memoryEntries: [entry("a1", "2026-08-10T00:00:00.000Z", "sm_a")],
          pagination: { currentPage: 1, limit: 100, totalItems: 1, totalPages: 1 },
        } satisfies MemoryListResponse);
      }
      return jsonResponse({
        memoryEntries: [entry("b1", "2026-08-05T00:00:00.000Z", "sm_b")],
        pagination: { currentPage: 1, limit: 100, totalItems: 1, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: { containerTags: ["sm_a", "sm_b"], sort: "updatedAt", order: "asc" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(body.memoryEntries.map((m) => m.id)).toEqual(["b1", "a1"]);
  });

  it("sorts malformed entries without timestamps after valid entries", async () => {
    stubRemoteBackend((call) => {
      const body = call.body as { containerTags: string[] };
      const tag = body.containerTags[0];
      const memory = entry(
        tag === "sm_a" ? "valid" : "missing",
        "2026-08-10T00:00:00.000Z",
        tag,
      );
      if (tag === "sm_b") {
        // Runtime responses can be older or heterogeneous even though the
        // current TypeScript contract requires this field.
        delete (memory as Partial<MemoryEntry>).updatedAt;
      }
      return jsonResponse({
        memoryEntries: [memory],
        pagination: { currentPage: 1, limit: 100, totalItems: 1, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: { containerTags: ["sm_a", "sm_b"], sort: "updatedAt" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(body.memoryEntries.map((m) => m.id)).toEqual(["valid", "missing"]);
  });

  it("uses one deterministic tiebreaker in remote and mock backends", async () => {
    stubRemoteBackend((call) => {
      const body = call.body as { containerTags: string[] };
      const tag = body.containerTags[0];
      return jsonResponse({
        memoryEntries: [
          entry(
            tag === "sm_a" ? "z-last" : "a-first",
            "2026-08-10T00:00:00.000Z",
            tag,
          ),
        ],
        pagination: { currentPage: 1, limit: 25, totalItems: 1, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: { containerTags: ["sm_a", "sm_b"], sort: "updatedAt" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(body.memoryEntries.map((m) => m.id)).toEqual([
      "a-first",
      "z-last",
    ]);
  });

  it("clamps unknown sort keys to updatedAt before proxying", async () => {
    const proxiedSorts: unknown[] = [];
    stubRemoteBackend((call) => {
      const body = call.body as { containerTags: string[]; sort?: unknown };
      proxiedSorts.push(body.sort);
      const tag = body.containerTags[0];
      return jsonResponse({
        memoryEntries: [
          entry(
            tag === "sm_a" ? "older" : "newer",
            tag === "sm_a"
              ? "2026-08-09T00:00:00.000Z"
              : "2026-08-10T00:00:00.000Z",
            tag,
          ),
        ],
        pagination: { currentPage: 1, limit: 25, totalItems: 1, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: { containerTags: ["sm_a", "sm_b"], sort: "memory" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(proxiedSorts).toEqual(["updatedAt", "updatedAt"]);
    expect(body.memoryEntries.map((m) => m.id)).toEqual(["newer", "older"]);
  });

  it("returns page two of the globally merged timeline", async () => {
    const requests: Array<{ page: number; limit: number }> = [];
    stubRemoteBackend((call) => {
      const body = call.body as {
        containerTags: string[];
        page: number;
        limit: number;
      };
      requests.push({ page: body.page, limit: body.limit });
      const tag = body.containerTags[0];
      return jsonResponse({
        memoryEntries:
          tag === "sm_a"
            ? [
                entry("a-new", "2026-08-13T09:00:00.000Z", tag),
                entry("a-old", "2026-08-13T01:00:00.000Z", tag),
              ]
            : [
                entry("b-new", "2026-08-13T08:00:00.000Z", tag),
                entry("b-old", "2026-08-13T07:00:00.000Z", tag),
              ],
        pagination: { currentPage: 1, limit: 4, totalItems: 2, totalPages: 1 },
      } satisfies MemoryListResponse);
    });
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories/list", {
        json: {
          containerTags: ["sm_a", "sm_b"],
          page: 2,
          limit: 2,
          sort: "updatedAt",
        },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(res);

    expect(requests).toEqual([
      { page: 1, limit: 4 },
      { page: 1, limit: 4 },
    ]);
    expect(body.memoryEntries.map((m) => m.id)).toEqual(["b-old", "a-old"]);
  });
});
