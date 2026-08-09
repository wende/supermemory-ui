"use client";

/**
 * Timeline — the memory bank as a feed.
 *
 * Every other screen in this console asks you to already know the data model:
 * the bank is a table of claims, the graph is a node-link diagram. This one
 * asks nothing. It is a vertical feed of posts, and the social-media grammar
 * people already read fluently is wired to real records — the "author" is the
 * space, the "link preview" is the source document, the "quote post" above an
 * inference is what it was derived from, and "edited" is a real version diff.
 *
 * Two rules keep it readable:
 *
 *   - **The memories are the post.** When a document produced claims, those
 *     claims are the body at full size and the document shrinks to a byline.
 *     The document only leads when it has not produced anything yet.
 *   - **The feed never leaves.** Documents open in a popup over the feed rather
 *     than navigating to another tab's deep link, so there is nothing to go
 *     back from.
 *
 * The event model lives in `src/lib/timeline.ts` and is unit-tested; this file
 * is only the rendering of it. Both list queries are fetched unfiltered and
 * sliced client-side, so switching space is instant and the space rail can show
 * true per-space counts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FilterPill } from "@/components/blocks/filter-pill";
import { Icon } from "@/components/icons";
import { useRouteParams } from "@/components/route-host";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Empty,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  bytes,
  relTime,
  shortDate,
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_GLYPH,
  TYPE_LABEL,
} from "@/lib/format";
import {
  invalidateCorpus,
  prefetch,
  useDocumentList,
  useMemoryList,
  useSpaces,
} from "@/lib/queries";
import { usePageVisible } from "@/lib/query";
import {
  buildTimeline,
  countByKind,
  groupByDay,
  initials,
  spaceName,
  KIND_META,
  TIMELINE_KINDS,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/timeline";
import type { ContainerTag, Document, MemoryEntry } from "@/lib/types";

/**
 * One request each for memories and documents, wide enough to assemble a feed
 * from. The corpus a local instance holds is small; paging happens down the
 * page, over assembled events, not over the wire.
 */
const FEED_MEMORIES: Parameters<typeof useMemoryList>[0] = {
  limit: 200,
  page: 1,
  sort: "updatedAt",
  includeForgotten: true,
};

const FEED_DOCUMENTS: Parameters<typeof useDocumentList>[0] = {
  limit: 200,
  page: 1,
  sort: "createdAt",
  order: "desc",
};

/** Posts revealed per scroll step. */
const PAGE_SIZE = 12;

export function warm(): void {
  void prefetch.spaces();
  void prefetch.memories(FEED_MEMORIES);
  void prefetch.documents(FEED_DOCUMENTS);
}

type Filter = "all" | TimelineKind;

