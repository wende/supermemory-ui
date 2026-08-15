/**
 * Deterministic seed data for the mock backend.
 *
 * Everything here is fabricated — it exists so the interface has a
 * believable corpus to render before you point it at a real
 * supermemory instance. Shapes match the OpenAPI contract exactly, so
 * swapping the mock for `http://localhost:6767` is a base-URL change.
 */

import type {
  ContainerTag,
  Document,
  DocumentChunk,
  DocumentStatus,
  DocumentType,
  MemoryEntry,
  MemoryRelation,
  OrgSettings,
  ServerInfo,
} from "./types";

const ORG_ID = "org_local_7f3a";

/**
 * "Now" for the seeded corpus, pinned to the top of the current hour.
 * Rounding keeps it stable for the life of the process (so relative
 * timestamps don't drift between renders) while still tracking real
 * time, which is what stops seeded items reading as "in 13h".
 */
export const NOW = Math.floor(Date.now() / 3_600_000) * 3_600_000;

const DAY = 86_400_000;
const HOUR = 3_600_000;

function ago(days: number, hours = 0): string {
  return new Date(NOW - days * DAY - hours * HOUR).toISOString();
}

/* ------------------------------------------------------------------ */
/* Spaces (container tags)                                             */
/* ------------------------------------------------------------------ */

export const SPACES: ContainerTag[] = [
  {
    containerTag: "sm_project_orbital",
    name: "Orbital",
    description:
      "Product work for Orbital — the edge scheduling engine. Specs, incident writeups, design review notes.",
    documentCount: 0,
    memoryCount: 0,
    createdAt: ago(214),
    updatedAt: ago(0, 3),
    settings: {
      shouldLLMFilter: true,
      filterPrompt:
        "Keep engineering decisions, architecture rationale, and incident findings. Drop scheduling chatter and standup logistics.",
      chunkSize: 1200,
      includeItems: ["design docs", "postmortems", "RFCs"],
      excludeItems: ["calendar invites", "standup notes"],
    },
  },
  {
    containerTag: "sm_research",
    name: "Research",
    description:
      "Papers, benchmarks and reading notes on retrieval, embeddings and long-context models.",
    documentCount: 0,
    memoryCount: 0,
    createdAt: ago(340),
    updatedAt: ago(1, 6),
    settings: {
      shouldLLMFilter: true,
      filterPrompt:
        "Extract claims, methods and reported numbers. Ignore acknowledgements and reference lists.",
      chunkSize: 1800,
      includeItems: ["abstracts", "results tables", "method sections"],
      excludeItems: ["bibliography", "author affiliations"],
    },
  },
  {
    containerTag: "sm_personal",
    name: "Personal",
    description:
      "Preferences, habits, recurring context about how I like to work. Mostly static facts.",
    documentCount: 0,
    memoryCount: 0,
    createdAt: ago(400),
    updatedAt: ago(2),
    settings: {
      shouldLLMFilter: false,
      filterPrompt: null,
      chunkSize: 800,
      includeItems: [],
      excludeItems: [],
    },
  },
  {
    containerTag: "sm_meetings",
    name: "Meetings",
    description:
      "Transcripts and summaries from Granola. Auto-expiring after 180 days.",
    documentCount: 0,
    memoryCount: 0,
    createdAt: ago(120),
    updatedAt: ago(0, 9),
    settings: {
      shouldLLMFilter: true,
      filterPrompt: "Keep decisions, owners and deadlines. Drop small talk.",
      chunkSize: 1000,
      includeItems: ["decisions", "action items"],
      excludeItems: ["greetings", "scheduling"],
    },
  },
  {
    containerTag: "sm_codebase",
    name: "Codebase",
    description:
      "Indexed READMEs, ADRs and inline docs from the monorepo.",
    documentCount: 0,
    memoryCount: 0,
    createdAt: ago(88),
    updatedAt: ago(0, 1),
    settings: {
      shouldLLMFilter: true,
      filterPrompt: "Keep architectural decisions and public API contracts.",
      chunkSize: 1500,
      includeItems: ["*.md", "adr/**"],
      excludeItems: ["node_modules/**", "*.lock", "dist/**"],
    },
  },
];


/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

interface DocSeed {
  title: string;
  type: DocumentType;
  space: string;
  summary: string;
  content: string;
  url?: string;
  filepath?: string;
  status?: DocumentStatus;
  days: number;
  metadata?: Record<string, string | number | boolean>;
}

