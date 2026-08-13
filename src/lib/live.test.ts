import { afterEach, describe, expect, it } from "vitest";
import {
  jsonResponse,
  restoreBackend,
  stubRemoteBackend,
  type ProxiedCall,
  type RemoteHandler,
} from "@/test/route-harness";
import { clearTagCache } from "./tags";
import type { MemoryEntry } from "./types";

type Live = typeof import("./live");

async function loadLive(
  handler: RemoteHandler = () => jsonResponse({}),
  options?: { url?: string },
): Promise<{ live: Live; calls: ProxiedCall[] }> {
  const calls = stubRemoteBackend(handler, options);
  return { live: await import("./live"), calls };
}

/**
 * A memory as the *live* API shapes it: relations arrive as a
 * `{ targetId: relation }` map and the space may be carried on
 * `containerTag`/`containerTags` rather than `spaceId`.
 */
type LiveShapedMemory = Omit<Partial<MemoryEntry>, "memoryRelations"> & {
  id: string;
  memoryRelations?: MemoryEntry["memoryRelations"] | Record<string, string>;
  containerTag?: string;
  containerTags?: string[];
};

/** Minimal live-shaped memory; individual cases override what they care about. */
function liveMemory(over: LiveShapedMemory) {
  return {
    memory: "A claim",
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    orgId: "remote",
    sourceCount: 0,
    parentMemoryId: null,
    rootMemoryId: over.id,
    forgetAfter: null,
    forgetReason: null,
    metadata: null,
    memoryRelations: null,
    temporalContext: null,
    history: [],
    documentIds: [],
    spaceId: "opaque_space_id",
    ...over,
  } as MemoryEntry;
}

/**
 * Answers the three endpoints the aggregators page: documents, per-tag
 * memories, and per-tag container-tag settings.
 */
function corpusBackend(input: {
  documents?: unknown[];
  memoriesByTag?: Record<string, unknown[]>;
  tagInfo?: Record<string, unknown>;
}): RemoteHandler {
  return (call) => {
    if (call.url.endsWith("/v3/documents/list")) {
      return jsonResponse({
        memories: input.documents ?? [],
        pagination: { totalPages: 1 },
      });
    }
    if (call.url.endsWith("/v4/memories/list")) {
      const body = call.body as { containerTags: string[]; page?: number; limit?: number };
      const [tag] = body.containerTags;
      const all = input.memoriesByTag?.[tag!] ?? [];
      const limit = body.limit ?? 100;
      const page = body.page ?? 1;
      const totalItems = all.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / limit));
      const start = (page - 1) * limit;
      return jsonResponse({
        memoryEntries: all.slice(start, start + limit),
        pagination: { currentPage: page, limit, totalItems, totalPages },
      });
    }
    const tag = decodeURIComponent(call.url.split("/v3/container-tags/")[1] ?? "");
    return jsonResponse(input.tagInfo?.[tag] ?? {});
  };
}

afterEach(() => {
  restoreBackend();
  // resolveTags caches across imports; a prior test's document tags must
  // not decide which spaces the next crawl pages.
  clearTagCache();
});

describe("normalizeMemoryRelations", () => {
  it("converts the live `{ targetId: relation }` map into edges", async () => {
    const { live } = await loadLive();

    expect(
      live.normalizeMemoryRelations({ mem_a: "updates", mem_b: "extends" }),
    ).toEqual([
      { targetId: "mem_a", relation: "updates" },
      { targetId: "mem_b", relation: "extends" },
    ]);
  });

  it("passes a non-empty array through untouched", async () => {
    const { live } = await loadLive();
    const edges = [{ targetId: "mem_a", relation: "derives" as const }];

    expect(live.normalizeMemoryRelations(edges)).toBe(edges);
  });

  it("normalises every empty shape to null", async () => {
    const { live } = await loadLive();

    expect(live.normalizeMemoryRelations(null)).toBeNull();
    expect(live.normalizeMemoryRelations(undefined)).toBeNull();
    expect(live.normalizeMemoryRelations([])).toBeNull();
    expect(live.normalizeMemoryRelations({})).toBeNull();
  });
});

