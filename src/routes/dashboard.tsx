"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarRows, LineChart, SegmentBar, Sparkline, Stat } from "@/components/charts";
import { useMemoryReview } from "@/components/blocks/memory-review-deck";
import { PillTabList } from "@/components/blocks/pill-tab-list";
import { PageBody } from "@/components/shell";
import { Badge, Card, Skeleton } from "@/components/ui";
import { type Stats } from "@/lib/api";
import {
  invalidateCorpus,
  prefetch,
  useDocumentList,
  useMemoryList,
  useProcessing,
  useSpaces,
  useStats,
} from "@/lib/queries";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
  bytes,
  compact,
  duration,
  relTime,
} from "@/lib/format";
import type { Document, DocumentStatus, MemoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/** First screen of recent activity — shared with `warm()` so the keys match. */
const RECENT_MEMORIES = { limit: 8, sort: "createdAt" } as const;
/** Corpus snapshot for pipeline "today" + failures cards. */
const DOC_SNAPSHOT = {
  limit: 500,
  sort: "updatedAt",
  order: "desc",
} as const;

export function warm(): void {
  void prefetch.stats();
  void prefetch.memories(RECENT_MEMORIES);
  void prefetch.processing();
  void prefetch.documents(DOC_SNAPSHOT);
  void prefetch.spaces();
}

export default function DashboardPage() {
  // Keep the numbers live while the pipeline is busy, then fall back to the
  // ordinary stale-while-revalidate refresh. `useQuery` pauses the timer
  // whenever the tab is off screen.
  const [poll, setPoll] = useState<number | false>(false);
  const [pipelineRange, setPipelineRange] = useState<"today" | "all">("today");

  const statsQuery = useStats({ refetchInterval: poll });
  const recentQuery = useMemoryList(RECENT_MEMORIES, { refetchInterval: poll });
  const processingQuery = useProcessing({ refetchInterval: poll });
  const documentsQuery = useDocumentList(DOC_SNAPSHOT, { refetchInterval: poll });
  const { spaces } = useSpaces();

  const inflight = processingQuery.documents.length;
  useEffect(() => {
    setPoll(inflight > 0 && 3000);
  }, [inflight]);

  const stats = statsQuery.data ?? null;
  const recent = recentQuery.data?.memoryEntries ?? [];
  const processing = processingQuery.documents;
  const documents = documentsQuery.data?.memories ?? [];
  const failure =
    statsQuery.error ??
    recentQuery.error ??
    processingQuery.error ??
    documentsQuery.error;
  const error = failure
    ? failure instanceof Error
      ? failure.message
      : "Failed to reach the instance"
    : null;

  const load = () => {
    void statsQuery.refetch();
    void recentQuery.refetch();
    void processingQuery.refetch();
    void documentsQuery.refetch();
  };

  const review = useMemoryReview({
    spaces,
    embedded: true,
    onSettled: () => {
      invalidateCorpus();
      load();
    },
  });

  return (
    <PageBody maxWidth="6xl">
      {error && (
        <Card className="mb-6 border-[color:var(--color-critical)]/35 px-6 py-4">
          <div className="flex items-center gap-2 text-[13px] text-[color:var(--color-critical)]">
            <span className="size-1.5 rounded-full bg-current" />
            {error}
          </div>
          <p className="mt-1.5 text-[12px] text-brand-black/55">
            The console could not reach the API. Check that the server is running.
          </p>
        </Card>
      )}

      {!stats ? (
        <LoadingGrid />
      ) : (
        <PillTabList
          tabs={[
            {
              value: "recent",
              label: "Recent",
              content: (
                <RecentTab
                  recent={recent}
                  reviewPane={review.pane}
                  stats={stats}
                  documents={documents}
                  processing={processing}
                  pipelineRange={pipelineRange}
                  onPipelineRangeChange={setPipelineRange}
                />
              ),
            },
            {
              value: "overview",
              label: "Overview",
              content: <OverviewTab stats={stats} />,
            },
            {
              value: "instance",
              label: "Instance",
              content: (
                <InstanceTab
                  stats={stats}
                  documents={documents}
                  onRefresh={load}
                />
              ),
            },
          ]}
        />
      )}
    </PageBody>
  );
}

/* ------------------------------------------------------------------ */

function RecentTab({
  recent,
  reviewPane,
  stats,
  documents,
  processing,
  pipelineRange,
  onPipelineRangeChange,
}: {
  recent: MemoryEntry[];
  reviewPane: ReactNode;
  stats: Stats;
  documents: Document[];
  processing: Document[];
  pipelineRange: "today" | "all";
  onPipelineRangeChange: (next: "today" | "all") => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="@container">
        <div className="grid grid-cols-1 items-stretch gap-6 @[40rem]:grid-cols-2">
          <div className="min-w-0 [&>section]:h-full [&>div]:h-full">{reviewPane}</div>
          <PipelineCard
            className="h-full"
            stats={stats}
            documents={documents}
            processing={processing}
            pipelineRange={pipelineRange}
            onPipelineRangeChange={onPipelineRangeChange}
          />
        </div>
      </div>

      <Card>
        <PanelHeader
          eyebrow="Recall"
          title="Recent activity"
          action={
            <Link
              href="/memories"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
            >
              View all
            </Link>
          }
        />
        <ul className="border-t border-brand-black/[0.05]">
          {recent.length === 0 ? (
            <li className="px-6 py-4 text-[12px] text-brand-black/55">
              No memories yet.
            </li>
          ) : (
            recent.map((m) => (
              <li
                key={m.id}
                className="px-6 py-4 transition-colors duration-200 hover:bg-brand-black/[0.025]"
              >
                <p className="line-clamp-2 text-[13px] leading-relaxed text-brand-black">
                  {m.memory}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-brand-black/45">
                  <span className="mono text-brand-black/35">{m.spaceId}</span>
                  <span className="text-brand-black/25">·</span>
                  <span className="text-brand-black/35">{relTime(m.createdAt)}</span>
                  {m.isInference && <Badge tone="s2">inferred</Badge>}
                  {m.isStatic && <Badge tone="s3">asserted</Badge>}
                </div>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}

function OverviewTab({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Memories"
          value={compact(stats.memories)}
          hint={`${stats.staticFacts} asserted · ${stats.inferences} inferred`}
        />
        <Stat
          label="Documents"
          value={compact(stats.documents)}
          hint={
            stats.chunks == null
              ? "chunk count unavailable"
              : `${compact(stats.chunks)} chunks indexed`
          }
        />
        <Stat
          label="Relations"
          value={compact(stats.relations)}
          hint={`${stats.versioned} memories revised`}
        />
        <Stat
          label="Forgotten"
          value={compact(stats.forgotten)}
          hint="Edges retained"
        />
      </div>

      <Card>
        <PanelHeader
          eyebrow="Ingest"
          title="Activity"
          meta="last 30 days"
          action={
            <Link
              href="/documents"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
            >
              View all
            </Link>
          }
        />
        <div className="border-t border-brand-black/[0.05] px-6 py-5">
          <LineChart
            labels={stats.activity.map((a) =>
              new Date(a.date + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }),
            )}
            series={[
              {
                key: "memories",
                label: "Memories extracted",
                color: "var(--color-s3)",
                values: stats.activity.map((a) => a.memories),
              },
              {
                key: "documents",
                label: "Documents ingested",
                color: "var(--color-s1)",
                values: stats.activity.map((a) => a.documents),
              },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function InstanceTab({
  stats,
  documents,
  onRefresh,
}: {
  stats: Stats;
  documents: Document[];
  onRefresh: () => void;
}) {
  const failedDocs = useMemo(
    () =>
      documents
        .filter((d) => d.status === "failed")
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [documents],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <PanelHeader
            eyebrow="Server"
            title="Instance"
            meta={stats.server.mode}
          />
          <dl className="divide-y divide-brand-black/[0.05] border-t border-brand-black/[0.05] px-6 text-[13px]">
            <Row
              label="Version"
              value={stats.server.version ? `v${stats.server.version}` : "—"}
            />
            <Row label="Endpoint" value={stats.server.baseUrl} mono />
            <Row
              label="Uptime"
              value={
                stats.server.uptimeSeconds != null
                  ? duration(stats.server.uptimeSeconds)
                  : "—"
              }
            />
            <Row
              label="Embeddings"
              value={stats.server.embeddings?.model ?? "—"}
              mono
              badge={
                stats.server.embeddings?.local ? (
                  <Badge tone="good">local</Badge>
                ) : undefined
              }
            />
            <Row
              label="Extraction"
              value={
                stats.server.llm
                  ? [stats.server.llm.provider, stats.server.llm.model]
                      .filter(Boolean)
                      .join("/")
                  : "—"
              }
              mono
            />
            <Row
              label="Vectors"
              value={
                stats.chunks != null && stats.server.embeddings
                  ? `${compact(stats.chunks)} × ${stats.server.embeddings.dimensions}d`
                  : "—"
              }
              hint={
                stats.vectorBytes != null ? bytes(stats.vectorBytes) : undefined
              }
            />
            <Row
              label="State"
              value={
                stats.server.storage
                  ? bytes(stats.server.storage.sizeBytes)
                  : "—"
              }
              hint={stats.server.storage?.path}
            />
          </dl>
        </Card>

        <Card>
          <PanelHeader eyebrow="Recall" title="Latency" meta="last 40 queries" />
          <div className="border-t border-brand-black/[0.05] px-6 py-5">
            <Sparkline
              values={stats.latencies}
              color="var(--color-s1)"
              height={56}
              suffix="ms"
            />
            <p className="mt-3 text-[12px] leading-relaxed text-brand-black/55">
              Vector search against{" "}
              <span className="text-brand-black/70">
                {stats.chunks == null ? "—" : compact(stats.chunks)}
              </span>{" "}
              chunks.
            </p>
          </div>
        </Card>

        <Card>
          <PanelHeader
            eyebrow="Corpus"
            title="By type"
            meta={`${stats.documents} docs`}
          />
          <div className="border-t border-brand-black/[0.05] px-6 py-5">
            <BarRows
              rows={Object.entries(stats.byType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([type, count]) => ({
                  label: TYPE_LABEL[type as keyof typeof TYPE_LABEL] ?? type,
                  value: count,
                }))}
            />
          </div>
        </Card>

        <Card>
          <PanelHeader
            eyebrow="Pipeline"
            title="Failures"
            meta={stats.failed ? `${compact(stats.failed)} failed` : "None"}
            action={
              stats.failed > 0 ? (
                <Link
                  href="/documents?status=failed"
                  className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
                >
                  View all
                </Link>
              ) : undefined
            }
          />
          <div className="border-t border-brand-black/[0.05]">
            {failedDocs.length === 0 ? (
              <p className="px-6 py-5 text-[12px] leading-relaxed text-brand-black/55">
                No documents stuck in a failed state.
              </p>
            ) : (
              <ul className="divide-y divide-brand-black/[0.05]">
                {failedDocs.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/documents?doc=${encodeURIComponent(d.id)}`}
                      className="focus-ring flex items-center gap-2.5 px-6 py-3 transition-colors duration-200 hover:bg-brand-black/[0.025]"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: STATUS_COLOR.failed }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
                        {d.title || d.id}
                      </span>
                      <Badge tone="critical">{STATUS_LABEL.failed}</Badge>
                      <span className="shrink-0 text-[11px] text-brand-black/45">
                        {relTime(d.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <PanelHeader
          eyebrow="Partition"
          title="Spaces"
          action={
            <Link
              href="/spaces"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
            >
              Manage
            </Link>
          }
        />
        <ul className="divide-y divide-brand-black/[0.05] border-t border-brand-black/[0.05]">
          {stats.spaces.map((s) => (
            <li key={s.containerTag}>
              <Link
                href={`/memories?space=${s.containerTag}`}
                className="focus-ring block px-6 py-4 transition-colors duration-200 hover:bg-brand-black/[0.025]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-brand-black">
                    {s.name}
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-brand-black/45">
                    {s.memoryCount} memories · {s.documentCount} docs
                  </span>
                </div>
                <p className="mono mt-1 truncate text-[11px] text-brand-black/35">
                  {s.containerTag}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PipelineCard({
  stats,
  documents,
  processing,
  className,
  pipelineRange,
  onPipelineRangeChange,
}: {
  stats: Stats;
  documents: Document[];
  processing: Document[];
  className?: string;
  pipelineRange: "today" | "all";
  onPipelineRangeChange: (next: "today" | "all") => void;
}) {
  const dayKey = new Date().toDateString();

  const pipeline = useMemo(() => {
    if (pipelineRange === "all") {
      return {
        byStatus: stats.byStatus,
        inFlight: stats.processing,
        items: processing,
      };
    }
    const now = new Date();
    const todays = documents.filter((d) => isLocalDay(d.updatedAt, now));
    const byStatus = countByStatus(todays);
    const items = processing.filter((d) => isLocalDay(d.updatedAt, now));
    const inFlight = todays.filter(
      (d) => d.status !== "done" && d.status !== "failed",
    ).length;
    return { byStatus, inFlight, items };
  }, [pipelineRange, stats.byStatus, stats.processing, documents, processing, dayKey]);

  return (
    <Card className={cn("flex flex-col", className)}>
      <PanelHeader
        eyebrow="Pipeline"
        title="Ingestion"
        meta={pipeline.inFlight ? `${pipeline.inFlight} in flight` : "Idle"}
        action={
          <PipelineRangeSwitch
            value={pipelineRange}
            onChange={onPipelineRangeChange}
          />
        }
      />
      <div className="min-h-0 flex-1 border-t border-brand-black/[0.05] px-6 py-5">
        <SegmentBar
          segments={Object.entries(pipeline.byStatus)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({
              label: STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? k,
              value: v,
              color: STATUS_COLOR[k as keyof typeof STATUS_COLOR] ?? MUTED,
            }))}
        />
        {pipeline.items.length > 0 && (
          <ul className="mt-4 divide-y divide-brand-black/[0.05] border-t border-brand-black/[0.05]">
            {pipeline.items.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 py-3">
                <span
                  className="size-1.5 shrink-0 animate-soft-pulse rounded-full"
                  style={{ background: STATUS_COLOR[d.status] }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
                  {d.title}
                </span>
                <span className="shrink-0 text-[11px] text-brand-black/45">
                  {STATUS_LABEL[d.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function PipelineRangeSwitch({
  value,
  onChange,
}: {
  value: "today" | "all";
  onChange: (next: "today" | "all") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Pipeline time range"
      className="inline-flex shrink-0 gap-0.5 rounded-full border border-brand-black/[0.06] bg-brand-black/[0.03] p-0.5"
    >
      {([
        ["today", "Today"],
        ["all", "All"],
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors",
            value === key
              ? "bg-brand-black text-white"
              : "text-brand-black/45 hover:text-brand-black",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const PIPELINE_STATUSES: DocumentStatus[] = [
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "indexing",
  "done",
  "failed",
];

function isLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function countByStatus(docs: Document[]): Record<string, number> {
  const counts = Object.fromEntries(
    PIPELINE_STATUSES.map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const doc of docs) {
    counts[doc.status] = (counts[doc.status] ?? 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ */

function PanelHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
          {eyebrow}
        </div>
        <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
          {title}
          {meta ? (
            <span className="ml-2 text-[12px] font-normal text-brand-black/45">
              {meta}
            </span>
          ) : null}
        </h3>
      </div>
      {action}
    </div>
  );
}

const MUTED = "color-mix(in oklab, var(--brand-black) 55%, transparent)";

function Row({
  label,
  value,
  hint,
  mono,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="shrink-0 text-[12px] text-brand-black/45">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right">
        <span
          className={`truncate text-brand-black/70 ${mono ? "mono text-[11px]" : "text-[12px]"}`}
        >
          {value}
        </span>
        {badge}
        {hint && (
          <span className="shrink-0 text-[11px] text-brand-black/35">{hint}</span>
        )}
      </dd>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto h-14 w-96 animate-pulse rounded-[22px] bg-brand-black/[0.04]" />
      <Skeleton className="h-[22rem] rounded-[28px]" />
      <Skeleton className="h-[280px] rounded-[28px]" />
    </div>
  );
}
