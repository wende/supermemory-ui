# Coding-agent integrations

This guide connects a local Supermemory engine to Codex, Claude Code, and
Cursor. Each editor needs three independent pieces:

1. **Session ingestion** saves useful conversation turns to the engine.
2. **Pre-prompt context** makes existing memory available before the agent
   answers.
3. **MCP** exposes explicit search, save, inspection, and source-ingestion
   tools.

Installing one piece does not install the other two. In particular, an editor
can list `supermemory-local` in its MCP tools while silently failing to capture
new sessions.

## Shared endpoints and event model

| Surface | Address | Authentication | Used for |
|---|---|---|---|
| Memory API | `http://127.0.0.1:6767` | Local `sm_...` API key | Hook-driven profile, recall, and session ingestion |
| MCP bridge | `http://127.0.0.1:6768/mcp` | None; loopback only | Agent-invoked memory and document tools |

The Memory API and MCP bridge are separate processes. Port `6767` is not an
MCP endpoint, and port `6768` should never be exposed outside the local
machine.

The editor event names differ, but the lifecycle is the same:

| Concern | Codex | Claude Code | Cursor |
|---|---|---|---|
| Initial profile context | `SessionStart` | `SessionStart` | `sessionStart` |
| Before each user prompt | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` |
| Observe assistant response | Transcript at `Stop` | Transcript at `Stop` | `afterAgentResponse` |
| Ingest completed turn | `Stop` | `Stop` | `stop`, with `sessionEnd` as a safety flush |
| Before compaction | `PreCompact`, if configured | `PreCompact`, if configured | `preCompact` |

Every hook adapter should fail open: a stopped engine must not prevent normal
editor use. Keep a per-session checkpoint so repeated `Stop` events ingest
only new transcript entries. Submit a stable session or turn ID as
`customId`; the engine can then update the source document rather than create
duplicates.

All three integrations should write to the same repository container:

```text
repo_<sanitized repository name>__<first 16 hex chars of SHA-256 identity>
```

The identity is the normalized `origin` remote by default, so clones and
worktrees share memory. With no `origin`, or with
`SUPERMEMORY_ISOLATE_WORKTREES=true`, use the resolved repository path. The MCP
bridge's `resolve_repo_space` tool implements the same rule; do not invent a
separate editor-specific tag.

## Codex

The Supermemory Codex integration installs Node hook scripts under the Codex
configuration directory. Point it at the local engine in
`~/.codex/supermemory.json`:

```json
{
  "apiKey": "sm_your_local_key",
  "baseUrl": "http://127.0.0.1:6767",
  "autoRecallEveryPrompt": true,
  "captureEveryNTurns": 3
}
```

Treat this file as a credential and restrict its permissions. The equivalent
environment variables are `SUPERMEMORY_CODEX_API_KEY` and
`SUPERMEMORY_API_URL`.

### Session ingestion

The integration registers `SessionStart` and `Stop` in
`~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/supermemory/session-start.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/supermemory/flush.js"
          }
        ]
      }
    ]
  }
}
```

`SessionStart` loads the repository profile into the new task. `Stop` reads
`session_id`, `cwd`, and `transcript_path` from stdin, selects entries not yet
captured for that session, and sends them to port `6767`. A Codex `Stop` may
run after every completed turn; it is not necessarily a one-time process-exit
event, so checkpointing is required.

### Pre-prompt context

Register the recall adapter on `UserPromptSubmit`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/supermemory/recall.js"
          }
        ]
      }
    ]
  }
}
```

The script receives the prompt, task ID, and working directory as JSON on
stdin. It searches the shared repository container and returns
`hookSpecificOutput.additionalContext`. The model sees this context with the
current prompt. A fresh session ID is useful when testing because the adapter
suppresses memories it has already injected into the same session.

### MCP

Register the bridge independently of the hooks:

```bash
codex mcp add supermemory-local \
  --url http://127.0.0.1:6768/mcp
```

Confirm with `codex mcp list`, then restart the Codex app, CLI, or IDE
extension. Codex stores the server in `~/.codex/config.toml`; no MCP bearer
token is needed.

## Claude Code

Install the official Supermemory plugin from inside Claude Code. Node.js 18 or
newer must be on the hook process's `PATH`:

```text
/plugin marketplace add supermemoryai/claude-supermemory
/plugin install supermemory
```

Point the plugin at the local engine wherever Claude Code is launched:

```bash
export SUPERMEMORY_API_URL=http://127.0.0.1:6767
export SUPERMEMORY_CC_API_KEY=sm_your_local_key
```

