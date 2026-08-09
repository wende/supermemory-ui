import { afterEach, describe, expect, it } from "vitest";
import {
  createMemory,
  db,
  deleteSpace,
  forgetMemory,
  listDocuments,
  listMemories,
  mergeSpaces,
  paginate,
  resetDb,
  spacesWithCounts,
  stats,
  suggestBuckets,
  updateMemory,
  updateSettings,
  updateSpace,
} from "./store";

afterEach(() => resetDb());

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("slices the requested page and reports the totals", () => {
    expect(paginate(items, 2, 10)).toEqual({
      slice: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      pagination: { currentPage: 2, limit: 10, totalItems: 25, totalPages: 3 },
    });
  });

  it("returns a short final page", () => {
    expect(paginate(items, 3, 10).slice).toEqual([20, 21, 22, 23, 24]);
  });

  it("clamps a page below one or past the end", () => {
    expect(paginate(items, 0, 10).pagination.currentPage).toBe(1);
    expect(paginate(items, 99, 10).pagination.currentPage).toBe(3);
    expect(paginate(items, 99, 10).slice).toEqual([20, 21, 22, 23, 24]);
  });

  it("reports one page for an empty list", () => {
    expect(paginate([], 1, 10)).toEqual({
      slice: [],
      pagination: { currentPage: 1, limit: 10, totalItems: 0, totalPages: 1 },
    });
  });

  it("defaults to the first page of twenty", () => {
    const { pagination } = paginate(items);
    expect(pagination).toMatchObject({ currentPage: 1, limit: 20, totalPages: 2 });
  });
});

describe("listDocuments", () => {
  it("blanks content unless the caller opts in", () => {
    const bare = listDocuments({ limit: 3 });
    expect(bare.memories.every((d) => d.content === "")).toBe(true);

    const full = listDocuments({ limit: 3, includeContent: true });
    expect(full.memories.some((d) => d.content.length > 0)).toBe(true);
  });

  it("filters by space, type and status", () => {
    const byTag = listDocuments({ containerTags: ["sm_research"], limit: 500 });
    expect(byTag.memories.length).toBeGreaterThan(0);
    expect(
      byTag.memories.every((d) => d.containerTags.includes("sm_research")),
    ).toBe(true);

    const byType = listDocuments({ types: ["pdf"], limit: 500 });
    expect(byType.memories.every((d) => d.type === "pdf")).toBe(true);

    const byStatus = listDocuments({ statuses: ["done"], limit: 500 });
    expect(byStatus.memories.every((d) => d.status === "done")).toBe(true);
  });

  it("matches the query against title, summary and content", () => {
    const target = db().documents.find((d) => d.title)!;
    const hits = listDocuments({ q: target.title!.toLowerCase(), limit: 500 });
    expect(hits.memories.some((d) => d.id === target.id)).toBe(true);
  });

  it("sorts by createdAt descending by default and honours order/sort", () => {
    const desc = listDocuments({ limit: 500 }).memories.map((d) => d.createdAt);
    expect(desc).toEqual([...desc].sort().reverse());

    const asc = listDocuments({ order: "asc", limit: 500 }).memories.map(
      (d) => d.createdAt,
    );
    expect(asc).toEqual([...asc].sort());

    const byUpdated = listDocuments({ sort: "updatedAt", limit: 500 }).memories.map(
      (d) => d.updatedAt,
    );
    expect(byUpdated).toEqual([...byUpdated].sort().reverse());
  });

  it("returns an empty page rather than throwing for an unknown space", () => {
    expect(listDocuments({ containerTags: ["sm_nope"] })).toMatchObject({
      memories: [],
      pagination: { totalItems: 0, totalPages: 1 },
    });
  });
});

