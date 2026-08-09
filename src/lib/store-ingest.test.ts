import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDocument,
  deleteDocument,
  getChunks,
  getDocument,
  listDocuments,
  listMemories,
  resetDb,
  stats,
} from "./store";
import { NOW } from "./seed";

/**
 * The pipeline derives its stage from elapsed wall-clock on every read rather
 * than from timers, so these walk the clock forward and re-read the document.
 */
const STAGE_MS = 1400;

/** Two paragraphs comfortably inside the 80–400 char extraction window. */
const CONTENT = [
  "Replay correctness depends on the membership snapshot being pinned for the whole window, otherwise a rebalance mid-replay silently drops work.",
  "The dispatcher uses highest-random-weight placement, which stays stable under partial partitions but not under a simultaneous membership change.",
].join("\n\n");

beforeEach(() => {
  resetDb();
  vi.useFakeTimers();
  // Seed timestamps are derived when the module loads. Keep writes strictly
  // newer regardless of the hour or timezone in which the suite runs.
  vi.setSystemTime(new Date(NOW + 86_400_000));
});

afterEach(() => {
  vi.useRealTimers();
  resetDb();
});

/** Advance the clock by `n` pipeline stages, then force a read (which ticks). */
function advanceStages(n: number) {
  vi.advanceTimersByTime(STAGE_MS * n);
}

describe("addDocument", () => {
  it("enters the pipeline queued, with no chunks or summary yet", () => {
    const doc = addDocument({ content: CONTENT });

    expect(doc.status).toBe("queued");
    expect(doc.chunkCount).toBe(0);
    expect(doc.summary).toBeNull();
    expect(doc.ingestStartedAt).toBe(Date.now());
  });

  it("derives a title from the content and defaults the space", () => {
    const doc = addDocument({ content: CONTENT });

    expect(doc.title).toBe(CONTENT.slice(0, 60).trim());
    expect(doc.containerTags).toEqual(["sm_personal"]);
    expect(doc.type).toBe("text");
    expect(doc.customId).toBeNull();
  });

  it("falls back to Untitled when the content cannot supply a title", () => {
    expect(addDocument({ content: "   " }).title).toBe("Untitled");
  });

  it("treats a url-sourced document as a webpage", () => {
    expect(addDocument({ content: CONTENT, url: "https://a.example" })).toMatchObject({
      type: "webpage",
      url: "https://a.example",
    });
  });

  it("honours explicit title, type, space and customId", () => {
    expect(
      addDocument({
        content: CONTENT,
        title: "RFC-014",
        type: "pdf",
        containerTags: ["sm_research"],
        customId: "rfc-014",
      }),
    ).toMatchObject({
      title: "RFC-014",
      type: "pdf",
      containerTags: ["sm_research"],
      customId: "rfc-014",
    });
  });

  it("lands at the head of the document list", () => {
    const doc = addDocument({ content: CONTENT });
    const list = listDocuments({ limit: 1 });
    expect(list.memories[0]!.id).toBe(doc.id);
  });
});

describe("ingest progresses through the pipeline on read", () => {
  it("walks extracting → chunking → embedding → indexing → done", () => {
    const { id } = addDocument({ content: CONTENT });
    const stageNow = () => getDocument(id)!.status;

    expect(stageNow()).toBe("extracting");
    advanceStages(1);
    expect(stageNow()).toBe("chunking");
    advanceStages(1);
    expect(stageNow()).toBe("embedding");
    advanceStages(1);
    expect(stageNow()).toBe("indexing");
    advanceStages(1);
    expect(stageNow()).toBe("done");
  });

  it("stays at done once the clock runs well past the last stage", () => {
    const { id } = addDocument({ content: CONTENT });
    advanceStages(50);
    expect(getDocument(id)!.status).toBe("done");
  });

  it("bumps updatedAt only when the stage actually changes", () => {
    const { id } = addDocument({ content: CONTENT });
    const afterFirstRead = getDocument(id)!.updatedAt;

    vi.advanceTimersByTime(10);
    expect(getDocument(id)!.updatedAt).toBe(afterFirstRead);

    advanceStages(1);
    expect(getDocument(id)!.updatedAt).not.toBe(afterFirstRead);
  });

  it("counts as processing until it is done", () => {
    addDocument({ content: CONTENT });
    expect(stats().processing).toBeGreaterThan(0);

    const processingMidway = stats().processing;
    advanceStages(5);
    expect(stats().processing).toBe(processingMidway - 1);
  });

  it("progresses from any read path, not just getDocument", () => {
    const { id } = addDocument({ content: CONTENT });
    advanceStages(5);

    listDocuments({ limit: 500 });
    expect(getDocument(id)!.status).toBe("done");
  });
});

