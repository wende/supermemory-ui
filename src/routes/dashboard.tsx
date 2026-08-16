"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarRows, SegmentBar, Stat } from "@/components/charts";
import { useMemoryReview } from "@/components/blocks/memory-review-deck";
import { PillTabList } from "@/components/blocks/pill-tab-list";
import { PageBody } from "@/components/shell";
import { Badge, Card, Skeleton } from "@/components/ui";
import { type HealthResponse } from "@/lib/api";
import {
  invalidateCorpus,
  prefetch,
  useDocumentList,
  useHealth,
  useMemoryList,
  useProcessing,
  useSpaces,
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
import type { ContainerTag, Document, DocumentStatus, MemoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/** First screen of recent activity — shared with `warm()` so the keys match. */
const RECENT_MEMORIES = { limit: 8, sort: "createdAt" } as const;
/** Bounded metadata-only sample for recent pipeline and failure cards. */
const RECENT_DOCUMENTS = {
  limit: 50,
  sort: "updatedAt",
  order: "desc",
} as const;

export function warm(): void {
  void prefetch.memories(RECENT_MEMORIES);
  void prefetch.processing();
  void prefetch.documents(RECENT_DOCUMENTS);
  void prefetch.spaces();
  void prefetch.health();
}

export default function DashboardPage() {
  // Keep the numbers live while the pipeline is busy, then fall back to the
  // ordinary stale-while-revalidate refresh. `useQuery` pauses the timer
  // whenever the tab is off screen.
  const [poll, setPoll] = useState<number | false>(false);
  const [pipelineRange, setPipelineRange] = useState<"active" | "recent">("active");

  const healthQuery = useHealth();
  const recentQuery = useMemoryList(RECENT_MEMORIES);
  const processingQuery = useProcessing({ refetchInterval: poll });
  const documentsQuery = useDocumentList(RECENT_DOCUMENTS);
  const spacesQuery = useSpaces();
  const { spaces } = spacesQuery;

  const inflight = processingQuery.documents.length;
  const previousInflight = useRef<number | null>(null);
  useEffect(() => {
    setPoll(inflight > 0 && 3000);
    if (
      previousInflight.current !== null &&
      previousInflight.current > 0 &&
      inflight === 0
    ) {
      void healthQuery.refetch();
      void recentQuery.refetch();
      void documentsQuery.refetch();
      void spacesQuery.refetch();
    }
    previousInflight.current = inflight;
  }, [inflight]);

  const health = healthQuery.data ?? null;
  const recent = recentQuery.data?.memoryEntries ?? [];
  const processing = processingQuery.documents;
  const documents = documentsQuery.data?.memories ?? [];
  const documentCount = documentsQuery.data?.pagination.totalItems ?? 0;
  const memoryCount = spaces.reduce((sum, space) => sum + space.memoryCount, 0);
  const failure =
    healthQuery.error ??
    recentQuery.error ??
    processingQuery.error ??
    documentsQuery.error ??
    spacesQuery.error;
  const error = failure
    ? failure instanceof Error
      ? failure.message
      : "Failed to reach the instance"
    : null;

  const load = () => {
    void healthQuery.refetch();
    void recentQuery.refetch();
    void processingQuery.refetch();
    void documentsQuery.refetch();
    void spacesQuery.refetch();
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

      {!health || documentsQuery.data === undefined || spacesQuery.isLoading ? (
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
              content: (
                <OverviewTab
                  documentCount={documentCount}
                  memoryCount={memoryCount}
                  processingCount={inflight}
                  spaces={spaces}
                />
              ),
            },
            {
              value: "instance",
              label: "Instance",
              content: (
                <InstanceTab
                  health={health}
                  documents={documents}
                  documentCount={documentCount}
                  spaces={spaces}
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
  documents,
  processing,
  pipelineRange,
  onPipelineRangeChange,
}: {
  recent: MemoryEntry[];
  reviewPane: ReactNode;
  documents: Document[];
  processing: Document[];
  pipelineRange: "active" | "recent";
  onPipelineRangeChange: (next: "active" | "recent") => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="@container">
        <div className="grid grid-cols-1 items-stretch gap-6 @[40rem]:grid-cols-2">
          <div className="min-w-0 [&>section]:h-full [&>div]:h-full">{reviewPane}</div>
          <PipelineCard
            className="h-full"
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

function OverviewTab({
  documentCount,
  memoryCount,
  processingCount,
  spaces,
}: {
  documentCount: number;
  memoryCount: number;
  processingCount: number;
  spaces: ContainerTag[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Memories"
          value={compact(memoryCount)}
          hint="Active memories across spaces"
        />
        <Stat
          label="Documents"
          value={compact(documentCount)}
          hint="From paginated document totals"
        />
        <Stat
          label="Spaces"
          value={compact(spaces.length)}
          hint="Server aggregate"
        />
        <Stat
          label="Processing"
          value={compact(processingCount)}
          hint={processingCount > 0 ? "Pipeline active" : "Pipeline idle"}
        />
      </div>

      <Card>
        <PanelHeader
          eyebrow="Partition"
          title="Memories by space"
          meta={`${spaces.length} spaces`}
          action={
            <Link
              href="/spaces"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
            >
              Manage
            </Link>
          }
        />
        <div className="border-t border-brand-black/[0.05] px-6 py-5">
          <BarRows
            rows={spaces
              .slice()
              .sort((a, b) => b.memoryCount - a.memoryCount)
              .map((space) => ({
                label: space.name,
                value: space.memoryCount,
                hint: `${space.documentCount} documents`,
              }))}
            color="var(--color-s3)"
          />
        </div>
      </Card>
    </div>
  );
}

function InstanceTab({
  health,
  documents,
  documentCount,
  spaces,
  onRefresh,
}: {
  health: HealthResponse;
  documents: Document[];
  documentCount: number;
  spaces: ContainerTag[];
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
            meta={health.mode}
          />
          <dl className="divide-y divide-brand-black/[0.05] border-t border-brand-black/[0.05] px-6 text-[13px]">
            <Row
              label="Version"
              value={health.version ? `v${health.version}` : "—"}
            />
            <Row label="Endpoint" value={health.baseUrl} mono />
            <Row
              label="Uptime"
              value={
                health.uptimeSeconds != null
                  ? duration(health.uptimeSeconds)
                  : "—"
              }
            />
            <Row
              label="Embeddings"
              value={health.embeddings?.model ?? "—"}
              mono
              badge={
                health.embeddings?.local ? (
                  <Badge tone="good">local</Badge>
                ) : undefined
              }
            />
            <Row
              label="Extraction"
              value={
                health.llm
                  ? [health.llm.provider, health.llm.model]
                      .filter(Boolean)
                      .join("/")
                  : "—"
              }
              mono
            />
            <Row
              label="Vectors"
              value={
                health.counts?.chunks != null && health.embeddings
                  ? `${compact(health.counts.chunks)} × ${health.embeddings.dimensions}d`
                  : "Unavailable"
              }
            />
            <Row
              label="State"
              value={
                health.storage
                  ? bytes(health.storage.sizeBytes)
                  : "—"
              }
              hint={health.storage?.path}
            />
          </dl>
        </Card>

        <Card>
          <PanelHeader eyebrow="Server" title="Health" meta={health.status} />
          <dl className="divide-y divide-brand-black/[0.05] border-t border-brand-black/[0.05] px-6 text-[13px]">
            <Row
              label="Probe"
              value={health.latencyMs == null ? "—" : `${health.latencyMs} ms`}
            />
            <Row label="Documents" value={compact(documentCount)} />
            <Row label="Memories" value={compact(health.counts?.memories ?? 0)} />
            <Row label="Spaces" value={compact(spaces.length)} />
          </dl>
        </Card>

        <Card>
          <PanelHeader
            eyebrow="Corpus"
            title="Recent by type"
            meta={`${documents.length} of ${documentCount} docs`}
          />
          <div className="border-t border-brand-black/[0.05] px-6 py-5">
            <BarRows
              rows={Object.entries(countByType(documents))
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
            title="Recent failures"
            meta={failedDocs.length ? `${compact(failedDocs.length)} in sample` : "None"}
            action={
              failedDocs.length > 0 ? (
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
          {spaces.map((s) => (
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
  documents,
  processing,
  className,
  pipelineRange,
  onPipelineRangeChange,
}: {
  documents: Document[];
  processing: Document[];
  className?: string;
  pipelineRange: "active" | "recent";
  onPipelineRangeChange: (next: "active" | "recent") => void;
}) {
  const pipeline = useMemo(() => {
    if (pipelineRange === "active") {
      return {
        byStatus: countByStatus(processing),
        inFlight: processing.length,
        items: processing,
      };
    }
    const byStatus = countByStatus(documents);
    const inFlight = documents.filter(
      (d) => d.status !== "done" && d.status !== "failed",
    ).length;
    return { byStatus, inFlight, items: documents };
  }, [pipelineRange, documents, processing]);

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
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    d.status !== "done" &&
                      d.status !== "failed" &&
                      "animate-soft-pulse",
                  )}
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
  value: "active" | "recent";
  onChange: (next: "active" | "recent") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Pipeline time range"
      className="inline-flex shrink-0 gap-0.5 rounded-full border border-brand-black/[0.06] bg-brand-black/[0.03] p-0.5"
    >
      {([
        ["active", "Active"],
        ["recent", "Recent"],
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

function countByStatus(docs: Document[]): Record<string, number> {
  const counts = Object.fromEntries(
    PIPELINE_STATUSES.map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const doc of docs) {
    counts[doc.status] = (counts[doc.status] ?? 0) + 1;
  }
  return counts;
}

function countByType(docs: Document[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const doc of docs) counts[doc.type] = (counts[doc.type] ?? 0) + 1;
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
