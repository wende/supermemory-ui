import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageBody, PageTitle } from "@/components/shell";
import { PanelCard } from "@/components/blocks/panel-card";
import { StatusPill } from "@/components/blocks/status-pill";
import { StatusDot } from "@/components/blocks/status-dot";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LineChart, SegmentBar, Sparkline, Stat } from "@/components/charts";
import {
  ACTIVITY,
  LATENCIES,
  SERVER_INFO,
  activityLabels,
  activitySeries,
  counts,
  documentsByStatus,
  pipelineSegments,
  recentDocuments,
  recentMemories,
} from "@/stories/fixtures";
import type { DocumentStatus } from "@/lib/types";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
  bytes,
  compact,
  duration,
  relTime,
} from "@/lib/format";

/**
 * The instance overview, assembled from the kit.
 *
 * Patterns exist to answer a question a component story cannot: **does the
 * change survive contact with a real page?** A stat tile that looks right
 * alone can still be wrong in a four-across grid; a panel radius that reads
 * well in isolation can fight the one beside it.
 *
 * What this page demonstrates:
 *
 * - **One plane of panels.** Tiles and cards sit side by side; nothing nests.
 * - **Series for entities, status for conditions.** The stat accents are
 *   `--s1`/`--s3`/`--s2`; the pipeline bar is the only place status colours
 *   appear, and there the categories genuinely are states.
 * - **Compact everywhere.** No raw ISO strings, no unformatted byte counts.
 */
const meta: Meta = {
  title: "Patterns/Dashboard",
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "900px", inline: false } },
  },
};

export default meta;
type Story = StoryObj;

/** Pipeline order, plus the terminal failure state the stages do not include. */
const PIPELINE_ORDER: DocumentStatus[] = [
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "indexing",
  "done",
  "failed",
];

