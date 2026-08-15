/**
 * Local review ledger for inferred memories.
 *
 * Durable decisions go through `POST .../inferred/:id/review` (approve /
 * decline). This ledger mirrors those decisions in the browser so the deck
 * can filter the queue immediately — and so a later revision of the same
 * claim (higher version) can surface again even before the list refetches.
 *
 * Records are keyed by memory id and carry the version that was reviewed.
 */

import { api } from "./api";
import type { MemoryEntry } from "./types";

export const REVIEW_KEY = "supermemory-memory-review";
const REVIEW_VERSION = 1 as const;

/** Most recent decisions kept before the oldest are pruned on write. */
const REVIEW_LIMIT = 500;

export type ReviewDecision = "kept" | "discarded";

export interface ReviewRecord {
  decision: ReviewDecision;
  /** Memory version the decision applies to. */
  version: number;
  /** ISO timestamp — also the pruning order. */
  at: string;
}

export interface ReviewLog {
  version: number;
  records: Record<string, ReviewRecord>;
}

export function emptyLog(): ReviewLog {
  return { version: REVIEW_VERSION, records: {} };
}

/**
 * Stable empty snapshot for `useSyncExternalStore`'s getServerSnapshot.
 * Must return the same reference across calls or React throws.
 */
const SERVER_EMPTY_LOG: ReviewLog = Object.freeze({
  version: REVIEW_VERSION,
  records: Object.freeze({}) as Record<string, ReviewRecord>,
});

export function getServerReviewLogSnapshot(): ReviewLog {
  return SERVER_EMPTY_LOG;
}

function sanitizeRecord(raw: unknown): ReviewRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.decision !== "kept" && o.decision !== "discarded") return null;
  if (typeof o.version !== "number" || !Number.isFinite(o.version)) return null;
  if (typeof o.at !== "string" || !o.at) return null;
  return { decision: o.decision, version: Math.max(1, Math.round(o.version)), at: o.at };
}

/** Untrusted localStorage input in, a usable log out. */
export function sanitizeLog(raw: unknown): ReviewLog {
  if (!raw || typeof raw !== "object") return emptyLog();
  const records = (raw as { records?: unknown }).records;
  if (!records || typeof records !== "object") return emptyLog();

  const clean: Record<string, ReviewRecord> = {};
  for (const [id, value] of Object.entries(records as Record<string, unknown>)) {
    const record = sanitizeRecord(value);
    if (record) clean[id] = record;
  }
  return { version: REVIEW_VERSION, records: clean };
}

/** Drop the oldest decisions so the ledger cannot grow without bound. */
export function pruneLog(log: ReviewLog, limit = REVIEW_LIMIT): ReviewLog {
  const entries = Object.entries(log.records);
  if (entries.length <= limit) return log;
  entries.sort((a, b) => (a[1].at < b[1].at ? 1 : a[1].at > b[1].at ? -1 : 0));
  return {
    version: REVIEW_VERSION,
    records: Object.fromEntries(entries.slice(0, limit)),
  };
}

export function loadReviewLog(): ReviewLog {
  if (typeof window === "undefined") return emptyLog();
  try {
    const raw = window.localStorage.getItem(REVIEW_KEY);
    return raw ? sanitizeLog(JSON.parse(raw)) : emptyLog();
  } catch {
    return emptyLog();
  }
}

let warnedOnWriteFailure = false;

export function saveReviewLog(log: ReviewLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_KEY, JSON.stringify(pruneLog(log)));
  } catch (err) {
    // Quota exceeded or private-mode storage. Non-fatal — reviewed
    // suggestions simply come back — but log once so it is diagnosable.
    if (!warnedOnWriteFailure) {
      warnedOnWriteFailure = true;
      console.warn("[review] could not persist review decisions", err);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared in-memory snapshot                                           */
/*                                                                     */
/* Multiple mounted routes (dashboard + memories) share one ledger so a */
/* keep in one view is already filtered out of the other. Cross-tab    */
/* edits arrive via the `storage` event.                               */
/* ------------------------------------------------------------------ */

type ReviewLogListener = () => void;

const reviewLogListeners = new Set<ReviewLogListener>();
let reviewLogSnapshot: ReviewLog | null = null;
let storageBound = false;

function ensureStorageListener(): void {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== REVIEW_KEY) return;
    reviewLogSnapshot = loadReviewLog();
    reviewLogListeners.forEach((l) => l());
  });
}

