import { afterEach, describe, expect, it } from "vitest";
import {
  createMemory,
  db,
  forgetMemory,
  getMemory,
  graph,
  listMemories,
  resetDb,
  restoreMemory,
  stats,
  updateMemory,
} from "./store";

afterEach(() => resetDb());

/** A seeded memory that already points at another memory in the graph. */
function memoryWithRelations() {
  const source = db().memories.find(
    (m) =>
      !m.isForgotten &&
      m.memoryRelations?.some((r) => db().memories.some((t) => t.id === r.targetId)),
  );
  if (!source) throw new Error("seed has no related memories");
  const targetId = source.memoryRelations!.find((r) =>
    db().memories.some((t) => t.id === r.targetId),
  )!.targetId;
  return { source, targetId };
}

describe("createMemory", () => {
  it("starts at version 1 and roots its own history", () => {
    const m = createMemory({ memory: "Ships on Thursdays." });

    expect(m.version).toBe(1);
    expect(m.isLatest).toBe(true);
    expect(m.rootMemoryId).toBe(m.id);
    expect(m.parentMemoryId).toBeNull();
    expect(m.history).toHaveLength(1);
    expect(m.history[0]).toMatchObject({
      id: m.id,
      memory: "Ships on Thursdays.",
      version: 1,
      isLatest: true,
      isForgotten: false,
    });
  });

  it("defaults to a static personal fact and honours overrides", () => {
    expect(createMemory({ memory: "a" })).toMatchObject({
      isStatic: true,
      isInference: false,
      spaceId: "sm_personal",
      sourceCount: 0,
    });
    expect(
      createMemory({ memory: "b", containerTag: "sm_research", isStatic: false }),
    ).toMatchObject({ isStatic: false, spaceId: "sm_research" });
  });

  it("is retrievable and lands at the head of the list", () => {
    const m = createMemory({ memory: "Newest claim." });
    expect(getMemory(m.id)).toBe(m);
    expect(db().memories[0]!.id).toBe(m.id);
  });
});

/**
 * "Editing a memory writes a new version; prior wording stays in history."
 * These are the product invariants, not incidental behaviour.
 */
describe("updateMemory — revision is versioned", () => {
  it("bumps the version and keeps the prior wording in history", () => {
    const created = createMemory({ memory: "Retries are capped at 3." });
    const updated = updateMemory(created.id, "Retries are capped at 5.")!;

    expect(updated.version).toBe(2);
    expect(updated.memory).toBe("Retries are capped at 5.");
    expect(updated.history).toHaveLength(2);

    const prior = updated.history.find((h) => h.version === 1)!;
    expect(prior.memory).toBe("Retries are capped at 3.");
    expect(prior.isLatest).toBe(false);
    expect(prior.id).toBe(`${created.id}_v1`);
  });

  it("does not overwrite in place — the id keeps pointing at the latest row", () => {
    const created = createMemory({ memory: "v1" });
    updateMemory(created.id, "v2");

    const latest = updated(created.id);
    expect(latest.id).toBe(created.id);
    expect(latest.parentMemoryId).toBe(`${created.id}_v1`);
    expect(latest.history.filter((h) => h.isLatest)).toHaveLength(1);
    expect(latest.history.find((h) => h.isLatest)!.memory).toBe("v2");
  });

  it("chains parents across repeated edits", () => {
    const created = createMemory({ memory: "v1" });
    updateMemory(created.id, "v2");
    updateMemory(created.id, "v3");

    const m = updated(created.id);
    expect(m.version).toBe(3);
    expect(m.parentMemoryId).toBe(`${created.id}_v2`);
    expect(m.history.map((h) => h.memory)).toEqual(["v1", "v2", "v3"]);
    expect(m.history.map((h) => h.version)).toEqual([1, 2, 3]);
    expect(m.history.map((h) => h.id)).toEqual([
      `${created.id}_v1`,
      `${created.id}_v2`,
      created.id,
    ]);
  });

  it("keeps a forgotten memory forgotten across an edit", () => {
    const created = createMemory({ memory: "v1" });
    forgetMemory(created.id);
    updateMemory(created.id, "v2");

    const m = updated(created.id);
    expect(m.isForgotten).toBe(true);
    expect(m.history.find((h) => h.isLatest)!.isForgotten).toBe(true);
  });

  it("returns undefined for an unknown id", () => {
    expect(updateMemory("mem_nope", "text")).toBeUndefined();
  });
});

