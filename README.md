# supermemory-ui

An open-source window into a locally running [supermemory](https://supermemory.ai)
backend — the memory bank, ingestion pipeline, hybrid recall, and the memory
graph, in one console.

> [!IMPORTANT]
> This is an unofficial, community-built project. It is not affiliated with,
> maintained by, or endorsed by Supermemory.

The self-hosted supermemory binary serves the full Memory API on
`http://localhost:6767` but ships no interface. This is that interface.

**It runs standalone.** A complete mock backend is bundled, seeded with a
realistic corpus, so every screen is populated and every mutation works before
you connect anything. Point it at a real instance with one environment variable.

```bash
npm install
npm run dev          # http://localhost:3000, mock backend
npm run storybook    # http://localhost:6006, design system
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwende%2Fsupermemory-ui&project-name=supermemory-ui&repository-name=supermemory-ui)

---

## Deploying

Vercel's Git integration deploys this repository directly — production for
`main`, a preview for every pull request. There are no tokens or repository
secrets to set up.

`.github/workflows/ci.yml` typechecks and builds every push and pull request as
a separate check. Details in
[`.github/workflows/README.md`](.github/workflows/README.md).

The deployed site is self-contained — it runs against the bundled mock, so there
is nothing to configure to get a working demo.

---

## What it covers

| Screen | What it does | API surface |
|---|---|---|
| **Overview** | Corpus counts, 30-day ingest activity, live pipeline state, recall latency, instance runtime | `/stats`, `/health`, `/v3/documents/processing` |
| **Memory bank** | Browse and manage every extracted claim (text filter, lenses, revise/forget/restore), or ask with semantic search (mode, threshold, limit, rerank, rewrite, aggregate, include) | `/v4/memories/*`, `/v4/search` |
| **Timeline** | The same corpus as a scrolling feed — documents arriving, claims learned, revised, inferred and retired, newest first. Post content and watch it ingest | `/v4/memories/*`, `/v3/documents/*` |
| **Graph** | Force-directed memories ↔ documents ↔ spaces, with `extends` / `derives` / `sources` edges. Hover isolates a neighbourhood; forgotten memories draw as hollow rings | `/v4/graph` |
| **Add memory** | Write, link, upload, batch, or assert a fact directly. New documents walk the pipeline live | `/v3/documents`, `/v3/documents/file`, `/v3/documents/batch`, `/v4/memories` |
| **Documents** | The corpus with pipeline status, chunk inspector, and full metadata | `/v3/documents/*` |
| **Spaces** | Container tags: per-space filter prompt, chunk size, include/exclude rules, merge, delete | `/v3/container-tags/*` |
| **Profile** | Static and dynamic facts plus custom buckets, optionally grounded in a query | `/v4/profile`, `/v4/profile/buckets` |
| **Settings** | Extraction filter, workspace prompt, chunk size, include/exclude, profile buckets, org reset | `/v3/settings/*` |
| **API explorer** | Every documented endpoint, with a live request console | everything |

## Connecting to a real instance

Start the memory engine, then set server-only env vars:

```bash
# terminal 1
supermemory-server                        # serves on :6767

# .env.local (gitignored)
SUPERMEMORY_URL=http://localhost:6767
SUPERMEMORY_KEY=sm_your_key

# terminal 2
npm run dev
```

Route handlers under `src/app/api/` proxy to the real instance and adapt
request/response shapes. The browser only talks to `/api/*`, so the API key
never reaches the client and CORS is not required.

See `.env.example`.

### Runtime metadata

The Memory API has no `/health`, `/status` or `/version` route — the surface is
`/v3` and `/v4` only, and `supermemory local status` reports liveness by GETting
the root URL and reading the installed version off disk. So Settings → Runtime
and the Overview instance panel cannot be proxied: against a live instance the
console derives the endpoint, port and mode from `SUPERMEMORY_URL`, and leaves
version, uptime, models and storage blank rather than inventing them.

When the console runs on the same machine as the server, that information is
still on disk. Point one more variable at the install directory:

```bash
SUPERMEMORY_LOCAL_DIR=~/.supermemory
```

and `/health` fills in version (`bin/supermemory-server.version`), embedding and
extraction configuration (`env`), storage engine, path and size
(`$SUPERMEMORY_DATA_DIR`, else the install directory), and uptime from the
running `supermemory-server` process. The panel labels which of the two it is
showing.

The variable is server-only and opt-in — with it unset nothing reads the local
filesystem, so hosted deployments are unaffected. `env` holds provider API keys;
they are read only to determine which provider is configured, and no key value
is ever included in a response.

## The mock backend

Under `src/app/api/**`, mirroring the real routes exactly (`/v3/documents/list`,
`/v4/search`, `/v4/memories`, …). It is a real implementation, not a fixture
server:

- **Ingestion is asynchronous.** A new document moves `queued → extracting →
  chunking → embedding → indexing → done` on a timer, and the UI polls it. When
  it lands, memories are extracted from it.
- **Versioning is real.** `PATCH /v4/memories` never overwrites — it creates
  version *n+1* and retains the prior wording in history.
- **Forgetting retains edges.** A forgotten memory keeps its relations, which is
  what lets the graph explain why an answer changed.
- **Semantic search is scored and ranked**, with a lexical scorer standing in for the
  hybrid vector + BM25 pass. Reranking, aggregation and thresholds all take effect
  from Memory bank's Semantic mode.

State lives in a module-level store: mutations persist for the life of the
server process and reset on restart (or on a cold serverless instance). That is
deliberate — it is a demo backend, not a database.

Types in `src/lib/types.ts` are transcribed from the published OpenAPI spec
(`https://api.supermemory.ai/v4/openapi`), including the document type and
status enums, filter grammar, and search response shape. Endpoints the mock does
not implement are still listed in the API explorer and marked as such, so the
console shows the whole surface rather than only the part it exercises.

**All seed content and every named persona are fabricated.** The corpus reads
like a working engineer's second brain because that makes the interface
legible — none of it describes a real system, project, or person.

## The timeline

The bank is a table and the graph is a diagram — both ask you to know the data
model first. The timeline asks nothing: it is a feed, and the grammar people
already read fluently is wired to real records rather than invented for
decoration.

| Feed idea | Timeline meaning | Backed by |
|---|---|---|
| Author | The space the item belongs to | `spaceId` |
| Post | One event in a memory's life | history + documents |
| Link preview | The document a claim cites | `documentIds` |
| Comment thread | The memories a document produced | reverse of the above |
| Quote post | The memories an inference was derived from | `memoryRelations` |
| "Edited" | The exact wording a version replaced | `history[]` |
| Reaction counts | Sources, links, version number — records, not sentiment | the entry itself |
| Composer | Post content; the engine ingests it and keeps what it can | `POST /v3/documents` |

Six event kinds — **ingested**, **learned**, **asserted**, **inferred**,
**revised**, **forgotten** — each with a series-coloured rail and an uppercase
verb, so colour is never the only signal. A claim extracted within 36 hours of
its source document arriving is folded into that document's post instead of
being announced twice; one that surfaces months later keeps its own post.

Two rules keep the feed readable:

- **The memories are the post.** When a document produced claims, those claims
  are the body at full size and the document shrinks to a byline underneath.
  The document only leads when nothing has come out of it yet — which is also
  the only time its pipeline status is worth showing.
- **The feed never leaves.** Sources open in a popup over the feed rather than
  deep-linking into the documents tab, so there is nothing to go back from and
  no scroll position to lose.

Posting is ingestion, not assertion: the composer creates a document, and the
feed polls while anything is in flight, so a post visibly walks through
`queued → extracting → chunking → embedding → indexing` and then fills in with
whatever the extractor kept.

The event model is a pure function in `src/lib/timeline.ts`
(`buildTimeline({ memories, documents })`) with unit tests in
`src/lib/timeline.test.ts`; `src/routes/timeline.tsx` only renders it. Both list
queries are fetched unfiltered and sliced in the browser, so switching space is
instant and the space rail can show true per-space counts.

## Navigation

Tabs are not torn down when you leave them. `RouteHost`
(`src/components/route-host.tsx`) renders every visited tab itself and hides the
inactive ones with `display: none`, so React state, DOM state and scroll
position survive a tab switch. The files under `src/app/` are stubs that render
`null`; the pages themselves live in `src/routes/` and are listed in
`src/routes/registry.ts`. **Adding a page means adding both** — a stub segment
for the URL and a registry entry for the host.

Data goes through a small stale-while-revalidate cache (`src/lib/query.tsx`,
with the console's queries defined in `src/lib/queries.ts`). A tab paints from
cache immediately and refreshes in the background; identical requests from
different tabs are de-duplicated; and a mutation calls `invalidateCorpus()` to
mark every derived view stale. Requests and polling timers only run for the tab
on screen, so hidden tabs stay quiet and revalidate when they are next shown.

While the browser is idle the host preloads every route chunk and calls each
route module's optional `warm()`, which fills the cache with that tab's first
screen — so the *first* visit to a tab is instant too, not just the second.

## Storybook

The design system is documented as a working Storybook — every token,
primitive, block, chart and layout surface, rendered against the same
`globals.css` the app loads and switchable between both themes.

```bash
npm run storybook          # workbench on :6006
npm run build-storybook    # static build into storybook-static/
```

It is organised the way the code is:

| Section | Covers |
|---|---|
| **Foundations** | Colour roles, type scale, surface recipe, motion, icon map, formatting helpers |
| **Primitives** | `src/components/ui/*` — Radix-backed, product-agnostic |
| **Console Kit** | `src/components/ui/index.tsx` — the layer page code imports |
| **Blocks** | `src/components/blocks/*` — composed surfaces with a fixed hierarchy |
| **Charts** | `src/components/charts.tsx` — stat tiles, line, bars, segments, sparkline |
| **Graph** | Canvas, legend, node detail, customise panel |
| **Layout** | Shell, sidebar, sticky header, page container |
| **Patterns** | Whole screens, so a component change can be judged in situ |

Stories render against the same seeded corpus the mock backend serves
(`src/stories/fixtures.ts`), so a component looks in Storybook exactly as it
does on `npm run dev`. Component stories are co-located with their components;
the foundation and pattern pages live in `src/stories/`.

[`DESIGN.md`](DESIGN.md) is the prose half of the same system — Storybook is the
executable half.

## Design notes

Quiet light/dark operator console — not a marketing site. Data colours are a
colour-vision-validated categorical palette checked against this app's own
surface — the three graph node hues clear all-pairs CVD separation (worst pair
ΔE 9.4 simulated, 20.9 unsimulated) — and colour is never the only channel:
every hue is repeated in a legend, a label, or a badge. Status colours are
reserved and never reused as a data series. See `DESIGN.md`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4.
UI primitives are shadcn/Radix under `src/components/ui/`; charts and the
d3-force graph live in `src/components`.

## License

[MIT](LICENSE).