const DOC_SEEDS: DocSeed[] = [
  {
    title: "RFC-014: Deterministic scheduling for edge workers",
    type: "text",
    space: "sm_project_orbital",
    days: 12,
    summary:
      "Proposes replacing the random-jitter dispatcher with a deterministic hash ring so replays of a failed window produce identical placement.",
    content: `# RFC-014: Deterministic scheduling for edge workers

## Problem
Orbital's dispatcher currently picks a worker with weighted random selection plus
jitter. This is fine in steady state but makes incident replay impossible: rerunning
a failed 5-minute window places jobs on different workers, so we can never reproduce
a hot-shard failure.

## Proposal
Replace weighted-random with rendezvous hashing (HRW) over (job_id, worker_id).
Placement becomes a pure function of the job ID and the current membership view.

## Consequences
- Replay is exact as long as we snapshot the membership view alongside the job log.
- Losing a worker reshuffles only 1/N of jobs rather than the whole assignment.
- We give up the load-smoothing that jitter provided; measured p99 imbalance rises
  from 4% to 11% under synthetic burst load. We consider this acceptable and will
  revisit with bounded-load HRW if it regresses further.

## Decision
Accepted 2026-07-24. Rollout behind ORBITAL_HRW_DISPATCH, default off until the
membership snapshot lands.`,
    metadata: { author: "wende", rfc: 14, status: "accepted" },
  },
  {
    title: "Incident 2026-07-19: cascading retry storm in eu-west",
    type: "text",
    space: "sm_project_orbital",
    days: 17,
    summary:
      "A 90-second control-plane blip caused every worker to retry simultaneously; the fix was decorrelated jitter plus a circuit breaker on the membership endpoint.",
    content: `# Incident 2026-07-19 — cascading retry storm (eu-west)

**Duration:** 41 minutes of degraded scheduling. No data loss.
**Impact:** p99 job start latency went from 180ms to 47s. 12% of jobs exceeded their
deadline and were shed.

## Timeline
- 09:12 UTC — control-plane deploy rolls out; membership endpoint returns 503 for 90s.
- 09:13 UTC — all 340 workers hit their retry path at the same instant. Every worker
  used a fixed 1s backoff, so the retries stayed in lockstep.
- 09:14 UTC — the membership endpoint, now healthy, is immediately re-saturated by
  the synchronised retry wave and starts failing again. This repeats for 38 minutes.
- 09:53 UTC — we manually staggered worker restarts in thirds; the herd broke up.

## Root cause
Fixed backoff with no jitter. The blip synchronised the fleet, and nothing in the
retry path was capable of desynchronising it again. The membership endpoint had no
circuit breaker, so it absorbed the full wave every cycle instead of shedding.

## What we changed
1. Decorrelated jitter: sleep = min(cap, random(base, prev*3)).
2. Circuit breaker on the membership client — opens after 5 consecutive failures,
   half-opens after 30s with a single probe request.
3. Workers now cache the last-known-good membership view for 10 minutes and keep
   scheduling against it while the breaker is open.

## What we did not change
We considered adding a rate limiter in front of the membership endpoint. Rejected:
it converts a retry storm into a queue, which just moves the latency. The client-side
fix addresses the actual synchronisation.`,
    metadata: { severity: "sev2", region: "eu-west", author: "wende" },
  },
  {
    title: "Orbital scheduling engine — architecture overview",
    type: "github_markdown",
    space: "sm_codebase",
    days: 40,
    filepath: "docs/architecture/scheduler.md",
    summary:
      "Top-level map of the scheduler: control plane, membership gossip, dispatcher, and the worker runtime contract.",
    content: `# Scheduler architecture

The scheduler is four cooperating pieces.

**Control plane** owns the authoritative job log (Raft, 5 members). It never talks to
workers directly — it only appends to the log and publishes membership views.

**Membership gossip** is SWIM with a 200ms probe interval. Each worker maintains its
own view; views converge in ~2s at our fleet size. Views are versioned so the
dispatcher can refuse to place against a stale view.

**Dispatcher** runs on every worker. Given (job, membership view) it computes a
placement. As of RFC-014 this is rendezvous hashing rather than weighted random.

**Worker runtime** executes the job in a per-job cgroup with a hard wall-clock
deadline. It reports completion by appending to the log, not by calling back — this
keeps the control plane out of the hot path.

## Contract notes
- Jobs must be idempotent. We deliver at-least-once and make no attempt to hide that.
- A job that exceeds its deadline is SIGKILLed. There is no graceful-shutdown window;
  add one only if you can prove the cleanup itself is bounded.
- The log is the only durable state. Anything a worker holds in memory is lost on
  restart, by design.`,
    metadata: { repo: "acme/orbital", branch: "main", lang: "markdown" },
  },
  {
    title: "Lost in the Middle: How Language Models Use Long Contexts",
    type: "pdf",
    space: "sm_research",
    days: 96,
    url: "https://arxiv.org/abs/2307.03172",
    summary:
      "Shows a U-shaped position curve: models recall information at the start and end of the context far better than in the middle, even well under the context limit.",
    content: `Lost in the Middle: How Language Models Use Long Contexts

We analyze the performance of language models on two tasks that require identifying
relevant information within their input contexts: multi-document question answering
and key-value retrieval.

Key finding: performance is highest when relevant information occurs at the beginning
or end of the input context, and significantly degrades when models must access
relevant information in the middle of long contexts. On multi-document QA, GPT-3.5
accuracy drops by more than 20 points between the best position (first) and the worst
(middle of a 20-document context).

Notably, performance substantially decreases as the input context grows longer, even
for models explicitly designed for long contexts. Extended-context variants of the
same base model do not improve middle-position recall — they simply tolerate more
tokens before failing.

Implications for retrieval systems: reranking matters more than recall depth. Placing
the strongest chunk first, rather than packing more chunks, is the higher-leverage
change. Systems that concatenate 50 retrieved passages in similarity order are leaving
accuracy on the table relative to systems that retrieve 8 and order them carefully.`,
    metadata: {
      authors: "Liu et al.",
      venue: "TACL 2024",
      year: 2024,
      cited: true,
    },
  },
  {
    title: "MTEB leaderboard notes — embedding model selection, July 2026",
    type: "text",
    space: "sm_research",
    days: 34,
    summary:
      "Comparison of bge-base, e5-large and gte-modernbert for local retrieval; bge-base wins on latency-per-point at our corpus size.",
    content: `# Embedding model selection notes

Evaluated four candidates for the local index. Corpus: 41k chunks, ~1.1k tokens each.
Hardware: M3 Max, CPU-only inference (we assume no GPU on a developer laptop).

| model | dim | MTEB retrieval avg | ms/chunk | index size |
|---|---|---|---|---|
| bge-base-en-v1.5 | 768 | 53.2 | 11 | 124 MB |
| e5-large-v2 | 1024 | 55.1 | 38 | 165 MB |
| gte-modernbert-base | 768 | 55.8 | 14 | 124 MB |
| all-MiniLM-L6-v2 | 384 | 41.9 | 4 | 62 MB |

Conclusion: bge-base is the right default for a local binary. e5-large buys 1.9 points
for 3.5x the latency, which is the wrong trade when the whole point is that ingestion
finishes while you are still in the terminal. gte-modernbert is genuinely better and
the same speed — worth revisiting once quantised weights are widely available.

MiniLM is tempting for the size but the 11-point drop is very visible in practice:
it confuses "retry backoff" with "retry storm" in our own incident corpus, which is
exactly the distinction we need.`,
    metadata: { topic: "embeddings", conclusion: "bge-base-en-v1.5" },
  },
  {
    title: "HNSW vs IVF-PQ for sub-million-vector local indexes",
    type: "webpage",
    space: "sm_research",
    days: 61,
    url: "https://example.dev/blog/hnsw-vs-ivfpq-local",
    summary:
      "Below ~1M vectors HNSW's memory overhead is affordable and its recall is strictly better; IVF-PQ only pays off when the index no longer fits in RAM.",
    content: `HNSW vs IVF-PQ for sub-million-vector local indexes

The usual advice — "use IVF-PQ, it's what production systems use" — is calibrated for
billion-scale indexes on dedicated hardware. For a local index under a million vectors
that advice inverts.

HNSW at M=16, efConstruction=200 gives 0.98 recall@10 with roughly 1.6x the raw vector
memory. On 500k 768-dim float32 vectors that is about 2.4 GB — uncomfortable but
survivable on a 32 GB laptop, and trivially fine if you quantise to int8 (0.97 recall,
700 MB).

IVF-PQ with nlist=4096, m=96 gets you to about 180 MB, but recall@10 lands near 0.89
without a rerank pass and the build takes 6x longer. You are trading a large accuracy
loss for memory you were not short of.

The crossover is roughly where the float32 index exceeds half of available RAM. Below
that, HNSW. Above it, IVF-PQ with an exact-rerank stage over the top 100 candidates —
never IVF-PQ alone.`,
    metadata: { topic: "vector-search", source: "blog" },
  },
  {
    title: "Design review — memory extraction prompt v3",
    type: "granola",
    space: "sm_meetings",
    days: 8,
    summary:
      "Team agreed to split extraction into claim-detection and claim-normalisation passes; Priya owns the eval set by Aug 14.",
    content: `Design review — memory extraction prompt v3
Attendees: Rhea, Priya, Marco, Sam
Duration: 48 min

## Decisions
1. Split extraction into two passes. Pass one detects candidate claims with high
   recall and no normalisation. Pass two normalises each claim into a standalone
   sentence with resolved pronouns and explicit subjects. Rationale: the single-pass
   prompt was silently dropping claims whenever normalisation was hard, and we could
   not tell the two failure modes apart in evals.
2. Memories get an explicit isInference flag. If a memory was derived by combining
   two source memories rather than read out of a document, it is marked and shown
   differently in the UI. Marco pushed back — worried it adds a concept users must
   learn. Resolved: flag it in the data model now, expose it in the UI behind a
   filter, revisit surfacing it prominently after we see how many inferences we
   actually generate.
3. Temporal context stays optional. We will not block v3 on getting validFrom right.

## Action items
- Priya: build the 200-claim eval set with human labels, due Aug 14.
- Marco: instrument pass-one recall separately from pass-two precision, due Aug 8.
- Rhea: write the migration for the isInference column, due Aug 7.
- Sam: check whether the two-pass split doubles our token cost in practice. If it
  does we need a cheaper model for pass one.

## Open questions
- What happens to an inference when one of its sources is forgotten? Nobody had a
  confident answer. Sam will write up options before the next review.`,
    metadata: { attendees: 4, duration_min: 48, source: "granola" },
  },
  {
    title: "Weekly sync — Orbital rollout, week 31",
    type: "granola",
    space: "sm_meetings",
    days: 3,
    summary:
      "HRW dispatch enabled for 10% of eu-west; imbalance within budget. Decision to hold at 10% until the membership snapshot ships.",
    content: `Weekly sync — Orbital rollout, week 31
Attendees: Rhea, Priya, Sam

- HRW dispatch (RFC-014) is live behind the flag for 10% of eu-west workers as of
  Monday. Observed p99 imbalance is 9.2%, under the 11% we budgeted from synthetic
  load. No deadline misses attributable to placement.
- Decision: hold at 10% until the membership snapshot lands. Without the snapshot we
  get deterministic placement but still cannot replay, so raising the percentage buys
  us nothing and doubles the blast radius.
- Sam raised that the flag check is in the hot path and costs ~40ns per dispatch.
  Agreed this is noise; revisit only if dispatch shows up in a profile.
- Priya: the eval set is at 140 of 200 claims. On track for Aug 14.
- Carry-over: nobody has looked at what the retry-storm circuit breaker does under a
  partial partition (some workers can reach the control plane, some cannot). Rhea
  to write a test.`,
    metadata: { attendees: 3, week: 31, source: "granola" },
  },
  {
    title: "Working preferences and defaults",
    type: "text",
    space: "sm_personal",
    days: 300,
    summary:
      "Standing preferences: deep work mornings, written-first decisions, TypeScript with strict mode, no meetings before 11.",
    content: `Standing preferences — keep these in mind by default.

Schedule: mornings are for deep work. No meetings before 11:00 local. Afternoons are
fine for reviews and syncs. I do not work weekends and do not want to be paged unless
it is a genuine sev1.

Decisions: written first. If a decision matters enough to argue about, it matters
enough to write an RFC. Meetings are for resolving disagreement on a document that
already exists, not for generating the document.

Code: TypeScript with strict mode on, no exceptions. I prefer explicit over clever —
if a reviewer has to think about whether the code is correct, it is not clear enough.
Avoid dependencies that do less than 100 lines of work.

Writing: short sentences. No hedging when the answer is known. Say the number rather
than "significantly faster".

Tools: terminal-first. I would rather learn a CLI flag than click through a dashboard.
Local over hosted wherever the trade is close.`,
    metadata: { kind: "preferences", static: true },
  },
  {
    title: "Reading queue — Q3 2026",
    type: "notion_doc",
    space: "sm_personal",
    days: 22,
    summary:
      "Papers and books queued for Q3, with why each is on the list.",
    content: `# Reading queue — Q3 2026

**In progress**
- *Designing Data-Intensive Applications*, ch. 9 (consistency & consensus). Re-reading
  because the Orbital membership work keeps bumping into linearizability questions I
  can only half-articulate.
- "Lost in the Middle" (Liu et al.) — already changed how I think about reranking.

**Queued**
- "Retrieval-Augmented Generation for Knowledge-Intensive NLP" — the original RAG
  paper. Embarrassing that I have only read summaries of it.
- SWIM paper (Das et al. 2002). We run SWIM in production and I have never read it end
  to end.
- *The Art of Doing Science and Engineering* (Hamming). Third attempt.

**Dropped**
- Anything on agent frameworks until one of them survives six months unchanged.`,
    metadata: { quarter: "Q3-2026", source: "notion" },
  },
  {
    title: "supermemory local — first-run notes",
    type: "text",
    space: "sm_personal",
    days: 5,
    summary:
      "Setup notes from running the local binary: boots in ~2s, auto-generates an API key, embeddings run locally with no network calls.",
    content: `# supermemory local — first-run notes

Downloaded the binary, ran it, and it was serving on :6767 in about two seconds. No
Docker, no Postgres, no pgvector setup. The graph engine is embedded.

An API key is generated on first boot and printed once — I missed it the first time
and had to look in the state directory.

Embeddings default to Xenova/bge-base-en-v1.5 running locally, so ingestion works with
the network off. I confirmed this by pulling the ethernet cable mid-ingest; it kept
going. The LLM side wants an OpenAI-compatible endpoint — I pointed it at Ollama and
memory extraction worked, noticeably slower than a hosted model but entirely offline.

Ingest, extraction, hybrid search, profiles, and spaces share the same API surface as
the hosted product, so the SDK works against localhost with a one-line baseURL change.`,
    metadata: { tool: "supermemory", version: "local", port: 6767 },
  },
  {
    title: "ADR-007: We do not use an ORM",
    type: "github_markdown",
    space: "sm_codebase",
    days: 71,
    filepath: "docs/adr/007-no-orm.md",
    summary:
      "Decision to write SQL directly with a thin query builder; ORMs hid the query plans we most needed to see.",
    content: `# ADR-007: We do not use an ORM

## Status
Accepted, 2026-05-26.

## Context
Three of our four worst latency incidents traced to a query the ORM generated that
nobody had read. In each case the fix was obvious once the SQL was visible, and in
each case finding the SQL took longer than fixing it.

## Decision
We write SQL directly. A thin query builder handles parameter binding and result
typing; it does not model relationships, does not lazy-load, and does not generate
joins on our behalf.

## Consequences
- Every query in the codebase can be pasted into a psql prompt and EXPLAINed. This is
  the whole point.
- More boilerplate for simple CRUD. Accepted; simple CRUD was never the expensive part.
- Onboarding is slightly slower for people who expect an ORM. Mitigated by keeping all
  queries in one directory per domain rather than scattered through handlers.
- We give up automatic migrations. We were writing them by hand anyway.`,
    metadata: { repo: "acme/orbital", adr: 7, status: "accepted" },
  },
  {
    title: "Retry semantics in the worker SDK",
    type: "github_markdown",
    space: "sm_codebase",
    days: 26,
    filepath: "packages/worker-sdk/README.md",
    summary:
      "Documents decorrelated jitter as the default backoff and the circuit breaker added after the July retry storm.",
    content: `# Worker SDK — retry semantics

The SDK retries on transport errors and 5xx responses. It does not retry 4xx.

**Backoff is decorrelated jitter**, not exponential:

    sleep = min(cap, random_between(base, previous_sleep * 3))

Fixed and plain-exponential backoff both keep a fleet synchronised after a shared
blip — see the 2026-07-19 incident, where 340 workers retried in lockstep for 38
minutes. Decorrelated jitter breaks the herd within two cycles.

Defaults: base 100ms, cap 20s, 8 attempts.

**Circuit breaker.** Every client wraps its transport in a breaker that opens after 5
consecutive failures and half-opens after 30s with a single probe. While open, calls
fail immediately rather than queueing. For the membership client specifically, the
worker falls back to its last-known-good view for up to 10 minutes and keeps
scheduling — degraded placement beats no placement.

**Idempotency.** Delivery is at-least-once. Every job handler must tolerate being run
twice with the same input. The SDK does not deduplicate for you and will not.`,
    metadata: { repo: "acme/orbital", package: "worker-sdk" },
  },
  {
    title: "Hybrid search: when to rerank",
    type: "webpage",
    space: "sm_research",
    days: 48,
    url: "https://example.dev/blog/when-to-rerank",
    summary:
      "Cross-encoder reranking pays for itself above ~20 candidates; below that the latency cost outweighs the ordering gain.",
    content: `Hybrid search: when to rerank

Reranking is not free and it is not always worth it. The useful framing is: how wrong
is your first-stage ordering, and how much does the consumer care about position?

If you retrieve 8 candidates and hand all 8 to a model, reranking changes the order but
not the set. Given "Lost in the Middle", order does matter — but with 8 items the
model can usually recover. Measured on our corpus, reranking 8 candidates improved
answer accuracy by 1.2 points and cost 140ms. Marginal.

At 50 candidates the picture inverts. First-stage ordering is noticeably wrong by then
— the true best chunk sits at rank 14 about a third of the time — and the model cannot
recover because rank 14 is squarely in the lost middle. Reranking there improved
accuracy 8.4 points for the same 140ms.

Practical rule: retrieve wide, rerank, then truncate narrow. Retrieving 8 and skipping
the reranker is a reasonable latency-optimised default. Retrieving 50 and skipping the
reranker is the worst of both — you pay to fetch context the model then misreads.`,
    metadata: { topic: "retrieval", source: "blog" },
  },
  {
    title: "Q3 planning — Orbital priorities",
    type: "google_doc",
    space: "sm_project_orbital",
    days: 52,
    summary:
      "Three Q3 priorities: replay correctness, cutting p99 start latency below 150ms, and shrinking the control plane's blast radius.",
    content: `Q3 planning — Orbital

Three priorities. Everything else is explicitly not a priority this quarter.

**1. Replay correctness.** We cannot currently reproduce an incident. RFC-014
(deterministic dispatch) is half of this; the membership snapshot is the other half.
Neither is useful alone. Target: any 5-minute window from the last 30 days can be
replayed to identical placement. Owner: Rhea.

**2. p99 job start latency under 150ms.** Currently 180ms steady-state. Most of the
gap is the membership freshness check, which does a synchronous round trip we could
serve from the local cache in the common case. Owner: Sam.

**3. Shrink control-plane blast radius.** Today a control-plane outage degrades
scheduling fleet-wide within 10 minutes (cache TTL). We want workers to keep
scheduling for an hour against a stale view, accepting placement drift. This is mostly
a correctness argument about what stale placement can do wrong, not a large code
change. Owner: Priya.

**Explicitly not this quarter:** multi-region failover, the admin UI rewrite, GPU
worker support. All three keep coming up and all three are cheaper after replay works.`,
    metadata: { quarter: "Q3-2026", source: "google-drive" },
  },
  {
    title: "Screenshot — dispatcher imbalance after HRW rollout",
    type: "image",
    space: "sm_project_orbital",
    days: 3,
    summary:
      "Grafana panel showing p99 worker imbalance settling at 9.2% after enabling HRW dispatch for 10% of eu-west.",
    content: `[Image: Grafana panel, "Worker load imbalance (p99)", 7-day window]

Extracted text: Panel title "Worker load imbalance (p99) — eu-west". Y-axis 0–15%.
The series is flat at approximately 4% until the vertical annotation marked
"HRW dispatch 10%" on Aug 3, after which it steps up and settles at approximately
9.2% with visible variance between 8.6% and 9.9%. A dashed horizontal threshold line
is drawn at 11% labelled "budget". The series stays below the threshold for the
entire post-rollout window.`,
    metadata: { source: "grafana", panel: "worker-imbalance" },
  },
  {
    title: "Thread on local-first AI tooling",
    type: "tweet",
    space: "sm_research",
    days: 15,
    url: "https://example.social/@dev/1789231",
    summary:
      "Argues the bottleneck for local AI tools is no longer model quality but ingestion ergonomics.",
    content: `Thread: the bottleneck for local-first AI tooling stopped being model quality about
a year ago.

1/ You can run a genuinely useful model on a laptop now. That was the hard part and it
is done. What is still bad is everything around it.

2/ Specifically: getting your data in. Every local tool wants you to configure a vector
DB, pick an embedding model, tune a chunk size, and write an ingestion script before
you see a single result.

3/ The tools that will win ship one binary that boots with sane defaults and indexes a
directory in the time it takes to read the README. Configurability comes after the
first success, not before it.

4/ Related: "bring your own OpenAI-compatible endpoint" is the right integration shape.
It means Ollama, LM Studio, vLLM and the hosted APIs are all the same code path.

5/ The counter-argument is that defaults are always wrong for someone. True. They are
also right for the 80% who would otherwise never get to step two.`,
    metadata: { platform: "social", likes: 2140 },
  },
  {
    title: "Vector index rebuild runbook",
    type: "text",
    space: "sm_codebase",
    days: 19,
    filepath: "docs/runbooks/index-rebuild.md",
    summary:
      "Steps to rebuild the local index after an embedding model change, including the shadow-index approach that avoids downtime.",
    content: `# Runbook: rebuilding the vector index

Trigger: you changed the embedding model or its dimensions. Mixed-model indexes return
nonsense — the vectors are not in the same space and cosine similarity between them is
meaningless, not merely noisy.

## Procedure
1. Build into a shadow index. Do not touch the live one. \`sm index rebuild --shadow\`.
2. Rebuild is CPU-bound; expect ~11ms per chunk on bge-base. For 41k chunks that is
   roughly 8 minutes on a laptop.
3. Run the recall check against the shadow: \`sm index verify --shadow --queries eval/queries.jsonl\`.
   It replays 200 known queries and compares the top-10 overlap against the live index.
   Expect 0.7-0.85 overlap for a model change; below 0.5 means something is wrong with
   the ingest, not the model.
4. Swap atomically: \`sm index promote --shadow\`. This is a pointer flip, not a copy.
5. Keep the old index for 24 hours. \`sm index gc\` removes it.

## Do not
- Do not rebuild in place. There is no consistent state during a partial rebuild and
  queries against it silently return partial results rather than erroring.
- Do not skip the verify step because the number "looked fine". The failure mode we
  actually hit was an ingest bug that dropped every chunk over 1400 tokens; recall
  looked great on short queries.`,
    metadata: { kind: "runbook", repo: "acme/orbital" },
  },
  {
    title: "Notes on SWIM membership under partial partitions",
    type: "text",
    space: "sm_project_orbital",
    days: 6,
    summary:
      "Working notes on what the circuit breaker does when only some workers can reach the control plane — currently undefined, and the failure is silent.",
    content: `# SWIM under partial partitions — working notes

Carry-over from week 31 sync. Question: what does the membership circuit breaker do
when the partition is partial — some workers reach the control plane, some do not?

What I have worked out so far:

The breaker is per-worker, so partitioned workers open their breakers and fall back to
their last-known-good view. Non-partitioned workers keep the fresh view. We now have
two populations scheduling against different membership views for up to 10 minutes.

With weighted-random dispatch this was survivable — placement was already
nondeterministic, so divergent views just changed the distribution slightly. With HRW
(RFC-014) it is worse: the two populations compute *different deterministic placements*
for the same job, and both believe they are correct. A job dispatched by a partitioned
worker and a healthy worker lands in two places.

At-least-once delivery means duplicate execution is legal, so this is not a
correctness bug in the strict sense. But it converts a rare event into a systematic
one during any partial partition, and our duplicate rate is a metric people watch.

Options I see:
1. Include the membership view version in the placement hash. Divergent views then
   produce visibly different placements and we can detect it, but we still dispatch.
2. Refuse to dispatch against a view older than N seconds. Trades availability for
   consistency — the opposite of the priority-3 direction in Q3 planning.
3. Accept it and make the duplicate rate alarm view-version-aware.

I do not have a recommendation yet. Leaning (1) plus (3). Need to write the test
before I argue for anything.`,
    metadata: { status: "draft", author: "wende" },
  },
  {
    title: "Onboarding deck — how Orbital schedules work",
    type: "google_slide",
    space: "sm_project_orbital",
    days: 110,
    summary:
      "Slide deck used for new-hire onboarding covering the job lifecycle end to end.",
    content: `Onboarding: how Orbital schedules work

Slide 1 — A job is a function, a deadline, and an idempotency key. That is the whole
data model. Everything else is scheduling.

Slide 2 — The lifecycle: submitted, appended to the log, observed by workers, placed
by the dispatcher, executed under a deadline, completion appended to the log.

Slide 3 — There is no central dispatcher. Every worker computes placement locally from
the same membership view and only executes the jobs that hash to itself. Nobody
assigns work; workers claim it.

Slide 4 — Why: a central dispatcher is a single point of failure in the hot path. We
would rather have N workers occasionally disagree than one dispatcher occasionally
down.

Slide 5 — The cost of that choice: workers must agree on the membership view, which is
why so much of this system is really about gossip convergence.

Slide 6 — At-least-once, always. Write idempotent handlers. This is not negotiable and
it is not something we plan to fix, because fixing it would require the central
coordinator from slide 4.`,
    metadata: { source: "google-drive", audience: "new hires" },
  },
  {
    title: "Cost model — hosted vs local memory backend",
    type: "google_sheet",
    space: "sm_research",
    days: 29,
    summary:
      "Spreadsheet comparing per-document cost of hosted supermemory against self-hosting; crossover at roughly 180k documents/month.",
    content: `Cost model — hosted vs local memory backend

Assumptions: 1.1k tokens/chunk, 3.4 chunks/document average, extraction with a small
hosted model at $0.15/M input tokens, embeddings local (free) in the self-hosted case.

Hosted: flat per-document price, no infra to run.
Self-hosted: embedding cost goes to zero, extraction cost stays (unless you run a local
model, which trades dollars for latency), plus whatever the machine costs.

Crossover lands near 180k documents/month, but the number is less interesting than the
shape: below crossover the hosted price is dominated by convenience you actually want,
and above it you are paying a margin on compute you could run yourself.

The real decision driver in our case is not cost. It is that the research corpus
contains unpublished work, and "it never leaves the laptop" is worth more than the
delta either way.`,
    metadata: { source: "google-drive", crossover_docs: 180000 },
  },
  {
    title: "Podcast — building a memory layer for agents",
    type: "audio",
    space: "sm_research",
    days: 41,
    summary:
      "Interview covering why agent memory is a retrieval problem plus a forgetting problem, and why most systems only solve the first.",
    content: `[Transcript excerpt — "Building a memory layer for agents", 62 min]

...the thing almost everyone gets wrong is treating memory as purely additive. You
build a great retrieval system, you index everything the agent ever saw, and six months
later it confidently tells you a fact that stopped being true in March.

Retrieval is the easy half. The hard half is knowing what to stop believing.

Three mechanisms you need. First, versioning — when a fact is updated you keep the old
version and mark it superseded, so you can answer "what did we think in March" as well
as "what is true now". Second, explicit forgetting — a memory can be retired with a
reason, and the reason matters because it tells you whether to retire the things
derived from it. Third, temporal scoping — some facts are true for a window and the
window is part of the fact.

The failure mode when you skip this is not that the system says "I don't know". It is
that it says something false with exactly the same confidence as something true, and
you have no way to tell which is which from the outside...`,
    metadata: { duration_min: 62, kind: "podcast" },
  },
  {
    title: "Conference talk — retrieval evaluation that survives contact with users",
    type: "video",
    space: "sm_research",
    days: 67,
    summary:
      "Argues offline retrieval metrics diverge from user-perceived quality because real queries are underspecified.",
    content: `[Talk transcript — "Retrieval evaluation that survives contact with users", 28 min]

Your recall@10 went from 0.71 to 0.83 and users say search got worse. This happens
constantly and the reason is boring: your eval queries are well-formed and real queries
are not.

Real queries are underspecified. "the retry thing" is a real query. It has no keyword
overlap with the document, no clear intent, and three plausible answers. Your eval set
has "what backoff strategy does the worker SDK use", which is a question nobody types.

Two fixes that actually moved our numbers. One: build the eval set from logged queries,
not from documents. Sample real queries, have a human label the correct answer, accept
that a third of them are ambiguous and label those as multi-answer. Two: measure
whether the right answer is in position one, not whether it is in the top ten. Users do
not scroll, and neither do models — position one is most of the signal.

The uncomfortable implication is that a lot of published retrieval improvements are
improvements on the well-formed-query distribution, which is not the one you serve.`,
    metadata: { duration_min: 28, venue: "SearchConf 2026" },
  },
  {
    title: "Email thread — vendor security review for local deployment",
    type: "text",
    space: "sm_project_orbital",
    days: 44,
    summary:
      "Security team approved the local memory backend on the basis that no document content leaves the machine.",
    content: `Subject: Re: Security review — local memory backend

> Can you confirm what leaves the machine?

Confirmed. With local embeddings enabled (the default), document content never leaves
the host. The embedding model runs in-process. The vector index is a file on local
disk.

The one network call is memory extraction, which posts chunk text to whatever
OpenAI-compatible endpoint is configured. If that endpoint is a hosted API, chunk text
leaves the machine. If it is Ollama on localhost, nothing does. We are running Ollama
for the research space and a hosted model for everything else.

> And the API key?

Generated locally on first boot, stored in the state directory, never transmitted
anywhere. It authenticates requests to the local server, which binds to 127.0.0.1 by
default — it is not reachable off-box unless you explicitly change the bind address.

---

Approved for the research corpus on the condition that space uses the local LLM
endpoint. Please document the configuration so it survives a laptop rebuild.`,
    metadata: { kind: "email", outcome: "approved" },
  },
  {
    title: "Chunking strategy comparison",
    type: "text",
    space: "sm_research",
    days: 55,
    summary:
      "Semantic chunking beat fixed-size on our corpus but only because our documents have real headings; on transcripts the two were identical.",
    content: `# Chunking strategy comparison

Compared fixed-size (1200 tokens, 200 overlap), recursive-by-separator, and semantic
(embedding-similarity boundary detection) on two corpora.

**Structured corpus** (RFCs, ADRs, runbooks — documents with real headings):
semantic chunking won by 6.1 points recall@10. But inspecting the boundaries, semantic
chunking was mostly rediscovering the headings. Recursive-by-separator with heading
awareness got within 1.4 points at a fraction of the cost.

**Transcript corpus** (meetings, podcasts — no structure):
all three strategies were within noise of each other. Semantic chunking's boundaries
looked arbitrary on inspection, because there genuinely is no boundary to find in a
conversation that drifts.

Conclusion: chunking strategy is a proxy for "does this document have structure". If it
does, use the structure. If it does not, fixed-size with generous overlap is fine and
anything cleverer is a cost with no benefit.

Practical default: 1200 tokens, split on headings where present, 200-token overlap.
That is what we shipped.`,
    metadata: { topic: "chunking", conclusion: "structure-aware" },
  },
  {
    title: "Postmortem action item tracker",
    type: "notion_doc",
    space: "sm_meetings",
    days: 11,
    summary:
      "Status of action items from the July incidents; two of five still open, both owned by Rhea.",
    content: `# Postmortem action items

From 2026-07-19 (retry storm, sev2):
- [x] Decorrelated jitter in worker SDK — shipped 2026-07-22
- [x] Circuit breaker on membership client — shipped 2026-07-23
- [x] Last-known-good view cache, 10 min TTL — shipped 2026-07-23
- [ ] Test coverage for partial partition behaviour — **open**, Rhea. Blocked on
      deciding what the correct behaviour actually is; see the SWIM working notes.
- [ ] Runbook entry for "membership endpoint is down" — **open**, Rhea.

From 2026-06-30 (index corruption, sev3):
- [x] Shadow-index rebuild procedure — documented in the rebuild runbook
- [x] Verify step made mandatory in the promote path — shipped 2026-07-04

Note: the two open items are both mine and both older than two weeks. Flagging in the
next sync rather than quietly rolling them again.`,
    metadata: { source: "notion", open_items: 2 },
  },
  {
    title: "S3 bucket inventory — archived training runs",
    type: "onedrive",
    space: "sm_research",
    days: 78,
    summary:
      "Index of archived training-run artifacts and which experiments they belong to.",
    content: `Archived training run inventory (s3://acme-research-archive/)

runs/2026-03-reranker-v1/    — cross-encoder rerank baseline, MiniLM backbone.
                               Superseded by v2; kept for the ablation table.
runs/2026-04-reranker-v2/    — same architecture, larger backbone. This is the one
                               referenced in the "when to rerank" numbers.
runs/2026-05-chunk-ablation/ — the fixed vs recursive vs semantic comparison.
                               Contains the per-query breakdown, which is more useful
                               than the summary numbers.
runs/2026-06-embed-eval/     — MTEB-style eval of the four embedding candidates on our
                               own corpus. This is what the model-selection note is
                               based on.

Retention: these are on lifecycle policy to glacier after 180 days. The chunk ablation
per-query data is the one thing here I would actually miss; pulled a local copy.`,
    metadata: { source: "s3", bucket: "acme-research-archive" },
  },
  {
    title: "Crawled: supermemory self-hosting docs",
    type: "webpage",
    space: "sm_personal",
    days: 5,
    url: "https://supermemory.ai/docs/self-hosting/overview",
    summary:
      "Official docs for the local binary: single file, port 6767, embedded graph engine, local embeddings by default.",
    content: `Supermemory local — overview

State-of-the-art memory, running on your machine. The same memory engine behind the
hosted platform — ingestion, memory extraction, hybrid semantic search, and the full
API — as a single self-contained binary. It boots in seconds with everything built in.

The server listens on http://localhost:6767 and speaks the same API as the hosted
platform: /v3/documents, /v4/search, /v4/profile, spaces, and the rest. Point any
supermemory SDK at it by setting baseURL.

Included: embedded graph engine with no external database, local embeddings by default
(Xenova/bge-base-en-v1.5), hybrid semantic search, file ingestion for PDFs and images,
and an API key generated on first boot.

Model providers: any OpenAI-compatible endpoint — OpenAI, Anthropic, Gemini, Groq,
Ollama, LM Studio, vLLM. Running against a local model makes the whole pipeline
offline.

Bring any OpenAI-compatible model for extraction; embeddings stay local by default.`,
    metadata: { source: "web-crawler", crawled: true },
  },
  {
    title: "Draft: memory forgetting policy",
    type: "text",
    space: "sm_project_orbital",
    days: 2,
    status: "embedding",
    summary:
      "In-progress draft on when memories should expire automatically versus require explicit retirement.",
    content: `# Draft: memory forgetting policy

Three categories of memory and what should happen to each.

**Static facts** (preferences, standing decisions). Never expire on a timer. They are
retired explicitly or superseded by a new version. "I don't take meetings before 11"
does not become less true because it is six months old.

**Observations** (what happened, what was measured). Expire on a long timer — a year —
because they remain true but stop being relevant. The 2026-07-19 incident happened and
will always have happened; whether it should surface in a search a year from now is a
different question.

**Inferences** (derived by combining other memories). Expire when any source expires.
This is the case Sam raised in the design review and nobody had an answer for. My
answer: an inference is only as live as its weakest source, and re-deriving it is
cheap. Retire aggressively.

Open: what "retire" means for the graph. Do we drop the edges or keep them marked? I
think keep — a forgotten memory with visible edges explains why an answer changed,
which is the thing users actually ask about.`,
    metadata: { status: "draft", author: "wende" },
  },
  {
    title: "Uploaded: bge-base model card",
    type: "pdf",
    space: "sm_research",
    days: 1,
    status: "chunking",
    summary:
      "Model card for BAAI/bge-base-en-v1.5, the default local embedding model.",
    content: `BAAI/bge-base-en-v1.5 — model card

Architecture: BERT-base, 12 layers, 768 hidden dimensions, 110M parameters.
Max sequence length: 512 tokens. Inputs longer than this are truncated, not chunked —
the caller is responsible for chunking.

Training: contrastive pretraining on a large unsupervised text pair corpus followed by
supervised fine-tuning on labelled retrieval data.

Retrieval note: for asymmetric retrieval (short query, long passage) prefix queries
with "Represent this sentence for searching relevant passages:". Passages take no
prefix. Skipping the query prefix costs roughly 1-2 points of retrieval accuracy.

Similarity: cosine over L2-normalised embeddings. The normalisation is not optional —
raw dot products on unnormalised vectors of this model are not calibrated.

License: MIT.`,
    metadata: { model: "bge-base-en-v1.5", params: "110M" },
  },
  {
    title: "Failed import: legacy wiki export",
    type: "text",
    space: "sm_codebase",
    days: 9,
    status: "failed",
    summary:
      "Import of the pre-2024 Confluence export failed on malformed XML in the attachments manifest.",
    content: `Import job for confluence-export-2023.zip failed during extraction.

Error: unexpected end of XML at attachments/manifest.xml line 4,281. The manifest
references 12,004 attachments but the document element is never closed — the export
was almost certainly truncated at generation time rather than corrupted in transit
(the archive checksum matches).

Retried twice with the same result. The fix is to regenerate the export, not to retry
this one. Left here rather than deleted so the failure is visible in the pipeline view
instead of being silently absent.`,
    metadata: { error: "malformed_xml", retries: 2 },
  },
  {
    title: "Queued: quarterly board update draft",
    type: "google_doc",
    space: "sm_meetings",
    days: 0,
    status: "queued",
    summary: "Draft board update for Q3, awaiting ingestion.",
    content: `Q3 board update — draft

Headline: replay correctness is the quarter's single deliverable and it is roughly half
done. Deterministic dispatch shipped behind a flag and is running for 10% of eu-west.
The membership snapshot is the remaining half and it is the harder half.

Reliability: one sev2 (retry storm, 41 minutes degraded, no data loss) and one sev3.
Both have shipped fixes; two action items remain open and are called out below rather
than buried.

Efficiency: p99 job start latency is 180ms against a 150ms target. The gap is a
synchronous membership check we believe is removable.

Ask: nothing this quarter.`,
    metadata: { quarter: "Q3-2026", draft: true },
  },
  {
    title: "Extracting: annual architecture review notes",
    type: "text",
    space: "sm_project_orbital",
    days: 0,
    status: "extracting",
    summary: "Long-form review notes currently being processed.",
    content: `Annual architecture review — raw notes

The recurring theme across every system we reviewed is that our failure modes are
almost all synchronisation failures rather than capacity failures. We have never run
out of CPU. We have repeatedly had every machine do the same thing at the same instant.

That suggests the useful investment is in desynchronisation primitives — jitter,
staggered rollout, per-host offsets — rather than in headroom. We keep buying headroom
because it is easy to buy.

Second theme: every system where we could not reproduce a failure took an order of
magnitude longer to fix than one where we could. Replay is not a nice-to-have. It is
the difference between a two-hour fix and a two-week one, and we have the incident data
to show it.`,
    metadata: { kind: "review", year: 2026 },
  },
];