export const Overview: Story = {
  render: () => (
    <div className="min-h-[900px] bg-background">
      <PageBody>
        <PageTitle
          label="Instance"
          title="Dashboard"
          description="A read on the local engine: what it holds, what it is working on, and how fast it is answering."
        >
          <StatusPill variant="solid">Healthy</StatusPill>
          <Button size="sm" variant="ghost">
            <Icon.refresh size={13} />
            Refresh
          </Button>
        </PageTitle>

        {/* Corpus at a glance */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Memories"
            value={compact(counts.memories)}
            hint={`${counts.forgotten} forgotten`}
            delta={{ value: "+34 this week", good: true }}
            accent="var(--color-s3)"
          />
          <Stat
            label="Documents"
            value={compact(counts.documents)}
            hint={`${compact(counts.chunks)} chunks`}
            accent="var(--color-s1)"
          />
          <Stat
            label="Spaces"
            value={counts.spaces}
            hint="container tags in use"
            accent="var(--color-s2)"
          />
          <Stat
            label="Relations"
            value={compact(counts.relations)}
            hint="updates · extends · derives"
            accent="var(--color-s5)"
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {/* Activity — two series, so it carries a legend */}
          <PanelCard
            eyebrow="Instance"
            title="Ingest activity"
            subtitle="Documents ingested and memories extracted, last 30 days."
            className="lg:col-span-2"
          >
            <div className="px-6 pt-4">
              <LineChart
                labels={activityLabels}
                series={activitySeries}
                height={200}
                yLabel="items per day"
              />
            </div>
          </PanelCard>

          {/* Runtime */}
          <PanelCard
            eyebrow="Instance"
            title="Runtime"
            action={<StatusPill variant="solid">Live</StatusPill>}
          >
            <dl className="space-y-2.5 px-6 pt-4 text-[12px]">
              {[
                ["Endpoint", SERVER_INFO.baseUrl],
                ["Version", `v${SERVER_INFO.version}`],
                ["Uptime", duration(SERVER_INFO.uptimeSeconds ?? 0)],
                ["Embeddings", SERVER_INFO.embeddings?.model ?? "—"],
                ["LLM", SERVER_INFO.llm?.model ?? "—"],
                ["Storage", bytes(SERVER_INFO.storage?.sizeBytes ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-brand-black/40">{k}</dt>
                  <dd className="mono min-w-0 truncate text-brand-black/70">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </PanelCard>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {/* Pipeline — the one chart allowed status colours */}
          <PanelCard
            eyebrow="Ingest"
            title="Pipeline"
            subtitle="Where the corpus currently sits."
          >
            <div className="px-6 pt-4">
              <SegmentBar segments={pipelineSegments} />
            </div>
          </PanelCard>

          {/* Latency — one series, so no legend; the title names it */}
          <PanelCard
            eyebrow="Recall"
            title="Recall latency"
            subtitle="Last 40 queries, hybrid mode."
          >
            <div className="px-6 pt-4">
              <Sparkline values={LATENCIES} suffix="ms" height={56} />
            </div>
          </PanelCard>

          {/* Throughput */}
          <PanelCard
            eyebrow="Ingest"
            title="Extraction rate"
            subtitle="Memories per ingested document, last 30 days."
          >
            <div className="px-6 pt-4">
              <Sparkline
                values={ACTIVITY.map((a) =>
                  a.documents ? Math.round((a.memories / a.documents) * 10) / 10 : 0,
                )}
                color="var(--color-s3)"
                height={56}
              />
            </div>
          </PanelCard>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <PanelCard
            eyebrow="Recall"
            title="Recently extracted"
            action={
              <Button size="sm" variant="ghost">
                Memory bank
                <Icon.chevron size={13} />
              </Button>
            }
            stagger
          >
            {recentMemories.slice(0, 5).map((m) => (
              <div key={m.id} className="px-6 py-3 first:pt-4">
                <p className="text-[13px] leading-relaxed text-brand-black">
                  {m.memory}
                </p>
                <span className="mt-1 block text-[11px] text-brand-black/45">
                  {relTime(m.updatedAt)} · {m.sourceCount} sources · v
                  {m.version}
                </span>
              </div>
            ))}
          </PanelCard>

          <PanelCard
            eyebrow="Ingest"
            title="Recently ingested"
            action={
              <Button size="sm" variant="ghost">
                Documents
                <Icon.chevron size={13} />
              </Button>
            }
            stagger
          >
            {recentDocuments.slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-6 py-3 first:pt-4"
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[d.status] }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
                  {d.title ?? "Untitled"}
                </span>
                <span className="shrink-0 text-[11px] text-brand-black/45">
                  {TYPE_LABEL[d.type]}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] text-brand-black/45">
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
            ))}
          </PanelCard>
        </div>
      </PageBody>
    </div>
  ),
};

/**
 * The same page while the corpus is still moving — pulsing dots on in-flight
 * work, and nothing pulsing that has finished.
 */
export const Ingesting: Story = {
  render: () => (
    <div className="min-h-[520px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle label="Ingest" title="Pipeline">
          <StatusPill variant="ongoing">Running</StatusPill>
        </PageTitle>
        <PanelCard
          eyebrow="Ingest"
          title="In flight"
          subtitle="Polled while work is outstanding, then stopped."
          className="mt-6"
          stagger
        >
          {PIPELINE_ORDER.map((status) => {
            const d = documentsByStatus[status];
            if (!d) return null;
            const inFlight = ["extracting", "chunking", "embedding", "indexing"].includes(
              status,
            );
            return (
              <div
                key={status}
                className="flex items-center gap-3 px-6 py-3 first:pt-4"
              >
                <StatusDot
                  tone={
                    status === "done"
                      ? "success"
                      : status === "failed"
                        ? "failure"
                        : status === "queued"
                          ? "pending"
                          : "running"
                  }
                  pulsing={inFlight}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
                  {d.title ?? "Untitled"}
                </span>
                <span className="shrink-0 text-[11px] text-brand-black/45">
                  {TYPE_LABEL[d.type]}
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] text-brand-black/45">
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          })}
        </PanelCard>
      </PageBody>
    </div>
  ),
};