describe("normalizeMemoryEntry", () => {
  it("prefers the tag it was fetched under over the opaque live spaceId", async () => {
    const { live } = await loadLive();

    expect(
      live.normalizeMemoryEntry(liveMemory({ id: "mem_1" }), "sm_research").spaceId,
    ).toBe("sm_research");
  });

  it("falls back through containerTag, containerTags and spaceId", async () => {
    const { live } = await loadLive();
    const base = liveMemory({ id: "mem_1" });

    expect(
      live.normalizeMemoryEntry({ ...base, containerTag: "sm_single" } as MemoryEntry)
        .spaceId,
    ).toBe("sm_single");
    expect(
      live.normalizeMemoryEntry({
        ...base,
        containerTags: ["sm_first", "sm_second"],
      } as MemoryEntry).spaceId,
    ).toBe("sm_first");
    expect(live.normalizeMemoryEntry(base).spaceId).toBe("opaque_space_id");
  });

  it("labels a memory with no derivable space as unknown", async () => {
    const { live } = await loadLive();

    expect(
      live.normalizeMemoryEntry(liveMemory({ id: "mem_1", spaceId: "" })).spaceId,
    ).toBe("unknown");
  });

  it("coerces relations and a missing documentIds array", async () => {
    const { live } = await loadLive();

    const normalized = live.normalizeMemoryEntry({
      ...liveMemory({ id: "mem_1" }),
      memoryRelations: { mem_a: "updates" },
      documentIds: undefined,
    } as unknown as MemoryEntry);

    expect(normalized.memoryRelations).toEqual([
      { targetId: "mem_a", relation: "updates" },
    ]);
    expect(normalized.documentIds).toEqual([]);
  });

  it("does not mutate the entry it was given", async () => {
    const { live } = await loadLive();
    const entry = liveMemory({ id: "mem_1" });

    live.normalizeMemoryEntry(entry, "sm_research");
    expect(entry.spaceId).toBe("opaque_space_id");
  });
});

describe("mapForgetMemories", () => {
  it("returns an empty list for nothing to map", async () => {
    const { live } = await loadLive();

    expect(live.mapForgetMemories(undefined)).toEqual([]);
    expect(live.mapForgetMemories([])).toEqual([]);
  });

  it("fills in a renderable entry, stamping the score into metadata", async () => {
    const { live } = await loadLive();

    const [entry] = live.mapForgetMemories(
      [{ id: "mem_1", memory: "A candidate", score: 0.62 }],
      "sm_research",
    );

    expect(entry).toMatchObject({
      id: "mem_1",
      memory: "A candidate",
      spaceId: "sm_research",
      orgId: "remote",
      version: 1,
      isForgotten: false,
      metadata: { score: 0.62 },
    });
  });

  it("tolerates thin candidates with no id, text or score", async () => {
    const { live } = await loadLive();

    expect(live.mapForgetMemories([{}])[0]).toMatchObject({
      id: "unknown",
      memory: "",
      spaceId: "unknown",
      rootMemoryId: null,
      metadata: null,
    });
  });
});

describe("remoteServerInfo", () => {
  it("derives the port from an explicit one", async () => {
    const { live } = await loadLive(() => jsonResponse({}), {
      url: "http://127.0.0.1:8787",
    });

    expect(live.remoteServerInfo()).toMatchObject({
      baseUrl: "http://127.0.0.1:8787",
      port: 8787,
      backend: "remote",
      mode: "local",
    });
  });

  it("defaults the port by scheme", async () => {
    const https = await loadLive(() => jsonResponse({}), {
      url: "https://engine.example.com",
    });
    expect(https.live.remoteServerInfo().port).toBe(443);
    restoreBackend();

    const http = await loadLive(() => jsonResponse({}), {
      url: "http://engine.example.com",
    });
    expect(http.live.remoteServerInfo().port).toBe(80);
  });

  it("reports a null port for an unparseable base url", async () => {
    const { live } = await loadLive(() => jsonResponse({}), { url: "not-a-url" });

    expect(live.remoteServerInfo().port).toBeNull();
  });

  it("lets a caller override any field", async () => {
    const { live } = await loadLive();

    expect(live.remoteServerInfo({ version: "1.2.3", port: 1 })).toMatchObject({
      version: "1.2.3",
      port: 1,
    });
  });
});

