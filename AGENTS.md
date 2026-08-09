# supermemory-ui

This repo is a **console for a memory engine**, not the engine itself.
Supermemory turns ingested content into a living graph of facts; this app is
the operator window — bank, graph, recall, spaces, profile, settings — against
either a live instance or a faithful mock of the same surface.

## Domain model

Treat these as distinct layers. Conflating them breaks the product.

- **Documents** are raw input (files, links, text). They move through an
  asynchronous pipeline; status and chunks belong to documents, not memories.
- **Memories** are atomic extracted facts. They form a graph: facts build on
  facts via relations such as update, extend, derive, and source links — not a
  flat list of embeddings.
- **Spaces** (container tags) scope the corpus. Filtering, prompts, and merge
  behavior live at this boundary.
- **Profiles** are synthesized views over memory (static/dynamic facts and
  buckets), not a separate store of truth.

## Memory semantics the UI must respect

These are product invariants, not implementation details:

- **Revision is versioned.** Editing a memory writes a new version; prior
  wording stays in history. Do not model PATCH as in-place overwrite.
- **Forget is soft.** A forgotten memory leaves the active set but retains
  edges so the graph can still explain why recall changed.
- **Relations are first-class.** Neighbourhood, ego views, and search
  “include” blocks exist so operators can see *how* knowledge connects, not
  only *what* is current.
- **Ingest is async.** New documents progress through pipeline stages; the UI
  observes that progression rather than pretending extraction is synchronous.

## Boundary with the backend

The browser talks only to this app’s API. Credentials and origin stay
server-side; routes proxy (and adapt) the Memory API. Mock and remote are two
backends behind one contract — the mock exists so every screen and mutation is
exercisable without a running engine, and it should preserve the semantics
above (pipeline ticks, versioning, soft forget, scored search), not act as a
static fixture dump.

Seed content is fabricated for legibility. Never treat it as real people,
systems, or production data.

## Product posture

This is an **instrument panel**: dense, dark, operational. Prefer clarity for
operators over marketing layout. Colour encodes data categories and status, but
must never be the only channel — legends, labels, and badges carry the same
information.

When extending the console, prefer fidelity to the Memory API’s model over
inventing a simpler UI model that erases documents/memories/spaces, versions,
or soft-forget.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
