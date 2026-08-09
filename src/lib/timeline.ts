/**
 * The timeline model.
 *
 * The memory bank is a table and the graph is a diagram; neither shows the one
 * thing a person already knows how to read — a feed. This module turns the
 * corpus into one: a reverse-chronological list of *things that happened to the
 * memory*, so scrolling down is scrolling backwards through what the engine
 * learned, revised, inferred and forgot.
 *
 * The social-media grammar is a mapping onto real records, not decoration:
 *
 *   | Feed idea      | Timeline meaning                    | Backed by            |
 *   |----------------|-------------------------------------|----------------------|
 *   | author         | the space the item belongs to       | `spaceId`            |
 *   | post           | one event in a memory's life        | history + documents  |
 *   | link preview   | the document a claim cites          | `documentIds`        |
 *   | comment thread | the memories a document produced    | reverse of the above |
 *   | quote post     | the memories an inference came from | `memoryRelations`    |
 *   | "edited"       | the wording a version replaced      | `history[]`          |
 *
 * Everything here is pure so the feed can be unit-tested without a DOM: the
 * route only renders what `buildTimeline` returns.
 */

import type { ContainerTag, Document, MemoryEntry, MemoryRelation } from "./types";

export const TIMELINE_KINDS = [
  "ingested",
  "learned",
  "asserted",
  "inferred",
  "revised",
  "forgotten",
  "restored",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/**
 * How each event kind presents. Accents are series colours (`--s1`…`--s5`),
 * which are CVD-validated as a set; `forgotten` / `restored` deliberately drop
 * out of the series into muted ink rather than borrowing a status colour.
 * Colour is never the only channel — every post also carries `label` as an
 * uppercase chip. `asserted` uses `--s3` to match the memory bank badge.
 */
export const KIND_META: Record<
  TimelineKind,
  { label: string; verb: string; accent: string }
> = {
  ingested: {
    label: "Ingested",
    verb: "took in a document",
    accent: "var(--color-s1)",
  },
  learned: {
    label: "Learned",
    verb: "learned something",
    // Not s4 — under TE Orange that token is fader grey and collapses into
    // forgotten. Share the document/steel family with ingest volume instead;
    // chips + verbs keep the kinds distinct.
    accent: "var(--color-s1)",
  },
  asserted: {
    label: "Asserted",
    verb: "was told a fact",
    accent: "var(--color-s3)",
  },
  inferred: {
    label: "Inferred",
    verb: "connected the dots",
    accent: "var(--color-s2)",
  },
  revised: {
    label: "Revised",
    verb: "changed its mind",
    accent: "var(--color-s5)",
  },
  forgotten: {
    label: "Forgotten",
    verb: "retired a memory",
    accent: "color-mix(in oklab, var(--brand-black) 40%, transparent)",
  },
  restored: {
    label: "Restored",
    verb: "brought a memory back",
    accent: "color-mix(in oklab, var(--brand-black) 55%, transparent)",
  },
};

export interface RelatedMemory {
  targetId: string;
  relation: MemoryRelation;
  /** Resolved when the target is in the same page of memories, else null. */
  entry: MemoryEntry | null;
}

export interface TimelineEvent {
  /** Stable across refetches — `kind:subject[:version]`. */
  id: string;
  kind: TimelineKind;
  /** When it happened. The feed is ordered by this, newest first. */
  at: string;
  spaceId: string;
  /** The memory the event is about — null only for `ingested`. */
  memory: MemoryEntry | null;
  /** The document the event is about — set only for `ingested`. */
  document: Document | null;
  /**
   * `ingested`: the memories this document produced, oldest first — a thread
   * under a post reads in the order it was written, not in reverse.
   */
  extracted: MemoryEntry[];
  /** Memory events: the documents the claim cites. */
  sources: Document[];
  /** Memory events: outgoing relations, resolved where possible. */
  related: RelatedMemory[];
  /** `revised`: the wording this version replaced. */
  revision: { from: string; to: string; version: number } | null;
}

/**
 * A *learned* memory extracted from a document within this window of the
 * document arriving is the *same* news as the ingest, so it is shown inside
 * that post's thread instead of being posted again on its own. Asserted and
 * inferred claims always keep their own posts (they are a different kind of
 * news). A learned claim that shows up months after its source did is
 * genuinely new, and keeps its own post — and is omitted from the ingest
 * thread so the feed does not restate it.
 */
export const GROUP_WINDOW_MS = 36 * 3_600_000;

function time(iso: string): number {
  return new Date(iso).getTime();
}

/** Newest first, with id as a tiebreak so the order is stable across renders. */
function newestFirst(a: { at: string; id: string }, b: { at: string; id: string }): number {
  const d = time(b.at) - time(a.at);
  return d !== 0 ? d : a.id.localeCompare(b.id);
}

function birthKind(m: MemoryEntry): TimelineKind {
  if (m.isInference) return "inferred";
  if (m.isStatic) return "asserted";
  return "learned";
}

/** When the claim first appeared — the oldest version, not the current one. */
function bornAt(m: MemoryEntry): string {
  const history = m.history ?? [];
  let oldest = m.createdAt;
  for (const h of history) {
    if (time(h.createdAt) < time(oldest)) oldest = h.createdAt;
  }
  return oldest;
}

/**
 * Best available "when forgotten" stamp. There is no dedicated `forgottenAt`
 * on MemoryEntry — prefer a history row marked forgotten, else `updatedAt`
 * (which any later write can bump).
 */
function forgottenAt(m: MemoryEntry): string {
  let best: string | null = null;
  for (const h of m.history ?? []) {
    if (!h.isForgotten) continue;
    if (!best || time(h.updatedAt) > time(best)) best = h.updatedAt;
  }
  return best ?? m.updatedAt;
}

/**
 * Best available "when restored" stamp. After each forgotten streak, the
 * first live history row is the restore; later live rows are edits and must
 * not move the event. Across multiple forget→restore cycles, the latest
 * cycle wins. Without a forgotten trail, fall back to `updatedAt`.
 */
function restoredAt(m: MemoryEntry): string {
  const history = (m.history ?? [])
    .slice()
    .sort((a, b) => a.version - b.version);
  let best: string | null = null;
  // True after a forgotten row until we pick the first live row of that streak.
  let pickNext = false;
  for (const h of history) {
    if (h.isForgotten) {
      pickNext = true;
      continue;
    }
    if (pickNext) {
      best = h.updatedAt;
      pickNext = false;
    }
  }
  return best ?? m.updatedAt;
}

/** True when this learned claim folds into the document's ingest thread. */
function foldsIntoIngest(m: MemoryEntry, sources: Document[]): boolean {
  if (birthKind(m) !== "learned") return false;
  const born = bornAt(m);
  return sources.some(
    (d) => Math.abs(time(born) - time(d.createdAt)) <= GROUP_WINDOW_MS,
  );
}

export function buildTimeline({
  memories,
  documents,
}: {
  memories: MemoryEntry[];
  documents: Document[];
}): TimelineEvent[] {
  const docById = new Map(documents.map((d) => [d.id, d]));
  const memById = new Map(memories.map((m) => [m.id, m]));

  const extractedByDoc = new Map<string, MemoryEntry[]>();
  for (const m of memories) {
    for (const id of m.documentIds) {
      if (!docById.has(id)) continue;
      const list = extractedByDoc.get(id);
      if (list) list.push(m);
      else extractedByDoc.set(id, [m]);
    }
  }

  const events: TimelineEvent[] = [];

  for (const doc of documents) {
    // Thread only the claims that fold into this ingest — others keep their
    // own posts and must not restate the claim under the document.
    const extracted = (extractedByDoc.get(doc.id) ?? [])
      .filter((m) => foldsIntoIngest(m, [doc]))
      .slice()
      .sort((a, b) => time(bornAt(a)) - time(bornAt(b)));
    events.push({
      id: `ingested:${doc.id}`,
      kind: "ingested",
      at: doc.createdAt,
      spaceId: doc.containerTags[0] ?? "",
      memory: null,
      document: doc,
      extracted,
      sources: [],
      related: [],
      revision: null,
    });
  }

  for (const m of memories) {
    const sources = m.documentIds
      .map((id) => docById.get(id))
      .filter((d): d is Document => !!d);
    const related: RelatedMemory[] = (m.memoryRelations ?? []).map((r) => ({
      targetId: r.targetId,
      relation: r.relation,
      entry: memById.get(r.targetId) ?? null,
    }));

    const base = {
      spaceId: m.spaceId,
      memory: m,
      document: null,
      extracted: [] as MemoryEntry[],
      sources,
      related,
    };

    const born = bornAt(m);
    const grouped = foldsIntoIngest(m, sources);
    if (!grouped) {
      events.push({
        ...base,
        id: `born:${m.id}`,
        kind: birthKind(m),
        at: born,
        revision: null,
      });
    }

    const history = (m.history ?? [])
      .slice()
      .sort((a, b) => a.version - b.version);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const next = history[i];
      // Restores push a same-text version; the `restored` event covers that.
      if (prev.memory === next.memory) continue;
      events.push({
        ...base,
        id: `revised:${m.id}:v${next.version}`,
        kind: "revised",
        at: next.createdAt || next.updatedAt,
        revision: { from: prev.memory, to: next.memory, version: next.version },
      });
    }

    if (m.isForgotten) {
      events.push({
        ...base,
        id: `forgotten:${m.id}`,
        kind: "forgotten",
        at: forgottenAt(m),
        revision: null,
      });
    } else if ((m.history ?? []).some((h) => h.isForgotten)) {
      // A forgotten history row on a live memory means it was restored —
      // keep that visible so the feed does not silently rewrite its past.
      events.push({
        ...base,
        id: `restored:${m.id}`,
        kind: "restored",
        at: restoredAt(m),
        revision: null,
      });
    }
  }

  return events.sort(newestFirst);
}

/* ------------------------------------------------------------------ */
/* Day grouping                                                        */
/* ------------------------------------------------------------------ */

export interface TimelineDay {
  key: string;
  label: string;
  events: TimelineEvent[];
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayLabel(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(then.getTime())) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Split an already-ordered feed into consecutive day runs. */
export function groupByDay(events: TimelineEvent[], now = Date.now()): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const event of events) {
    const key = dayKey(event.at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.events.push(event);
    else days.push({ key, label: dayLabel(event.at, now), events: [event] });
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** Per-kind counts, for the filter chips. */
export function countByKind(events: TimelineEvent[]): Record<TimelineKind, number> {
  const counts = Object.fromEntries(TIMELINE_KINDS.map((k) => [k, 0])) as Record<
    TimelineKind,
    number
  >;
  for (const e of events) counts[e.kind]++;
  return counts;
}

/** Human name for a space, with the redundant "Space " prefix trimmed. */
export function spaceName(spaces: ContainerTag[], id: string): string {
  const match = spaces.find((s) => s.containerTag === id);
  return (match?.name || id || "Unfiled").replace(/^Space\s+/i, "");
}

/** Up to two letters for the author bubble. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return "·";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
