/**
 * Story fixtures.
 *
 * Stories render against the same seeded corpus the mock backend serves, so a
 * component looks in Storybook exactly as it does on `npm run dev` with no
 * instance attached. Nothing here is fabricated a second time — it is a thin
 * selection layer over `src/lib/seed.ts` and `src/lib/store.ts`.
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
} from "@/lib/seed";
import { graph } from "@/lib/store";
import type {
  Document,
  DocumentStatus,
  GraphResponse,
  MemoryEntry,
  SearchResult,
} from "@/lib/types";

export {
  ACTIVITY,
  DOCUMENTS,
  LATENCIES,
  MEMORIES,
  PROFILE,
  SERVER_INFO,
  SETTINGS,
  SPACES,
  chunksFor,
};

/* ------------------------------------------------------------------ */
/* Single records                                                      */
/* ------------------------------------------------------------------ */

/** A representative indexed document with a title, summary and chunks. */
export const doc: Document =
  DOCUMENTS.find((d) => d.status === "done" && d.title && d.summary) ??
  DOCUMENTS[0];

/** A memory with relations and history — the interesting detail case. */
export const memory: MemoryEntry =
  MEMORIES.find(
    (m) => (m.memoryRelations?.length ?? 0) > 0 && m.history.length > 1,
  ) ?? MEMORIES[0];

/** A forgotten memory, for the muted / struck-through treatments. */
export const forgottenMemory: MemoryEntry | undefined = MEMORIES.find(
  (m) => m.isForgotten,
);

export const space = SPACES[0];

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export const recentMemories = MEMORIES.filter((m) => !m.isForgotten).slice(0, 6);

export const recentDocuments = DOCUMENTS.slice(0, 6);

/** One document per pipeline status, so every state can be shown at once. */
export const documentsByStatus: Partial<Record<DocumentStatus, Document>> =
  DOCUMENTS.reduce<Partial<Record<DocumentStatus, Document>>>((acc, d) => {
    acc[d.status] ??= d;
    return acc;
  }, {});

/* ------------------------------------------------------------------ */
/* Derived counts — what the dashboard tiles show                      */
/* ------------------------------------------------------------------ */

export const counts = {
  documents: DOCUMENTS.length,
  memories: MEMORIES.filter((m) => !m.isForgotten).length,
  forgotten: MEMORIES.filter((m) => m.isForgotten).length,
  spaces: SPACES.length,
  chunks: DOCUMENTS.reduce((n, d) => n + (d.chunkCount ?? 0), 0),
  relations: MEMORIES.reduce((n, m) => n + (m.memoryRelations?.length ?? 0), 0),
};

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

/** The full assembled graph — spaces, memories, documents and their edges. */
export const fullGraph: GraphResponse = graph({
  includeDocuments: true,
  includeForgotten: true,
});

/** Memories and spaces only — the default view when documents are hidden. */
export const memoryGraph: GraphResponse = graph({
  includeDocuments: false,
  includeForgotten: false,
});

export const graphCounts = {
  memory: fullGraph.nodes.filter((n) => n.kind === "memory").length,
  document: fullGraph.nodes.filter((n) => n.kind === "document").length,
  space: fullGraph.nodes.filter((n) => n.kind === "space").length,
};

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/** Hand-built results so scores descend cleanly for the meter stories. */
export const searchResults: SearchResult[] = recentMemories
  .slice(0, 5)
  .map((m, i) => ({
    id: m.id,
    memory: m.memory,
    similarity: 0.91 - i * 0.07,
    updatedAt: m.updatedAt,
    version: m.version,
    filepath: null,
    metadata: m.metadata,
  }));

/* ------------------------------------------------------------------ */
/* Chart-shaped slices                                                 */
/* ------------------------------------------------------------------ */

export const activityLabels = ACTIVITY.map((a) => a.date.slice(5));

export const activitySeries = [
  {
    key: "documents",
    label: "Documents",
    color: "var(--color-s1)",
    values: ACTIVITY.map((a) => a.documents),
  },
  {
    key: "memories",
    label: "Memories",
    color: "var(--color-s3)",
    values: ACTIVITY.map((a) => a.memories),
  },
];

/** Space membership, largest first — the bar-rows shape. */
export const spaceRows = SPACES.map((s) => ({
  label: s.name,
  value: DOCUMENTS.filter((d) => d.containerTags.includes(s.containerTag))
    .length,
  hint: s.description,
})).sort((a, b) => b.value - a.value);

/** Pipeline breakdown using the reserved status palette. */
export const pipelineSegments = [
  {
    label: "Indexed",
    value: DOCUMENTS.filter((d) => d.status === "done").length,
    color: "var(--color-good)",
  },
  {
    label: "In flight",
    value: DOCUMENTS.filter((d) =>
      ["queued", "extracting", "chunking", "embedding", "indexing"].includes(
        d.status,
      ),
    ).length,
    color: "var(--warning-status)",
  },
  {
    label: "Failed",
    value: DOCUMENTS.filter((d) => d.status === "failed").length,
    color: "var(--color-critical)",
  },
];
