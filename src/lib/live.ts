/**
 * Server-side aggregators that rebuild mock-only endpoints from the live API.
 */

import { REMOTE, proxyJson, recentLatencies } from "./remote";
import {
  localInstanceConfigured,
  localInstanceDir,
  readLocalInstance,
} from "./local-instance";
import { spaceDisplayName } from "./format";
import { resolveTags } from "./tags";
import type {
  ContainerTag,
  Document,
  DocumentListResponse,
  GraphEdge,
  GraphNode,
  GraphResponse,
  MemoryEntry,
  MemoryListResponse,
  MemoryRelation,
  ServerInfo,
} from "./types";

/** How far through the remote memory crawl a graph build has gotten. */
export type CorpusProgress = { loaded: number; total: number };

async function pageAllDocuments(): Promise<Document[]> {
  const out: Document[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 50) {
    const { ok, data } = await proxyJson<DocumentListResponse>("/v3/documents/list", {
      method: "POST",
      json: { page, limit: 100 },
    });
    if (!ok || !data?.memories) break;
    out.push(...data.memories);
    totalPages = data.pagination?.totalPages ?? 1;
    page += 1;
  }
  return out;
}

async function pageAllMemories(
  tags: string[],
  onProgress?: (progress: CorpusProgress) => void,
): Promise<MemoryEntry[]> {
  if (!tags.length) {
    onProgress?.({ loaded: 0, total: 0 });
    return [];
  }
  // Fetch per tag so we can stamp the human containerTag onto spaceId.
  // The live API returns opaque internal space IDs (e.g. qvZATN…), which
  // otherwise never match tag filters in the graph / spaces aggregators.
  //
  // Tags are probed in parallel for totals, then drained sequentially so
  // `loaded` climbs monotonically and the UI meter can track real pages.
  const probes = await Promise.all(
    tags.map(async (tag) => {
      const { ok, data } = await proxyJson<MemoryListResponse>(
        "/v4/memories/list",
        {
          method: "POST",
          json: { containerTags: [tag], page: 1, limit: 100 },
        },
      );
      return { tag, ok, data };
    }),
  );

  let total = 0;
  for (const { ok, data } of probes) {
    if (!ok || !data) continue;
    total += data.pagination?.totalItems ?? data.memoryEntries?.length ?? 0;
  }

  const byId = new Map<string, MemoryEntry>();
  let loaded = 0;
  const report = () =>
    onProgress?.({ loaded, total: Math.max(total, loaded) });

  // Publish the denominator before the first page lands so the meter opens
  // at 0/N instead of an unknown wait.
  report();

  for (const { tag, ok, data: first } of probes) {
    if (!ok || !first?.memoryEntries) continue;

    for (const entry of normalizeMemories(first.memoryEntries, tag)) {
      byId.set(entry.id, entry);
    }
    loaded += first.memoryEntries.length;
    report();

    let page = 2;
    let totalPages = first.pagination?.totalPages ?? 1;
    while (page <= totalPages && page <= 50) {
      const { ok: pageOk, data } = await proxyJson<MemoryListResponse>(
        "/v4/memories/list",
        {
          method: "POST",
          json: { containerTags: [tag], page, limit: 100 },
        },
      );
      if (!pageOk || !data?.memoryEntries) break;
      for (const entry of normalizeMemories(data.memoryEntries, tag)) {
        byId.set(entry.id, entry);
      }
      loaded += data.memoryEntries.length;
      totalPages = data.pagination?.totalPages ?? totalPages;
      report();
      page += 1;
    }
  }

  return Array.from(byId.values());
}

/** Live API returns memoryRelations as `{ [targetId]: relation }` — normalize. */
export function normalizeMemoryRelations(
  rels: MemoryEntry["memoryRelations"] | Record<string, string> | null | undefined,
): MemoryEntry["memoryRelations"] {
  if (!rels) return null;
  if (Array.isArray(rels)) return rels.length ? rels : null;
  if (typeof rels === "object") {
    const edges = Object.entries(rels as Record<string, string>).map(
      ([targetId, relation]) => ({
        targetId,
        relation: relation as MemoryRelation,
      }),
    );
    return edges.length ? edges : null;
  }
  return null;
}

/**
 * Live memories use opaque spaceId values, not container tags. When we know
 * the tag used to fetch them, stamp it. Also coerce relation shape.
 */
export function normalizeMemoryEntry(
  m: MemoryEntry,
  spaceTag?: string,
): MemoryEntry {
  const any = m as MemoryEntry & {
    containerTags?: string[];
    containerTag?: string;
    memoryRelations?: MemoryEntry["memoryRelations"] | Record<string, string>;
  };
  const spaceId =
    spaceTag ||
    any.containerTag ||
    any.containerTags?.[0] ||
    m.spaceId ||
    "unknown";
  return {
    ...m,
    spaceId,
    memoryRelations: normalizeMemoryRelations(any.memoryRelations),
    documentIds: Array.isArray(m.documentIds) ? m.documentIds : [],
  };
}

