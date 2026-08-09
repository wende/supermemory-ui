/**
 * The documented supermemory surface, transcribed from the OpenAPI spec.
 *
 * `mocked` marks the endpoints this demo implements. The rest are listed
 * so the console shows the whole API, not just the part it exercises —
 * set SUPERMEMORY_URL to proxy unmocked explorer paths to a live instance.
 */

export interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  group: string;
  summary: string;
  mocked: boolean;
  /** Local-only convenience route, not part of the documented API. */
  local?: boolean;
  sample?: unknown;
}

export const ENDPOINTS: Endpoint[] = [
  /* Ingest */
  {
    method: "POST",
    path: "/v3/documents",
    group: "Ingest",
    summary: "Add a document",
    mocked: true,
    sample: {
      content: "Deploys are frozen from Dec 20 to Jan 3.",
      title: "Deploy freeze",
      containerTags: ["sm_personal"],
    },
  },
  {
    method: "POST",
    path: "/v3/documents/batch",
    group: "Ingest",
    summary: "Batch add documents",
    mocked: true,
    sample: {
      documents: [
        { content: "First document body.", containerTags: ["sm_personal"] },
        { content: "Second document body.", containerTags: ["sm_personal"] },
      ],
    },
  },
  {
    method: "POST",
    path: "/v3/documents/file",
    group: "Ingest",
    summary: "Upload a file (multipart)",
    mocked: true,
  },
  {
    method: "PATCH",
    path: "/v3/documents/{id}",
    group: "Ingest",
    summary: "Update a document",
    mocked: false,
  },
  {
    method: "DELETE",
    path: "/v3/documents/{id}",
    group: "Ingest",
    summary: "Delete by id or customId",
    mocked: true,
  },
  {
    method: "DELETE",
    path: "/v3/documents/bulk",
    group: "Ingest",
    summary: "Bulk delete documents",
    mocked: false,
  },
  {
    method: "POST",
    path: "/v4/conversations",
    group: "Ingest",
    summary: "Ingest or update a conversation",
    mocked: false,
    sample: {
      conversationId: "conv_1",
      messages: [{ role: "user", content: "Remember I prefer async reviews." }],
    },
  },

  /* Documents */
  {
    method: "POST",
    path: "/v3/documents/list",
    group: "Documents",
    summary: "List documents",
    mocked: true,
    sample: { limit: 5, includeContent: false, sort: "createdAt", order: "desc" },
  },
  {
    method: "GET",
    path: "/v3/documents/processing",
    group: "Documents",
    summary: "Documents still in the pipeline",
    mocked: true,
  },
  {
    method: "GET",
    path: "/v3/documents/{id}",
    group: "Documents",
    summary: "Get a document",
    mocked: true,
  },
  {
    method: "GET",
    path: "/v3/documents/{id}/chunks",
    group: "Documents",
    summary: "Chunks in position order",
    mocked: true,
  },
  {
    method: "GET",
    path: "/v3/documents/{id}/file-url",
    group: "Documents",
    summary: "Presigned file URL",
    mocked: false,
  },
  {
    method: "POST",
    path: "/v3/search",
    group: "Documents",
    summary: "Search documents (v3)",
    mocked: false,
    sample: { q: "how I like to work", limit: 5 },
  },

  /* Recall */
  {
    method: "POST",
    path: "/v4/search",
    group: "Recall",
    summary: "Search memory entries",
    mocked: true,
    sample: {
      q: "why did we stop using random jitter",
      searchMode: "hybrid",
      limit: 5,
      rerank: true,
      include: { documents: true, chunks: true, relatedMemories: true },
    },
  },

  /* Memories */
  {
    method: "POST",
    path: "/v4/memories/list",
    group: "Memories",
    summary: "List entries with history",
    mocked: true,
    sample: { limit: 5, sort: "updatedAt", order: "desc" },
  },
  {
    method: "POST",
    path: "/v4/memories",
    group: "Memories",
    summary: "Create a memory directly",
    mocked: true,
    sample: {
      memory: "The team runs retros on the last Thursday of the month.",
      containerTag: "sm_personal",
      isStatic: true,
    },
  },
  {
    method: "PATCH",
    path: "/v4/memories",
    group: "Memories",
    summary: "Update — creates a new version",
    mocked: true,
    sample: { id: "mem_0010000", memory: "Revised wording." },
  },
  {
    method: "DELETE",
    path: "/v4/memories",
    group: "Memories",
    summary: "Forget a memory",
    mocked: true,
    sample: { id: "mem_0010000", reason: "No longer true." },
  },
  {
    method: "POST",
    path: "/v4/memories/forget-matching",
    group: "Memories",
    summary: "Forget everything matching a prompt",
    mocked: true,
    sample: {
      prompt: "anything about my old apartment address",
      dryRun: true,
    },
  },

  /* Profiles */
  {
    method: "POST",
    path: "/v4/profile",
    group: "Profiles",
    summary: "Get the user profile",
    mocked: true,
    sample: { include: ["static", "dynamic", "buckets"] },
  },
  {
    method: "POST",
    path: "/v4/profile/buckets",
    group: "Profiles",
    summary: "Get profile buckets",
    mocked: true,
    sample: {},
  },

  /* Container tags */
  {
    method: "GET",
    path: "/v3/container-tags/{containerTag}",
    group: "Container tags",
    summary: "Get tag settings",
    mocked: true,
  },
  {
    method: "PATCH",
    path: "/v3/container-tags/{containerTag}",
    group: "Container tags",
    summary: "Update tag settings",
    mocked: true,
    sample: { chunkSize: 1400, shouldLLMFilter: true },
  },
  {
    method: "DELETE",
    path: "/v3/container-tags/{containerTag}",
    group: "Container tags",
    summary: "Delete a tag and its contents",
    mocked: true,
  },
  {
    method: "POST",
    path: "/v3/container-tags/merge",
    group: "Container tags",
    summary: "Merge one tag into another",
    mocked: true,
    sample: { source: "sm_meetings", target: "sm_project_orbital" },
  },
  {
    method: "GET",
    path: "/v3/container-tags/merge/{mergeId}",
    group: "Container tags",
    summary: "Merge status",
    mocked: false,
  },

  /* Settings */
  {
    method: "GET",
    path: "/v3/settings",
    group: "Settings",
    summary: "Get org settings",
    mocked: true,
  },
  {
    method: "PATCH",
    path: "/v3/settings",
    group: "Settings",
    summary: "Update org settings",
    mocked: true,
    sample: { chunkSize: 1200, shouldLLMFilter: true },
  },
  {
    method: "POST",
    path: "/v3/settings/suggest-buckets",
    group: "Settings",
    summary: "Suggest profile buckets",
    mocked: true,
    sample: {},
  },
  {
    method: "POST",
    path: "/v3/settings/reset",
    group: "Settings",
    summary: "Reset organisation data",
    mocked: true,
    sample: { confirm: "RESET" },
  },

  /* Local extensions */
  {
    method: "GET",
    path: "/health",
    group: "Instance",
    summary: "Health and instance metadata",
    mocked: true,
    local: true,
  },
  {
    method: "GET",
    path: "/stats",
    group: "Instance",
    summary: "Dashboard rollup",
    mocked: true,
    local: true,
  },
  {
    method: "GET",
    path: "/v3/container-tags",
    group: "Instance",
    summary: "List every container tag",
    mocked: true,
    local: true,
  },
  {
    method: "GET",
    path: "/v4/graph",
    group: "Instance",
    summary: "Memory graph nodes and edges",
    mocked: true,
    local: true,
  },
];

export const METHOD_COLOR: Record<Endpoint["method"], string> = {
  GET: "var(--color-s3)",
  POST: "var(--color-s1)",
  PATCH: "var(--color-s4)",
  DELETE: "var(--color-critical)",
};
