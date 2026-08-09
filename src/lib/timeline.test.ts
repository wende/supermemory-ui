import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  countByKind,
  dayLabel,
  groupByDay,
  initials,
  spaceName,
} from "./timeline";
import type { Document, MemoryEntry, MemoryHistoryEntry } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-08-08T12:00:00.000Z");

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function doc(overrides: Partial<Document> & { id: string }): Document {
  return {
    customId: null,
    title: "A document",
    summary: null,
    content: "",
    type: "text",
    status: "done",
    containerTags: ["sm_research"],
    metadata: null,
    url: null,
    filepath: null,
    connectionId: null,
    createdAt: iso(10 * DAY),
    updatedAt: iso(10 * DAY),
    ...overrides,
  };
}

function version(
  id: string,
  v: number,
  memory: string,
  createdAt: string,
): MemoryHistoryEntry {
  return {
    id: `${id}_v${v}`,
    memory,
    version: v,
    createdAt,
    updatedAt: createdAt,
    parentMemoryId: null,
    rootMemoryId: `${id}_v1`,
    isLatest: false,
    isForgotten: false,
  };
}

function mem(overrides: Partial<MemoryEntry> & { id: string }): MemoryEntry {
  const createdAt = overrides.createdAt ?? iso(5 * DAY);
  return {
    memory: "A claim",
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: false,
    createdAt,
    updatedAt: createdAt,
    spaceId: "sm_research",
    orgId: "org",
    sourceCount: 0,
    parentMemoryId: null,
    rootMemoryId: overrides.id,
    forgetAfter: null,
    forgetReason: null,
    metadata: null,
    memoryRelations: null,
    temporalContext: null,
    history: [version(overrides.id, 1, overrides.memory ?? "A claim", createdAt)],
    documentIds: [],
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("posts an ingest event per document", () => {
    const events = buildTimeline({
      memories: [],
      documents: [doc({ id: "d1", title: "Paper" })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "ingested:d1",
      kind: "ingested",
      spaceId: "sm_research",
    });
    expect(events[0].document?.title).toBe("Paper");
  });

  it("orders the feed newest first", () => {
    const events = buildTimeline({
      memories: [mem({ id: "m_old", createdAt: iso(40 * DAY) })],
      documents: [
        doc({ id: "d_mid", createdAt: iso(20 * DAY) }),
        doc({ id: "d_new", createdAt: iso(1 * DAY) }),
      ],
    });
    expect(events.map((e) => e.id)).toEqual([
      "ingested:d_new",
      "ingested:d_mid",
      "born:m_old",
    ]);
  });

  it("labels a birth by how the claim came to exist", () => {
    const events = buildTimeline({
      memories: [
        mem({ id: "m1" }),
        mem({ id: "m2", isStatic: true }),
        mem({ id: "m3", isInference: true }),
      ],
      documents: [],
    });
    const byId = new Map(events.map((e) => [e.id, e.kind]));
    expect(byId.get("born:m1")).toBe("learned");
    expect(byId.get("born:m2")).toBe("asserted");
    expect(byId.get("born:m3")).toBe("inferred");
  });

  it("folds a birth into its source's ingest post when they are the same news", () => {
    const source = doc({ id: "d1", createdAt: iso(10 * DAY) });
    const events = buildTimeline({
      memories: [
        mem({ id: "m1", createdAt: iso(10 * DAY - 2 * HOUR), documentIds: ["d1"] }),
      ],
      documents: [source],
    });
    expect(events.map((e) => e.id)).toEqual(["ingested:d1"]);
    expect(events[0].extracted.map((m) => m.id)).toEqual(["m1"]);
  });

  it("threads a document's memories oldest first", () => {
    const events = buildTimeline({
      memories: [
        mem({ id: "m_late", createdAt: iso(9 * DAY), documentIds: ["d1"] }),
        mem({ id: "m_early", createdAt: iso(11 * DAY), documentIds: ["d1"] }),
      ],
      documents: [doc({ id: "d1", createdAt: iso(10 * DAY) })],
    });
    const ingest = events.find((e) => e.id === "ingested:d1")!;
    expect(ingest.extracted.map((m) => m.id)).toEqual(["m_early", "m_late"]);
  });

  it("keeps a standalone post for a claim extracted long after its source landed", () => {
    const source = doc({ id: "d1", createdAt: iso(90 * DAY) });
    const events = buildTimeline({
      memories: [mem({ id: "m1", createdAt: iso(2 * DAY), documentIds: ["d1"] })],
      documents: [source],
    });
    expect(events.map((e) => e.id)).toEqual(["born:m1", "ingested:d1"]);
    // Outside the fold window — omit from the ingest thread so the claim is
    // not restated under the document and again as its own post.
    expect(events[1].extracted.map((m) => m.id)).toEqual([]);
    expect(events[0].sources.map((d) => d.id)).toEqual(["d1"]);
  });

  it("always posts asserted and inferred births, even inside the ingest window", () => {
    const source = doc({ id: "d1", createdAt: iso(10 * DAY) });
    const events = buildTimeline({
      memories: [
        mem({
          id: "m_static",
          isStatic: true,
          createdAt: iso(10 * DAY - HOUR),
          documentIds: ["d1"],
        }),
        mem({
          id: "m_inf",
          isInference: true,
          createdAt: iso(10 * DAY - HOUR),
          documentIds: ["d1"],
        }),
      ],
      documents: [source],
    });
    expect(events.map((e) => e.id).sort()).toEqual([
      "born:m_inf",
      "born:m_static",
      "ingested:d1",
    ].sort());
    expect(events.find((e) => e.id === "ingested:d1")!.extracted).toEqual([]);
  });

  it("posts a restore when a previously forgotten memory is live again", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: iso(1 * DAY),
          isForgotten: false,
          forgetReason: null,
          version: 2,
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isForgotten: true,
              updatedAt: iso(5 * DAY),
            },
            {
              ...version("m1", 2, "A claim", iso(1 * DAY)),
              isLatest: true,
              isForgotten: false,
              updatedAt: iso(1 * DAY),
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.map((e) => e.id)).toEqual(["restored:m1", "born:m1"]);
  });

  it("dates a forgetting from a forgotten history stamp when present", () => {
    const forgottenStamp = iso(5 * DAY);
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: iso(1 * DAY),
          isForgotten: true,
          forgetReason: "stale",
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isLatest: true,
              isForgotten: true,
              updatedAt: forgottenStamp,
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.find((e) => e.id === "forgotten:m1")?.at).toBe(forgottenStamp);
  });

  it("dates a restore from the live history row after a forget, not a later edit", () => {
    const forgottenStamp = iso(20 * DAY);
    const restoredStamp = iso(10 * DAY);
    const editedStamp = iso(1 * DAY);
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: editedStamp,
          isForgotten: false,
          forgetReason: "No longer true",
          version: 3,
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isForgotten: true,
              updatedAt: forgottenStamp,
            },
            {
              ...version("m1", 2, "A claim", restoredStamp),
              isForgotten: false,
              updatedAt: restoredStamp,
            },
            {
              ...version("m1", 3, "A claim, edited", editedStamp),
              isLatest: true,
              isForgotten: false,
              updatedAt: editedStamp,
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.find((e) => e.id === "restored:m1")?.at).toBe(restoredStamp);
  });

  it("dates a second restore cycle at the latest restore, not the first", () => {
    // forget → restore → edit → forget → restore leaves the first restore
    // row live in history (only the latest is re-forgotten), so an early
    // return would pin the event to the first cycle.
    const firstRestore = iso(15 * DAY);
    const secondRestore = iso(3 * DAY);
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: secondRestore,
          isForgotten: false,
          forgetReason: null,
          version: 4,
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isForgotten: true,
              updatedAt: iso(20 * DAY),
            },
            {
              ...version("m1", 2, "A claim", firstRestore),
              isForgotten: false,
              updatedAt: firstRestore,
            },
            {
              ...version("m1", 3, "A claim, edited", iso(8 * DAY)),
              isForgotten: true,
              updatedAt: iso(5 * DAY),
            },
            {
              ...version("m1", 4, "A claim, edited", secondRestore),
              isLatest: true,
              isForgotten: false,
              updatedAt: secondRestore,
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.find((e) => e.id === "restored:m1")?.at).toBe(secondRestore);
  });

  it("falls back to updatedAt when a forgotten streak has no following live row", () => {
    const updated = iso(2 * DAY);
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: updated,
          isForgotten: false,
          version: 1,
          // Detection sees a forgotten row; restoredAt finds no live row after
          // the streak and falls back to the entry's updatedAt.
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isLatest: true,
              isForgotten: true,
              updatedAt: iso(10 * DAY),
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.find((e) => e.id === "restored:m1")?.at).toBe(updated);
  });

  it("dates a restore after consecutive forgotten history rows", () => {
    const restoredStamp = iso(4 * DAY);
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: restoredStamp,
          isForgotten: false,
          version: 3,
          history: [
            {
              ...version("m1", 1, "A claim", iso(30 * DAY)),
              isForgotten: true,
              updatedAt: iso(20 * DAY),
            },
            {
              ...version("m1", 2, "A claim", iso(10 * DAY)),
              isForgotten: true,
              updatedAt: iso(8 * DAY),
            },
            {
              ...version("m1", 3, "A claim", restoredStamp),
              isLatest: true,
              isForgotten: false,
              updatedAt: restoredStamp,
            },
          ],
        }),
      ],
      documents: [],
    });
    expect(events.find((e) => e.id === "restored:m1")?.at).toBe(restoredStamp);
  });

  it("orders a document thread by bornAt, not the latest version stamp", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m_revised",
          createdAt: iso(1 * DAY),
          documentIds: ["d1"],
          history: [
            version("m_revised", 1, "first", iso(11 * DAY)),
            version("m_revised", 2, "second", iso(1 * DAY)),
          ],
        }),
        mem({ id: "m_early", createdAt: iso(10 * DAY - HOUR), documentIds: ["d1"] }),
      ],
      documents: [doc({ id: "d1", createdAt: iso(10 * DAY) })],
    });
    const ingest = events.find((e) => e.id === "ingested:d1")!;
    // m_revised was born at 11d ago (older than m_early at ~10d), so it leads.
    expect(ingest.extracted.map((m) => m.id)).toEqual(["m_revised", "m_early"]);
  });

  it("posts one revision per extra version, carrying the wording it replaced", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          memory: "third",
          version: 3,
          createdAt: iso(30 * DAY),
          history: [
            version("m1", 1, "first", iso(30 * DAY)),
            version("m1", 2, "second", iso(20 * DAY)),
            version("m1", 3, "third", iso(4 * DAY)),
          ],
        }),
      ],
      documents: [],
    });

    expect(events.map((e) => e.id)).toEqual([
      "revised:m1:v3",
      "revised:m1:v2",
      "born:m1",
    ]);
    expect(events[0].revision).toEqual({ from: "second", to: "third", version: 3 });
    expect(events[1].revision).toEqual({ from: "first", to: "second", version: 2 });
  });

  it("dates the birth from the oldest version, not the current one", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(2 * DAY),
          history: [
            version("m1", 1, "first", iso(60 * DAY)),
            version("m1", 2, "second", iso(2 * DAY)),
          ],
        }),
      ],
      documents: [],
    });
    const born = events.find((e) => e.id === "born:m1");
    expect(born?.at).toBe(iso(60 * DAY));
  });

  it("posts a forgetting as its own event", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          createdAt: iso(30 * DAY),
          updatedAt: iso(1 * DAY),
          isForgotten: true,
          forgetReason: "No longer true",
        }),
      ],
      documents: [],
    });
    expect(events.map((e) => e.id)).toEqual(["forgotten:m1", "born:m1"]);
    expect(events[0].memory?.forgetReason).toBe("No longer true");
  });

  it("resolves relations, leaving unknown targets addressable", () => {
    const events = buildTimeline({
      memories: [
        mem({
          id: "m1",
          memoryRelations: [
            { targetId: "m2", relation: "extends" },
            { targetId: "gone", relation: "derives" },
          ],
        }),
        mem({ id: "m2", memory: "the parent" }),
      ],
      documents: [],
    });
    const related = events.find((e) => e.id === "born:m1")!.related;
    expect(related).toHaveLength(2);
    expect(related[0].entry?.memory).toBe("the parent");
    expect(related[1].entry).toBeNull();
    expect(related[1].targetId).toBe("gone");
  });

  it("ignores document ids that are not in the page it was given", () => {
    const events = buildTimeline({
      memories: [mem({ id: "m1", documentIds: ["missing"] })],
      documents: [],
    });
    expect(events[0].sources).toEqual([]);
  });
});

