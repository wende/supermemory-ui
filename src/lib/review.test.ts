import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLICK_VELOCITY,
  REVIEW_KEY,
  SKIP_THRESHOLD,
  SWIPE_THRESHOLD,
  commitReviewLog,
  emptyLog,
  getReviewLogSnapshot,
  isReviewed,
  loadReviewLog,
  pendingReview,
  persistReviewDecision,
  pruneLog,
  recordDecision,
  resetReviewLogStore,
  sanitizeLog,
  saveReviewLog,
  subscribeReviewLog,
  swipeOutcome,
  type ReviewLog,
} from "./review";
import type { MemoryEntry } from "./types";

vi.mock("./api", () => ({
  api: {
    reviewInferred: vi.fn(async () => ({
      id: "mem_1",
      isInference: false,
      isForgotten: false,
      reviewStatus: "approved",
    })),
  },
}));

import { api } from "./api";

function entry(over: Partial<MemoryEntry> & { id: string }): MemoryEntry {
  return {
    memory: "A claim",
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    spaceId: "sm_personal",
    orgId: "org_local",
    sourceCount: 2,
    parentMemoryId: null,
    rootMemoryId: over.id,
    forgetAfter: null,
    forgetReason: null,
    metadata: null,
    memoryRelations: null,
    temporalContext: null,
    history: [],
    documentIds: [],
    ...over,
  };
}

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

describe("sanitizeLog", () => {
  it("returns an empty log for anything that is not a log", () => {
    for (const raw of [null, undefined, 42, "log", [], {}, { records: 7 }]) {
      expect(sanitizeLog(raw).records).toEqual({});
    }
  });

  it("drops records with an unknown decision or a missing version", () => {
    const log = sanitizeLog({
      records: {
        good: { decision: "kept", version: 2, at: "2026-08-01T00:00:00.000Z" },
        bogus: { decision: "approved", version: 1, at: "2026-08-01T00:00:00.000Z" },
        versionless: { decision: "discarded", at: "2026-08-01T00:00:00.000Z" },
        undated: { decision: "discarded", version: 1 },
      },
    });
    expect(Object.keys(log.records)).toEqual(["good"]);
    expect(log.records.good.version).toBe(2);
  });
});