describe("listMemories", () => {
  it("hides forgotten memories unless asked", () => {
    const m = createMemory({ memory: "Soon forgotten.", containerTag: "sm_personal" });
    forgetMemory(m.id);

    const active = listMemories({ limit: 500 }).memoryEntries;
    expect(active.some((x) => x.id === m.id)).toBe(false);
    expect(active.every((x) => !x.isForgotten)).toBe(true);

    const all = listMemories({ includeForgotten: true, limit: 500 }).memoryEntries;
    expect(all.some((x) => x.id === m.id)).toBe(true);
  });

  it("filters by the static, inference and versioned flags", () => {
    const staticFact = createMemory({ memory: "Static fact.", isStatic: true });
    const edited = createMemory({ memory: "v1", isStatic: false });
    updateMemory(edited.id, "v2");

    const onlyStatic = listMemories({ onlyStatic: true, limit: 500 }).memoryEntries;
    expect(onlyStatic.every((m) => m.isStatic)).toBe(true);
    expect(onlyStatic.some((m) => m.id === staticFact.id)).toBe(true);

    const onlyInference = listMemories({ onlyInference: true, limit: 500 })
      .memoryEntries;
    expect(onlyInference.every((m) => m.isInference)).toBe(true);

    const onlyVersioned = listMemories({ onlyVersioned: true, limit: 500 })
      .memoryEntries;
    expect(onlyVersioned.every((m) => m.version > 1)).toBe(true);
    expect(onlyVersioned.some((m) => m.id === edited.id)).toBe(true);
  });

  it("filters by container tag and by source document", () => {
    const scoped = listMemories({ containerTags: ["sm_research"], limit: 500 });
    expect(scoped.memoryEntries.length).toBeGreaterThan(0);
    expect(scoped.memoryEntries.every((m) => m.spaceId === "sm_research")).toBe(true);

    const sourced = db().memories.find((m) => m.documentIds.length > 0)!;
    const byDoc = listMemories({
      documentId: sourced.documentIds[0]!,
      limit: 500,
    }).memoryEntries;
    expect(byDoc.every((m) => m.documentIds.includes(sourced.documentIds[0]!))).toBe(
      true,
    );
  });

  it("matches the query case-insensitively against the memory text", () => {
    const m = createMemory({ memory: "Uniquely Spelled Zarbaglione Fact." });
    const hits = listMemories({ q: "zarbaglione", limit: 500 }).memoryEntries;
    expect(hits.map((x) => x.id)).toEqual([m.id]);
  });

  it("sorts by updatedAt descending and pages by 25", () => {
    const { memoryEntries, pagination } = listMemories({});
    expect(pagination.limit).toBe(25);
    const updated = memoryEntries.map((m) => m.updatedAt);
    expect(updated).toEqual([...updated].sort().reverse());
  });
});

describe("spacesWithCounts", () => {
  it("counts documents per space and excludes forgotten memories", () => {
    const spaces = spacesWithCounts();
    const research = spaces.find((s) => s.containerTag === "sm_research")!;

    expect(research.documentCount).toBe(
      db().documents.filter((d) => d.containerTags.includes("sm_research")).length,
    );

    const before = research.memoryCount;
    const m = createMemory({ memory: "Counted.", containerTag: "sm_research" });
    expect(
      spacesWithCounts().find((s) => s.containerTag === "sm_research")!.memoryCount,
    ).toBe(before + 1);

    forgetMemory(m.id);
    expect(
      spacesWithCounts().find((s) => s.containerTag === "sm_research")!.memoryCount,
    ).toBe(before);
  });
});

describe("stats", () => {
  it("rolls up documents, memories and derived counts", () => {
    const s = stats();
    const d = db();

    expect(s.documents).toBe(d.documents.length);
    expect(s.memories).toBe(d.memories.filter((m) => !m.isForgotten).length);
    expect(s.spaces).toBe(d.spaces.length);
    expect(s.chunks).toBe(d.documents.reduce((n, doc) => n + (doc.chunkCount ?? 0), 0));
    expect(s.vectorBytes).toBe(s.chunks * 768 * 4);
    expect(s.relations).toBe(
      d.memories.reduce((n, m) => n + (m.memoryRelations?.length ?? 0), 0),
    );
  });

  it("buckets documents by status and by type", () => {
    const s = stats();
    expect(Object.keys(s.byStatus)).toEqual([
      "queued",
      "extracting",
      "chunking",
      "embedding",
      "indexing",
      "done",
      "failed",
    ]);
    expect(
      Object.values(s.byStatus).reduce((a, b) => a + b, 0),
    ).toBe(s.documents);
    expect(Object.values(s.byType).reduce((a, b) => a + b, 0)).toBe(s.documents);
    expect(s.failed).toBe(s.byStatus.failed);
  });

  it("tracks versioned memories as they are edited", () => {
    const before = stats().versioned;
    const m = createMemory({ memory: "v1" });
    expect(stats().versioned).toBe(before);

    updateMemory(m.id, "v2");
    expect(stats().versioned).toBe(before + 1);
  });
});