function normalizeMemories(
  entries: MemoryEntry[],
  spaceTag?: string,
): MemoryEntry[] {
  return entries.map((m) => normalizeMemoryEntry(m, spaceTag));
}

const EMPTY_SETTINGS: ContainerTag["settings"] = {
  shouldLLMFilter: null,
  filterPrompt: null,
  chunkSize: null,
  includeItems: [],
  excludeItems: [],
};

async function buildSpaces(
  tags: string[],
  docs: Document[],
  mems: MemoryEntry[],
): Promise<ContainerTag[]> {
  const spaces: ContainerTag[] = await Promise.all(
    tags.map(async (tag) => {
      const { ok, data } = await proxyJson<
        Partial<ContainerTag> & { settings?: ContainerTag["settings"] }
      >(`/v3/container-tags/${encodeURIComponent(tag)}`);
      const settings =
        ok && data?.settings ? { ...EMPTY_SETTINGS, ...data.settings } : EMPTY_SETTINGS;
      const now = new Date().toISOString();
      return {
        containerTag: tag,
        name: spaceDisplayName(
          (data as { name?: string } | undefined)?.name ?? tag,
          tag,
        ),
        description: (data as { description?: string } | undefined)?.description ?? "",
        documentCount: docs.filter((d) => d.containerTags?.includes(tag)).length,
        memoryCount: mems.filter((m) => m.spaceId === tag && !m.isForgotten).length,
        createdAt: (data as { createdAt?: string } | undefined)?.createdAt ?? now,
        updatedAt: (data as { updatedAt?: string } | undefined)?.updatedAt ?? now,
        settings,
      };
    }),
  );
  return spaces;
}

/** Shared remote corpus snapshot for aggregators. */
async function loadCorpus(onProgress?: (progress: CorpusProgress) => void) {
  const tags = await resolveTags();
  // Memories first so progress events reflect the crawl the UI labels as
  // "Loading memories"; documents are a smaller follow-up pass.
  const mems = await pageAllMemories(tags, onProgress);
  const docs = await pageAllDocuments();
  const spaces = await buildSpaces(tags, docs, mems);
  return { tags, docs, mems, spaces };
}

export async function liveSpaces(): Promise<{
  containerTags: ContainerTag[];
  merges: [];
}> {
  const { spaces } = await loadCorpus();
  return { containerTags: spaces, merges: [] };
}

/**
 * What the proxy alone can say about the instance. The Memory API publishes no
 * runtime metadata — no version, uptime, model or storage endpoint — so
 * everything here is derived from the URL we were pointed at, and the rest
 * stays null until `readLocalInstance()` can fill it in.
 */
export function remoteServerInfo(partial?: Partial<ServerInfo>): ServerInfo {
  const url = REMOTE!.url;
  let port: number | null = null;
  let mode: ServerInfo["mode"] = "local";
  try {
    const u = new URL(url);
    port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    mode = /(^|\.)supermemory\.ai$/i.test(u.hostname) ? "cloud" : "local";
  } catch {
    port = null;
  }
  return {
    version: null,
    mode,
    baseUrl: url,
    port,
    uptimeSeconds: null,
    embeddings: null,
    llm: null,
    storage: null,
    // Not a probe: the documented Memory API surface, minus the connectors
    // that /docs/self-hosting/local-vs-enterprise lists as platform-only.
    features: {
      ingest: true,
      memoryExtraction: true,
      hybridSearch: true,
      profiles: true,
      spaces: true,
      fileIngest: true,
      graph: true,
      connectors: mode === "cloud",
    },
    backend: "remote",
    runtimeSource: "derived",
    runtimeSourceDir: null,
    ...partial,
  };
}

/**
 * `remoteServerInfo` plus whatever the install directory can tell us, when the
 * console runs on the same machine as the server and `SUPERMEMORY_LOCAL_DIR`
 * points at it. Falls back to the derived view when it does not.
 */
export async function liveServerInfo(): Promise<ServerInfo> {
  const base = remoteServerInfo();
  if (!localInstanceConfigured()) return base;

  const local = await readLocalInstance();
  // Configured but unreadable: keep the derived view, but name the directory
  // we tried so the console can say so rather than repeat the setup hint.
  if (!local) return { ...base, runtimeSourceDir: localInstanceDir() };

  return {
    ...base,
    version: local.version,
    uptimeSeconds: local.uptimeSeconds,
    embeddings: local.embeddings,
    llm: local.llm,
    storage: local.storage,
    runtimeSource: "disk",
    runtimeSourceDir: local.dir,
  };
}