describe("pruneLog", () => {
  it("keeps the most recent decisions and drops the oldest", () => {
    let log = emptyLog();
    for (let i = 0; i < 10; i++) {
      log = recordDecision(
        log,
        `mem_${i}`,
        "kept",
        1,
        `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      );
    }
    const pruned = pruneLog(log, 3);
    expect(Object.keys(pruned.records).sort()).toEqual(["mem_7", "mem_8", "mem_9"]);
  });

  it("leaves a log under the limit untouched", () => {
    const log = recordDecision(emptyLog(), "mem_1", "kept", 1);
    expect(pruneLog(log, 10)).toBe(log);
  });
});

describe("isReviewed / pendingReview", () => {
  it("treats a newer version of a reviewed memory as pending again", () => {
    const log = recordDecision(emptyLog(), "mem_1", "kept", 1);
    expect(isReviewed(log, entry({ id: "mem_1", version: 1 }))).toBe(true);
    expect(isReviewed(log, entry({ id: "mem_1", version: 2 }))).toBe(false);
  });

  it("queues only live, unreviewed inferences and preserves their order", () => {
    const log = recordDecision(emptyLog(), "reviewed", "discarded", 1);
    const queue = pendingReview(
      [
        entry({ id: "first" }),
        entry({ id: "reviewed" }),
        entry({ id: "asserted", isInference: false, isStatic: true }),
        entry({ id: "gone", isForgotten: true }),
        entry({ id: "second" }),
      ],
      log,
    );
    expect(queue.map((m) => m.id)).toEqual(["first", "second"]);
  });
});

describe("persistReviewDecision", () => {
  const storage = makeStorage();

  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    resetReviewLogStore(emptyLog());
    vi.mocked(api.reviewInferred).mockClear();
  });

  afterEach(() => {
    storage.removeItem(REVIEW_KEY);
    vi.unstubAllGlobals();
  });

  it("approves on the engine and mirrors the decision in the ledger", async () => {
    const m = entry({ id: "mem_1", version: 2 });
    await persistReviewDecision(m, "kept");
    expect(api.reviewInferred).toHaveBeenCalledWith(
      "sm_personal",
      "mem_1",
      "approve",
    );
    expect(getReviewLogSnapshot().records.mem_1).toMatchObject({
      decision: "kept",
      version: 2,
    });
  });

  it("declines on the engine and records the discard", async () => {
    const m = entry({ id: "mem_9", version: 1 });
    await persistReviewDecision(m, "discarded", 4);
    expect(api.reviewInferred).toHaveBeenCalledWith(
      "sm_personal",
      "mem_9",
      "decline",
    );
    expect(getReviewLogSnapshot().records.mem_9).toMatchObject({
      decision: "discarded",
      version: 4,
    });
  });
});

describe("swipeOutcome", () => {
  it("keeps on a right swipe and discards on a left swipe", () => {
    expect(swipeOutcome(SWIPE_THRESHOLD, 0, 0)).toBe("keep");
    expect(swipeOutcome(-SWIPE_THRESHOLD, 0, 0)).toBe("discard");
  });

  it("commits a short but fast flick", () => {
    expect(swipeOutcome(20, 0, FLICK_VELOCITY)).toBe("keep");
    expect(swipeOutcome(-20, 0, -FLICK_VELOCITY)).toBe("discard");
  });

  it("springs back when the drag is short and slow", () => {
    expect(swipeOutcome(SWIPE_THRESHOLD - 1, 10, 0.1)).toBeNull();
    expect(swipeOutcome(0, 0, 0)).toBeNull();
  });

  it("skips on a decisive downward drag, but not on a diagonal keep", () => {
    expect(swipeOutcome(10, SKIP_THRESHOLD + 1, 0)).toBe("skip");
    expect(swipeOutcome(200, SKIP_THRESHOLD + 1, 0)).toBe("keep");
  });
});

describe("shared review log store", () => {
  const storage = makeStorage();

  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    storage.removeItem(REVIEW_KEY);
    resetReviewLogStore(emptyLog());
  });

  afterEach(() => {
    storage.removeItem(REVIEW_KEY);
    resetReviewLogStore(emptyLog());
    vi.unstubAllGlobals();
  });

  it("notifies same-tab subscribers when a decision is committed", () => {
    const seen: number[] = [];
    const stop = subscribeReviewLog(() => seen.push(Object.keys(getReviewLogSnapshot().records).length));
    commitReviewLog(recordDecision(emptyLog(), "mem_1", "kept", 1));
    commitReviewLog(recordDecision(getReviewLogSnapshot(), "mem_2", "discarded", 1));
    stop();
    expect(seen).toEqual([1, 2]);
    expect(loadReviewLog().records.mem_2.decision).toBe("discarded");
  });
});

describe("persistence", () => {
  const storage = makeStorage();

  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    storage.removeItem(REVIEW_KEY);
    vi.unstubAllGlobals();
  });

  it("round-trips decisions through localStorage", () => {
    saveReviewLog(recordDecision(emptyLog(), "mem_1", "kept", 3));
    expect(loadReviewLog().records.mem_1).toMatchObject({
      decision: "kept",
      version: 3,
    });
  });

  it("falls back to an empty log when the stored value is corrupt", () => {
    storage.setItem(REVIEW_KEY, "{not json");
    expect(loadReviewLog().records).toEqual({});
  });

  it("survives storage that refuses to write", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: {
        ...storage,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    const log: ReviewLog = recordDecision(emptyLog(), "mem_1", "kept", 1);
    expect(() => saveReviewLog(log)).not.toThrow();
    warn.mockRestore();
  });
});