describe("forgetMemory — forget is soft", () => {
  it("flags the memory without deleting it or bumping the version", () => {
    const created = createMemory({ memory: "Deploys are frozen in December." });
    const forgotten = forgetMemory(created.id)!;

    expect(forgotten.isForgotten).toBe(true);
    expect(forgotten.version).toBe(1);
    expect(forgotten.history).toHaveLength(1);
    expect(getMemory(created.id)).toBeDefined();
  });

  it("stamps the forget onto the latest history row in place", () => {
    const created = createMemory({ memory: "A claim." });
    forgetMemory(created.id);

    const latest = updated(created.id).history.find((h) => h.isLatest)!;
    expect(latest.isForgotten).toBe(true);
    expect(latest.version).toBe(1);
  });

  it("stores a default reason and treats a blank reason as unset", () => {
    const a = createMemory({ memory: "a" });
    const b = createMemory({ memory: "b" });
    const c = createMemory({ memory: "c" });

    expect(forgetMemory(a.id)!.forgetReason).toBe("Forgotten via the dashboard.");
    expect(forgetMemory(b.id, "   ")!.forgetReason).toBe(
      "Forgotten via the dashboard.",
    );
    expect(forgetMemory(c.id, "  superseded by RFC-014  ")!.forgetReason).toBe(
      "superseded by RFC-014",
    );
  });

  it("retains relations so the graph can still explain the change", () => {
    const { source, targetId } = memoryWithRelations();
    const before = source.memoryRelations!.length;

    const forgotten = forgetMemory(source.id)!;

    expect(forgotten.memoryRelations).toHaveLength(before);
    expect(forgotten.memoryRelations!.some((r) => r.targetId === targetId)).toBe(
      true,
    );
  });

  it("returns undefined for an unknown id", () => {
    expect(forgetMemory("mem_nope")).toBeUndefined();
  });
});

describe("restoreMemory", () => {
  it("appends a live version on top of the forgotten one", () => {
    const created = createMemory({ memory: "Still true." });
    forgetMemory(created.id, "mistake");
    const restored = restoreMemory(created.id)!;

    expect(restored.isForgotten).toBe(false);
    expect(restored.forgetReason).toBeNull();
    expect(restored.version).toBe(2);
    expect(restored.memory).toBe("Still true.");
  });

  it("keeps the forgotten row in history rather than rewriting it", () => {
    const created = createMemory({ memory: "Still true." });
    forgetMemory(created.id);
    restoreMemory(created.id);

    const history = updated(created.id).history;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ version: 1, isForgotten: true, isLatest: false });
    expect(history[1]).toMatchObject({ version: 2, isForgotten: false, isLatest: true });
  });

  it("returns undefined for an unknown id", () => {
    expect(restoreMemory("mem_nope")).toBeUndefined();
  });
});

describe("forgotten memories leave the active set", () => {
  it("drops out of listMemories unless explicitly included", () => {
    const created = createMemory({ memory: "Temporary.", containerTag: "sm_research" });
    forgetMemory(created.id);

    const active = listMemories({ containerTags: ["sm_research"], limit: 500 });
    expect(active.memoryEntries.some((m) => m.id === created.id)).toBe(false);

    const all = listMemories({
      containerTags: ["sm_research"],
      includeForgotten: true,
      limit: 500,
    });
    expect(all.memoryEntries.some((m) => m.id === created.id)).toBe(true);
  });

  it("moves the memory from the live count to the forgotten count", () => {
    const before = stats();
    const created = createMemory({ memory: "Counted once." });
    forgetMemory(created.id);
    const after = stats();

    expect(after.memories).toBe(before.memories);
    expect(after.forgotten).toBe(before.forgotten + 1);
  });
});

describe("graph — soft forget keeps the edges", () => {
  it("hides a forgotten memory and its edges by default", () => {
    const { source, targetId } = memoryWithRelations();
    forgetMemory(source.id);

    const g = graph({});
    expect(g.nodes.some((n) => n.id === source.id)).toBe(false);
    expect(
      g.edges.some((e) => e.source === source.id && e.target === targetId),
    ).toBe(false);
  });

  it("still returns the edge when forgotten memories are included", () => {
    const { source, targetId } = memoryWithRelations();
    forgetMemory(source.id);

    const g = graph({ includeForgotten: true });
    const node = g.nodes.find((n) => n.id === source.id);
    expect(node).toBeDefined();
    expect(node!.forgotten).toBe(true);
    expect(
      g.edges.some((e) => e.source === source.id && e.target === targetId),
    ).toBe(true);
  });

  it("never emits an edge whose endpoint was filtered out", () => {
    const g = graph({ containerTags: ["sm_research"] });
    const ids = new Set(g.nodes.map((n) => n.id));

    expect(g.edges.length).toBeGreaterThanOrEqual(0);
    for (const edge of g.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("adds document nodes and `sources` edges only when asked", () => {
    const without = graph({});
    expect(without.nodes.some((n) => n.kind === "document")).toBe(false);

    const withDocs = graph({ includeDocuments: true });
    expect(withDocs.nodes.some((n) => n.kind === "document")).toBe(true);
    expect(withDocs.edges.some((e) => e.relation === "sources")).toBe(true);
  });
});

function updated(id: string) {
  const m = getMemory(id);
  if (!m) throw new Error(`memory ${id} disappeared`);
  return m;
}
