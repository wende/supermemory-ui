import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import * as z from "zod";
import {
  createMemory,
  listMemoriesAcrossSpaces,
  localApi,
  resolveRepositorySpace,
} from "./lib.mjs";

const PORT = Number(process.env.SUPERMEMORY_MCP_PORT ?? "6768");
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
// This bridge has no client authentication. Keep it loopback-only and let the
// SDK install its localhost Host-header validation.
const HOST = "127.0.0.1";
function result(data, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) };
}

async function ingestDocument({ content, containerTag, sourcePath, title, customId, source }) {
  const response = await localApi("/v3/documents", {
    content,
    containerTag,
    ...(customId ? { customId } : {}),
    metadata: {
      sm_source: source,
      document_kind: "repository-source",
      ...(sourcePath ? { source_path: sourcePath } : {}),
      ...(title ? { title } : {}),
    },
  });
  invalidateSpacesCache();
  return response;
}

const SPACES_CACHE_TTL_MS = 15_000;
let spacesCache = null;
let spacesInFlight = null;

function invalidateSpacesCache() {
  spacesCache = null;
}

async function loadSpaces() {
  const spaces = new Map();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 50) {
    const response = await localApi("/v3/documents/list", { page, limit: 100 });
    for (const document of response.memories ?? []) {
      for (const containerTag of document.containerTags ?? []) {
        if (!containerTag) continue;
        const existing = spaces.get(containerTag) ?? {
          containerTag,
          documentCount: 0,
          latestActivity: null,
        };
        existing.documentCount += 1;
        if (!existing.latestActivity || document.updatedAt > existing.latestActivity) {
          existing.latestActivity = document.updatedAt;
        }
        spaces.set(containerTag, existing);
      }
    }
    totalPages = response.pagination?.totalPages ?? 1;
    page += 1;
  }

  const entries = await Promise.all(
    Array.from(spaces.values()).map(async (space) => {
      const memories = await localApi("/v4/memories/list", {
        containerTags: [space.containerTag],
        page: 1,
        limit: 1,
      });
      return {
        ...space,
        memoryCount: memories.pagination?.totalItems ?? memories.memoryEntries?.length ?? 0,
      };
    }),
  );
  return entries.sort((a, b) => a.containerTag.localeCompare(b.containerTag));
}

async function discoverSpaces() {
  if (spacesCache && Date.now() - spacesCache.cachedAt < SPACES_CACHE_TTL_MS) {
    return spacesCache.entries;
  }
  if (spacesInFlight) return spacesInFlight;

  spacesInFlight = loadSpaces()
    .then((entries) => {
      spacesCache = { cachedAt: Date.now(), entries };
      return entries;
    })
    .finally(() => {
      spacesInFlight = null;
    });
  return spacesInFlight;
}