export default function Timeline() {
  const params = useRouteParams();
  const { push, view: toasts } = useToasts();

  const { spaces } = useSpaces();

  // Keep the feed live while anything is still moving through ingest — a post
  // made from the composer should visibly turn into memories.
  const [poll, setPoll] = useState<number | false>(false);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const memoryQuery = useMemoryList(FEED_MEMORIES, { refetchInterval: poll });
  const documentQuery = useDocumentList(FEED_DOCUMENTS, { refetchInterval: poll });

  const spaceParam = params.get("space");
  const [space, setSpace] = useState(spaceParam ?? "");
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  // `/timeline?space=` must win over the tab's own state, the same way the
  // memory bank handles deep links while staying mounted.
  useEffect(() => {
    if (spaceParam !== null) setSpace(spaceParam);
  }, [spaceParam]);

  const documents = useMemo(
    () => documentQuery.data?.memories ?? [],
    [documentQuery.data],
  );

  const inflight = documents.some(
    (d) => d.status !== "done" && d.status !== "failed",
  );
  const watching = watchingId
    ? documents.find((d) => d.id === watchingId)
    : undefined;
  const watchingTerminal =
    watching != null &&
    (watching.status === "done" || watching.status === "failed");

  useEffect(() => {
    if (watchingTerminal) setWatchingId(null);
  }, [watchingTerminal]);

  // Safety: drop a watch that never appears / never terminates.
  useEffect(() => {
    if (!watchingId) return;
    const t = window.setTimeout(() => setWatchingId(null), 60_000);
    return () => window.clearTimeout(t);
  }, [watchingId]);

  useEffect(() => {
    setPoll(inflight || watchingId ? 1500 : false);
  }, [inflight, watchingId]);

  const events = useMemo(
    () =>
      buildTimeline({
        memories: memoryQuery.data?.memoryEntries ?? [],
        documents,
      }),
    [memoryQuery.data, documents],
  );

  const inSpace = useMemo(
    () => (space ? events.filter((e) => e.spaceId === space) : events),
    [events, space],
  );
  const counts = useMemo(() => countByKind(inSpace), [inSpace]);
  const shown = useMemo(
    () => (filter === "all" ? inSpace : inSpace.filter((e) => e.kind === filter)),
    [inSpace, filter],
  );
  const days = useMemo(() => groupByDay(shown.slice(0, visible)), [shown, visible]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
    const scroll =
      document.querySelector<HTMLElement>("main .scrollbar-hide.flex-1") ?? null;
    if (scroll) scroll.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [space, filter]);

  const loading =
    (memoryQuery.isLoading || documentQuery.isLoading) && !events.length;

  const loadMore = useCallback(
    () => setVisible((v) => (v >= shown.length ? v : v + PAGE_SIZE)),
    [shown.length],
  );

  /**
   * Posting is ingestion, not assertion. You hand the engine content; what it
   * keeps is up to the extractor, and the post shows it happening.
   */
  async function onPost(text: string, containerTag: string) {
    let created: { id: string };
    try {
      created = await api.addDocument({
        content: text,
        title: titleFor(text),
        type: "text",
        containerTags: [containerTag],
      });
    } catch (e) {
      push(`Post failed — ${String(e)}`, "critical");
      // Re-throw so the composer keeps the draft open for retry.
      throw e;
    }
    push("Posted — extracting memories from it now", "good");
    setWatchingId(created.id);
    invalidateCorpus();
  }

  async function onRestore(entry: MemoryEntry) {
    try {
      await api.restoreMemory(entry.id);
    } catch (e) {
      push(`Restore failed — ${String(e)}`, "critical");
      return;
    }
    push("Memory restored", "good");
    invalidateCorpus();
  }

  const memoryLoaded = memoryQuery.data?.memoryEntries.length ?? 0;
  const memoryTotal = memoryQuery.data?.pagination.totalItems;
  const docLoaded = documents.length;
  const docTotal = documentQuery.data?.pagination.totalItems;
  const corpusTruncated =
    (memoryTotal != null && memoryLoaded < memoryTotal) ||
    (docTotal != null && docLoaded < docTotal);

  return (
    <>
      <PageBody maxWidth="2xl" className="space-y-3.5">
        <PageTitle
          label="Recall"
          title="Timeline"
          description="Everything that happened to the memory, newest first: documents arriving, claims learned, revised, inferred from each other, and retired. Scrolling down is scrolling backwards."
        />

        {/* Own full-width row (not title-row children): many spaces must scroll
            inside this strip. Nested in a flex title cell, min-content width
            wins and the whole page scrolls sideways on a phone. */}
        <SpaceRail
          spaces={spaces}
          events={events}
          active={space}
          onSelect={setSpace}
        />

        <Composer
          spaces={spaces}
          space={space}
          onPost={onPost}
          disabled={!spaces.length}
        />

        {/* Single scrolling row on purpose: a wrapping filter bar would change
            height and shove the sticky day headers out of alignment. Opaque
            because posts pass behind it. */}
        <div className="scrollbar-hide sticky top-0 z-20 -mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain bg-background px-1 py-2">
          <FilterPill
            label="Everything"
            count={inSpace.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {TIMELINE_KINDS.filter((k) => counts[k] > 0).map((kind) => (
            <FilterPill
              key={kind}
              label={KIND_META[kind].label}
              count={counts[kind]}
              accent={KIND_META[kind].accent}
              active={filter === kind}
              onClick={() => setFilter(kind)}
            />
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2.5">
                    <Skeleton className="h-3 w-40 rounded" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : !shown.length ? (
          <Card>
            <Empty
              title="Nothing on this timeline yet"
              hint={
                filter === "all"
                  ? "Post something above and it will show up here as it is ingested."
                  : `No ${KIND_META[filter as TimelineKind].label.toLowerCase()} events in this space.`
              }
              action={
                <Button size="sm" onClick={() => { setFilter("all"); setSpace(""); }}>
                  Show everything
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-5" role="feed" aria-label="Timeline feed">
            {days.map((day) => (
              <section key={day.key} className="space-y-3">
                {/* Opaque, and offset by exactly the filter bar's height so the
                    two abut with no seam for a post to show through. */}
                <div className="sticky top-[43px] z-10 -mx-1 flex items-center gap-3 bg-background px-1 py-1.5">
                  <span className="rounded-full border border-brand-black/[0.06] bg-card/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-black/55">
                    {day.label}
                  </span>
                  <span className="h-px flex-1 bg-brand-black/[0.06]" />
                  <span
                    className="text-[11px] text-brand-black/35 tnum"
                    title={`${day.events.length} events on this day`}
                  >
                    {day.events.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {day.events.map((event) => (
                    <Post
                      key={event.id}
                      event={event}
                      spaces={spaces}
                      onOpenDocument={setOpenDoc}
                      onRestore={onRestore}
                    />
                  ))}
                </div>
              </section>
            ))}

            <FeedFooter
              shown={Math.min(visible, shown.length)}
              total={shown.length}
              truncated={corpusTruncated}
              onLoadMore={loadMore}
            />
          </div>
        )}
      </PageBody>

      <DocumentModal
        id={openDoc}
        onClose={() => setOpenDoc(null)}
      />

      {toasts}
    </>
  );
}

/** First line of a post, trimmed to something that reads as a title. */
function titleFor(text: string): string {
  const line = text.trim().split("\n")[0].trim();
  return line.length > 72 ? `${line.slice(0, 71).trimEnd()}…` : line;
}

/** Stable series colour from a space id — same hash everywhere in the feed. */
function spaceAccent(spaceId: string): string {
  let h = 0;
  for (let i = 0; i < spaceId.length; i++) {
    h = (h * 31 + spaceId.charCodeAt(i)) | 0;
  }
  return `var(--color-s${(Math.abs(h) % 5) + 1})`;
}

/** Kind label for a memory line inside an ingest thread. */
function memoryKind(entry: MemoryEntry): Exclude<TimelineKind, "ingested" | "revised" | "restored"> {
  if (entry.isForgotten) return "forgotten";
  if (entry.isInference) return "inferred";
  if (entry.isStatic) return "asserted";
  return "learned";
}

/* ------------------------------------------------------------------ */
/* Space rail — full-width chip strip; scrolls horizontally in-place   */
/* ------------------------------------------------------------------ */

function SpaceRail({
  spaces,
  events,
  active,
  onSelect,
}: {
  spaces: ContainerTag[];
  events: TimelineEvent[];
  active: string;
  onSelect: (tag: string) => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(e.spaceId, (map.get(e.spaceId) ?? 0) + 1);
    return map;
  }, [events]);

  // Stable tag order — accent index must not follow event-count ranking.
  const ordered = useMemo(
    () =>
      spaces
        .filter((s) => counts.get(s.containerTag))
        .sort((a, b) => a.containerTag.localeCompare(b.containerTag)),
    [spaces, counts],
  );

  if (!ordered.length) return null;

  return (
    <div
      className="scrollbar-hide -mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain px-1"
      role="group"
      aria-label="Filter the timeline by space"
    >
      <RailPill
        label="All"
        count={events.length}
        active={!active}
        onClick={() => onSelect("")}
      />
      {ordered.map((s) => (
        <RailPill
          key={s.containerTag}
          label={spaceName(spaces, s.containerTag)}
          count={counts.get(s.containerTag) ?? 0}
          accent={spaceAccent(s.containerTag)}
          active={active === s.containerTag}
          onClick={() => onSelect(active === s.containerTag ? "" : s.containerTag)}
        />
      ))}
    </div>
  );
}

function RailPill({
  label,
  count,
  accent,
  active,
  onClick,
}: {
  label: string;
  count: number;
  accent?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${label} · ${count} events`}
      className={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-brand-black/[0.14] bg-brand-black/[0.05] text-brand-black"
          : "border-transparent text-brand-black/55 hover:bg-brand-black/[0.03]"
      }`}
    >
      {accent && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: accent }}
        />
      )}
      {label}
      <span className="tnum text-brand-black/35">{count}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Composer — posting means ingesting                                  */
/* ------------------------------------------------------------------ */

function Composer({
  spaces,
  space,
  onPost,
  disabled,
}: {
  spaces: ContainerTag[];
  space: string;
  onPost: (text: string, containerTag: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState(space);
  const [busy, setBusy] = useState(false);

  // Follow the rail: composing while filtered to a space should file it there.
  useEffect(() => setTarget(space), [space]);

  const containerTag = target || space || spaces[0]?.containerTag || "";

  async function submit() {
    const value = text.trim();
    if (!value || !containerTag) return;
    setBusy(true);
    try {
      await onPost(value, containerTag);
      setText("");
      setOpen(false);
    } catch {
      // onPost already toasted — keep the draft and stay open so the user can retry.
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="focus-ring flex w-full items-center gap-2.5 rounded-full border border-brand-black/[0.06] bg-card px-3 py-2 text-left text-[13px] text-brand-black/45 transition-colors hover:border-brand-black/[0.12] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <Icon.spark size={15} className="shrink-0 text-brand-black/35" />
        Post something for the memory to read…
      </button>
    );
  }

  return (
    <Card className="space-y-2.5 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
        rows={4}
        autoFocus
        aria-label="What to post for the memory to read"
        placeholder="Paste a note, a decision, a page of research. It is ingested as a document — whatever the extractor keeps shows up as memories under this post."
        className="text-[13px] leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[150px]">
          <Select
            value={containerTag}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Space to file this in"
            className="h-8 rounded-full border-brand-black/[0.06] text-[12px] shadow-none"
          >
            {spaces.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {spaceName(spaces, s.containerTag)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !text.trim() || !containerTag}
          onClick={() => void submit()}
        >
          {busy && <Spinner />}
          Post
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Post                                                                */
/* ------------------------------------------------------------------ */

function Post({
  event,
  spaces,
  onOpenDocument,
  onRestore,
}: {
  event: TimelineEvent;
  spaces: ContainerTag[];
  onOpenDocument: (id: string) => void;
  onRestore: (entry: MemoryEntry) => Promise<void>;
}) {
  const meta = KIND_META[event.kind];
  const author = spaceName(spaces, event.spaceId);
  const kept = event.extracted.length;

  // An ingest that produced claims is news about the claims, not the file.
  const verb =
    event.kind === "ingested" && kept
      ? `kept ${kept} ${kept === 1 ? "memory" : "memories"} from a document`
      : meta.verb;

  return (
    <Card
      role="article"
      aria-label={`${author} ${verb}`}
      className="animate-fade-in relative overflow-hidden p-4 pl-[18px]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5"
        style={{
          background: `color-mix(in oklab, ${meta.accent} 45%, transparent)`,
        }}
      />
      <header className="flex items-center gap-2.5">
        <Avatar label={author} accent={spaceAccent(event.spaceId)} />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[12px]">
          <span className="font-semibold text-brand-black">{author}</span>
          <span className="text-brand-black/55">{verb}</span>
          <span className="text-brand-black/30" aria-hidden>
            ·
          </span>
          <span className="text-brand-black/40" title={shortDate(event.at)}>
            {relTime(event.at)}
          </span>
        </div>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
          style={{
            color: meta.accent,
            background: `color-mix(in oklab, ${meta.accent} 10%, transparent)`,
          }}
        >
          {meta.label}
        </span>
      </header>

      <div className="mt-3 space-y-2.5">
        {event.kind === "ingested" && event.document ? (
          <DocumentBody
            document={event.document}
            extracted={event.extracted}
            onOpen={onOpenDocument}
          />
        ) : event.memory ? (
          <MemoryBody
            event={event}
            entry={event.memory}
            onOpenDocument={onOpenDocument}
            onRestore={onRestore}
          />
        ) : null}
      </div>

      <PostActions event={event} />
    </Card>
  );
}

function Avatar({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
      style={{
        color: accent,
        background: `color-mix(in oklab, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${accent} 26%, transparent)`,
      }}
    >
      {initials(label)}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What the engine kept, at full size — with the document reduced to a byline
 * underneath. The document only takes the lead when nothing has come out of it
 * yet, which is also the only time its pipeline status is worth a glance.
 */
function DocumentBody({
  document,
  extracted,
  onOpen,
}: {
  document: Document;
  extracted: MemoryEntry[];
  onOpen: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const preview = showAll ? extracted : extracted.slice(0, 3);
  const working = document.status !== "done" && document.status !== "failed";

  if (!extracted.length) {
    return (
      <>
        <button
          type="button"
          onClick={() => onOpen(document.id)}
          className="focus-ring block w-full rounded-xl border border-brand-black/[0.06] bg-muted p-3 text-left transition-colors hover:border-brand-black/[0.12]"
        >
          <h3 className="text-[14px] font-semibold leading-snug text-brand-black">
            {document.title ?? "Untitled document"}
          </h3>
          {document.summary && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-brand-black/55">
              {document.summary}
            </p>
          )}
        </button>
        <p className="flex items-center gap-1.5 text-[11px] text-brand-black/40">
          <span
            className={`size-1.5 rounded-full ${working ? "animate-pulse" : ""}`}
            style={{ background: STATUS_COLOR[document.status] }}
            aria-hidden
          />
          {working
            ? `${STATUS_LABEL[document.status]} — memories will appear here`
            : `${STATUS_LABEL[document.status]}, nothing extracted`}
        </p>
      </>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {preview.map((m) => {
          const kind = memoryKind(m);
          const kindMeta = KIND_META[kind];
          return (
            <li key={m.id} className="flex items-start gap-2.5">
              <span className="mt-[7px] flex shrink-0 items-center gap-1">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: kindMeta.accent }}
                  aria-hidden
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-black/40">
                  {kindMeta.label}
                </span>
              </span>
              <p
                className={`text-[14px] leading-relaxed text-brand-black ${
                  m.isForgotten ? "line-through decoration-brand-black/25 opacity-60" : ""
                }`}
              >
                {m.memory}
              </p>
            </li>
          );
        })}
      </ul>

      {extracted.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="focus-ring rounded text-[11px] font-medium text-brand-black/55 transition-colors hover:text-brand-black"
        >
          {showAll ? "Show fewer" : `Show ${extracted.length - 3} more`}
        </button>
      )}

      <SourceByline document={document} onOpen={onOpen} />
    </>
  );
}

/**
 * The document, reduced to a credit line under what came out of it. It is also
 * the whole affordance for opening the source — an ingest post needs no action
 * bar repeating what this line already does.
 */
function SourceByline({
  document,
  onOpen,
}: {
  document: Document;
  onOpen: (id: string) => void;
}) {
  const working = document.status !== "done" && document.status !== "failed";
  const chunks = document.chunkCount ?? 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(document.id)}
      className="focus-ring group flex w-full items-center gap-1.5 rounded pt-0.5 text-left text-[11px] text-brand-black/40 transition-colors hover:text-brand-black/70"
    >
      <span aria-hidden className="shrink-0">
        {TYPE_GLYPH[document.type]}
      </span>
      <span className="shrink-0">from</span>
      <span className="truncate text-brand-black/55 group-hover:underline">
        {document.title ?? "Untitled document"}
      </span>
      {working ? (
        <span className="flex shrink-0 items-center gap-1">
          <span
            className="size-1.5 animate-pulse rounded-full"
            style={{ background: STATUS_COLOR[document.status] }}
            aria-hidden
          />
          {STATUS_LABEL[document.status]}
        </span>
      ) : chunks ? (
        <span className="shrink-0 tnum">
          · {chunks} {chunks === 1 ? "chunk" : "chunks"}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function MemoryBody({
  event,
  entry,
  onOpenDocument,
  onRestore,
}: {
  event: TimelineEvent;
  entry: MemoryEntry;
  onOpenDocument: (id: string) => void;
  onRestore: (entry: MemoryEntry) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const claim = event.revision?.to ?? entry.memory;

  return (
    <>
      {/* An edit shows what it replaced — the point of a revision is the delta. */}
      {event.revision && (
        <p className="text-[12px] leading-relaxed text-brand-black/40 line-through decoration-brand-black/25">
          {event.revision.from}
        </p>
      )}

      <Claim text={claim} struck={event.kind === "forgotten"} />

      {event.kind === "forgotten" && entry.forgetReason && (
        <p className="text-[12px] leading-relaxed text-brand-black/55">
          <span className="text-brand-black/40">Why:</span> {entry.forgetReason}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {entry.isStatic && <Badge tone="s3">asserted</Badge>}
        {entry.isInference && <Badge tone="s2">inferred</Badge>}
        {/* A post describes the moment it happened. A claim that was retired
            later says so in the past tense — it was not forgotten *then*. */}
        {entry.isForgotten && (
          <Badge tone="neutral">
            {event.kind === "forgotten" ? "forgotten" : "since forgotten"}
          </Badge>
        )}
        {event.revision && <Badge tone="s5">now v{event.revision.version}</Badge>}
        {entry.temporalContext && (
          <Badge tone="neutral">
            <Icon.clock size={11} />
            {entry.temporalContext.note ??
              (entry.temporalContext.validFrom
                ? `from ${shortDate(entry.temporalContext.validFrom)}`
                : "time-scoped")}
          </Badge>
        )}
      </div>

      {/* Quote posts: the memories this one was built on. */}
      {event.related.length > 0 && (
        <ul className="space-y-1.5">
          {event.related.map((r) => (
            <li key={r.targetId}>
              <Link
                href={`/graph?focus=${r.targetId}`}
                className="focus-ring block rounded-r border-l-2 py-0.5 pl-2.5 transition-colors hover:bg-brand-black/[0.02]"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--brand-black) 18%, transparent)",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-black/40">
                  {r.relation}
                </span>
                <p className="line-clamp-2 text-[12px] leading-relaxed text-brand-black/55">
                  {r.entry?.memory ?? (
                    <span className="mono text-[11px]">{r.targetId}</span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Where the claim came from. Opens over the feed, never navigates. */}
      {event.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {event.sources.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onOpenDocument(d.id)}
              className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-black/[0.06] px-2 py-0.5 text-[11px] text-brand-black/45 transition-colors hover:border-brand-black/[0.12] hover:text-brand-black"
            >
              <span aria-hidden className="text-brand-black/35">
                {TYPE_GLYPH[d.type]}
              </span>
              <span className="truncate">{d.title ?? "Untitled"}</span>
            </button>
          ))}
        </div>
      )}

      {event.kind === "forgotten" && (
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRestore(entry);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />}
          <Icon.refresh size={13} />
          Bring it back
        </Button>
      )}
    </>
  );
}

/** The claim itself, clamped like a long post until you ask for the rest. */
function Claim({ text, struck }: { text: string; struck?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 320;

  return (
    <div>
      <p
        className={`text-[14px] leading-relaxed text-brand-black ${
          struck ? "line-through decoration-brand-black/25 opacity-70" : ""
        } ${long && !expanded ? "line-clamp-4" : ""}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring mt-1 rounded text-[11px] font-medium text-brand-black/55 transition-colors hover:text-brand-black"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The reaction bar, except the counts are records rather than sentiment: how
 * many sources back a claim, how many memories it links to, how many times it
 * has been rewritten.
 *
 * Ingest posts get none of this — their byline already names the source and
 * opens it, and a second row saying the same thing is the kind of chrome that
 * pushes the actual memories off the screen.
 */
function PostActions({ event }: { event: TimelineEvent }) {
  const entry = event.memory;
  if (!entry || event.kind === "ingested") return null;

  const stats: { icon: React.ReactNode; text: string }[] = [];
  if (event.sources.length)
    stats.push({
      icon: <Icon.document size={12} />,
      text: `${event.sources.length} ${event.sources.length === 1 ? "source" : "sources"}`,
    });
  if (event.related.length)
    stats.push({
      icon: <Icon.link size={12} />,
      text: `${event.related.length} ${event.related.length === 1 ? "link" : "links"}`,
    });
  if (entry.version > 1)
    stats.push({ icon: <Icon.edit size={12} />, text: `v${entry.version}` });

  return (
    <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-black/[0.05] pt-2.5 text-[11px] text-brand-black/40">
      {stats.map((s) => (
        <span key={s.text} className="inline-flex items-center gap-1.5">
          {s.icon}
          {s.text}
        </span>
      ))}
      <Link
        href={`/graph?focus=${entry.id}`}
        className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded text-brand-black/55 transition-colors hover:text-brand-black"
      >
        <Icon.graph size={12} />
        Trace in graph
      </Link>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Document popup                                                      */
/* ------------------------------------------------------------------ */

/**
 * Reading a source must not cost you your place. This opens over the feed
 * instead of deep-linking into the documents tab, where there is no way back.
 */
function DocumentModal({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [extracted, setExtracted] = useState<MemoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fresh document id drops any prior error; retries keep it until the attempt settles.
  useEffect(() => {
    setDoc(null);
    setExtracted([]);
    setError(null);
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getDocument(id),
      api.listMemories({
        documentId: id,
        includeForgotten: true,
        limit: 100,
        page: 1,
        sort: "createdAt",
        order: "asc",
      }),
    ])
      .then(([d, mems]) => {
        if (cancelled) return;
        setDoc(d);
        setExtracted(mems.memoryEntries);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setDoc(null);
        setExtracted([]);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, retryKey]);

  if (!id) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={error ? "Couldn't load source" : (doc?.title ?? "Loading…")}
      subtitle={
        error ? (
          "The document could not be opened. Your place in the feed is still here."
        ) : doc ? (
          <span className="flex flex-wrap items-center gap-2">
            <Copyable value={doc.id} className="text-brand-black/55" />
            <span aria-hidden>·</span>
            <span>{TYPE_LABEL[doc.type]}</span>
            <span aria-hidden>·</span>
            <span style={{ color: STATUS_COLOR[doc.status] }}>
              {STATUS_LABEL[doc.status]}
            </span>
          </span>
        ) : (
          "Fetching the source document…"
        )
      }
      footer={
        doc && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-brand-black/40">
            <span className="tnum">{doc.chunkCount ?? 0} chunks</span>
            <span aria-hidden>·</span>
            <span className="tnum">{bytes(doc.content.length)}</span>
            <span aria-hidden>·</span>
            <span>{shortDate(doc.createdAt)}</span>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto"
              >
                <Button size="sm">
                  <Icon.external size={13} />
                  Open source
                </Button>
              </a>
            )}
          </div>
        )
      }
    >
      {error ? (
        <div className="space-y-3" role="alert">
          <p className="text-[13px] leading-relaxed text-brand-black/70">
            Couldn&apos;t open {id} — {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={loading}
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Back to the feed
            </Button>
          </div>
        </div>
      ) : !doc ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading document">
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <div className="animate-fade-in space-y-4">
          {doc.summary && (
            <p className="text-[13px] leading-relaxed text-brand-black/70">
              {doc.summary}
            </p>
          )}

          {extracted.length > 0 && (
            <section>
              <h3 className="label mb-2">
                Memories from this ({extracted.length})
              </h3>
              <ul className="space-y-1.5">
                {extracted.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-brand-black/[0.06] bg-muted px-2.5 py-2 text-[12px] leading-relaxed text-brand-black/70"
                  >
                    {m.memory}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="label mb-2">Content</h3>
            <pre className="mono whitespace-pre-wrap rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-3 text-[11.5px] leading-relaxed text-brand-black/70">
              {doc.content || "No content stored for this document."}
            </pre>
          </section>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Reveals the next page as the bottom comes into view. The tab stays mounted
 * when it is hidden, so the observer is only attached while it is on screen —
 * otherwise a background tab would quietly unroll its whole feed.
 */
function FeedFooter({
  shown,
  total,
  truncated,
  onLoadMore,
}: {
  shown: number;
  total: number;
  truncated?: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const visible = usePageVisible();
  const done = shown >= total;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || done || !visible) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [done, visible, onLoadMore, shown]);

  return (
    <div ref={sentinel} className="pt-1 pb-6 text-center">
      {done ? (
        <p className="text-[11px] text-brand-black/35">
          {truncated
            ? `Showing ${shown} of ${total} loaded ${total === 1 ? "event" : "events"} — the corpus has more beyond the fetch limit.`
            : `That is the whole timeline — ${total} ${total === 1 ? "event" : "events"}.`}
        </p>
      ) : (
        <Button size="sm" variant="ghost" onClick={onLoadMore}>
          Load older events
        </Button>
      )}
    </div>
  );
}