describe("groupByDay", () => {
  it("runs consecutive events of the same day together", () => {
    const events = buildTimeline({
      memories: [],
      documents: [
        doc({ id: "d1", createdAt: iso(1 * HOUR) }),
        doc({ id: "d2", createdAt: iso(3 * HOUR) }),
        doc({ id: "d3", createdAt: iso(30 * DAY) }),
      ],
    });
    const days = groupByDay(events, NOW);
    expect(days).toHaveLength(2);
    expect(days[0].events.map((e) => e.id)).toEqual(["ingested:d1", "ingested:d2"]);
    expect(days[1].events.map((e) => e.id)).toEqual(["ingested:d3"]);
  });

  it("splits events that straddle local midnight into two day runs", () => {
    const localMidnight = new Date(NOW);
    localMidnight.setHours(0, 0, 0, 0);
    const justAfter = new Date(localMidnight.getTime() + 30 * 60_000).toISOString();
    const justBefore = new Date(localMidnight.getTime() - 30 * 60_000).toISOString();
    const events = buildTimeline({
      memories: [],
      documents: [
        doc({ id: "d_after", createdAt: justAfter }),
        doc({ id: "d_before", createdAt: justBefore }),
      ],
    });
    const days = groupByDay(events, localMidnight.getTime() + 12 * HOUR);
    expect(days).toHaveLength(2);
    expect(days[0].events.map((e) => e.id)).toEqual(["ingested:d_after"]);
    expect(days[1].events.map((e) => e.id)).toEqual(["ingested:d_before"]);
  });
});