function createServer() {
  const server = new McpServer({
    name: "supermemory-local",
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    "search_memory",
    {
      title: "Search local memory",
      description: "Search memories stored by the local Supermemory instance.",
      inputSchema: {
        query: z.string().min(1),
        containerTag: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
        searchMode: z.enum(["memories", "hybrid", "documents"]).optional().describe("Use memories to match the console's Semantic Memory-bank default; hybrid includes source-document retrieval."),
        threshold: z.number().min(0).max(1).optional(),
        rerank: z.boolean().optional(),
      },
    },
    async ({ query, containerTag, limit = 10, searchMode = "memories", threshold, rerank }) => {
      try {
        const tags = containerTag ? [containerTag] : (await discoverSpaces()).map((space) => space.containerTag);
        const responses = await Promise.all(
          tags.map((tag) => localApi("/v4/search", {
            q: query,
            containerTag: tag,
            limit,
            searchMode,
            ...(threshold !== undefined ? { threshold } : {}),
            ...(rerank !== undefined ? { rerank } : {}),
          })),
        );
        const byId = new Map();
        let timing = 0;
        for (const response of responses) {
          timing = Math.max(timing, response.timing ?? 0);
          for (const entry of response.results ?? []) {
            const existing = byId.get(entry.id);
            if (!existing || (entry.similarity ?? 0) > (existing.similarity ?? 0)) byId.set(entry.id, entry);
          }
        }
        const results = Array.from(byId.values())
          .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
          .slice(0, limit);
        return result({ results, total: results.length, timing, searchMode, spacesSearched: tags });
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "listDocuments",
    {
      title: "List source documents",
      description: "Browse documents stored in the local Supermemory instance, including status and summaries. Set includeContent only when the full stored text is needed.",
      inputSchema: {
        containerTag: z.string().min(1).optional(),
        query: z.string().min(1).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        includeContent: z.boolean().optional(),
      },
    },
    async ({ containerTag, query, page, limit, includeContent }) => {
      try {
        return result(await localApi("/v3/documents/list", {
          ...(containerTag ? { containerTags: [containerTag] } : {}),
          ...(query ? { q: query } : {}),
          ...(page ? { page } : {}),
          ...(limit ? { limit } : {}),
          ...(includeContent ? { includeContent: true } : {}),
        }));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "getDocument",
    {
      title: "Get a source document",
      description: "Read one stored document's metadata, summary, and available content by document ID.",
      inputSchema: {
        documentId: z.string().min(1),
      },
    },
    async ({ documentId }) => {
      try {
        return result(await localApi(`/v3/documents/${encodeURIComponent(documentId)}`, undefined, "GET"));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "listMemories",
    {
      title: "List extracted memories",
      description: "Browse extracted memory entries, including versions and source document IDs. Without a containerTag, results are aggregated from all discovered local spaces.",
      inputSchema: {
        containerTag: z.string().min(1).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        includeForgotten: z.boolean().optional(),
      },
    },
    async ({ containerTag, page = 1, limit = 20, includeForgotten = false }) => {
      try {
        const tags = containerTag ? [containerTag] : (await discoverSpaces()).map((space) => space.containerTag);
        return result(await listMemoriesAcrossSpaces({
          containerTag,
          tags,
          page,
          limit,
          includeForgotten,
        }));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "listSpaces",
    {
      title: "List local memory spaces",
      description: "List spaces discovered from documents in the local Supermemory instance, with document and extracted-memory counts.",
      inputSchema: {},
    },
    async () => {
      try {
        const spaces = await discoverSpaces();
        return result({ spaces, count: spaces.length });
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "resolve_repo_space",
    {
      title: "Resolve a repository's memory space",
      description: "Derive the exact canonical Supermemory container tag for a local Git repository. The result matches Codex and Claude Code capture hooks: it uses the normalized origin remote by default, or the resolved path when there is no origin or when worktrees are isolated.",
      inputSchema: {
        repositoryPath: z.string().min(1).describe("Path inside the local Git repository whose space should be resolved."),
        isolateWorktrees: z.boolean().optional().describe("Use a separate space per worktree. Defaults to SUPERMEMORY_ISOLATE_WORKTREES."),
      },
    },
    async ({ repositoryPath, isolateWorktrees }) => {
      try {
        return result(await resolveRepositorySpace(repositoryPath, isolateWorktrees ?? process.env.SUPERMEMORY_ISOLATE_WORKTREES === "true"));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "ingest_document",
    {
      title: "Ingest a repository document",
      description: "Ingest Markdown, source code, or other text into a specific local Supermemory space. Read the file with the agent's normal filesystem tools, then pass its full text here. This server never reads an arbitrary path itself.",
      inputSchema: {
        content: z.string().min(1).describe("Full text to ingest."),
        containerTag: z.string().min(1).describe("Target Supermemory space, such as repo_my_project__0123456789abcdef."),
        sourcePath: z.string().min(1).optional().describe("Repository-relative path for provenance, such as docs/architecture.md."),
        title: z.string().min(1).optional().describe("Human-readable document title."),
        customId: z.string().min(1).optional().describe("Stable source identifier used to update this document on later ingestion."),
      },
    },
    async (document) => {
      try {
        return result(await ingestDocument({ ...document, source: "supermemory-local-mcp" }));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "save_memory",
    {
      title: "Save local memory",
      description: "Create one atomic, immediately searchable memory in a specific local Supermemory space. Resolve repository spaces with resolve_repo_space first.",
      inputSchema: {
        content: z.string().min(1),
        containerTag: z.string().min(1).describe("Target Supermemory space, e.g. repo_my_project__0123456789abcdef. Resolve via resolve_repo_space."),
        isStatic: z.boolean().optional().describe("Mark permanent identity traits true; ordinary project facts and decisions should remain false."),
      },
    },
    async ({ content, containerTag, isStatic }) => {
      try {
        return result(await createMemory({ content, containerTag, isStatic }));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "memory_profile",
    {
      title: "Read local memory profile",
      description: "Retrieve profile facts and related memories from local Supermemory.",
      inputSchema: {
        query: z.string().optional(),
        containerTag: z.string().optional(),
      },
    },
    async ({ query, containerTag }) => {
      try {
        return result(await localApi("/v4/profile", { ...(query ? { q: query } : {}), ...(containerTag ? { containerTag } : {}) }));
      } catch (error) {
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  return server;
}

const app = createMcpExpressApp({ host: HOST });

app.post("/mcp", async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request failed:", error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

app.all("/mcp", (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.listen(PORT, HOST, () => {
  console.log(`Supermemory local MCP adapter listening at http://${HOST}:${PORT}/mcp`);
});
