# Troubleshooting local Supermemory for coding agents

## The engine page at `http://localhost:6767/mcp` returns 404

Expected. The self-hosted Supermemory engine exposes the Memory API on port
6767, not a bundled MCP endpoint. Point MCP clients at the local bridge on
`http://127.0.0.1:6768/mcp` instead.

## Claude Code opens `app.supermemory.ai/auth/connect`

One of Claude's Supermemory configurations is still targeting the hosted
service or lacks the global local credentials. Set the local hook URL and key
globally, not only in a project-local configuration:

```text
SUPERMEMORY_API_URL=http://127.0.0.1:6767
SUPERMEMORY_CC_API_KEY=sm_your_local_key
```

Restart Claude Code. This local setup does not require hosted Supermemory OAuth.

## MCP reports HTTP 401 / `Unauthorized`

The current loopback-only bridge is intentionally unauthenticated, so a 401
means an old bridge process or old configuration is still in use. Restart the
local MCP service and remove stale `Authorization` headers from Codex, Claude
Code, or Cursor. Do not expose `127.0.0.1:6768` beyond the local machine.

## Codex does not list `supermemory-local`

Installing the Codex Supermemory capture hook does not register an MCP server.
Register the local bridge explicitly:

```bash
codex mcp add supermemory-local \
  --url http://127.0.0.1:6768/mcp
```

Check `codex mcp list`, then restart the Codex client. The active tools in an
already-running Codex task are not hot-reloaded from a changed MCP configuration.

## Documents remain `queued` forever

On `server-v0.0.6`, the packaged Rivet runtime is missing. The symptom is a
working HTTP API with no extraction, repeated queue retries, and this error:

```text
Cannot find module '@rivetkit/rivetkit-wasm'
```

Confirm with:

```bash
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6767/api/rivet/metadata
```

`500` means the worker is broken. Install a fixed server build and verify the
endpoint returns `200`. This was reported upstream in
[Supermemory issue #1315](https://github.com/supermemoryai/supermemory/issues/1315).

## A newer server fails with `schema "observatory" already exists`

The v0.0.7 release candidate can fail while opening a v0.0.6 store because of
an incompatible migration. Do **not** delete the old store or hand-edit its
schema. Stop the service, move the full data directory to a timestamped backup,
start the fixed binary with a fresh directory, verify the Rivet endpoint, then
re-ingest the previous source documents or conversations as appropriate.

## MiniMax works in a terminal but the background service cannot extract

Your shell startup files are not inherited by launchd. Set the provider key in
the launchd user environment with:

```bash
launchctl setenv MINIMAX_API_KEY "$MINIMAX_API_KEY"
```

Have the service wrapper read it with `launchctl getenv MINIMAX_API_KEY`, then
export `OPENAI_API_KEY`, `OPENAI_BASE_URL=https://api.minimax.io/v1`, and the
three `MiniMax-M3` model variables before executing the server.

## The space is named `repo_name__deadbeef…`

This is a canonical container tag, not a random document name. The readable
prefix is the sanitized Git repository name. The suffix is a 16-character
SHA-256 identity derived from the normalized `origin` remote by default. Call
`resolve_repo_space` from MCP with a repository path rather than copying the
tag manually.

## `ingest_document` does not know the current repository

An MCP request carries no working directory. Call `resolve_repo_space` first
with the agent's repository path, then pass its result as `containerTag` to
`ingest_document`.

## `supermemory-server --help` starts a second server

The installed standalone binary version used here does not safely treat
`--help` as a normal help request. Avoid probing it that way, especially from a
repository directory: it can initialize a `.supermemory` directory and then
fail on a port conflict. Use the release notes and the health endpoints above
for verification instead.

## `npm run dev` uses port 3001 instead of 3000

Port 3000 was already occupied. Next.js automatically selected 3001; this does
not change the engine or MCP ports. The UI still targets the engine through
`SUPERMEMORY_URL=http://127.0.0.1:6767`.
