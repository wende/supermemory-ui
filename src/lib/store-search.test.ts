import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDocument,
  createMemory,
  forgetMemory,
  getDocument,
  listMemories,
  resetDb,
  search,
} from "./store";
import type { SearchRequest } from "./types";

/**
 * Every case searches inside a synthetic space so the assertions describe the
 * scorer rather than whatever the seed corpus happens to say.
 */
const SPACE = "sm_search_fixture";

const MATCH_BOTH =
  "Quantum sledding telemetry shows the aurora pipeline drops packets whenever the beacon rotates past the meridian marker.";
const MATCH_ONE =
  "Aurora beacon rotation is scheduled by the meridian planner, which never accounts for sledding telemetry backpressure at all.";
const NO_MATCH =
  "Completely unrelated statement about gardening rotas and compost turning across the cold winter months of the year.";

let documentId: string;

function find<T extends { id: string }>(results: T[], id: string): T | undefined {
  return results.find((r) => r.id === id);
}

/** The extracted memory whose text starts with `prefix`. */
function memoryStartingWith(prefix: string) {
  const entry = listMemories({ containerTags: [SPACE], limit: 100 })
    .memoryEntries.find((m) => m.memory.startsWith(prefix));
  if (!entry) throw new Error(`no fixture memory starting with "${prefix}"`);
  return entry;
}

function run(req: Partial<SearchRequest> & { q: string }) {
  return search({ containerTags: [SPACE], ...req });
}

beforeEach(() => {
  resetDb();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));

  const doc = addDocument({
    content: [MATCH_BOTH, MATCH_ONE].join("\n\n"),
    title: "Aurora beacon notes",
    containerTags: [SPACE],
  });
  documentId = doc.id;
  // Drive the document to `done` so it has chunks and extracted memories.
  vi.advanceTimersByTime(1400 * 5);
  getDocument(documentId);

  createMemory({ memory: NO_MATCH, containerTag: SPACE });
});

afterEach(() => {
  vi.useRealTimers();
  resetDb();
});

describe("matching", () => {
  it("returns the memories that share terms with the query", () => {
    const res = run({ q: "quantum sledding" });

    expect(res.total).toBe(2);
    expect(res.results.map((r) => r.memory)).toEqual(
      expect.arrayContaining([MATCH_BOTH, MATCH_ONE]),
    );
    expect(res.results.some((r) => r.memory === NO_MATCH)).toBe(false);
  });

  it("ranks the memory containing every term above the partial match", () => {
    const res = run({ q: "quantum sledding" });

    const both = find(res.results, memoryStartingWith("Quantum sledding").id)!;
    const one = find(res.results, memoryStartingWith("Aurora beacon").id)!;
    expect(both.similarity).toBeGreaterThan(one.similarity);
  });

  it("returns results sorted by descending similarity", () => {
    const res = run({ q: "aurora beacon meridian", limit: 50 });
    const scores = res.results.map((r) => r.similarity);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("ignores terms of three characters or fewer", () => {
    // Every token is too short to be indexed, so nothing can score.
    expect(run({ q: "an of it" }).total).toBe(0);
  });

  it("finds nothing for a query with no shared vocabulary", () => {
    const res = run({ q: "helicopter parenting curriculum" });
    expect(res).toMatchObject({ total: 0, results: [] });
  });

  it("keeps every similarity inside the cosine-like band", () => {
    const res = run({ q: "aurora beacon meridian telemetry", limit: 50 });
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.similarity).toBeGreaterThanOrEqual(0.3);
      expect(r.similarity).toBeLessThanOrEqual(0.98);
    }
  });

  it("scores deterministically across identical requests", () => {
    const a = run({ q: "aurora beacon", limit: 50 });
    const b = run({ q: "aurora beacon", limit: 50 });
    expect(b.results).toEqual(a.results);
  });

  it("reports a non-zero timing", () => {
    expect(run({ q: "aurora beacon" }).timing).toBeGreaterThanOrEqual(9);
  });
});