Alternatively, set `apiKey` and `baseUrl` per repository in
`.claude/.supermemory-claude/config.json`. Do not commit a real key.

The plugin declares its hooks internally, so they do not need to be copied
into `~/.claude/settings.json`:

```text
SessionStart      -> context-hook.cjs
UserPromptSubmit  -> recall-hook.cjs
PreToolUse        -> recall-approve.cjs
Stop              -> summary-hook.cjs
```

### Session ingestion

`SessionStart` fetches repository profile facts and returns them as
`hookSpecificOutput.additionalContext`. At each `Stop`, `summary-hook.cjs`
reads the session transcript, keeps only entries after its last checkpoint,
and sends them to port `6767` with the shared repository container and a
stable session ID.

The optional signal-extraction settings can capture only turns around durable
signals such as decisions, architecture, bugs, and fixes. Configure these in
`~/.supermemory-claude/settings.json`; they affect automatic capture, not MCP.

### Pre-prompt context

`UserPromptSubmit` injects a reasoned-recall directive before every prompt.
Claude decides whether prior memory would materially improve the answer and,
when appropriate, invokes the plugin's read-only `supermemory-search` skill.
The matching `PreToolUse` hook automatically approves that specific search.
This is intentionally model-gated recall rather than an unconditional search
on every prompt.

### MCP

The official plugin does not automatically create an MCP server entry. Add
this fragment to the appropriate Claude Code MCP configuration, commonly the
user-level `~/.claude.json`:

```json
{
  "mcpServers": {
    "supermemory-local": {
      "type": "http",
      "url": "http://127.0.0.1:6768/mcp"
    }
  }
}
```

Restart Claude Code and confirm the entry with `/mcp`. A prompt to authenticate
at `app.supermemory.ai` means a hook or MCP entry is still pointing at the
managed service rather than the local endpoints.

## Cursor

Only the MCP setup below is ready to copy. Supermemory does not currently ship
an official Cursor capture adapter, so MCP gives Cursor explicit tools but not
automatic session ingestion.

### MCP