/** Current shared snapshot — hydrates from localStorage on first read. */
export function getReviewLogSnapshot(): ReviewLog {
  ensureStorageListener();
  if (!reviewLogSnapshot) reviewLogSnapshot = loadReviewLog();
  return reviewLogSnapshot;
}

export function subscribeReviewLog(listener: ReviewLogListener): () => void {
  ensureStorageListener();
  reviewLogListeners.add(listener);
  return () => reviewLogListeners.delete(listener);
}

/** Persist and broadcast a new ledger to every subscriber in this tab. */
export function commitReviewLog(log: ReviewLog): void {
  const next = pruneLog(log);
  reviewLogSnapshot = next;
  saveReviewLog(next);
  reviewLogListeners.forEach((l) => l());
}

/** Test helper — drop the in-memory cache between cases. */
export function resetReviewLogStore(log: ReviewLog = emptyLog()): void {
  reviewLogSnapshot = log;
  reviewLogListeners.forEach((l) => l());
}

/** Pure: returns a new log with the decision applied. */
export function recordDecision(
  log: ReviewLog,
  id: string,
  decision: ReviewDecision,
  version: number,
  at = new Date().toISOString(),
): ReviewLog {
  return {
    version: REVIEW_VERSION,
    records: {
      ...log.records,
      [id]: { decision, version: Math.max(1, Math.round(version)), at },
    },
  };
}

/**
 * Persist an approve/decline on the engine and mirror it in the local ledger.
 * Callers own toasts and corpus invalidation — a plain keep in the review
 * queue does not need a corpus refresh (the onlyInference refetch drops it).
 */
export async function persistReviewDecision(
  entry: MemoryEntry,
  decision: ReviewDecision,
  version = entry.version,
): Promise<void> {
  await api.reviewInferred(
    entry.spaceId,
    entry.id,
    decision === "kept" ? "approve" : "decline",
  );
  commitReviewLog(
    recordDecision(getReviewLogSnapshot(), entry.id, decision, version),
  );
}

/** A revision published after the decision counts as unreviewed again. */
export function isReviewed(log: ReviewLog, entry: MemoryEntry): boolean {
  const record = log.records[entry.id];
  return !!record && record.version >= entry.version;
}

/** Inferred, live, and not yet ruled on — in the order given. */
export function pendingReview(entries: MemoryEntry[], log: ReviewLog): MemoryEntry[] {
  return entries.filter(
    (m) => m.isInference && !m.isForgotten && !isReviewed(log, m),
  );
}

/* ------------------------------------------------------------------ */
/* Swipe gesture                                                       */
/* ------------------------------------------------------------------ */

/** Horizontal travel that commits a decision, in CSS pixels. */
export const SWIPE_THRESHOLD = 96;
/** Vertical travel that commits a skip. */
export const SKIP_THRESHOLD = 128;
/** Horizontal speed (px/ms) that commits regardless of distance. */
export const FLICK_VELOCITY = 0.6;

export type SwipeOutcome = "keep" | "discard" | "skip";

/**
 * Which way a released card falls. Right keeps, left discards, a decisive
 * downward drag skips; anything short of a threshold springs back (null).
 */
export function swipeOutcome(dx: number, dy: number, vx: number): SwipeOutcome | null {
  if (dy > SKIP_THRESHOLD && dy > Math.abs(dx)) return "skip";
  if (dx >= SWIPE_THRESHOLD || vx >= FLICK_VELOCITY) return "keep";
  if (dx <= -SWIPE_THRESHOLD || vx <= -FLICK_VELOCITY) return "discard";
  return null;
}