describe("threshold, limit and total", () => {
  it("drops everything below an unreachable threshold", () => {
    expect(run({ q: "quantum sledding", threshold: 0.99 }).total).toBe(0);
  });

  it("admits weak matches when the threshold is lowered", () => {
    const strict = run({ q: "quantum gardening", threshold: 0.9, limit: 50 }).total;
    const loose = run({ q: "quantum gardening", threshold: 0, limit: 50 }).total;
    expect(loose).toBeGreaterThan(strict);
  });

  it("reports the pre-truncation total alongside a truncated page", () => {
    for (let i = 0; i < 5; i++) {
      createMemory({
        memory: `Extra quantum sledding note number ${i} about the aurora beacon.`,
        containerTag: SPACE,
      });
    }

    const all = run({ q: "quantum sledding", limit: 50 });
    expect(all.total).toBe(7);

    const page = run({ q: "quantum sledding", limit: 2 });
    expect(page.results).toHaveLength(2);
    expect(page.total).toBe(7);
  });

  it("defaults to ten results per page", () => {
    for (let i = 0; i < 15; i++) {
      createMemory({
        memory: `Extra quantum sledding note number ${i} about the aurora beacon.`,
        containerTag: SPACE,
      });
    }
    expect(run({ q: "quantum sledding" }).results).toHaveLength(10);
  });
});

describe("space scoping", () => {
  it("only searches the requested spaces", () => {
    createMemory({ memory: MATCH_BOTH, containerTag: "sm_elsewhere" });

    expect(run({ q: "quantum sledding" }).total).toBe(2);
    expect(
      search({ q: "quantum sledding", containerTags: ["sm_elsewhere"] }).total,
    ).toBe(1);
  });

  it("searches every space when no container tag is given", () => {
    const elsewhere = createMemory({
      memory: MATCH_BOTH,
      containerTag: "sm_elsewhere",
    });

    const scoped = run({ q: "quantum sledding", limit: 50 });
    const everywhere = search({ q: "quantum sledding", limit: 50 });

    expect(everywhere.total).toBeGreaterThan(scoped.total);
    expect(find(everywhere.results, elsewhere.id)).toBeDefined();
  });

  it("treats an empty container tag list as every space", () => {
    createMemory({ memory: MATCH_BOTH, containerTag: "sm_elsewhere" });

    expect(search({ q: "quantum sledding", containerTags: [], limit: 50 }).total).toBe(
      search({ q: "quantum sledding", limit: 50 }).total,
    );
  });
});

describe("forgotten memories", () => {
  it("leaves the active result set once forgotten", () => {
    const target = memoryStartingWith("Quantum sledding");
    forgetMemory(target.id);

    const res = run({ q: "quantum sledding" });
    expect(find(res.results, target.id)).toBeUndefined();
    expect(res.total).toBe(1);
  });

  it("comes back when the caller asks to include them", () => {
    const target = memoryStartingWith("Quantum sledding");
    forgetMemory(target.id);

    const res = run({
      q: "quantum sledding",
      include: { forgottenMemories: true },
    });
    expect(find(res.results, target.id)).toBeDefined();
    expect(res.total).toBe(2);
  });
});

