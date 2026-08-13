# Local Supermemory MCP bridge

This optional, self-hosted MCP bridge lets an agent search local Supermemory,
read a profile, save short notes, and ingest Markdown or source files. It is
not Supermemory's managed MCP service and it never sends content to the hosted
Supermemory API. It is deliberately unauthenticated and binds only to the
loopback interface, so it is intended for a single-user local machine.

The bridge accepts text, not filesystem paths. An agent calls
`resolve_repo_space` with its local repository path, reads a repository file
with its own filesystem tools, then calls `ingest_document` with the complete
text, its repository-relative `sourcePath`, a stable `customId`, and the
returned `containerTag`. That keeps source material in the same space as the
repo's conversation memory without giving the MCP server broad filesystem
access.

Its inspection tools mirror the useful read surface of the official MCP:
`listDocuments`, `getDocument`, `listMemories`, and `listSpaces`. Unlike the
managed service, `listSpaces` discovers local spaces from stored documents;
there is no hosted account or active-space state in this local bridge.

## Run it

```bash
cd mcp-server
npm install

SUPERMEMORY_API_KEY=sm_your_local_key \
SUPERMEMORY_LOCAL_API_URL=http://127.0.0.1:6767 \
node server.mjs
```

`SUPERMEMORY_API_KEY` is the local engine key printed on first boot; the bridge
forwards it as a bearer token to port `6767`. The bridge listens only on
`127.0.0.1:6768` by default. Configure your MCP client with its endpoint and no
authentication header:

```json
{
  "mcpServers": {
    "supermemory-local": {
      "url": "http://127.0.0.1:6768/mcp"
    }
  }
}
```

## Ingesting repository material

First call `resolve_repo_space` with the current repository path. It returns a
canonical tag such as `repo_my_project__0123456789abcdef`, calculated with the
same normalized-origin hash used by the Codex and Claude Code capture hooks.
Repositories without an `origin` use their resolved local path instead. Pass
`isolateWorktrees: true` to scope a worktree independently.

Then use `ingest_document` for files that should become searchable reference
material. For example, an agent can read `docs/architecture.md`, then call:

```text
content: <the complete Markdown file>
containerTag: repo_my_project__0123456789abcdef
sourcePath: docs/architecture.md
title: Architecture
customId: repo:docs/architecture.md
```

Use a stable `customId` per source path so a later ingestion updates the same
document rather than creating an unrelated duplicate. Code files are supported
the same way; ingest high-signal files and documentation rather than vendored,
generated, or secret-bearing files.

## Search versus semantic recall

`search_memory` is the bridge's agent-facing interface to the local engine's
`POST /v4/search` endpoint. Its default `searchMode: "memories"` retrieves
semantically relevant extracted facts, matching the console's Semantic
Memory-bank default. Set `searchMode: "hybrid"` to include source-document
retrieval, or `"documents"` to search documents only. When no space is named,
the bridge fans the query out across discovered local spaces.

The **Semantic** mode in supermemory-ui's Memory bank is the same underlying
`/v4/search` capability presented as an operator workflow. The console exposes
additional retrieval controls such as query rewriting, aggregation, and
included documents/chunks. `listMemories`, by contrast, is browsing—not
semantic recall—and returns extracted entries in recency order.