describe("liveSpaces", () => {
  it("counts documents and live memories per discovered tag", async () => {
    const { live } = await loadLive(
      corpusBackend({
        documents: [
          { id: "doc_1", containerTags: ["sm_research"], type: "text", status: "done" },
          { id: "doc_2", containerTags: ["sm_research"], type: "pdf", status: "done" },
          { id: "doc_3", containerTags: ["sm_personal"], type: "text", status: "done" },
        ],
        memoriesByTag: {
          sm_research: [
            liveMemory({ id: "mem_1" }),
            liveMemory({ id: "mem_2", isForgotten: true }),
          ],
          sm_personal: [liveMemory({ id: "mem_3" })],
        },
      }),
    );

    const { containerTags, merges } = await live.liveSpaces();
    const research = containerTags.find((s) => s.containerTag === "sm_research")!;

    expect(merges).toEqual([]);
    expect(research.documentCount).toBe(2);
    expect(research.memoryCount).toBe(1);
  });

  it("drops the auto-ingest `Space <tag>` prefix from the display name", async () => {
    const { live } = await loadLive(
      corpusBackend({
        documents: [{ id: "doc_1", containerTags: ["sm_research"] }],
        tagInfo: { sm_research: { name: "Space sm_research" } },
      }),
    );

    const { containerTags } = await live.liveSpaces();
    expect(containerTags[0]!.name).toBe("sm_research");
  });

  it("keeps a deliberate custom name and merges partial settings", async () => {
    const { live } = await loadLive(
      corpusBackend({
        documents: [{ id: "doc_1", containerTags: ["sm_research"] }],
        tagInfo: {
          sm_research: {
            name: "Private research",
            description: "Unpublished work",
            settings: { chunkSize: 900 },
          },
        },
      }),
    );

    const [space] = (await live.liveSpaces()).containerTags;
    expect(space).toMatchObject({
      name: "Private research",
      description: "Unpublished work",
    });
    expect(space!.settings).toEqual({
      shouldLLMFilter: null,
      filterPrompt: null,
      chunkSize: 900,
      includeItems: [],
      excludeItems: [],
    });
  });
});

describe("liveStats", () => {
  it("rolls up counts and per-day activity from the live corpus", async () => {
    const { live } = await loadLive(
      corpusBackend({
        documents: [
          {
            id: "doc_1",
            containerTags: ["sm_research"],
            type: "pdf",
            status: "done",
            createdAt: "2026-08-01T09:00:00.000Z",
          },
          {
            id: "doc_2",
            containerTags: ["sm_research"],
            type: "text",
            status: "extracting",
            createdAt: "2026-08-02T09:00:00.000Z",
          },
        ],
        memoriesByTag: {
          sm_research: [
            liveMemory({ id: "mem_1", createdAt: "2026-08-01T10:00:00.000Z" }),
            liveMemory({
              id: "mem_2",
              isForgotten: true,
              createdAt: "2026-08-02T10:00:00.000Z",
            }),
            liveMemory({
              id: "mem_3",
              version: 3,
              isStatic: true,
              createdAt: "2026-08-02T11:00:00.000Z",
              memoryRelations: { mem_1: "updates" },
            }),
          ],
        },
      }),
    );

    const s = await live.liveStats();

    expect(s).toMatchObject({
      documents: 2,
      memories: 2,
      forgotten: 1,
      staticFacts: 1,
      versioned: 1,
      relations: 1,
      processing: 1,
      failed: 0,
      // The live API exposes neither chunk counts nor index size.
      chunks: null,
      vectorBytes: null,
    });
    expect(s.byStatus).toMatchObject({ done: 1, extracting: 1 });
    expect(s.byType).toEqual({ pdf: 1, text: 1 });
    expect(s.activity).toEqual([
      { date: "2026-08-01", documents: 1, memories: 1 },
      { date: "2026-08-02", documents: 1, memories: 2 },
    ]);
  });
});