describe("spaces", () => {
  it("patches settings and description without clobbering the rest", () => {
    const before = db().spaces.find((s) => s.containerTag === "sm_research")!;
    const excludes = before.settings.excludeItems;

    const updated = updateSpace("sm_research", {
      description: "Private research corpus",
      chunkSize: 999,
    })!;

    expect(updated.description).toBe("Private research corpus");
    expect(updated.settings.chunkSize).toBe(999);
    expect(updated.settings.excludeItems).toEqual(excludes);
  });

  it("leaves the description alone when the patch omits it", () => {
    const before = db().spaces.find((s) => s.containerTag === "sm_research")!
      .description;
    expect(updateSpace("sm_research", { chunkSize: 1 })!.description).toBe(before);
  });

  it("returns undefined for an unknown space", () => {
    expect(updateSpace("sm_nope", { chunkSize: 1 })).toBeUndefined();
  });

  it("deleting a space removes its documents and memories", () => {
    expect(deleteSpace("sm_research")).toBe(true);

    expect(db().spaces.some((s) => s.containerTag === "sm_research")).toBe(false);
    expect(
      db().documents.some((d) => d.containerTags.includes("sm_research")),
    ).toBe(false);
    expect(db().memories.some((m) => m.spaceId === "sm_research")).toBe(false);
    expect(deleteSpace("sm_research")).toBe(false);
  });

  it("merging moves documents and memories onto the target tag", () => {
    const movedDocs = db().documents.filter((d) =>
      d.containerTags.includes("sm_research"),
    ).length;
    const movedMemories = db().memories.filter(
      (m) => m.spaceId === "sm_research",
    ).length;

    const status = mergeSpaces("sm_research", "sm_personal");

    expect(status).toMatchObject({
      status: "done",
      source: "sm_research",
      target: "sm_personal",
      movedDocuments: movedDocs,
      movedMemories,
    });
    expect(db().memories.some((m) => m.spaceId === "sm_research")).toBe(false);
    expect(
      db().documents.some((d) => d.containerTags.includes("sm_research")),
    ).toBe(false);
    expect(db().spaces.some((s) => s.containerTag === "sm_research")).toBe(false);
    expect(db().merges[0]).toBe(status);
  });

  it("does not duplicate the target tag on a document that already had both", () => {
    const doc = db().documents.find((d) =>
      d.containerTags.includes("sm_research"),
    )!;
    doc.containerTags = ["sm_research", "sm_personal"];

    mergeSpaces("sm_research", "sm_personal");

    expect(doc.containerTags).toEqual(["sm_personal"]);
  });
});

describe("settings", () => {
  it("merges a partial patch into the stored settings", () => {
    const before = db().settings;
    const after = updateSettings({ chunkSize: 2048 });

    expect(after.chunkSize).toBe(2048);
    expect(after.filterPrompt).toBe(before.filterPrompt);
    expect(after.profileBuckets).toEqual(before.profileBuckets);
  });

  it("suggests only buckets that are not configured yet", () => {
    const suggested = suggestBuckets();
    const existing = new Set(db().settings.profileBuckets.map((b) => b.key));

    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((b) => !existing.has(b.key))).toBe(true);

    updateSettings({
      profileBuckets: [
        ...db().settings.profileBuckets,
        ...suggested.map((b) => ({ key: b.key, description: b.description })),
      ],
    });
    expect(suggestBuckets()).toEqual([]);
  });
});
