/**
 * Types transcribed from the supermemory OpenAPI spec (v3.0.0,
 * https://api.supermemory.ai/v4/openapi). The local binary at
 * :6767 speaks the same contract, so these are what a real
 * self-hosted instance returns.
 */

export const DOCUMENT_STATUSES = [
  "unknown",
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "indexing",
  "done",
  "failed",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Stages a document walks through, in pipeline order. */
export const PIPELINE_STAGES = [
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "indexing",
  "done",
] as const;

export const DOCUMENT_TYPES = [
  "text",
  "pdf",
  "tweet",
  "google_doc",
  "google_slide",
  "google_sheet",
  "image",
  "video",
  "audio",
  "notion_doc",
  "webpage",
  "onedrive",
  "github_markdown",
  "granola",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SEARCH_MODES = ["memories", "hybrid", "documents"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const MEMORY_RELATIONS = ["updates", "extends", "derives"] as const;
export type MemoryRelation = (typeof MEMORY_RELATIONS)[number];

export const FILTER_TYPES = [
  "metadata",
  "numeric",
  "array_contains",
  "string_contains",
] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export const NUMERIC_OPERATORS = [">", "<", ">=", "<=", "="] as const;
export type NumericOperator = (typeof NUMERIC_OPERATORS)[number];

export type MetadataValue = string | number | boolean | null;
export type Metadata = Record<string, MetadataValue>;

/* ------------------------------------------------------------------ */
/* Documents (v3)                                                      */
/* ------------------------------------------------------------------ */

export interface Document {
  id: string;
  customId: string | null;
  title: string | null;
  summary: string | null;
  content: string;
  type: DocumentType;
  status: DocumentStatus;
  containerTags: string[];
  metadata: Metadata | null;
  url: string | null;
  filepath: string | null;
  connectionId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Not in the wire format — derived locally for the pipeline view. */
  chunkCount?: number;
  /**
   * Mock-only. Epoch ms the document entered the pipeline; the stage is
   * derived from elapsed time on read rather than advanced by a timer,
   * so ingestion still progresses on a serverless host whose process is
   * frozen between requests.
   */
  ingestStartedAt?: number;
}

export interface DocumentChunk {
  id: string;
  documentId?: string;
  content: string;
  position: number;
  score?: number;
  tokens?: number;
  type?: string;
  createdAt?: string;
}

export interface Pagination {
  currentPage: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface DocumentListResponse {
  memories: Document[];
  pagination: Pagination;
}

/* ------------------------------------------------------------------ */
/* Memory entries (v4)                                                 */
/* ------------------------------------------------------------------ */

export interface MemoryHistoryEntry {
  id: string;
  memory: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  parentMemoryId: string | null;
  rootMemoryId: string | null;
  isLatest: boolean;
  isForgotten: boolean;
}

export interface MemoryRelationEdge {
  targetId: string;
  relation: MemoryRelation;
}

export interface TemporalContext {
  /** ISO date the fact is understood to hold from. */
  validFrom?: string;
  validUntil?: string;
  /** Free-text hint the extractor attached, e.g. "as of Q3 planning". */
  note?: string;
}

export interface MemoryEntry {
  id: string;
  memory: string;
  version: number;
  isLatest: boolean;
  isForgotten: boolean;
  /** Asserted by the user rather than extracted from a document. */
  isStatic: boolean;
  /** Derived by the engine from other memories rather than read directly. */
  isInference: boolean | null;
  createdAt: string;
  updatedAt: string;
  spaceId: string;
  orgId: string;
  sourceCount: number;
  parentMemoryId: string | null;
  rootMemoryId: string | null;
  forgetAfter: string | null;
  forgetReason: string | null;
  metadata: Metadata | null;
  memoryRelations: MemoryRelationEdge[] | null;
  temporalContext: TemporalContext | null;
  history: MemoryHistoryEntry[];
  documentIds: string[];
}

export interface MemoryListResponse {
  memoryEntries: MemoryEntry[];
  pagination: Pagination;
}

/* ------------------------------------------------------------------ */
/* Search (v4)                                                         */
/* ------------------------------------------------------------------ */

export interface SearchContextNode {
  relation: string;
  memory: string;
  version?: number | null;
  metadata?: Metadata | null;
  updatedAt: string;
}

export interface SearchResultDocument {
  id: string;
  title: string;
  type: DocumentType;
  summary: string | null;
  metadata: Metadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultChunk {
  content: string;
  score: number;
  position: number;
  documentId: string;
}

export interface SearchResult {
  id: string;
  memory: string;
  chunk?: string;
  similarity: number;
  updatedAt: string;
  version: number | null;
  filepath: string | null;
  metadata: Metadata | null;
  isAggregated?: boolean;
  context?: {
    parents: SearchContextNode[];
    children: SearchContextNode[];
    related: SearchContextNode[];
  };
  documents?: SearchResultDocument[];
  chunks?: SearchResultChunk[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  timing: number;
}

export interface SearchRequest {
  q: string;
  containerTags?: string[];
  searchMode?: SearchMode;
  limit?: number;
  threshold?: number;
  rerank?: boolean;
  rewriteQuery?: boolean;
  aggregate?: boolean;
  include?: {
    documents?: boolean;
    summaries?: boolean;
    relatedMemories?: boolean;
    forgottenMemories?: boolean;
    chunks?: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Profile (v4)                                                        */
/* ------------------------------------------------------------------ */

export interface ProfileResponse {
  profile: {
    static: string[];
    dynamic: string[];
    buckets?: Record<string, string[]>;
  };
  searchResults?: {
    results: SearchResult[];
    total: number;
    timing: number;
  };
}

export interface ProfileBucket {
  key: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/* Container tags / spaces (v3)                                        */
/* ------------------------------------------------------------------ */

export interface ContainerTag {
  containerTag: string;
  /** Human label the UI keeps alongside the raw tag. */
  name: string;
  description: string;
  documentCount: number;
  memoryCount: number;
  createdAt: string;
  updatedAt: string;
  settings: {
    shouldLLMFilter: boolean | null;
    filterPrompt: string | null;
    chunkSize: number | null;
    includeItems: string[];
    excludeItems: string[];
  };
}

export interface MergeStatus {
  mergeId: string;
  status: "queued" | "running" | "done" | "failed";
  source: string;
  target: string;
  movedDocuments: number;
  movedMemories: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Settings (v3)                                                       */
/* ------------------------------------------------------------------ */

export interface OrgSettings {
  shouldLLMFilter: boolean | null;
  filterPrompt: string | null;
  chunkSize: number | null;
  includeItems: string[];
  excludeItems: string[];
  workspacePrompt: string | null;
  profileBuckets: ProfileBucket[];
}

/* ------------------------------------------------------------------ */
/* Server health — self-hosted only                                    */
/* ------------------------------------------------------------------ */

export interface ServerInfo {
  version: string | null;
  mode: "local" | "cloud";
  baseUrl: string;
  port: number | null;
  uptimeSeconds: number | null;
  embeddings: {
    provider: string;
    model: string;
    dimensions: number;
    local: boolean;
  } | null;
  /**
   * The extraction model. `model` and `baseUrl` are null when the provider is
   * known but its model was left at the server's own default.
   */
  llm: { provider: string; model: string | null; baseUrl: string | null } | null;
  storage: {
    engine: string;
    sizeBytes: number;
    path: string;
  } | null;
  features: Record<string, boolean>;
  /** Present on /health — distinguishes mock vs proxied backends. */
  backend?: "mock" | "remote";
  /**
   * Where the runtime facts above came from. The Memory API publishes no
   * runtime metadata, so against a live instance most of this block is either
   * derived from the proxy target or read off the local disk.
   *
   * - `mock`    — the bundled backend, which makes all of it up.
   * - `derived` — inferred from `SUPERMEMORY_URL`; version, uptime, models
   *               and storage stay null.
   * - `disk`    — read from the install directory named by
   *               `SUPERMEMORY_LOCAL_DIR`.
   */
  runtimeSource?: "mock" | "derived" | "disk";
  /** The install directory that was read, when `runtimeSource` is `disk`. */
  runtimeSourceDir?: string | null;
}

/* ------------------------------------------------------------------ */
/* Graph — assembled client-side from memories + documents + spaces    */
/* ------------------------------------------------------------------ */

export type GraphNodeKind = "memory" | "document" | "space";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Relative weight — sourceCount for memories, chunkCount for docs. */
  weight: number;
  spaceId: string;
  forgotten?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: MemoryRelation | "sources" | "contains";
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