export async function liveStats() {
  const [{ docs, mems, spaces }, server] = await Promise.all([
    loadCorpus(),
    liveServerInfo(),
  ]);

  const statuses = [
    "queued",
    "extracting",
    "chunking",
    "embedding",
    "indexing",
    "done",
    "failed",
  ];
  const byStatus = Object.fromEntries(
    statuses.map((s) => [s, docs.filter((d) => d.status === s).length]),
  ) as Record<string, number>;

  const byType: Record<string, number> = {};
  for (const doc of docs) byType[doc.type] = (byType[doc.type] ?? 0) + 1;

  const dayKey = (iso: string) => iso.slice(0, 10);
  const activityMap = new Map<string, { documents: number; memories: number }>();
  for (const doc of docs) {
    const k = dayKey(doc.createdAt);
    const cur = activityMap.get(k) ?? { documents: 0, memories: 0 };
    cur.documents += 1;
    activityMap.set(k, cur);
  }
  for (const m of mems) {
    const k = dayKey(m.createdAt);
    const cur = activityMap.get(k) ?? { documents: 0, memories: 0 };
    cur.memories += 1;
    activityMap.set(k, cur);
  }
  const activity = Array.from(activityMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  return {
    documents: docs.length,
    memories: mems.filter((m) => !m.isForgotten).length,
    forgotten: mems.filter((m) => m.isForgotten).length,
    inferences: mems.filter((m) => m.isInference && !m.isForgotten).length,
    staticFacts: mems.filter((m) => m.isStatic && !m.isForgotten).length,
    versioned: mems.filter((m) => (m.version ?? 1) > 1).length,
    relations: mems.reduce((n, m) => n + (m.memoryRelations?.length ?? 0), 0),
    chunks: null as number | null,
    spaces: spaces.length,
    processing: docs.filter((d) => d.status !== "done" && d.status !== "failed").length,
    failed: byStatus.failed ?? 0,
    byStatus,
    byType,
    activity,
    latencies: recentLatencies(),
    vectorBytes: null as number | null,
    server,
    spacesList: spaces,
  };
}

export async function liveHealth() {
  const started = performance.now();
  const { ok } = await proxyJson("/v3/documents/list", {
    method: "POST",
    json: { limit: 1 },
  });
  const latencyMs = Math.round(performance.now() - started);
  const rollup = await liveStats();
  return {
    status: ok ? "ok" : "degraded",
    ...rollup.server,
    latencyMs,
    counts: {
      documents: rollup.documents,
      memories: rollup.memories,
      forgotten: rollup.forgotten,
      chunks: rollup.chunks,
      spaces: rollup.spaces,
    },
  };
}

export async function liveGraph(
  opts: {
    containerTags?: string[];
    includeDocuments?: boolean;
    includeForgotten?: boolean;
  },
  onProgress?: (progress: CorpusProgress) => void,
): Promise<GraphResponse> {
  const { tags: allTags, docs, mems: allMems } = await loadCorpus(onProgress);
  const tags = opts.containerTags?.length ? opts.containerTags : allTags;
  const mems = allMems.filter(
    (m) =>
      tags.includes(m.spaceId) &&
      (opts.includeForgotten || !m.isForgotten),
  );

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const memIds = new Set(mems.map((m) => m.id));
  for (const m of mems) {
    nodes.push({
      id: m.id,
      kind: "memory",
      label: m.memory,
      weight: 1 + (m.sourceCount ?? 0),
      spaceId: m.spaceId,
      forgotten: m.isForgotten,
    });
    // Membership is shown via territory blobs; no space hub / contains edges.
    for (const rel of m.memoryRelations ?? []) {
      if (memIds.has(rel.targetId)) {
        edges.push({
          source: m.id,
          target: rel.targetId,
          relation: rel.relation as MemoryRelation,
        });
      }
    }
  }

  if (opts.includeDocuments !== false) {
    const referenced = new Set(mems.flatMap((m) => m.documentIds ?? []));
    for (const doc of docs) {
      if (!referenced.has(doc.id)) continue;
      if (!doc.containerTags?.some((t) => tags.includes(t))) continue;
      nodes.push({
        id: doc.id,
        kind: "document",
        label: doc.title ?? "Untitled",
        weight: 1 + (doc.chunkCount ?? 0) / 4,
        spaceId: doc.containerTags?.[0],
      });
    }
    for (const m of mems) {
      for (const docId of m.documentIds ?? []) {
        if (referenced.has(docId)) {
          edges.push({ source: docId, target: m.id, relation: "sources" });
        }
      }
    }
  }

  const present = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: edges.filter((e) => present.has(e.source) && present.has(e.target)),
  };
}

/** Map thin forget candidates into something the forget page can render. */
export function mapForgetMemories(
  items: { id?: string; memory?: string; score?: number }[] | undefined,
  spaceId = "unknown",
): MemoryEntry[] {
  if (!items?.length) return [];
  const now = new Date().toISOString();
  return items.map((c) => ({
    id: c.id ?? "unknown",
    memory: c.memory ?? "",
    version: 1,
    isLatest: true,
    isForgotten: false,
    isStatic: false,
    isInference: null,
    createdAt: now,
    updatedAt: now,
    spaceId,
    orgId: "remote",
    sourceCount: 0,
    parentMemoryId: null,
    rootMemoryId: c.id ?? null,
    forgetAfter: null,
    forgetReason: null,
    metadata: c.score != null ? { score: c.score } : null,
    memoryRelations: null,
    temporalContext: null,
    history: [],
    documentIds: [],
  }));
}
