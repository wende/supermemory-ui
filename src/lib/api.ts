/**
 * Thin client for the supermemory API.
 *
 * Always talks to this app's `/api/*` routes. Point those at a real
 * instance with server-only SUPERMEMORY_URL / SUPERMEMORY_KEY — the
 * route handlers proxy and adapt shapes so the browser never sees the
 * key and never hits the remote origin directly.
 */

import type {
  ContainerTag,
  Document,
  DocumentChunk,
  DocumentListResponse,
  GraphResponse,
  MemoryEntry,
  MemoryListResponse,
  MergeStatus,
  OrgSettings,
  ProfileResponse,
  SearchRequest,
  SearchResponse,
  ServerInfo,
} from "./types";

const BASE = "/api";

/** Always `/api` — remote vs mock is decided server-side. */
export const API_BASE = BASE;

/** @deprecated Prefer health.backend; kept for pages that still import it. */
export const IS_MOCK = true;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("content-type", "application/json");

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });

  const text = await res.text();
  const parsed = text ? safeParse(text) : null;

  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ??
      `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg, (parsed as { code?: string } | null)?.code);
  }
  return parsed as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/* ------------------------------------------------------------------ */

export interface Stats {
  documents: number;
  memories: number;
  forgotten: number;
  inferences: number;
  staticFacts: number;
  versioned: number;
  relations: number;
  chunks: number | null;
  processing: number;
  failed: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  activity: { date: string; documents: number; memories: number }[];
  latencies: number[];
  vectorBytes: number | null;
  server: ServerInfo;
  spaces: ContainerTag[];
}

export const api = {
  /* dashboard + health ------------------------------------------- */
  stats: () => call<Stats>("/stats"),
  health: () =>
    call<
      ServerInfo & {
        status: string;
        backend?: "mock" | "remote";
        remoteConfigured?: boolean;
      }
    >("/health"),

  /* documents ----------------------------------------------------- */
  listDocuments: (input: {
    containerTags?: string[];
    q?: string;
    types?: string[];
    statuses?: string[];
    includeContent?: boolean;
    page?: number;
    limit?: number;
    sort?: "createdAt" | "updatedAt";
    order?: "asc" | "desc";
  }) => call<DocumentListResponse>("/v3/documents/list", { method: "POST", json: input }),

  getDocument: (id: string) => call<Document>(`/v3/documents/${id}`),

  getChunks: (id: string) =>
    call<{ documentId: string; chunks: DocumentChunk[]; count: number }>(
      `/v3/documents/${id}/chunks`,
    ),

  processing: () =>
    call<{ documents: Document[]; count: number }>("/v3/documents/processing"),

  addDocument: (input: {
    content?: string;
    title?: string;
    url?: string;
    type?: Document["type"];
    containerTags?: string[];
    metadata?: Document["metadata"];
  }) =>
    call<{ id: string; status: string; title: string }>("/v3/documents", {
      method: "POST",
      json: input,
    }),

  addBatch: (documents: { content: string; title?: string; containerTags?: string[] }[]) =>
    call<{ accepted: number; rejected: number }>("/v3/documents/batch", {
      method: "POST",
      json: { documents },
    }),

  uploadFile: (file: File, containerTags: string[]) => {
    const form = new FormData();
    form.append("file", file);
    form.append("containerTags", containerTags.join(","));
    return call<{ id: string; status: string; title: string }>("/v3/documents/file", {
      method: "POST",
      body: form,
    });
  },

  deleteDocument: (id: string) =>
    call<{ deleted: boolean }>(`/v3/documents/${id}`, { method: "DELETE" }),

  /* memories ------------------------------------------------------ */
  listMemories: (input: {
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
  }) => call<MemoryListResponse>("/v4/memories/list", { method: "POST", json: input }),

  createMemory: (input: {
    memory: string;
    containerTag?: string;
    isStatic?: boolean;
    metadata?: Record<string, string | number | boolean | null>;
  }) => call<MemoryEntry>("/v4/memories", { method: "POST", json: input }),

  updateMemory: (id: string, memory: string) =>
    call<MemoryEntry>("/v4/memories", { method: "PATCH", json: { id, memory } }),

  restoreMemory: (id: string) =>
    call<MemoryEntry>("/v4/memories", { method: "PATCH", json: { id, restore: true } }),

  forgetMemory: (id: string, reason?: string, containerTag?: string) =>
    call<MemoryEntry>("/v4/memories", {
      method: "DELETE",
      json: { id, reason, containerTag },
    }),

  forgetMatching: (input: {
    prompt?: string;
    ids?: string[];
    reason?: string;
    dryRun?: boolean;
    containerTag?: string;
  }) =>
    call<{
      dryRun: boolean;
      count: number;
      memories: MemoryEntry[];
      summary?: string;
      summaries?: string[];
      forgetBatchId?: string | null;
      forgetBatchIds?: string[];
    }>("/v4/memories/forget-matching", { method: "POST", json: input }),

  /** Persist a keep / discard / undo on an inferred memory. */
  reviewInferred: (
    containerTag: string,
    memoryId: string,
    action: "approve" | "decline" | "undo",
  ) =>
    call<{
      id: string;
      isInference: boolean;
      isForgotten: boolean;
      reviewStatus: "approved" | "declined" | null;
    }>(
      `/v3/container-tags/${encodeURIComponent(containerTag)}/inferred/${encodeURIComponent(memoryId)}/review`,
      { method: "POST", json: { action } },
    ),

  /* search -------------------------------------------------------- */
  search: (input: SearchRequest) =>
    call<SearchResponse>("/v4/search", { method: "POST", json: input }),

  /* profile ------------------------------------------------------- */
  profile: (input: {
    q?: string;
    containerTag?: string;
    include?: ("static" | "dynamic" | "buckets")[];
    buckets?: string[];
  } = {}) => call<ProfileResponse>("/v4/profile", { method: "POST", json: input }),

  /* spaces -------------------------------------------------------- */
  spaces: () =>
    call<{ containerTags: ContainerTag[]; merges: MergeStatus[] }>("/v3/container-tags"),

  updateSpace: (
    tag: string,
    patch: Partial<ContainerTag["settings"]> & { description?: string },
  ) => call<ContainerTag>(`/v3/container-tags/${tag}`, { method: "PATCH", json: patch }),

  deleteSpace: (tag: string) =>
    call<{ deleted: boolean }>(`/v3/container-tags/${tag}`, { method: "DELETE" }),

  mergeSpaces: (source: string, target: string) =>
    call<MergeStatus>("/v3/container-tags/merge", {
      method: "POST",
      json: { source, target },
    }),

  /* settings ------------------------------------------------------ */
  settings: () => call<OrgSettings>("/v3/settings"),

  updateSettings: (patch: Partial<OrgSettings>) =>
    call<{ updated: OrgSettings }>("/v3/settings", { method: "PATCH", json: patch }),

  suggestBuckets: () =>
    call<{ buckets: { key: string; description: string }[] }>(
      "/v3/settings/suggest-buckets",
      { method: "POST" },
    ),

  reset: () =>
    call<{ reset: boolean; removed: { documents: number; memories: number } }>(
      "/v3/settings/reset",
      { method: "POST", json: { confirm: "RESET" } },
    ),

  /* graph --------------------------------------------------------- */
  graph: (opts: { containerTags?: string[]; documents?: boolean; forgotten?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.containerTags?.length) p.set("containerTags", opts.containerTags.join(","));
    if (opts.documents === false) p.set("documents", "false");
    if (opts.forgotten) p.set("forgotten", "true");
    const qs = p.toString();
    return call<GraphResponse>(`/v4/graph${qs ? `?${qs}` : ""}`);
  },

  /** Raw passthrough for the API explorer. */
  raw: async (method: string, path: string, jsonBody?: unknown) => {
    const started = performance.now();
    const headers = new Headers();
    if (jsonBody !== undefined) headers.set("content-type", "application/json");
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    return {
      status: res.status,
      ms: Math.round(performance.now() - started),
      body: text ? safeParse(text) : null,
    };
  },
};