describe("liveGraph", () => {
  const backend = corpusBackend({
    documents: [
      { id: "doc_1", containerTags: ["sm_research"], chunkCount: 8, title: "RFC-014" },
    ],
    memoriesByTag: {
      sm_research: [
        liveMemory({
          id: "mem_1",
          documentIds: ["doc_1"],
          memoryRelations: { mem_2: "updates", mem_missing: "extends" },
        }),
        liveMemory({ id: "mem_2", documentIds: ["doc_1"] }),
        liveMemory({ id: "mem_3", isForgotten: true }),
      ],
    },
  });

  it("emits memory nodes with their relations, dropping dangling edges", async () => {
    const { live } = await loadLive(backend);

    const g = await live.liveGraph({ includeDocuments: false });

    expect(g.nodes.map((n) => n.id).sort()).toEqual(["mem_1", "mem_2"]);
    expect(g.edges).toEqual([
      { source: "mem_1", target: "mem_2", relation: "updates" },
    ]);
  });

  it("excludes forgotten memories unless asked for them", async () => {
    const { live } = await loadLive(backend);

    const without = await live.liveGraph({ includeDocuments: false });
    expect(without.nodes.some((n) => n.id === "mem_3")).toBe(false);

    restoreBackend();
    const reloaded = await loadLive(backend);
    const with3 = await reloaded.live.liveGraph({
      includeDocuments: false,
      includeForgotten: true,
    });
    expect(with3.nodes.find((n) => n.id === "mem_3")).toMatchObject({
      forgotten: true,
    });
  });

  it("includes source documents by default", async () => {
    const { live } = await loadLive(backend);

    const g = await live.liveGraph({});

    expect(g.nodes.find((n) => n.id === "doc_1")).toMatchObject({
      kind: "document",
      label: "RFC-014",
      weight: 3,
    });
    expect(g.edges).toContainEqual({
      source: "doc_1",
      target: "mem_1",
      relation: "sources",
    });
  });

  it("narrows to the requested container tags", async () => {
    const { live } = await loadLive(backend);

    const g = await live.liveGraph({ containerTags: ["sm_other"] });
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("reports loaded/total while paging the memory corpus", async () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      liveMemory({ id: `mem_page_${i}` }),
    );
    const paged = corpusBackend({
      // Tags are discovered from documents; without one, resolveTags falls
      // back to sm_project_default and the crawl never sees these memories.
      documents: [{ id: "doc_seed", containerTags: ["sm_research"] }],
      memoriesByTag: { sm_research: many },
    });
    const { live } = await loadLive(paged);
    const seen: { loaded: number; total: number }[] = [];

    const g = await live.liveGraph({ includeDocuments: false }, (p) =>
      seen.push(p),
    );

    expect(g.nodes).toHaveLength(250);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toEqual({ loaded: 0, total: 250 });
    expect(seen[1]).toEqual({ loaded: 100, total: 250 });
    // The document pass (one seed document here) rides the same denominator
    // as the memory crawl, so the meter keeps moving past the memory total
    // instead of parking at 100% while documents and spaces are assembled.
    expect(seen.at(-1)).toEqual({ loaded: 251, total: 251 });
    // Monotonic climb — the meter must never jump backwards.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.loaded).toBeGreaterThanOrEqual(seen[i - 1]!.loaded);
    }
  });
});