/* ------------------------------------------------------------------ */
/* Build documents                                                     */
/* ------------------------------------------------------------------ */

function docId(i: number): string {
  return `doc_${(i + 1).toString(36).padStart(4, "0")}k${((i * 7919) % 46656)
    .toString(36)
    .padStart(3, "0")}`;
}

export const DOCUMENTS: Document[] = DOC_SEEDS.map((s, i) => {
  const created = ago(s.days, (i * 3) % 24);
  const status: DocumentStatus = s.status ?? "done";
  return {
    id: docId(i),
    customId: s.filepath ? `gh:${s.filepath}` : null,
    title: s.title,
    summary: s.summary,
    content: s.content,
    type: s.type,
    status,
    containerTags: [s.space],
    metadata: s.metadata ?? null,
    url: s.url ?? null,
    filepath: s.filepath ?? null,
    connectionId: null,
    createdAt: created,
    updatedAt: ago(Math.max(0, s.days - 1), (i * 5) % 24),
    chunkCount:
      status === "done" ? Math.max(1, Math.round(s.content.length / 620)) : 0,
  };
});

/** Split a document into chunks on paragraph boundaries, capped by size. */
export function chunksFor(doc: Document): DocumentChunk[] {
  if (doc.status !== "done") return [];
  const paragraphs = doc.content.split(/\n\n+/).filter((p) => p.trim());
  const target = 620;
  const out: DocumentChunk[] = [];
  let buf = "";
  const flush = () => {
    if (!buf.trim()) return;
    out.push({
      id: `${doc.id}_c${out.length}`,
      documentId: doc.id,
      content: buf.trim(),
      position: out.length,
      tokens: Math.round(buf.trim().length / 3.8),
    });
    buf = "";
  };
  for (const p of paragraphs) {
    if (buf.length + p.length > target) flush();
    buf += (buf ? "\n\n" : "") + p;
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Memory entries                                                      */
/* ------------------------------------------------------------------ */

interface MemSeed {
  memory: string;
  space: string;
  docs: number[];
  days: number;
  isStatic?: boolean;
  isInference?: boolean;
  forgotten?: boolean;
  forgetReason?: string;
  /** Previous wordings, oldest first — become versions 1..n-1. */
  history?: string[];
  relations?: { to: number; relation: MemoryRelation }[];
  temporal?: { validFrom?: string; validUntil?: string; note?: string };
  metadata?: Record<string, string | number | boolean>;
}

const MEM_SEEDS: MemSeed[] = [
  {
    memory:
      "Orbital's dispatcher uses rendezvous (HRW) hashing over (job_id, worker_id) so that placement is a pure function of the job and the membership view.",
    space: "sm_project_orbital",
    docs: [0, 2],
    days: 12,
    history: [
      "Orbital's dispatcher picks workers with weighted random selection plus jitter.",
    ],
    relations: [
      { to: 1, relation: "extends" },
      { to: 3, relation: "derives" },
    ],
    metadata: { rfc: 14, confidence: "high" },
  },
  {
    memory:
      "Deterministic placement was adopted so that a failed scheduling window can be replayed to identical worker assignment, which weighted-random dispatch made impossible.",
    space: "sm_project_orbital",
    docs: [0, 14],
    days: 12,
    metadata: { rfc: 14 },
  },
  {
    memory:
      "Switching to HRW dispatch raised p99 worker load imbalance from about 4% to about 9.2% in production, within the 11% budget derived from synthetic load tests.",
    space: "sm_project_orbital",
    docs: [0, 7, 15],
    days: 3,
    history: [
      "Switching to HRW dispatch is expected to raise p99 worker load imbalance from 4% to about 11% based on synthetic burst load.",
    ],
    temporal: { validFrom: ago(3), note: "measured after 10% eu-west rollout" },
    metadata: { metric: "p99_imbalance", value: 9.2 },
  },
  {
    memory:
      "Deterministic dispatch alone does not enable replay — it must be paired with a snapshot of the membership view, and neither half is useful without the other.",
    space: "sm_project_orbital",
    docs: [0, 14],
    days: 11,
    isInference: true,
    relations: [{ to: 0, relation: "derives" }],
    metadata: { derived: true },
  },
  {
    memory:
      "The HRW dispatch rollout is held at 10% of eu-west workers until the membership snapshot ships, because raising it without replay buys nothing and doubles blast radius.",
    space: "sm_project_orbital",
    docs: [7],
    days: 3,
    temporal: { validFrom: ago(3), note: "current rollout gate" },
    metadata: { rollout_pct: 10 },
  },
  {
    memory:
      "The 2026-07-19 eu-west incident was a retry storm: a 90-second control-plane blip synchronised 340 workers that all used fixed 1-second backoff, and they re-saturated the membership endpoint for 38 minutes.",
    space: "sm_project_orbital",
    docs: [1],
    days: 17,
    relations: [
      { to: 6, relation: "extends" },
      { to: 7, relation: "extends" },
    ],
    metadata: { severity: "sev2", duration_min: 41 },
  },
  {
    memory:
      "The worker SDK uses decorrelated jitter for backoff — sleep = min(cap, random(base, previous*3)) with base 100ms, cap 20s, 8 attempts — because fixed and plain-exponential backoff both keep a fleet synchronised after a shared blip.",
    space: "sm_codebase",
    docs: [12, 1],
    days: 26,
    history: [
      "The worker SDK retries with fixed 1-second backoff, 8 attempts.",
      "The worker SDK uses exponential backoff with a 20s cap.",
    ],
    metadata: { package: "worker-sdk", base_ms: 100, cap_s: 20 },
  },
  {
    memory:
      "Every worker SDK client wraps its transport in a circuit breaker that opens after 5 consecutive failures and half-opens after 30 seconds with a single probe request.",
    space: "sm_codebase",
    docs: [12, 1],
    days: 26,
    metadata: { package: "worker-sdk" },
  },
  {
    memory:
      "When the membership breaker is open, workers keep scheduling against their last-known-good view for up to 10 minutes — degraded placement is preferred to no placement.",
    space: "sm_codebase",
    docs: [12, 1, 14],
    days: 26,
    metadata: { ttl_min: 10 },
  },
  {
    memory:
      "A rate limiter in front of the membership endpoint was considered and rejected during the retry-storm postmortem, on the grounds that it converts a retry storm into a queue and only relocates the latency.",
    space: "sm_project_orbital",
    docs: [1],
    days: 17,
    metadata: { decision: "rejected" },
  },
  {
    memory:
      "Under a partial partition, HRW dispatch lets partitioned and healthy workers compute different deterministic placements for the same job, systematically producing duplicate execution where weighted-random only did so rarely.",
    space: "sm_project_orbital",
    docs: [18, 12],
    days: 6,
    isInference: true,
    relations: [
      { to: 0, relation: "derives" },
      { to: 8, relation: "derives" },
    ],
    metadata: { status: "open question", derived: true },
  },
  {
    memory:
      "Orbital delivers jobs at-least-once and does not deduplicate; every job handler must tolerate running twice with the same input, and this is a deliberate permanent choice rather than a gap.",
    space: "sm_codebase",
    docs: [2, 12, 19],
    days: 40,
    isStatic: true,
    metadata: { contract: "at-least-once" },
  },
  {
    memory:
      "Orbital has no central dispatcher — every worker computes placement locally from the shared membership view and claims only the jobs that hash to itself.",
    space: "sm_project_orbital",
    docs: [2, 19],
    days: 40,
    metadata: { pattern: "claim-based" },
  },
  {
    memory:
      "The control plane is a 5-member Raft group that owns the job log and never contacts workers directly; keeping it out of the hot path is the reason placement is computed worker-side.",
    space: "sm_codebase",
    docs: [2, 19],
    days: 40,
    relations: [{ to: 12, relation: "extends" }],
    metadata: { raft_members: 5 },
  },
  {
    memory:
      "Membership uses SWIM gossip with a 200ms probe interval; views converge in about 2 seconds at current fleet size and are versioned so the dispatcher can refuse a stale view.",
    space: "sm_codebase",
    docs: [2],
    days: 40,
    metadata: { protocol: "SWIM", probe_ms: 200 },
  },
  {
    memory:
      "Q3 2026 has exactly three Orbital priorities: replay correctness (Rhea), p99 job start latency under 150ms (Sam), and shrinking control-plane blast radius (Priya).",
    space: "sm_project_orbital",
    docs: [14],
    days: 52,
    temporal: { validFrom: ago(52), validUntil: ago(-57), note: "Q3 2026" },
    metadata: { quarter: "Q3-2026" },
  },
  {
    memory:
      "Multi-region failover, the admin UI rewrite, and GPU worker support are explicitly not Q3 priorities, because all three get cheaper once replay works.",
    space: "sm_project_orbital",
    docs: [14],
    days: 52,
    metadata: { quarter: "Q3-2026", kind: "non-goals" },
  },
  {
    memory:
      "p99 job start latency is 180ms against a 150ms target, and most of the gap is a synchronous membership freshness check that could be served from the local cache in the common case.",
    space: "sm_project_orbital",
    docs: [14, 30],
    days: 52,
    metadata: { p99_ms: 180, target_ms: 150 },
  },
  {
    memory:
      "Language models recall information at the start and end of a context far better than in the middle, and extended-context model variants do not fix middle-position recall — they only tolerate more tokens before failing.",
    space: "sm_research",
    docs: [3],
    days: 96,
    metadata: { paper: "Lost in the Middle", venue: "TACL 2024" },
  },
  {
    memory:
      "Because of the lost-in-the-middle effect, ordering retrieved chunks well is higher-leverage than retrieving more of them; concatenating 50 passages in similarity order wastes accuracy.",
    space: "sm_research",
    docs: [3, 13],
    days: 96,
    isInference: true,
    relations: [{ to: 18, relation: "derives" }],
    metadata: { derived: true },
  },
  {
    memory:
      "Cross-encoder reranking is worth its ~140ms above roughly 20 candidates: at 8 candidates it bought 1.2 accuracy points, at 50 candidates it bought 8.4.",
    space: "sm_research",
    docs: [13],
    days: 48,
    relations: [{ to: 19, relation: "extends" }],
    metadata: { latency_ms: 140 },
  },
  {
    memory:
      "The practical retrieval rule adopted here is: retrieve wide, rerank, then truncate narrow — retrieving 50 without reranking is the worst configuration of the three.",
    space: "sm_research",
    docs: [13],
    days: 48,
    isInference: true,
    relations: [{ to: 20, relation: "derives" }],
    metadata: { derived: true },
  },
  {
    memory:
      "bge-base-en-v1.5 was chosen as the default local embedding model: 53.2 MTEB retrieval average at 11ms per chunk on CPU, versus e5-large's 55.1 at 38ms.",
    space: "sm_research",
    docs: [4, 30],
    days: 34,
    history: [
      "all-MiniLM-L6-v2 is the default local embedding model, chosen for its 62MB index size.",
    ],
    relations: [{ to: 23, relation: "extends" }],
    metadata: { model: "bge-base-en-v1.5", dim: 768 },
  },
  {
    memory:
      "gte-modernbert-base scores 55.8 on MTEB retrieval at the same 14ms latency as bge-base, and is the model to revisit once quantised weights are widely available.",
    space: "sm_research",
    docs: [4],
    days: 34,
    metadata: { model: "gte-modernbert-base", revisit: true },
  },
  {
    memory:
      "all-MiniLM-L6-v2 was rejected as the local default because its 11-point retrieval drop is visible in practice — it confuses 'retry backoff' with 'retry storm' in our own incident corpus.",
    space: "sm_research",
    docs: [4],
    days: 34,
    metadata: { model: "all-MiniLM-L6-v2", decision: "rejected" },
  },
  {
    memory:
      "For indexes under about a million vectors, HNSW beats IVF-PQ: 0.98 recall@10 at 1.6x vector memory, versus 0.89 for IVF-PQ without a rerank pass.",
    space: "sm_research",
    docs: [5],
    days: 61,
    metadata: { topic: "vector-index" },
  },
  {
    memory:
      "The HNSW/IVF-PQ crossover is where the float32 index exceeds half of available RAM; above that, IVF-PQ should always be paired with an exact rerank over the top 100 candidates, never used alone.",
    space: "sm_research",
    docs: [5],
    days: 61,
    relations: [{ to: 25, relation: "extends" }],
    metadata: { topic: "vector-index" },
  },
  {
    memory:
      "Memory extraction is being split into two passes — high-recall claim detection, then claim normalisation — because the single-pass prompt silently dropped claims when normalisation was hard.",
    space: "sm_meetings",
    docs: [6],
    days: 8,
    metadata: { decision: true, version: "v3" },
  },
  {
    memory:
      "Memories carry an explicit isInference flag distinguishing engine-derived memories from ones read directly out of a document; it is in the data model now and behind a UI filter until inference volume is understood.",
    space: "sm_meetings",
    docs: [6],
    days: 8,
    metadata: { decision: true },
  },
  {
    memory:
      "Priya owns building the 200-claim human-labelled extraction eval set, due 2026-08-14; as of week 31 it stood at 140 of 200.",
    space: "sm_meetings",
    docs: [6, 7],
    days: 3,
    history: [
      "Priya owns building the 200-claim human-labelled extraction eval set, due 2026-08-14.",
    ],
    temporal: { validUntil: ago(-9), note: "due 2026-08-14" },
    metadata: { owner: "priya", progress: 140 },
  },
  {
    memory:
      "It is an open question what should happen to an inference when one of its source memories is forgotten; Sam owns writing up the options.",
    space: "sm_meetings",
    docs: [6, 29],
    days: 8,
    metadata: { owner: "sam", status: "open" },
  },
  {
    memory:
      "The draft forgetting policy is that static facts never expire on a timer, observations expire after a year, and inferences expire when any source expires.",
    space: "sm_project_orbital",
    docs: [29],
    days: 2,
    relations: [{ to: 30, relation: "extends" }],
    metadata: { status: "draft" },
  },
  {
    memory:
      "A forgotten memory should keep its graph edges rather than dropping them, because visible edges from a retired memory explain why an answer changed.",
    space: "sm_project_orbital",
    docs: [29],
    days: 2,
    metadata: { status: "draft" },
  },
  {
    memory:
      "Rhea does not take meetings before 11:00 local, keeps mornings for deep work, and does not want to be paged outside a genuine sev1.",
    space: "sm_personal",
    docs: [8],
    days: 300,
    isStatic: true,
    metadata: { kind: "preference" },
  },
  {
    memory:
      "Rhea's decision-making default is written-first: if a decision is worth arguing about it gets an RFC, and meetings exist to resolve disagreement on a document that already exists.",
    space: "sm_personal",
    docs: [8],
    days: 300,
    isStatic: true,
    metadata: { kind: "preference" },
  },
  {
    memory:
      "Rhea writes TypeScript with strict mode always on, prefers explicit code over clever code, and avoids dependencies that do less than 100 lines of work.",
    space: "sm_personal",
    docs: [8],
    days: 300,
    isStatic: true,
    metadata: { kind: "preference", language: "typescript" },
  },
  {
    memory:
      "Rhea prefers terminal-first tools and picks local over hosted whenever the trade-off is close.",
    space: "sm_personal",
    docs: [8, 10],
    days: 300,
    isStatic: true,
    metadata: { kind: "preference" },
  },
  {
    memory:
      "The supermemory local binary serves the full Memory API on port 6767, boots in about two seconds, embeds its own graph engine, and generates an API key on first boot.",
    space: "sm_personal",
    docs: [10, 27],
    days: 5,
    metadata: { tool: "supermemory", port: 6767 },
  },
  {
    memory:
      "Local supermemory runs embeddings in-process with Xenova/bge-base-en-v1.5, so ingestion completes with the network disconnected.",
    space: "sm_personal",
    docs: [10, 27, 23],
    days: 5,
    relations: [{ to: 22, relation: "extends" }],
    metadata: { tool: "supermemory", offline: true },
  },
  {
    memory:
      "The local supermemory binary speaks the same v3/v4 Memory API as hosted — ingest, extraction, hybrid search, profiles, and spaces.",
    space: "sm_personal",
    docs: [10, 27],
    days: 5,
    metadata: { tool: "supermemory", scope: "api-parity" },
  },
  {
    memory:
      "Pointing a supermemory SDK at a local instance is a one-line change — set baseURL to http://localhost:6767 — because the local server speaks the identical v3/v4 contract.",
    space: "sm_personal",
    docs: [10, 27],
    days: 5,
    isInference: true,
    relations: [{ to: 39, relation: "derives" }],
    metadata: { derived: true },
  },
  {
    memory:
      "The codebase does not use an ORM: three of four worst latency incidents traced to generated queries nobody had read, so all SQL is written directly with a thin typed query builder.",
    space: "sm_codebase",
    docs: [11],
    days: 71,
    metadata: { adr: 7, status: "accepted" },
  },
  {
    memory:
      "Mixing embedding models within one index produces meaningless similarity scores, so an embedding model change requires a full index rebuild rather than incremental re-embedding.",
    space: "sm_codebase",
    docs: [17],
    days: 19,
    metadata: { kind: "runbook" },
  },
  {
    memory:
      "Index rebuilds go into a shadow index and are promoted by an atomic pointer flip; rebuilding in place has no consistent intermediate state and silently returns partial results.",
    space: "sm_codebase",
    docs: [17],
    days: 19,
    relations: [{ to: 42, relation: "extends" }],
    metadata: { kind: "runbook" },
  },
  {
    memory:
      "The mandatory post-rebuild verify step replays 200 known queries and compares top-10 overlap; below 0.5 overlap indicates an ingest bug rather than a model difference.",
    space: "sm_codebase",
    docs: [17],
    days: 19,
    metadata: { kind: "runbook", threshold: 0.5 },
  },
  {
    memory:
      "Chunking strategy is effectively a proxy for whether a document has structure: semantic chunking beat fixed-size by 6.1 points on structured documents and was within noise on transcripts.",
    space: "sm_research",
    docs: [24],
    days: 55,
    metadata: { topic: "chunking" },
  },
  {
    memory:
      "The shipped chunking default is 1200 tokens with 200-token overlap, split on headings where present.",
    space: "sm_research",
    docs: [24],
    days: 55,
    relations: [{ to: 45, relation: "derives" }],
    metadata: { chunk_tokens: 1200, overlap: 200 },
  },
  {
    memory:
      "Offline retrieval metrics diverge from perceived quality because real queries are underspecified — 'the retry thing' is a real query and has no keyword overlap with its answer.",
    space: "sm_research",
    docs: [23],
    days: 67,
    metadata: { topic: "evaluation" },
  },
  {
    memory:
      "Retrieval eval sets should be built from logged user queries rather than from documents, and should measure whether the right answer is at position one rather than in the top ten.",
    space: "sm_research",
    docs: [23],
    days: 67,
    relations: [{ to: 47, relation: "derives" }],
    metadata: { topic: "evaluation" },
  },
  {
    memory:
      "Security approved the local memory backend for the research corpus on the condition that the space uses a local Ollama endpoint, because chunk text leaves the machine only via the extraction call.",
    space: "sm_project_orbital",
    docs: [22],
    days: 44,
    metadata: { outcome: "approved", condition: "local LLM endpoint" },
  },
  {
    memory:
      "The local server binds to 127.0.0.1 by default and its API key is generated and stored locally, never transmitted.",
    space: "sm_personal",
    docs: [22, 27],
    days: 44,
    metadata: { bind: "127.0.0.1" },
  },
  {
    memory:
      "Two action items from the 2026-07-19 postmortem remain open — partial-partition test coverage and a membership-outage runbook entry — both owned by Rhea and both over two weeks old.",
    space: "sm_meetings",
    docs: [25, 18],
    days: 11,
    temporal: { validFrom: ago(11), note: "as of the Aug tracker review" },
    metadata: { open_items: 2, owner: "wende" },
  },
  {
    memory:
      "Across the annual architecture review, essentially every failure mode was a synchronisation failure rather than a capacity failure — the fleet has never run out of CPU but has repeatedly done the same thing at the same instant.",
    space: "sm_project_orbital",
    docs: [32],
    days: 0,
    isInference: true,
    relations: [{ to: 5, relation: "derives" }],
    metadata: { derived: true, kind: "review" },
  },
  {
    memory:
      "Incidents that could not be reproduced took roughly an order of magnitude longer to fix than reproducible ones, which is the empirical case for prioritising replay.",
    space: "sm_project_orbital",
    docs: [32, 14],
    days: 0,
    isInference: true,
    relations: [{ to: 1, relation: "derives" }],
    metadata: { derived: true },
  },
  {
    memory:
      "The cost crossover between hosted and self-hosted memory lands near 180k documents per month, but the deciding factor here was that the research corpus contains unpublished work.",
    space: "sm_research",
    docs: [21],
    days: 29,
    metadata: { crossover_docs: 180000 },
  },
  /* --- forgotten -------------------------------------------------- */
  {
    memory:
      "The dispatcher smooths load with random jitter, which keeps p99 worker imbalance near 4%.",
    space: "sm_project_orbital",
    docs: [2],
    days: 30,
    forgotten: true,
    forgetReason: "Superseded by RFC-014 — jitter-based dispatch was removed.",
    metadata: { superseded_by: "rfc-14" },
  },
  {
    memory:
      "Meetings space retains transcripts for 90 days before automatic expiry.",
    space: "sm_meetings",
    docs: [],
    days: 60,
    forgotten: true,
    forgetReason: "Retention was changed to 180 days; this value is stale.",
    metadata: { stale: true },
  },
  {
    memory:
      "The Confluence wiki export is the canonical source for pre-2024 architecture decisions.",
    space: "sm_codebase",
    docs: [31],
    days: 9,
    forgotten: true,
    forgetReason:
      "Import failed permanently on a truncated manifest; the export is not a usable source.",
    metadata: { import_failed: true },
  },
  {
    memory:
      "Sam owns reducing p99 job start latency below 150ms by end of Q2.",
    space: "sm_project_orbital",
    docs: [14],
    days: 140,
    forgotten: true,
    forgetReason: "Q2 target rolled into the Q3 plan; superseded by version 2.",
    metadata: { quarter: "Q2-2026" },
  },
];

function memId(i: number): string {
  return `mem_${(i + 1).toString(36).padStart(3, "0")}${((i * 104729) % 1679616)
    .toString(36)
    .padStart(4, "0")}`;
}

export const MEMORIES: MemoryEntry[] = MEM_SEEDS.map((s, i) => {
  const id = memId(i);
  const history: MemoryEntry["history"] = [];
  const versions = (s.history?.length ?? 0) + 1;

  (s.history ?? []).forEach((text, hi) => {
    history.push({
      id: `${id}_v${hi + 1}`,
      memory: text,
      version: hi + 1,
      createdAt: ago(s.days + (versions - hi) * 21),
      updatedAt: ago(s.days + (versions - hi - 1) * 21),
      parentMemoryId: hi === 0 ? null : `${id}_v${hi}`,
      rootMemoryId: `${id}_v1`,
      isLatest: false,
      isForgotten: false,
    });
  });
  history.push({
    id,
    memory: s.memory,
    version: versions,
    createdAt: ago(s.days),
    updatedAt: ago(s.days),
    parentMemoryId: versions > 1 ? `${id}_v${versions - 1}` : null,
    rootMemoryId: versions > 1 ? `${id}_v1` : id,
    isLatest: true,
    isForgotten: !!s.forgotten,
  });

  return {
    id,
    memory: s.memory,
    version: versions,
    isLatest: true,
    isForgotten: !!s.forgotten,
    isStatic: !!s.isStatic,
    isInference: s.isInference ?? false,
    createdAt: ago(s.days + (versions - 1) * 21),
    updatedAt: ago(s.days),
    spaceId: s.space,
    orgId: ORG_ID,
    sourceCount: s.docs.length,
    parentMemoryId: versions > 1 ? `${id}_v${versions - 1}` : null,
    rootMemoryId: versions > 1 ? `${id}_v1` : id,
    forgetAfter: null,
    forgetReason: s.forgetReason ?? null,
    metadata: s.metadata ?? null,
    memoryRelations:
      s.relations?.map((r) => ({
        targetId: memId(r.to),
        relation: r.relation,
      })) ?? null,
    temporalContext: s.temporal ?? null,
    history,
    documentIds: s.docs.map((d) => DOCUMENTS[d]?.id).filter(Boolean),
  };
});

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export const PROFILE = {
  static: [
    "Prefers deep work in the morning and takes no meetings before 11:00 local time.",
    "Writes decisions down first — an argument worth having is worth an RFC.",
    "Writes TypeScript with strict mode on and avoids sub-100-line dependencies.",
    "Terminal-first; chooses local tooling over hosted when the trade-off is close.",
    "Does not work weekends and does not want to be paged below sev1.",
  ],
  dynamic: [
    "Currently leading Q3 replay-correctness work on Orbital, roughly half delivered.",
    "Owns two overdue postmortem action items from the 2026-07-19 retry storm.",
    "Actively evaluating whether HRW dispatch is safe under partial partitions.",
    "Running supermemory locally with Ollama for the research space after a security review.",
    "Reading about long-context retrieval; recently changed position on reranking.",
  ],
  buckets: {
    working_style: [
      "Asynchronous and document-driven; meetings resolve disagreement rather than produce decisions.",
      "Prefers explicit code and reviewable SQL over abstraction layers.",
    ],
    technical_context: [
      "Distributed scheduling: Raft control plane, SWIM gossip, worker-side placement.",
      "Retrieval systems: HNSW indexes, cross-encoder reranking, local embeddings.",
      "TypeScript, Postgres without an ORM, terminal tooling.",
    ],
    current_projects: [
      "Orbital replay correctness (RFC-014 + membership snapshot).",
      "supermemory local evaluation for the private research corpus.",
    ],
    constraints: [
      "Research corpus contains unpublished work and must not leave the machine.",
      "Security approval for the local backend is conditional on a local LLM endpoint.",
    ],
  },
} as const;

/* ------------------------------------------------------------------ */
/* Settings & server info                                              */
/* ------------------------------------------------------------------ */

export const SETTINGS: OrgSettings = {
  shouldLLMFilter: true,
  filterPrompt:
    "Keep durable facts, decisions with rationale, measured numbers and ownership. Drop scheduling logistics, pleasantries and anything that will be false next week.",
  chunkSize: 1200,
  includeItems: ["*.md", "*.pdf", "docs/**", "adr/**"],
  excludeItems: ["node_modules/**", "*.lock", "dist/**", "*.min.js"],
  workspacePrompt:
    "This workspace belongs to a systems engineer working on distributed scheduling and retrieval infrastructure. Prefer precise technical phrasing and preserve exact numbers, thresholds and owner names.",
  profileBuckets: [
    {
      key: "working_style",
      description: "How this person prefers to work, decide and communicate.",
    },
    {
      key: "technical_context",
      description: "Systems, languages and domains they work in day to day.",
    },
    {
      key: "current_projects",
      description: "What they are actively delivering right now.",
    },
    {
      key: "constraints",
      description:
        "Hard limits — compliance, privacy, approvals and non-negotiables.",
    },
  ],
};

export const SERVER_INFO: ServerInfo = {
  version: "1.4.2",
  mode: "local",
  baseUrl: "http://localhost:6767",
  port: 6767,
  uptimeSeconds: 4 * 86400 + 7 * 3600 + 12 * 60,
  embeddings: {
    provider: "xenova",
    model: "bge-base-en-v1.5",
    dimensions: 768,
    local: true,
  },
  llm: {
    provider: "ollama",
    model: "qwen3:8b",
    baseUrl: "http://localhost:11434/v1",
  },
  storage: {
    engine: "embedded graph + hnsw",
    sizeBytes: 318_244_864,
    path: "~/.supermemory/state",
  },
  features: {
    ingest: true,
    memoryExtraction: true,
    hybridSearch: true,
    profiles: true,
    spaces: true,
    fileIngest: true,
    graph: true,
  },
  runtimeSource: "mock",
  runtimeSourceDir: null,
};

/** Daily ingest counts for the last 30 days — drives the activity chart. */
export const ACTIVITY: { date: string; documents: number; memories: number }[] =
  Array.from({ length: 30 }, (_, i) => {
    const d = 29 - i;
    const date = new Date(NOW - d * DAY).toISOString().slice(0, 10);
    const weekday = new Date(NOW - d * DAY).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    // Deterministic pseudo-random, weekday-weighted.
    const n = (i * 2654435761) % 97;
    const docs = weekend ? n % 3 : 2 + (n % 9);
    return { date, documents: docs, memories: docs * 2 + (n % 5) };
  });

/** Recent query latencies (ms) — drives the recall latency sparkline. */
export const LATENCIES: number[] = Array.from({ length: 40 }, (_, i) => {
  const n = (i * 1103515245 + 12345) % 61;
  return 28 + n + (i % 11 === 0 ? 40 : 0);
});
