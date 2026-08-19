# Local Supermemory for coding agents

This is the canonical setup guide for using a self-hosted Supermemory instance
with Codex, Claude Code, Cursor, and the `supermemory-ui` console. It assumes a
local engine, MiniMax-M3 as the extraction model, and no hosted Supermemory
account or cloud OAuth flow.

## Architecture

| Component | Address | Responsibility |
|---|---|---|
| Local Supermemory engine | `http://127.0.0.1:6767` | Documents, extraction, memories, profiles, spaces, and search |
| Local MCP bridge | `http://127.0.0.1:6768/mcp` | Agent tools over the local Memory API |
| supermemory-ui | `http://127.0.0.1:3001` in this installation | Operator console for the local engine |

The engine and the MCP bridge are separate processes. The self-hosted engine
does **not** expose an MCP endpoint at port 6767. The bridge is maintained in
this repository at [`mcp-server/`](../../mcp-server).

## 1. Install a working local engine

Do not install `server-v0.0.6` for ingestion. Its standalone build accepts
documents but does not run the async pipeline. Use the vetted newer build and
verify its checksum before installing it:

```bash
mkdir -p ~/.supermemory/bin

curl -fL -o /tmp/supermemory-server \
  https://github.com/supermemoryai/supermemory/releases/download/server-v0.0.7-rc.2/supermemory-server-darwin-arm64
curl -fsSL -o /tmp/supermemory-server.sha256 \
  https://github.com/supermemoryai/supermemory/releases/download/server-v0.0.7-rc.2/supermemory-server-darwin-arm64.sha256

expected_sha="$(awk '{print $1}' /tmp/supermemory-server.sha256)"
if command -v sha256sum >/dev/null 2>&1; then
  actual_sha="$(sha256sum /tmp/supermemory-server | awk '{print $1}')"
else
  actual_sha="$(shasum -a 256 /tmp/supermemory-server | awk '{print $1}')"
fi
test "$actual_sha" = "$expected_sha"
install -m 755 /tmp/supermemory-server ~/.supermemory/bin/supermemory-server
```

Use the matching Darwin x64, Linux ARM64, or Linux x64 release asset on other
platforms. The version is currently a prerelease; verify the ingest health
check below after every server upgrade.

## 2. Configure MiniMax-M3 and start the engine

Make the MiniMax provider key available to user launchd, not only to an
interactive shell:

```bash
launchctl setenv MINIMAX_API_KEY "$MINIMAX_API_KEY"
```

For a foreground test, start the server with the OpenAI-compatible MiniMax
endpoint:

```bash
export OPENAI_API_KEY="$(launchctl getenv MINIMAX_API_KEY)"
export OPENAI_BASE_URL=https://api.minimax.io/v1
export OPENAI_MODEL=MiniMax-M3
export OPENAI_FAST_MODEL=MiniMax-M3
export OPENAI_TEXT_MODEL=MiniMax-M3
export SUPERMEMORY_DATA_DIR="$HOME/.supermemory-local/data"
export SUPERMEMORY_DISABLE_TELEMETRY=1

~/.supermemory/bin/supermemory-server
```

First startup prints an `sm_…` local API key. It is the engine credential, not
the MiniMax provider key. Keep the engine data directory persistent: this key
remains stable over ordinary restarts, but a deliberately fresh data directory
generates a new key.

> [!WARNING]
> The engine defaults its data directory to `./.supermemory` relative to the
> directory from which it is launched. Starting it from the `supermemory-ui`
> repository without `SUPERMEMORY_DATA_DIR` therefore creates a new, empty
> engine beside the UI. The console can still connect successfully, but its
> Memory bank will be empty because it is reading the wrong corpus. Always
> export `SUPERMEMORY_DATA_DIR="$HOME/.supermemory-local/data"` (or your chosen
> persistent directory) before every launch, including manual foreground runs.
>
> A data directory has its own local API key. If the console reports `401` or
> does not show the expected corpus after switching directories, align
> `SUPERMEMORY_KEY` in the UI's `.env.local` with the `api-key` in the selected
> data directory, then restart the UI.

For a persistent service, have a LaunchAgent wrapper read
`MINIMAX_API_KEY` with `launchctl getenv`, export the values above, and `exec`
the server binary. Do not commit a provider key to a plist, source file, or
`.env` file.

## 3. Prove processing works

The server listening on port 6767 alone is not proof that extraction works.
Check the Rivet worker endpoint:

```bash
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6767/api/rivet/metadata
```

It must return `200`. Then ingest a small document and verify it reaches
`done`, not merely `queued`, using the console's Documents view or
`GET /v3/documents/<id>`.

## 4. Connect supermemory-ui

Configure only the server-side connection in the root `.env.local`:

```dotenv
SUPERMEMORY_URL=http://127.0.0.1:6767
SUPERMEMORY_KEY=sm_your_local_key
```

Then run the console with `npm install` and `npm run dev`. The browser talks to
the console's `/api/*` routes; it never receives the Supermemory key directly.

## 5. Add the local MCP bridge

The bridge is a reusable project component, not the hosted Supermemory MCP
service:

```bash
cd mcp-server
npm install

SUPERMEMORY_API_KEY=sm_your_local_key \
SUPERMEMORY_LOCAL_API_URL=http://127.0.0.1:6767 \
node server.mjs
```

It listens only on `127.0.0.1:6768` by default. Configure an MCP client with:

```json
{
  "mcpServers": {
    "supermemory-local": {
      "url": "http://127.0.0.1:6768/mcp"
    }
  }
}
```

The bridge is unauthenticated and binds only to `127.0.0.1`; do not expose its
port through a public interface or a broad network tunnel.

## 6. Use repository spaces and source ingestion

MCP calls do not have the caller's current working directory. An agent should
first call `resolve_repo_space` with its current repository path. The tool
returns the canonical `containerTag` used by Codex and Claude Code hooks, for
example `repo_my_project__0123456789abcdef`.

Then the agent reads a Markdown or code file using its normal filesystem tools
and calls `ingest_document`:

```text
content: <the complete file contents>
containerTag: <value returned by resolve_repo_space>
sourcePath: docs/architecture.md
title: Architecture
customId: repo:docs/architecture.md
```

Use stable custom IDs per repository-relative path to update a source document
on later ingestion rather than making duplicates. Do not ingest secrets,
generated output, dependencies, or broad low-signal source trees by default.

See [agent integrations](agent-integrations.md) and the full
[troubleshooting guide](troubleshooting.md) before treating a local setup as
healthy.