Add the bridge to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "supermemory-local": {
      "url": "http://127.0.0.1:6768/mcp"
    }
  }
}
```

Restart Cursor or reload its MCP configuration, then check that the server and
tools appear in Cursor settings.

### Appendix: implementing an unofficial capture adapter

The remainder of this Cursor section is an implementation contract for authors
building their own adapter, not a working setup recipe. Do not register the
commands below until an actual `~/.cursor/hooks/supermemory.cjs` implementation
exists. A compatible adapter would use this event routing in
`~/.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "node hooks/supermemory.cjs session-start" }
    ],
    "beforeSubmitPrompt": [
      { "command": "node hooks/supermemory.cjs pre-prompt" }
    ],
    "afterAgentResponse": [
      { "command": "node hooks/supermemory.cjs response" }
    ],
    "stop": [
      { "command": "node hooks/supermemory.cjs ingest" }
    ],
    "sessionEnd": [
      { "command": "node hooks/supermemory.cjs ingest" }
    ],
    "preCompact": [
      { "command": "node hooks/supermemory.cjs ingest" }
    ]
  }
}
```

`supermemory.cjs` above is not bundled with this repository. It must implement
the event behavior described below or wrap equivalent Supermemory hook library
functions.

User hooks run with `~/.cursor/` as their working directory, which is why the
example uses `hooks/supermemory.cjs`. Cursor sends JSON to the command on stdin
and expects JSON on stdout. Return `{}` for observation-only hooks and on
recoverable errors.

Cursor can also load hook configurations written for Claude Code when
**Cursor Settings -> Rules, Skills, Subagents -> Include third-party Plugins,
Skills, and other configs** is enabled. That is useful for shared hook scripts,
but do not assume an installed Claude marketplace plugin is automatically
discoverable. Confirm all active hooks in **Customize -> Hooks** and use the
native configuration above when it is absent.

### Session ingestion

The Cursor adapter has to assemble a turn because the relevant fields arrive
in separate events:

1. On `beforeSubmitPrompt`, store `prompt` under `conversation_id` and
   `generation_id`.
2. On `afterAgentResponse`, append the final assistant `text` to that pending
   turn.
3. On `stop`, select only completed turns that do not yet have a successful
   capture checkpoint. Send that delta using a stable `customId` derived only
   from `conversation_id`; do not rebuild or resend the earlier transcript.
4. Mark exactly that delta captured only after the API request succeeds. A
   failed request must leave it pending so the next flush retries the same
   content.
5. Serialize flushes per conversation so overlapping `stop`, `sessionEnd`, and
   `preCompact` events cannot submit the same pending delta twice. If there is
   no pending turn, return without issuing an API request.

The invariant is one logical source document per Cursor conversation, not one
document per generation. Supermemory appends each submitted delta to that
session document. The per-generation state exists only for pairing, ordering,
checkpointing, and retry safety. This matches the Claude Code and Codex client
behavior: one stable session `customId`, with only new transcript entries in
each `Stop` request.

This is a client-side ingestion guarantee. A self-hosted Supermemory engine may
still reconstruct the complete logical document for chunk diffing or memory
extraction after accepting the delta; changing that backend behavior is a
separate concern.

When `transcript_path` is available, the adapter may parse and checkpoint that
transcript instead of maintaining its own turn files. Do not ingest
`afterAgentThought`; private reasoning is neither required nor appropriate
session memory.

### Pre-prompt context

`sessionStart` can return an `additional_context` field containing the
repository profile. Cursor's native `beforeSubmitPrompt` currently supports
prompt validation (`continue` and `user_message`) but does not document a
response field for injecting recalled context into the pending request.

Therefore the dependable Cursor pattern is:

- inject a compact repository profile at `sessionStart`;
- use `beforeSubmitPrompt` to record the prompt for later ingestion;
- add an agent rule telling Cursor to call the MCP `search_memory` or
  `memory_profile` tool when previous decisions, conventions, or sessions
  could matter.

Do not claim unconditional per-prompt context injection unless the installed
Cursor version has been tested to honor a compatible Claude
`UserPromptSubmit` `additionalContext` response.

See Cursor's current [hook reference](https://cursor.com/docs/hooks) and
[Claude Code compatibility reference](https://cursor.com/docs/reference/third-party-hooks)
before implementing the adapter; hook input and output fields are part of the
editor contract, not the Supermemory API.

User-level hooks and a loopback MCP server work only for Cursor sessions
running on this machine. Cursor cloud agents load project-level
`.cursor/hooks.json`, not `~/.cursor/hooks.json`, and cannot reach the Mac's
`127.0.0.1:6767` or `127.0.0.1:6768`. Supporting cloud agents requires a
network-reachable authenticated service and is outside this local setup.

## MCP tool workflow

| Tool | Purpose |
|---|---|
| `resolve_repo_space` | Return the canonical space for a supplied local Git path |
| `ingest_document` | Ingest already-read Markdown, source code, or text with source metadata |
| `save_memory` | Create an atomic memory directly in a resolved repository space |
| `search_memory` | Semantic/hybrid recall from the local engine's `/v4/search` endpoint |
| `listDocuments` / `getDocument` | Browse source documents or read one stored document |
| `listMemories` | Browse extracted memory entries, versions, and source links |
| `listSpaces` | Discover locally stored spaces with document and memory counts |
| `memory_profile` | Read profile facts and relevant memory |

The bridge deliberately accepts text rather than a file path for ingestion.
That preserves the coding agent's normal filesystem permissions and prevents
the MCP service from becoming an unrestricted file reader.

An agent should call `resolve_repo_space` before `ingest_document`; the MCP
HTTP request does not carry the editor's current working directory.

### Semantic recall versus browsing

`search_memory` and the console's **Semantic** Memory-bank mode use the same
local engine endpoint, `POST /v4/search`. Both default to
`searchMode: "memories"`, which retrieves semantically relevant extracted
facts. Set `searchMode: "hybrid"` to add source-document retrieval or
`"documents"` to search sources only. The console adds an operator UI around
that endpoint, including query rewriting, aggregation, and result-include
controls.

`listMemories` is not semantic recall. It is a paginated browse view of
extracted facts, normally sorted by recency. Use it to inspect what the engine
already learned; use `search_memory` to answer a question from that knowledge.

## Verification checklist

For each editor, verify the three surfaces separately:

1. Start a new local session and confirm repository profile context is present.
2. Send a prompt that clearly refers to an earlier decision and confirm recall
   occurs directly or through MCP, as appropriate for the editor.
3. Complete a distinctive test turn, wait for asynchronous extraction, and
   find the resulting conversation document or memory in the console.
4. List the editor's MCP servers and invoke `resolve_repo_space` followed by a
   read-only `memory_profile` or `search_memory` call.
5. Stop port `6767` temporarily and confirm hook failures do not block ordinary
   editor operation.

See the [local setup guide](README.md) for starting the engine and bridge, and
the [troubleshooting guide](troubleshooting.md) for endpoint and authentication
failures.