describe("dayLabel", () => {
  it("names the recent past in words", () => {
    // Build "now" and fixtures from local calendar parts so the suite is
    // timezone-stable (UTC midnights fail east of ~UTC+11).
    const localNow = new Date(2026, 7, 8, 12, 0, 0, 0).getTime();
    const localIso = (msAgo: number) => new Date(localNow - msAgo).toISOString();
    expect(dayLabel(localIso(1 * HOUR), localNow)).toBe("Today");
    expect(dayLabel(localIso(1 * DAY), localNow)).toBe("Yesterday");
    expect(dayLabel(localIso(3 * DAY), localNow)).toBe("3 days ago");
    expect(dayLabel(localIso(30 * DAY), localNow)).toMatch(/\w{3},/);
  });
});

describe("countByKind", () => {
  it("counts every kind, including the ones with no events", () => {
    const counts = countByKind(
      buildTimeline({
        memories: [mem({ id: "m1", isStatic: true })],
        documents: [doc({ id: "d1" })],
      }),
    );
    expect(counts.asserted).toBe(1);
    expect(counts.ingested).toBe(1);
    expect(counts.forgotten).toBe(0);
    expect(counts.restored).toBe(0);
  });
});

describe("labels", () => {
  it("resolves a space name and trims the redundant prefix", () => {
    const spaces = [{ containerTag: "sm_research", name: "Space Research" }];
    expect(spaceName(spaces as never, "sm_research")).toBe("Research");
    expect(spaceName([], "sm_unknown")).toBe("sm_unknown");
    expect(spaceName([], "")).toBe("Unfiled");
  });

  it("builds an author monogram", () => {
    expect(initials("Research")).toBe("RE");
    expect(initials("Orbital Edge")).toBe("OE");
    expect(initials("")).toBe("·");
  });
});
