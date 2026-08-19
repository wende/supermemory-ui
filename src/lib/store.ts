/**
 * In-memory mock store.
 *
 * Module-level state: mutations persist for the life of the server
 * process (or a warm serverless instance) and reset on cold start.
 * That is deliberate — this is a demo backend, not a database. Point
 * SUPERMEMORY_URL at a real instance and none of this runs.
 */

import {
  ACTIVITY,
  DOCUMENTS,
  LATENCIES,
  MEMORIES,
  PROFILE,
  SERVER_INFO,
  SETTINGS,
  SPACES,
  chunksFor,
} from "./seed";
import type {
  ContainerTag,
  Document,
  DocumentChunk,
  GraphEdge,
  GraphNode,
  GraphResponse,
  MemoryEntry,
  MemoryRelation,
  MergeStatus,
  OrgSettings,
  Pagination,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "./types";

interface DB {
  documents: Document[];
  memories: MemoryEntry[];
  spaces: ContainerTag[];
  settings: OrgSettings;
  merges: MergeStatus[];
  profile: {
    static: string[];
    dynamic: string[];
    buckets: Record<string, string[]>;
  };
  seq: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __smDb: DB | undefined;
}

function create(): DB {
  return {
    documents: structuredClone(DOCUMENTS),
    memories: structuredClone(MEMORIES),
    spaces: structuredClone(SPACES),
    settings: structuredClone(SETTINGS),
    merges: [],
    profile: {
      static: [...PROFILE.static],
      dynamic: [...PROFILE.dynamic],
      buckets: Object.fromEntries(
        Object.entries(PROFILE.buckets).map(([k, v]) => [k, [...v]]),
      ),
    },
    seq: 1000,
  };
}

/** Survives dev-server hot reloads. */
export function db(): DB {
  if (!globalThis.__smDb) globalThis.__smDb = create();
  return globalThis.__smDb;
}

export function resetDb(): void {
  globalThis.__smDb = create();
}

function nextId(prefix: string): string {
  const d = db();
  d.seq += 1;
  return `${prefix}_${d.seq.toString(36)}${Math.floor(
    (d.seq * 7919) % 46656,
  ).toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Derived counts                                                      */
/* ------------------------------------------------------------------ */

export function spacesWithCounts(): ContainerTag[] {
  tickAll();
  const d = db();
  return d.spaces.map((s) => ({
    ...s,
    documentCount: d.documents.filter((doc) =>
      doc.containerTags.includes(s.containerTag),
    ).length,
    memoryCount: d.memories.filter(
      (m) => m.spaceId === s.containerTag && !m.isForgotten,
    ).length,
  }));
}

export function stats() {
  tickAll();
  const d = db();
  const docs = d.documents;
  const mems = d.memories;
  const byStatus = Object.fromEntries(
    ["queued", "extracting", "chunking", "embedding", "indexing", "done", "failed"].map(
      (s) => [s, docs.filter((doc) => doc.status === s).length],
    ),
  ) as Record<string, number>;

  const byType: Record<string, number> = {};
  for (const doc of docs) byType[doc.type] = (byType[doc.type] ?? 0) + 1;

  const chunks = docs.reduce((n, doc) => n + (doc.chunkCount ?? 0), 0);

  return {
    documents: docs.length,
    memories: mems.filter((m) => !m.isForgotten).length,
    forgotten: mems.filter((m) => m.isForgotten).length,
    inferences: mems.filter((m) => m.isInference && !m.isForgotten).length,
    staticFacts: mems.filter((m) => m.isStatic && !m.isForgotten).length,
    versioned: mems.filter((m) => m.version > 1).length,
    relations: mems.reduce((n, m) => n + (m.memoryRelations?.length ?? 0), 0),
    chunks,
    spaces: d.spaces.length,
    processing: docs.filter(
      (doc) => doc.status !== "done" && doc.status !== "failed",
    ).length,
    failed: byStatus.failed ?? 0,
    byStatus,
    byType,
    activity: ACTIVITY,
    latencies: LATENCIES,
    vectorBytes: chunks * 768 * 4,
    server: SERVER_INFO,
  };
}

/* ------------------------------------------------------------------ */
/* Pagination helper                                                   */
/* ------------------------------------------------------------------ */

export function paginate<T>(
  items: T[],
  page = 1,
  limit = 20,
): { slice: T[]; pagination: Pagination } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const current = Math.min(Math.max(1, page), totalPages);
  return {
    slice: items.slice((current - 1) * limit, current * limit),
    pagination: { currentPage: current, limit, totalItems, totalPages },
  };
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export function listDocuments(opts: {
  containerTags?: string[];
  q?: string;
  types?: string[];
  statuses?: string[];
  includeContent?: boolean;
  page?: number;
  limit?: number;
  sort?: "createdAt" | "updatedAt";
  order?: "asc" | "desc";
}) {
  tickAll();
  const d = db();
  let items = d.documents.slice();

  if (opts.containerTags?.length)
    items = items.filter((doc) =>
      doc.containerTags.some((t) => opts.containerTags!.includes(t)),
    );
  if (opts.types?.length)
    items = items.filter((doc) => opts.types!.includes(doc.type));
  if (opts.statuses?.length)
    items = items.filter((doc) => opts.statuses!.includes(doc.status));
  if (opts.q) {
    const q = opts.q.toLowerCase();
    items = items.filter(
      (doc) =>
        doc.title?.toLowerCase().includes(q) ||
        doc.summary?.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q),
    );
  }

  const sort = opts.sort ?? "createdAt";
  const dir = opts.order === "asc" ? 1 : -1;
  items.sort((a, b) => (a[sort] < b[sort] ? -dir : a[sort] > b[sort] ? dir : 0));

  const { slice, pagination } = paginate(items, opts.page, opts.limit ?? 20);
  return {
    memories: opts.includeContent
      ? slice
      : slice.map((doc) => ({ ...doc, content: "" })),
    pagination,
  };
}

export function getDocument(id: string): Document | undefined {
  tickAll();
  return db().documents.find((doc) => doc.id === id || doc.customId === id);
}

export function getChunks(id: string): DocumentChunk[] {
  const doc = getDocument(id);
  return doc ? chunksFor(doc) : [];
}

export function addDocument(input: {
  content: string;
  title?: string;
  containerTags?: string[];
  type?: Document["type"];
  metadata?: Document["metadata"];
  url?: string;
  customId?: string;
}): Document {
  const d = db();
  const now = new Date().toISOString();
  const doc: Document = {
    id: nextId("doc"),
    customId: input.customId ?? null,
    title: input.title ?? (input.content.slice(0, 60).trim() || "Untitled"),
    summary: null,
    content: input.content,
    type: input.type ?? (input.url ? "webpage" : "text"),
    status: "queued",
    containerTags: input.containerTags?.length
      ? input.containerTags
      : ["sm_personal"],
    metadata: input.metadata ?? null,
    url: input.url ?? null,
    filepath: null,
    connectionId: null,
    createdAt: now,
    updatedAt: now,
    chunkCount: 0,
    ingestStartedAt: Date.now(),
  };
  d.documents.unshift(doc);
  return doc;
}

/** Wall-clock spent in each pipeline stage. */
const STAGE_MS = 1400;
const INGEST_STAGES: Document["status"][] = [
  "extracting",
  "chunking",
  "embedding",
  "indexing",
  "done",
];

/**
 * Advance a document through the pipeline based on elapsed time.
 *
 * Deriving the stage on read rather than scheduling timers is what makes
 * this work on a serverless host: the process may be frozen between the
 * POST that created the document and the GET that polls it, so anything
 * timer-driven would never fire.
 */
function tickIngest(doc: Document): void {
  if (!doc.ingestStartedAt || doc.status === "failed") return;

  const elapsed = Date.now() - doc.ingestStartedAt;
  const stage =
    INGEST_STAGES[Math.min(INGEST_STAGES.length - 1, Math.floor(elapsed / STAGE_MS))];

  if (doc.status !== stage) {
    doc.status = stage;
    doc.updatedAt = new Date().toISOString();
  }

  if (stage === "done") {
    doc.ingestStartedAt = undefined;
    doc.chunkCount = Math.max(1, Math.round(doc.content.length / 620));
    doc.summary = doc.content.split(/\n\n+/)[0]?.slice(0, 180).trim() ?? null;
    extractMemories(doc);
  }
}

/** Bring every in-flight document up to date. Cheap; called on each read. */
function tickAll(): void {
  for (const doc of db().documents) tickIngest(doc);
}

/** Crude "extraction": one memory per substantial paragraph. */
function extractMemories(doc: Document) {
  const d = db();
  const claims = doc.content
    .split(/\n\n+/)
    .map((p) => p.replace(/^[#>\-*\d.\s]+/, "").trim())
    .filter((p) => p.length > 80 && p.length < 400)
    .slice(0, 3);

  for (const claim of claims) {
    const now = new Date().toISOString();
    const id = nextId("mem");
    d.memories.unshift({
      id,
      memory: claim.length > 300 ? claim.slice(0, 297) + "…" : claim,
      version: 1,
      isLatest: true,
      isForgotten: false,
      isStatic: false,
      isInference: false,
      createdAt: now,
      updatedAt: now,
      spaceId: doc.containerTags[0],
      orgId: "org_local_7f3a",
      sourceCount: 1,
      parentMemoryId: null,
      rootMemoryId: id,
      forgetAfter: null,
      forgetReason: null,
      metadata: { extracted: true },
      memoryRelations: null,
      temporalContext: null,
      history: [
        {
          id,
          memory: claim,
          version: 1,
          createdAt: now,
          updatedAt: now,
          parentMemoryId: null,
          rootMemoryId: id,
          isLatest: true,
          isForgotten: false,
        },
      ],
      documentIds: [doc.id],
    });
  }
}

export function deleteDocument(id: string): boolean {
  const d = db();
  const i = d.documents.findIndex((doc) => doc.id === id || doc.customId === id);
  if (i === -1) return false;
  d.documents.splice(i, 1);
  return true;
}

/* ------------------------------------------------------------------ */
/* Memories                                                            */
/* ------------------------------------------------------------------ */

export function compareMemoryEntries(
  a: MemoryEntry,
  b: MemoryEntry,
  sort: "createdAt" | "updatedAt",
  order: "asc" | "desc" = "desc",
) {
  const dir = order === "asc" ? 1 : -1;
  const aValue = typeof a[sort] === "string" ? a[sort] : null;
  const bValue = typeof b[sort] === "string" ? b[sort] : null;
  if (aValue === bValue) return a.id.localeCompare(b.id);
  if (aValue === null) return 1;
  if (bValue === null) return -1;
  return aValue < bValue ? -dir : dir;
}

export function listMemories(opts: {
  containerTags?: string[];
  documentId?: string;
  q?: string;
  includeForgotten?: boolean;
  onlyStatic?: boolean;
  onlyInference?: boolean;
  onlyVersioned?: boolean;
  page?: number;
  limit?: number;
  sort?: "createdAt" | "updatedAt";
  order?: "asc" | "desc";
}) {
  tickAll();
  const d = db();
  let items = d.memories.slice();

  if (!opts.includeForgotten) items = items.filter((m) => !m.isForgotten);
  if (opts.containerTags?.length)
    items = items.filter((m) => opts.containerTags!.includes(m.spaceId));
  if (opts.documentId)
    items = items.filter((m) => m.documentIds.includes(opts.documentId!));
  if (opts.onlyStatic) items = items.filter((m) => m.isStatic);
  if (opts.onlyInference) items = items.filter((m) => m.isInference);
  if (opts.onlyVersioned) items = items.filter((m) => m.version > 1);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    items = items.filter((m) => m.memory.toLowerCase().includes(q));
  }

  const sort = opts.sort ?? "updatedAt";
  items.sort((a, b) => compareMemoryEntries(a, b, sort, opts.order));

  const { slice, pagination } = paginate(items, opts.page, opts.limit ?? 25);
  return { memoryEntries: slice, pagination };
}

export function getMemory(id: string): MemoryEntry | undefined {
  return db().memories.find((m) => m.id === id);
}

export function createMemory(input: {
  memory: string;
  containerTag?: string;
  isStatic?: boolean;
  metadata?: MemoryEntry["metadata"];
}): MemoryEntry {
  const d = db();
  const now = new Date().toISOString();
  const id = nextId("mem");
  const entry: MemoryEntry = {
    id,
    memory: input.memory,
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: input.isStatic ?? true,
    isInference: false,
    createdAt: now,
    updatedAt: now,
    spaceId: input.containerTag ?? "sm_personal",
    orgId: "org_local_7f3a",
    sourceCount: 0,
    parentMemoryId: null,
    rootMemoryId: id,
    forgetAfter: null,
    forgetReason: null,
    metadata: input.metadata ?? null,
    memoryRelations: null,
    temporalContext: null,
    history: [
      {
        id,
        memory: input.memory,
        version: 1,
        createdAt: now,
        updatedAt: now,
        parentMemoryId: null,
        rootMemoryId: id,
        isLatest: true,
        isForgotten: false,
      },
    ],
    documentIds: [],
  };
  d.memories.unshift(entry);
  return entry;
}

/** Append a new history version; never mutates the prior row in place. */
function pushNewVersion(
  m: MemoryEntry,
  memoryText: string,
  isForgotten: boolean,
): void {
  const now = new Date().toISOString();
  const priorId = `${m.id}_v${m.version}`;

  m.history = m.history.map((h) =>
    h.isLatest ? { ...h, id: priorId, isLatest: false } : h,
  );
  m.version += 1;
  m.parentMemoryId = priorId;
  m.rootMemoryId = m.rootMemoryId ?? m.id;
  m.memory = memoryText;
  m.isForgotten = isForgotten;
  m.updatedAt = now;
  m.history.push({
    id: m.id,
    memory: memoryText,
    version: m.version,
    createdAt: now,
    updatedAt: now,
    parentMemoryId: priorId,
    rootMemoryId: m.rootMemoryId,
    isLatest: true,
    isForgotten,
  });
}

/** Stamp forget/restore flags onto the latest history row without bumping version. */
function stampLatestHistory(
  m: MemoryEntry,
  patch: { isForgotten: boolean; updatedAt: string },
): void {
  m.history = m.history.map((h) => (h.isLatest ? { ...h, ...patch } : h));
}

/** PATCH /v4/memories — an update creates a new version, never mutates in place. */
export function updateMemory(id: string, text: string): MemoryEntry | undefined {
  const m = getMemory(id);
  if (!m) return undefined;
  pushNewVersion(m, text, m.isForgotten);
  return m;
}

export function forgetMemory(id: string, reason?: string): MemoryEntry | undefined {
  const m = getMemory(id);
  if (!m) return undefined;
  const now = new Date().toISOString();
  m.isForgotten = true;
  // Empty / whitespace reasons are treated as unset so callers can't persist "".
  m.forgetReason = reason?.trim() || "Forgotten via the dashboard.";
  m.updatedAt = now;
  // Stamp in place (no version bump) so the forget moment survives later
  // writes that bump the entry's `updatedAt`.
  stampLatestHistory(m, { isForgotten: true, updatedAt: now });
  return m;
}

export function restoreMemory(id: string): MemoryEntry | undefined {
  const m = getMemory(id);
  if (!m) return undefined;
  // Current-state reason is for forgotten memories only. Append a new live
  // row on top of the forgotten one so both rows remain in history.
  m.forgetReason = null;
  pushNewVersion(m, m.memory, false);
  return m;
}

export type ReviewAction = "approve" | "decline" | "undo";
export type ReviewStatus = "approved" | "declined";

export interface InferredMemorySummary {
  id: string;
  memory: string;
  parentCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: MemoryEntry["metadata"];
}

export interface ReviewResult {
  id: string;
  isInference: boolean;
  isForgotten: boolean;
  reviewStatus: ReviewStatus | null;
}

function reviewStatusOf(m: MemoryEntry): ReviewStatus | null {
  const raw = m.metadata?.reviewStatus;
  return raw === "approved" || raw === "declined" ? raw : null;
}

function stampReview(m: MemoryEntry, status: ReviewStatus | null): void {
  const next = { ...(m.metadata ?? {}) };
  if (status) next.reviewStatus = status;
  else delete next.reviewStatus;
  m.metadata = Object.keys(next).length ? next : null;
  m.updatedAt = new Date().toISOString();
}

/** Unreviewed inferences in a space — the review-queue shape. */
export function listInferred(containerTag: string): {
  memories: InferredMemorySummary[];
  total: number;
} {
  const memories = db()
    .memories.filter(
      (m) =>
        m.spaceId === containerTag &&
        m.isInference &&
        !m.isForgotten &&
        !reviewStatusOf(m),
    )
    .map((m) => ({
      id: m.id,
      memory: m.memory,
      parentCount: m.sourceCount ?? 0,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      metadata: m.metadata,
    }));
  return { memories, total: memories.length };
}

/**
 * Persist a review decision. Approve/decline conflict when the memory is not
 * an unreviewed inference (`!isInference`, forgotten, or already stamped) —
 * call undo first before re-approving.
 */
export function reviewInferred(
  containerTag: string,
  memoryId: string,
  action: ReviewAction,
): ReviewResult | { error: "not_found" | "conflict" } {
  const m = getMemory(memoryId);
  if (!m || m.spaceId !== containerTag) return { error: "not_found" };

  const status = reviewStatusOf(m);

  if (action === "undo") {
    if (!status) return { error: "conflict" };
    m.isInference = true;
    m.isForgotten = false;
    m.forgetReason = null;
    stampReview(m, null);
    m.history = m.history.map((h) =>
      h.isLatest ? { ...h, isForgotten: false } : h,
    );
    return {
      id: m.id,
      isInference: true,
      isForgotten: false,
      reviewStatus: null,
    };
  }

  if (!m.isInference || m.isForgotten || status) return { error: "conflict" };

  if (action === "approve") {
    m.isInference = false;
    stampReview(m, "approved");
    return {
      id: m.id,
      isInference: false,
      isForgotten: false,
      reviewStatus: "approved",
    };
  }

  m.isForgotten = true;
  m.forgetReason = "Declined during memory review";
  stampReview(m, "declined");
  m.history = m.history.map((h) =>
    h.isLatest ? { ...h, isForgotten: true } : h,
  );
  return {
    id: m.id,
    isInference: true,
    isForgotten: true,
    reviewStatus: "declined",
  };
}

/** Lexical stand-in for the live semantic forget-matching search. */
export function matchForgetPrompt(
  prompt: string,
  opts?: { containerTag?: string; limit?: number },
): MemoryEntry[] {
  const terms = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  if (!terms.length) return [];
  const tag = opts?.containerTag?.trim();
  const limit = opts?.limit ?? 25;
  return db()
    .memories.filter((m) => {
      if (m.isForgotten) return false;
      if (tag && m.spaceId !== tag) return false;
      const text = m.memory.toLowerCase();
      return terms.some((t) => text.includes(t));
    })
    .slice(0, limit);
}

/** POST /v4/memories/forget-matching — agentic mass-forget. */
export function forgetMatching(
  prompt: string,
  reason?: string,
  opts?: { containerTag?: string },
) {
  const matched = matchForgetPrompt(prompt, opts);
  const resolved = reason?.trim() || `Matched forget prompt: "${prompt}"`;
  for (const m of matched) forgetMemory(m.id, resolved);
  return { matched };
}

/** Forget an explicit id set (live apply-by-ids contract). */
export function forgetByIds(ids: string[], reason?: string) {
  const matched: MemoryEntry[] = [];
  const resolved = reason?.trim() || undefined;
  for (const id of ids) {
    const forgotten = forgetMemory(id, resolved);
    if (forgotten) matched.push(forgotten);
  }
  return { matched };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/**
 * Lexical scorer standing in for the real hybrid vector + BM25 pass.
 *
 * Weights rarer terms higher (a crude IDF), rewards adjacency and an
 * early match, and normalises for length — enough structure that the
 * returned scores spread out the way cosine similarities do instead of
 * bunching on a handful of values.
 */
function score(text: string, terms: string[], phrase: string): number {
  if (!terms.length) return 0;
  const t = text.toLowerCase();

  let weighted = 0;
  let total = 0;
  let firstAt = Infinity;

  for (const term of terms) {
    // Longer terms carry more signal than "the" or "was".
    const w = Math.min(2.2, 0.5 + term.length * 0.18);
    total += w;
    const at = t.indexOf(term);
    if (at !== -1) {
      weighted += w;
      firstAt = Math.min(firstAt, at);
    } else if (term.length > 5) {
      const stem = term.slice(0, Math.max(4, term.length - 2));
      const stemAt = t.indexOf(stem);
      if (stemAt !== -1) {
        weighted += w * 0.55;
        firstAt = Math.min(firstAt, stemAt);
      }
    }
  }

  if (weighted === 0) return 0;

  let s = weighted / total;
  if (phrase.length > 6 && t.includes(phrase)) s += 0.22;
  // An early match reads as more on-topic than one buried at the end.
  if (firstAt < 90) s += 0.06 * (1 - firstAt / 90);
  // Mild length normalisation: a short memory that matches is a tighter hit.
  s *= 1 + 0.1 * (1 - Math.min(1, t.length / 600));

  // Squash into the band a cosine-similarity search actually returns,
  // with a small deterministic jitter so ties don't stack on one value.
  const jitter = ((text.length * 2654435761) % 97) / 97 - 0.5;
  return Math.max(0.3, Math.min(0.98, 0.4 + s * 0.54 + jitter * 0.018));
}

export function search(req: SearchRequest): SearchResponse {
  const started = Date.now();
  tickAll();
  const d = db();
  const phrase = req.q.trim().toLowerCase();
  const terms = phrase.split(/\W+/).filter((t) => t.length > 2);
  const mode = req.searchMode ?? "memories";
  const threshold = req.threshold ?? 0.5;
  const limit = req.limit ?? 10;
  const include = req.include ?? {};

  const inSpace = (tag: string) =>
    !req.containerTags?.length || req.containerTags.includes(tag);

  let results: SearchResult[] = [];

  if (mode === "memories" || mode === "hybrid") {
    const pool = d.memories.filter(
      (m) =>
        inSpace(m.spaceId) && (include.forgottenMemories ? true : !m.isForgotten),
    );
    results = pool
      .map((m) => {
        const sim = score(m.memory, terms, phrase);
        if (sim < threshold) return null;

        const result: SearchResult = {
          id: m.id,
          memory: m.memory,
          similarity: sim,
          updatedAt: m.updatedAt,
          version: m.version,
          filepath: null,
          metadata: m.metadata,
        };

        if (include.relatedMemories !== false) {
          const parents = (m.memoryRelations ?? [])
            .map((r) => {
              const target = getMemory(r.targetId);
              return target
                ? {
                    relation: r.relation,
                    memory: target.memory,
                    version: target.version,
                    metadata: target.metadata,
                    updatedAt: target.updatedAt,
                  }
                : null;
            })
            .filter(Boolean) as SearchResult["context"] extends undefined
            ? never
            : NonNullable<SearchResult["context"]>["parents"];

          const children = d.memories
            .filter((other) =>
              (other.memoryRelations ?? []).some((r) => r.targetId === m.id),
            )
            .map((other) => ({
              relation:
                other.memoryRelations!.find((r) => r.targetId === m.id)!.relation,
              memory: other.memory,
              version: other.version,
              metadata: other.metadata,
              updatedAt: other.updatedAt,
            }));

          const related = d.memories
            .filter(
              (other) =>
                other.id !== m.id &&
                other.spaceId === m.spaceId &&
                !other.isForgotten &&
                other.documentIds.some((id) => m.documentIds.includes(id)),
            )
            .slice(0, 3)
            .map((other) => ({
              relation: "shares-source",
              memory: other.memory,
              metadata: other.metadata,
              updatedAt: other.updatedAt,
            }));

          if (parents.length || children.length || related.length)
            result.context = { parents, children, related };
        }

        if (include.documents) {
          result.documents = m.documentIds
            .map((id) => d.documents.find((doc) => doc.id === id))
            .filter(Boolean)
            .slice(0, 4)
            .map((doc) => ({
              id: doc!.id,
              title: doc!.title ?? "Untitled",
              type: doc!.type,
              summary: include.summaries ? doc!.summary : null,
              metadata: doc!.metadata,
              createdAt: doc!.createdAt,
              updatedAt: doc!.updatedAt,
            }));
        }

        if (include.chunks) {
          result.chunks = m.documentIds
            .flatMap((id) =>
              getChunks(id).map((c) => ({
                ...c,
                documentId: c.documentId ?? id,
              })),
            )
            .map((c) => ({ ...c, score: score(c.content, terms, phrase) }))
            .filter((c) => c.score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 2)
            .map((c) => ({
              content: c.content,
              score: c.score,
              position: c.position,
              documentId: c.documentId,
            }));
        }

        return result;
      })
      .filter(Boolean) as SearchResult[];
  }

  if (mode === "documents" || mode === "hybrid") {
    const docHits = d.documents
      .filter((doc) => doc.containerTags.some(inSpace) && doc.status === "done")
      .flatMap((doc) =>
        chunksFor(doc).map((c) => ({
          doc,
          chunk: c,
          s: score(c.content, terms, phrase),
        })),
      )
      .filter((x) => x.s >= threshold)
      .sort((a, b) => b.s - a.s)
      .slice(0, mode === "hybrid" ? 6 : limit * 2)
      .map<SearchResult>(({ doc, chunk, s }) => ({
        id: chunk.id,
        memory: doc.title ?? "Untitled",
        chunk: chunk.content,
        similarity: s,
        updatedAt: doc.updatedAt,
        version: null,
        filepath: doc.filepath,
        metadata: doc.metadata,
        documents: [
          {
            id: doc.id,
            title: doc.title ?? "Untitled",
            type: doc.type,
            summary: include.summaries !== false ? doc.summary : null,
            metadata: doc.metadata,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          },
        ],
        chunks: [
          {
            content: chunk.content,
            score: s,
            position: chunk.position,
            documentId: doc.id,
          },
        ],
      }));
    results = results.concat(docHits);
  }

  results.sort((a, b) => b.similarity - a.similarity);

  // Reranking nudges strong lexical matches up; a real cross-encoder
  // would reorder more aggressively.
  if (req.rerank) {
    results = results
      .map((r) => ({
        r,
        boost: phrase && r.memory.toLowerCase().includes(phrase) ? 0.08 : 0,
      }))
      .sort((a, b) => b.r.similarity + b.boost - (a.r.similarity + a.boost))
      .map(({ r, boost }) => ({
        ...r,
        similarity: Math.min(0.99, r.similarity + boost),
      }));
  }

  if (req.aggregate) {
    const seen = new Set<string>();
    results = results.filter((r) => {
      const key = r.memory.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    results = results.map((r) => ({ ...r, isAggregated: true }));
  }

  const total = results.length;
  return {
    results: results.slice(0, limit),
    total,
    timing: Math.max(9, Date.now() - started + (req.rerank ? 140 : 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

export function graph(opts: {
  containerTags?: string[];
  includeDocuments?: boolean;
  includeForgotten?: boolean;
}): GraphResponse {
  tickAll();
  const d = db();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const spaceFilter = opts.containerTags?.length ? opts.containerTags : null;

  const memories = d.memories.filter(
    (m) =>
      (!spaceFilter || spaceFilter.includes(m.spaceId)) &&
      (opts.includeForgotten || !m.isForgotten),
  );
  const memIds = new Set(memories.map((m) => m.id));

  for (const m of memories) {
    nodes.push({
      id: m.id,
      kind: "memory",
      label: m.memory,
      weight: 1 + m.sourceCount,
      spaceId: m.spaceId,
      forgotten: m.isForgotten,
    });
    // Membership is shown via territory blobs; no space hub / contains edges.
    for (const rel of m.memoryRelations ?? []) {
      if (memIds.has(rel.targetId))
        edges.push({
          source: m.id,
          target: rel.targetId,
          relation: rel.relation as MemoryRelation,
        });
    }
  }

  if (opts.includeDocuments) {
    const referenced = new Set(memories.flatMap((m) => m.documentIds));
    for (const doc of d.documents) {
      if (!referenced.has(doc.id)) continue;
      if (spaceFilter && !doc.containerTags.some((t) => spaceFilter.includes(t)))
        continue;
      nodes.push({
        id: doc.id,
        kind: "document",
        label: doc.title ?? "Untitled",
        weight: 1 + (doc.chunkCount ?? 0) / 4,
        spaceId: doc.containerTags[0],
      });
    }
    for (const m of memories)
      for (const docId of m.documentIds)
        if (referenced.has(docId))
          edges.push({ source: docId, target: m.id, relation: "sources" });
  }

  const present = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: edges.filter((e) => present.has(e.source) && present.has(e.target)),
  };
}

/* ------------------------------------------------------------------ */
/* Spaces / container tags                                             */
/* ------------------------------------------------------------------ */

export function updateSpace(
  tag: string,
  patch: Partial<ContainerTag["settings"]> & { description?: string },
): ContainerTag | undefined {
  const s = db().spaces.find((x) => x.containerTag === tag);
  if (!s) return undefined;
  const { description, ...settings } = patch;
  if (description !== undefined) s.description = description;
  s.settings = { ...s.settings, ...settings };
  s.updatedAt = new Date().toISOString();
  return s;
}

export function deleteSpace(tag: string): boolean {
  const d = db();
  const i = d.spaces.findIndex((s) => s.containerTag === tag);
  if (i === -1) return false;
  d.spaces.splice(i, 1);
  d.documents = d.documents.filter((doc) => !doc.containerTags.includes(tag));
  d.memories = d.memories.filter((m) => m.spaceId !== tag);
  return true;
}

export function mergeSpaces(source: string, target: string): MergeStatus {
  const d = db();
  const moved = {
    documents: d.documents.filter((doc) => doc.containerTags.includes(source))
      .length,
    memories: d.memories.filter((m) => m.spaceId === source).length,
  };
  for (const doc of d.documents) {
    if (doc.containerTags.includes(source))
      doc.containerTags = Array.from(
        new Set(doc.containerTags.map((t) => (t === source ? target : t))),
      );
  }
  for (const m of d.memories) if (m.spaceId === source) m.spaceId = target;
  d.spaces = d.spaces.filter((s) => s.containerTag !== source);

  const status: MergeStatus = {
    mergeId: nextId("merge"),
    status: "done",
    source,
    target,
    movedDocuments: moved.documents,
    movedMemories: moved.memories,
    createdAt: new Date().toISOString(),
  };
  d.merges.unshift(status);
  return status;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function updateSettings(patch: Partial<OrgSettings>): OrgSettings {
  const d = db();
  d.settings = { ...d.settings, ...patch };
  return d.settings;
}

/** Mirrors POST /v3/settings/suggest-buckets. */
export function suggestBuckets() {
  const existing = new Set(db().settings.profileBuckets.map((b) => b.key));
  return [
    {
      key: "communication_style",
      description: "Tone, formality and channel preferences when writing to others.",
    },
    {
      key: "decision_history",
      description: "Positions taken previously and whether they were revised.",
    },
    {
      key: "expertise_areas",
      description: "Topics this person is consulted on by others.",
    },
    {
      key: "tooling",
      description: "Editors, languages and services in daily use.",
    },
  ].filter((b) => !existing.has(b.key));
}