describe("include blocks", () => {
  it("attaches related memories by default and drops them on request", () => {
    const withContext = run({ q: "quantum sledding" });
    const target = find(withContext.results, memoryStartingWith("Quantum sledding").id)!;
    // Both fixture memories were extracted from the same document.
    expect(target.context?.related?.length).toBeGreaterThan(0);
    expect(target.context?.related?.[0]).toMatchObject({ relation: "shares-source" });

    const without = run({
      q: "quantum sledding",
      include: { relatedMemories: false },
    });
    expect(find(without.results, target.id)!.context).toBeUndefined();
  });

  it("attaches source documents only when asked", () => {
    const plain = run({ q: "quantum sledding" });
    expect(plain.results[0]!.documents).toBeUndefined();

    const withDocs = run({ q: "quantum sledding", include: { documents: true } });
    expect(withDocs.results[0]!.documents?.[0]).toMatchObject({
      id: documentId,
      title: "Aurora beacon notes",
    });
  });

  it("omits document summaries unless summaries are requested too", () => {
    const bare = run({ q: "quantum sledding", include: { documents: true } });
    expect(bare.results[0]!.documents![0]!.summary).toBeNull();

    const full = run({
      q: "quantum sledding",
      include: { documents: true, summaries: true },
    });
    expect(full.results[0]!.documents![0]!.summary).toBeTruthy();
  });

  it("attaches scored chunks only when asked", () => {
    const plain = run({ q: "quantum sledding" });
    expect(plain.results[0]!.chunks).toBeUndefined();

    const withChunks = run({ q: "quantum sledding", include: { chunks: true } });
    const chunks = withChunks.results[0]!.chunks!;
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.documentId).toBe(documentId);
      expect(chunk.score).toBeGreaterThan(0.5);
    }
  });
});

describe("search modes", () => {
  it("returns document chunk hits in documents mode", () => {
    const res = run({ q: "quantum sledding", searchMode: "documents" });

    expect(res.total).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.version).toBeNull();
      expect(r.chunk).toBeTruthy();
      expect(r.memory).toBe("Aurora beacon notes");
      expect(r.documents?.[0]!.id).toBe(documentId);
    }
  });

  it("skips documents that have not finished ingesting", () => {
    resetDb();
    addDocument({ content: MATCH_BOTH, containerTags: [SPACE] });

    expect(run({ q: "quantum sledding", searchMode: "documents" }).total).toBe(0);
  });

  it("merges memory and document hits in hybrid mode", () => {
    const memories = run({ q: "quantum sledding", searchMode: "memories" }).total;
    const documents = run({ q: "quantum sledding", searchMode: "documents" }).total;
    const hybrid = run({ q: "quantum sledding", searchMode: "hybrid", limit: 50 });

    expect(hybrid.total).toBeGreaterThan(memories);
    expect(hybrid.total).toBeGreaterThan(0);
    expect(documents).toBeGreaterThan(0);
    expect(hybrid.results.some((r) => r.version === null)).toBe(true);
    expect(hybrid.results.some((r) => r.version !== null)).toBe(true);
  });
});

describe("rerank", () => {
  it("lifts a result whose text contains the query phrase verbatim", () => {
    const target = memoryStartingWith("Aurora beacon");

    const plain = run({ q: "aurora beacon", limit: 50 });
    const reranked = run({ q: "aurora beacon", limit: 50, rerank: true });

    expect(find(reranked.results, target.id)!.similarity).toBeGreaterThan(
      find(plain.results, target.id)!.similarity,
    );
  });

  it("never pushes a similarity past 0.99 and keeps the result set intact", () => {
    const plain = run({ q: "aurora beacon meridian", limit: 50 });
    const reranked = run({ q: "aurora beacon meridian", limit: 50, rerank: true });

    expect(reranked.results.map((r) => r.id).sort()).toEqual(
      plain.results.map((r) => r.id).sort(),
    );
    for (const r of reranked.results) {
      expect(r.similarity).toBeLessThanOrEqual(0.99);
    }
  });
});

describe("aggregate", () => {
  it("collapses results that share an opening and flags the rest", () => {
    const shared = "Quantum sledding telemetry across the aurora beacon fleet";
    createMemory({ memory: `${shared} in July.`, containerTag: SPACE });
    createMemory({ memory: `${shared} in August.`, containerTag: SPACE });

    const plain = run({ q: "quantum sledding", limit: 50 });
    const aggregated = run({ q: "quantum sledding", limit: 50, aggregate: true });

    expect(aggregated.total).toBe(plain.total - 1);
    expect(aggregated.results.every((r) => r.isAggregated)).toBe(true);
  });
});
