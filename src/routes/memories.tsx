"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteParams } from "@/components/route-host";
import { Icon } from "@/components/icons";
import { FilterPill } from "@/components/blocks/filter-pill";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Modal,
  Empty,
  Input,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { invalidateCorpus, prefetch, useMemoryList, useSpaces } from "@/lib/queries";
import {
  getReviewLogSnapshot,
  getServerReviewLogSnapshot,
  isReviewed,
  persistReviewDecision,
  subscribeReviewLog,
} from "@/lib/review";
import {
  SearchOptionsPanel,
  SearchResultsPanel,
} from "@/components/blocks/search-results";
import { relTime, shortDate } from "@/lib/format";
import type {
  ContainerTag,
  MemoryEntry,
  SearchMode,
  SearchResponse,
} from "@/lib/types";

type Lens = "all" | "asserted" | "inferred" | "revised" | "forgotten";
type FilterMode = "text" | "semantic";

const FILTER_MODES: { key: FilterMode; label: string }[] = [
  { key: "text", label: "By text" },
  { key: "semantic", label: "Semantic" },
];

const LENSES: { key: Lens; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every live memory entry" },
  { key: "asserted", label: "Asserted", hint: "Stated directly, not extracted" },
  { key: "inferred", label: "Inferred", hint: "Derived from other memories" },
  { key: "revised", label: "Revised", hint: "Has more than one version" },
  { key: "forgotten", label: "Forgotten", hint: "Retired, edges retained" },
];

/** The list the tab opens on — shared with `warm()` so the cache keys match. */
const FIRST_PAGE = {
  sort: "updatedAt",
  page: 1,
  limit: 20,
  includeForgotten: false,
  onlyStatic: false,
  onlyInference: false,
  onlyVersioned: false,
} as const;

export function warm(): void {
  void prefetch.spaces();
  void prefetch.memories(FIRST_PAGE);
}