describe("reaching done", () => {
  it("materialises chunks, a summary and the chunk count", () => {
    const { id } = addDocument({ content: CONTENT });
    advanceStages(5);

    const doc = getDocument(id)!;
    expect(doc.ingestStartedAt).toBeUndefined();
    expect(doc.chunkCount).toBe(Math.max(1, Math.round(CONTENT.length / 620)));
    expect(doc.summary).toBe(CONTENT.split(/\n\n+/)[0]!.slice(0, 180).trim());
    expect(getChunks(id).length).toBeGreaterThan(0);
  });

  it("exposes no chunks before the document is done", () => {
    const { id } = addDocument({ content: CONTENT });
    expect(getChunks(id)).toEqual([]);
  });

  it("extracts one memory per substantial paragraph, into the document's space", () => {
    const { id } = addDocument({
      content: CONTENT,
      containerTags: ["sm_research"],
    });
    advanceStages(5);

    const extracted = listMemories({ documentId: id, limit: 100 }).memoryEntries;
    expect(extracted).toHaveLength(2);
    for (const m of extracted) {
      expect(m.spaceId).toBe("sm_research");
      expect(m.version).toBe(1);
      expect(m.isStatic).toBe(false);
      expect(m.metadata).toEqual({ extracted: true });
      expect(m.documentIds).toEqual([id]);
      expect(m.history).toHaveLength(1);
    }
  });

  it("skips paragraphs that are too short or too long, and caps at three", () => {
    const short = "too short";
    const long = "x".repeat(500);
    const good = (n: number) =>
      `Claim number ${n} about scheduler behaviour that is comfortably longer than the eighty character floor.`;

    const { id } = addDocument({
      content: [short, good(1), long, good(2), good(3), good(4)].join("\n\n"),
    });
    advanceStages(5);

    const extracted = listMemories({ documentId: id, limit: 100 }).memoryEntries;
    expect(extracted).toHaveLength(3);
    expect(extracted.some((m) => m.memory === short)).toBe(false);
    expect(extracted.some((m) => m.memory.startsWith("xxxx"))).toBe(false);
  });

  it("strips list and heading markers from the extracted claim", () => {
    const { id } = addDocument({
      content:
        "## 1. Snapshots must be pinned for the entire replay window, or a rebalance will silently drop queued work.",
    });
    advanceStages(5);

    const [memory] = listMemories({ documentId: id, limit: 10 }).memoryEntries;
    expect(memory!.memory.startsWith("Snapshots must be pinned")).toBe(true);
  });

  it("truncates an over-long claim with an ellipsis", () => {
    const paragraph = `${"A claim that runs long. ".repeat(15)}end`;
    expect(paragraph.length).toBeGreaterThan(300);
    expect(paragraph.length).toBeLessThan(400);

    const { id } = addDocument({ content: paragraph });
    advanceStages(5);

    const [memory] = listMemories({ documentId: id, limit: 10 }).memoryEntries;
    expect(memory!.memory).toHaveLength(298);
    expect(memory!.memory.endsWith("…")).toBe(true);
  });

  it("extracts exactly once, however many times the document is read", () => {
    const { id } = addDocument({ content: CONTENT });
    advanceStages(5);

    getDocument(id);
    getDocument(id);
    listDocuments({ limit: 500 });
    stats();

    expect(listMemories({ documentId: id, limit: 100 }).memoryEntries).toHaveLength(2);
  });
});

describe("documents that never progress", () => {
  it("leaves a failed document alone", () => {
    const { id } = addDocument({ content: CONTENT });
    getDocument(id)!.status = "failed";

    advanceStages(5);
    expect(getDocument(id)!.status).toBe("failed");
    expect(listMemories({ documentId: id, limit: 10 }).memoryEntries).toEqual([]);
  });

  it("leaves seeded documents untouched — they carry no ingest clock", () => {
    const seeded = listDocuments({ limit: 500 }).memories.filter(
      (d) => d.status === "done",
    );
    const before = seeded.map((d) => d.updatedAt);

    advanceStages(20);

    const after = listDocuments({ limit: 500 })
      .memories.filter((d) => d.status === "done")
      .map((d) => d.updatedAt);
    expect(after).toEqual(expect.arrayContaining(before));
  });
});

describe("deleteDocument", () => {
  it("removes by id and by customId, and reports misses", () => {
    const byId = addDocument({ content: CONTENT });
    const byCustom = addDocument({ content: CONTENT, customId: "rfc-014" });

    expect(deleteDocument(byId.id)).toBe(true);
    expect(deleteDocument("rfc-014")).toBe(true);
    expect(deleteDocument("doc_nope")).toBe(false);

    expect(getDocument(byId.id)).toBeUndefined();
    expect(getDocument(byCustom.id)).toBeUndefined();
  });
});