export default function MemoryBank() {
  const params = useRouteParams();
  const router = useRouter();
  const { push, view: toasts } = useToasts();

  const { spaces } = useSpaces();
  const spaceParam = params.get("space");
  const qParam = params.get("q");
  const filterMode: FilterMode =
    params.get("mode") === "semantic" ? "semantic" : "text";
  const isSemantic = filterMode === "semantic";

  const [space, setSpace] = useState(spaceParam ?? "");
  const [lens, setLens] = useState<Lens>("all");
  const [q, setQ] = useState(qParam ?? "");
  const [sort, setSort] = useState<"updatedAt" | "createdAt">("updatedAt");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("memories");
  const [threshold, setThreshold] = useState(0.5);
  const [limit, setLimit] = useState(10);
  const [rerank, setRerank] = useState(true);
  const [rewrite, setRewrite] = useState(false);
  const [aggregate, setAggregate] = useState(false);
  const [withDocs, setWithDocs] = useState(true);
  const [withChunks, setWithChunks] = useState(true);
  const [withForgotten, setWithForgotten] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchRes, setSearchRes] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const pipeline = { rerank, rewrite, aggregate };
  const include = { docs: withDocs, chunks: withChunks, forgotten: withForgotten };

  // Deep links like `/memories?space=` / `?q=` must win even though the tab
  // stays mounted. A missing param leaves the local filter alone so an
  // ordinary tab switch does not wipe it.
  useEffect(() => {
    if (spaceParam !== null) setSpace(spaceParam);
  }, [spaceParam]);

  useEffect(() => {
    if (qParam !== null) setQ(qParam);
  }, [qParam]);

  function setFilterMode(mode: FilterMode) {
    const next = new URLSearchParams(params.toString());
    if (mode === "semantic") next.set("mode", "semantic");
    else next.delete("mode");
    const qs = next.toString();
    router.replace(qs ? `/memories?${qs}` : "/memories", { scroll: false });
  }

  // Typing should not fire a request per keystroke; the cache keys off the
  // settled term so an earlier prefix stays cached and instant to go back to.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    if (isSemantic) return;
    const t = setTimeout(() => setDebouncedQ(q), q ? 220 : 0);
    return () => clearTimeout(t);
  }, [q, isSemantic]);

  const input = useMemo(
    () => ({
      ...FIRST_PAGE,
      containerTags: space ? [space] : undefined,
      q: debouncedQ.trim() || undefined,
      includeForgotten: lens === "forgotten",
      onlyStatic: lens === "asserted",
      onlyInference: lens === "inferred",
      onlyVersioned: lens === "revised",
      sort,
      page,
    }),
    [space, debouncedQ, lens, sort, page],
  );

  const { data, isLoading, isFetching } = useMemoryList(input, {
    keepPreviousData: true,
    enabled: !isSemantic,
  });

  const entries = useMemo(() => {
    const list = data?.memoryEntries ?? [];
    return lens === "forgotten" ? list.filter((m) => m.isForgotten) : list;
  }, [data, lens]);
  const total =
    lens === "forgotten" ? entries.length : (data?.pagination.totalItems ?? 0);
  const pages = data?.pagination.totalPages ?? 1;
  const loading = isLoading || (isFetching && !data);

  useEffect(() => setPage(1), [space, lens, debouncedQ, sort]);

  async function runSearch(overrides?: {
    query?: string;
    threshold?: number;
    searchMode?: SearchMode;
  }) {
    const query = overrides?.query ?? q;
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      setSearchRes(
        await api.search({
          q: query,
          searchMode: overrides?.searchMode ?? searchMode,
          containerTags: space ? [space] : undefined,
          threshold: overrides?.threshold ?? threshold,
          limit,
          rerank,
          rewriteQuery: rewrite,
          aggregate,
          include: {
            documents: withDocs,
            summaries: withDocs,
            chunks: withChunks,
            relatedMemories: true,
            forgottenMemories: withForgotten,
          },
        }),
      );
    } finally {
      setSearchLoading(false);
    }
  }

  // A memory changed: mark every view derived from the corpus stale. Visible
  // queries — this list included — refresh immediately; the other tabs pick the
  // change up when they are next shown.
  async function onForget(m: MemoryEntry, reason?: string) {
    await api.forgetMemory(m.id, reason, m.spaceId);
    push("Memory forgotten — edges kept", "neutral");
    setSelected(null);
    invalidateCorpus();
  }

  async function onRestore(m: MemoryEntry) {
    await api.restoreMemory(m.id);
    push("Memory restored", "good");
    setSelected(null);
    invalidateCorpus();
  }

  async function onSave(m: MemoryEntry, text: string) {
    const updated = await api.updateMemory(m.id, text);
    push(`Saved as v${updated.version} — previous version retained`, "good");
    setSelected(updated);
    invalidateCorpus();
  }

  async function onApprove(m: MemoryEntry) {
    await persistReviewDecision(m, "kept");
    push("Inference approved", "good");
    setSelected(null);
    // List shows isInference / needsReview — refresh so the row updates.
    invalidateCorpus();
  }

  async function onReject(m: MemoryEntry) {
    await persistReviewDecision(m, "discarded");
    push("Inference rejected — edges kept", "neutral");
    setSelected(null);
    invalidateCorpus();
  }

  const reviewLog = useSyncExternalStore(
    subscribeReviewLog,
    getReviewLogSnapshot,
    getServerReviewLogSnapshot,
  );

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Memory"
          title="Memory bank"
          description="Every extracted claim. Filter by text or semantic similarity. Editing writes a new version; forgetting retires an entry without deleting its edges."
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isSemantic) void runSearch();
          }}
          className="space-y-2"
        >
          <div className="relative">
            <Icon.search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-brand-black/40"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                isSemantic
                  ? "What do you know about how I like to work?"
                  : "Search for a name, place, or phrase…"
              }
              className="h-11 rounded-full border-brand-black/[0.06] py-0 pr-[11.5rem] pl-8 sm:text-[13px] shadow-none"
              aria-label={isSemantic ? "Semantic search" : "Filter memories"}
            />
            <div
              className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5 rounded-full border border-brand-black/[0.06] bg-muted/80 p-0.5"
              role="group"
              aria-label="Filter mode"
            >
              {FILTER_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setFilterMode(m.key);
                    if (m.key === "semantic" && q.trim()) {
                      void runSearch();
                    } else if (m.key === "text") {
                      setSearchRes(null);
                      setOptionsOpen(false);
                    }
                  }}
                  className={`focus-ring rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    filterMode === m.key
                      ? "bg-brand-black text-white"
                      : "text-brand-black/50 hover:text-brand-black/80"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {isSemantic && searchLoading && (
              <span className="pointer-events-none absolute top-1/2 right-[11.75rem] -translate-y-1/2">
                <Spinner />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-[9.5rem] sm:w-[168px] sm:flex-none">
              <Select
                value={space}
                onChange={(e) => setSpace(e.target.value)}
                aria-label="Space"
                className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none"
              >
                <option value="">All spaces</option>
                {spaces.map((s) => (
                  <option key={s.containerTag} value={s.containerTag}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            {!isSemantic && (
              <div className="min-w-0 flex-1 basis-full sm:w-[176px] sm:flex-none">
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  aria-label="Sort"
                  className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none"
                >
                  <option value="updatedAt">Recently updated</option>
                  <option value="createdAt">Recently created</option>
                </Select>
              </div>
            )}
            {isSemantic && (
              <button
                type="button"
                onClick={() => setOptionsOpen((o) => !o)}
                className="focus-ring rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-black/45 transition-colors hover:text-brand-black"
              >
                {optionsOpen ? "Hide options" : "Options"}
              </button>
            )}
            {isSemantic && (
              <span className="text-[11px] text-brand-black/40">
                Press Enter to search
              </span>
            )}
          </div>
        </form>

        {isSemantic && optionsOpen && (
          <SearchOptionsPanel
            searchMode={searchMode}
            onSearchModeChange={(mode) => {
              setSearchMode(mode);
              if (q.trim()) void runSearch({ searchMode: mode });
            }}
            pipeline={pipeline}
            onTogglePipeline={(key) => {
              if (key === "rerank") setRerank((v) => !v);
              if (key === "rewrite") setRewrite((v) => !v);
              if (key === "aggregate") setAggregate((v) => !v);
            }}
            include={include}
            onToggleInclude={(key) => {
              if (key === "docs") setWithDocs((v) => !v);
              if (key === "chunks") setWithChunks((v) => !v);
              if (key === "forgotten") setWithForgotten((v) => !v);
            }}
            threshold={threshold}
            onThresholdChange={setThreshold}
            limit={limit}
            onLimitChange={setLimit}
          />
        )}

        {!isSemantic && (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* The lenses stay on one swipeable line below `sm`; wrapping them
                stranded a single pill next to the count. */}
            <div className="scrollbar-hide flex max-w-full items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible">
              {LENSES.map((l) => (
                <FilterPill
                  key={l.key}
                  label={l.label}
                  active={lens === l.key}
                  onClick={() => setLens(l.key)}
                  title={l.hint}
                  className="px-3 text-[11px] tracking-[0.12em]"
                />
              ))}
            </div>
            <span className="tnum ml-auto self-center text-[11px] text-brand-black/40">
              {loading ? "…" : `${total} ${total === 1 ? "entry" : "entries"}`}
            </span>
          </div>
        )}

        {isSemantic ? (
          !q.trim() && !searchRes ? (
            <Card>
              <Empty
                title="Semantic filter needs a query"
                hint="Type a question and press Enter — results stay in this same list."
              />
            </Card>
          ) : (
            <SearchResultsPanel
              loading={searchLoading}
              res={searchRes}
              threshold={threshold}
              pipeline={pipeline}
              onRetryAtThreshold={(next) => {
                setThreshold(next);
                void runSearch({ threshold: next });
              }}
            />
          )
        ) : loading && !entries.length ? (
          <Card>
            <div className="space-y-0 divide-y divide-brand-black/[0.05] px-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-6 py-4">
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              ))}
            </div>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <Empty
              title="No memories match these filters"
              hint={
                lens === "forgotten"
                  ? "Nothing has been retired in this space yet."
                  : "Try clearing the text filter or switching space."
              }
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQ("");
                    setSpace("");
                    setLens("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-brand-black/[0.05]">
                  {entries.map((m) => (
                    <li key={m.id}>
                      <MemoryRow
                        entry={m}
                        spaces={spaces}
                        query={q}
                        onOpen={() => setSelected(m)}
                      />
                    </li>
                  ))}
            </ul>
          </Card>
        )}

        {!isSemantic && pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="tnum text-xs text-brand-black/55">
              {page} / {pages}
            </span>
            <Button
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </PageBody>

      <MemoryDrawer
        entry={selected}
        spaces={spaces}
        needsReview={Boolean(
          selected &&
            selected.isInference &&
            !selected.isForgotten &&
            !isReviewed(reviewLog, selected),
        )}
        onClose={() => setSelected(null)}
        onForget={onForget}
        onRestore={onRestore}
        onSave={onSave}
        onApprove={onApprove}
        onReject={onReject}
      />

      {toasts}
    </>
  );
}

/* ------------------------------------------------------------------ */

function MemoryRow({
  entry,
  spaces,
  query,
  onOpen,
}: {
  entry: MemoryEntry;
  spaces: ContainerTag[];
  query: string;
  onOpen: () => void;
}) {
  const spaceName = (
    spaces.find((s) => s.containerTag === entry.spaceId)?.name ?? entry.spaceId
  ).replace(/^Space\s+/i, "");

  return (
    <button
      type="button"
      onClick={() => {
        // Allow drag-select/copy without opening the drawer.
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        onOpen();
      }}
      className={`focus-ring group w-full select-text px-6 py-4 text-left transition-colors duration-200 hover:bg-brand-black/[0.025] ${
        entry.isForgotten ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-[7px] size-1.5 shrink-0 rounded-full"
          style={{
            background: entry.isForgotten
              ? "color-mix(in oklab, var(--brand-black) 40%, transparent)"
              : entry.isInference
                ? "var(--color-s2)"
                : entry.isStatic
                  ? "var(--color-s3)"
                  : "var(--color-s1)",
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={`select-text text-[13px] leading-relaxed text-brand-black/70 ${
              entry.isForgotten ? "line-through decoration-ink-4" : ""
            }`}
          >
            <HighlightedText text={entry.memory} query={query} />
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-brand-black/40">
            <span className="text-brand-black/55">{spaceName}</span>
            <span aria-hidden>·</span>
            <span title={shortDate(entry.updatedAt)}>{relTime(entry.updatedAt)}</span>

            {entry.version > 1 && (
              <span className="text-brand-black/35">
                v{entry.version} · {entry.history.length} versions
              </span>
            )}
            {entry.isStatic && <Badge tone="s3">asserted</Badge>}
            {entry.isInference && <Badge tone="s2">inferred</Badge>}
            {entry.isForgotten && <Badge tone="neutral">forgotten</Badge>}
            {entry.sourceCount > 0 && (
              <span>
                {entry.sourceCount} {entry.sourceCount === 1 ? "source" : "sources"}
              </span>
            )}
            {!!entry.memoryRelations?.length && (
              <span>{entry.memoryRelations.length} relations</span>
            )}
            {entry.temporalContext && (
              <span className="flex items-center gap-1">
                <Icon.clock size={11} />
                {entry.temporalContext.note ?? "time-scoped"}
              </span>
            )}
          </div>
        </div>
        <Icon.chevron
          size={14}
          className="mt-1 shrink-0 text-brand-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return text;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark
        key={i}
        className="rounded-sm bg-[color-mix(in_oklab,var(--color-s3)_32%,transparent)] px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/* ------------------------------------------------------------------ */

function MemoryDrawer({
  entry,
  spaces,
  needsReview,
  onClose,
  onForget,
  onRestore,
  onSave,
  onApprove,
  onReject,
}: {
  entry: MemoryEntry | null;
  spaces: ContainerTag[];
  needsReview?: boolean;
  onClose: () => void;
  onForget: (m: MemoryEntry, reason?: string) => Promise<void>;
  onRestore: (m: MemoryEntry) => Promise<void>;
  onSave: (m: MemoryEntry, text: string) => Promise<void>;
  onApprove: (m: MemoryEntry) => Promise<void>;
  onReject: (m: MemoryEntry) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [bundle, setBundle] = useState<{
    entryId: string;
    sources: { id: string; title: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEditing(false);
    setConfirming(false);
    setReason("");
    setDraft(entry?.memory ?? "");

    if (!entry) return;

    if (!entry.documentIds.length) {
      setBundle({ entryId: entry.id, sources: [] });
      return;
    }

    Promise.all(
      entry.documentIds.slice(0, 8).map((id) =>
        api.getDocument(id).catch(() => null),
      ),
    ).then((docs) => {
      if (cancelled) return;
      setBundle({
        entryId: entry.id,
        sources: docs
          .filter(Boolean)
          .map((d) => ({ id: d!.id, title: d!.title ?? "Untitled" })),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [entry]);

  const spaceName = useMemo(() => {
    const raw =
      spaces.find((s) => s.containerTag === entry?.spaceId)?.name ?? entry?.spaceId;
    return raw?.replace(/^Space\s+/i, "");
  }, [spaces, entry]);

  if (!entry) return null;

  const ready =
    !entry.documentIds.length || bundle?.entryId === entry.id;
  const sources = bundle?.entryId === entry.id ? bundle.sources : [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Memory entry"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Copyable value={entry.id} className="text-brand-black/55" />
          <span aria-hidden>·</span>
          <span>{spaceName}</span>
        </span>
      }
      footer={
        ready ? (
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={busy || !draft.trim() || draft === entry.memory}
                onClick={async () => {
                  setBusy(true);
                  await onSave(entry, draft.trim());
                  setBusy(false);
                  setEditing(false);
                }}
              >
                {busy && <Spinner />}
                Save as v{entry.version + 1}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <span className="text-[11px] text-brand-black/40">
                The current wording is kept as v{entry.version}.
              </span>
            </>
          ) : entry.isForgotten ? (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onRestore(entry);
                setBusy(false);
              }}
            >
              Restore memory
            </Button>
          ) : confirming ? (
            <>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="I changed my mind — this isn't true anymore"
                className="min-w-0 flex-1"
                autoFocus
              />
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onForget(entry, reason.trim() || undefined);
                  setBusy(false);
                }}
              >
                {busy && <Spinner />}
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {needsReview && (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onApprove(entry);
                      setBusy(false);
                    }}
                  >
                    {busy && <Spinner />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onReject(entry);
                      setBusy(false);
                    }}
                  >
                    Reject
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => setEditing(true)}>
                <Icon.edit size={13} />
                Revise
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                <Icon.trash size={13} />
                Forget
              </Button>
            </>
          )}
        </div>
        ) : undefined
      }
    >
      {!ready ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading memory">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : (
      <div className="animate-fade-in space-y-6">
        <section>
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="text-[13px] leading-relaxed"
              autoFocus
            />
          ) : (
            <p
              className={`text-sm leading-relaxed text-brand-black ${
                entry.isForgotten ? "line-through decoration-ink-4" : ""
              }`}
            >
              {entry.memory}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="text-[11px] text-brand-black/35">
              version {entry.version}
            </span>
            {entry.isStatic && <Badge tone="s3">asserted</Badge>}
            {entry.isInference && <Badge tone="s2">inferred</Badge>}
            {entry.isForgotten && <Badge tone="critical">forgotten</Badge>}
          </div>

          {entry.isForgotten && entry.forgetReason && (
            <p className="mt-3 rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-2 text-xs leading-relaxed text-brand-black/55">
              <span className="text-brand-black/70">Reason:</span> {entry.forgetReason}
            </p>
          )}
        </section>

        {entry.temporalContext && (
          <Section title="Temporal context">
            <dl className="space-y-1.5 text-xs">
              {entry.temporalContext.validFrom && (
                <Field
                  label="Valid from"
                  value={shortDate(entry.temporalContext.validFrom)}
                />
              )}
              {entry.temporalContext.validUntil && (
                <Field
                  label="Valid until"
                  value={shortDate(entry.temporalContext.validUntil)}
                />
              )}
              {entry.temporalContext.note && (
                <Field label="Note" value={entry.temporalContext.note} />
              )}
            </dl>
          </Section>
        )}

        {entry.history.length > 1 && (
          <Section title={`Version history (${entry.history.length})`}>
            <ol className="relative space-y-3 border-l border-brand-black/[0.06] pl-4">
              {[...entry.history].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span
                    className="absolute top-[6px] -left-[21px] size-[7px] rounded-full border-2 border-surface"
                    style={{
                      background: h.isLatest
                        ? "var(--color-s3)"
                        : "color-mix(in oklab, var(--brand-black) 40%, transparent)",
                    }}
                    aria-hidden
                  />
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium text-brand-black/70">
                      v{h.version}
                    </span>
                    {h.isLatest && <Badge tone="s3">current</Badge>}
                    <span className="ml-auto text-[11px] text-brand-black/40">
                      {shortDate(h.updatedAt)}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-xs leading-relaxed ${
                      h.isLatest ? "text-brand-black/70" : "text-brand-black/55"
                    }`}
                  >
                    {h.memory}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {!!entry.memoryRelations?.length && (
          <Section title={`Relations (${entry.memoryRelations.length})`}>
            <ul className="space-y-1.5">
              {entry.memoryRelations.map((r) => (
                <li
                  key={r.targetId}
                  className="flex items-center gap-2 rounded-lg border border-brand-black/[0.06] bg-muted px-2.5 py-2"
                >
                  <Badge tone="s5">{r.relation}</Badge>
                  <span className="mono truncate text-[11px] text-brand-black/55">
                    {r.targetId}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={`/graph?focus=${entry.id}`}
              className="focus-ring mt-2.5 inline-flex items-center gap-1.5 rounded text-xs text-brand-black/55 transition-colors hover:text-brand-black"
            >
              <Icon.graph size={13} />
              Show in graph
            </Link>
          </Section>
        )}

        {sources.length > 0 && (
          <Section title={`Sources (${sources.length})`}>
            <ul className="space-y-1.5">
              {sources.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/documents?doc=${d.id}`}
                    className="focus-ring flex items-center gap-2 rounded-lg border border-brand-black/[0.06] bg-muted px-2.5 py-2 text-xs text-brand-black/70 transition-colors hover:border-brand-black/[0.12] hover:text-brand-black"
                  >
                    <Icon.document size={13} className="shrink-0 text-brand-black/40" />
                    <span className="truncate">{d.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <Section title="Metadata">
            <dl className="space-y-1.5 text-xs">
              {Object.entries(entry.metadata).map(([k, v]) => (
                <Field key={k} label={k} value={String(v)} mono />
              ))}
            </dl>
          </Section>
        )}

        <Section title="Record">
          <dl className="space-y-1.5 text-xs">
            <Field label="Created" value={shortDate(entry.createdAt)} />
            <Field label="Updated" value={shortDate(entry.updatedAt)} />
            <Field label="Space" value={entry.spaceId} mono />
            {entry.rootMemoryId && (
              <Field label="Root" value={entry.rootMemoryId} mono />
            )}
            {entry.parentMemoryId && (
              <Field label="Parent" value={entry.parentMemoryId} mono />
            )}
          </dl>
        </Section>
      </div>
      )}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-brand-black/40">{label}</dt>
      <dd className={`truncate text-right text-brand-black/70 ${mono ? "mono text-[11px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
