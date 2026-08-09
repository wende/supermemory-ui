import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatsCard } from "@/components/blocks/stats-card";
import { counts, SERVER_INFO } from "@/stories/fixtures";
import { bytes, compact, duration } from "@/lib/format";

/**
 * The headline metric tile: uppercase eyebrow and an optional health pill on
 * the top row, a `text-3xl` metric, then up to two lines of supporting text.
 *
 * The two support lines have distinct jobs. `primary` is the *composition* of
 * the number — what it is made of. `secondary` is the *context* — where it
 * came from, or how it is trending. Both truncate, so neither can push the
 * tile out of a grid.
 *
 * `healthy` is tri-state: pass `true` or `false` to show the pill, omit it
 * entirely when the metric has no health dimension.
 *
 * Compare with **Charts / Stat**, which is the same idea with a series accent
 * bar and a delta instead of a health pill.
 */
const meta = {
  title: "Blocks/StatsCard",
  component: StatsCard,
  parameters: { layout: "padded" },
  argTypes: {
    healthy: { control: "boolean" },
  },
  args: {
    label: "Memories",
    metric: compact(counts.memories),
    primary: `${counts.spaces} spaces · ${counts.relations} relations`,
    secondary: `${counts.forgotten} forgotten`,
  },
} satisfies Meta<typeof StatsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <StatsCard {...args} />
    </div>
  ),
};

/** Metric alone — correct when the number needs no gloss. */
export const MetricOnly: Story = {
  args: { primary: undefined, secondary: undefined, healthy: undefined },
  render: (args) => (
    <div className="max-w-sm">
      <StatsCard {...args} />
    </div>
  ),
};

/** With the health pill in both states. */
export const Health: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatsCard
        label="Local instance"
        metric={duration(SERVER_INFO.uptimeSeconds ?? 0)}
        primary={`${SERVER_INFO.baseUrl} · v${SERVER_INFO.version}`}
        secondary={`${SERVER_INFO.embeddings?.model} · ${SERVER_INFO.embeddings?.dimensions}d`}
        healthy
      />
      <StatsCard
        label="Local instance"
        metric="—"
        primary="http://localhost:6767"
        secondary="No response on /health"
        healthy={false}
      />
    </div>
  ),
};

/** The dashboard row — four tiles, one grid, no nesting. */
export const DashboardRow: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        label="Memories"
        metric={compact(counts.memories)}
        primary={`${counts.relations} relations`}
        secondary={`${counts.forgotten} forgotten`}
      />
      <StatsCard
        label="Documents"
        metric={compact(counts.documents)}
        primary={`${compact(counts.chunks)} chunks`}
        secondary={`across ${counts.spaces} spaces`}
      />
      <StatsCard
        label="Storage"
        metric={bytes(SERVER_INFO.storage?.sizeBytes ?? 0)}
        primary={SERVER_INFO.storage?.engine}
        secondary={SERVER_INFO.storage?.path}
      />
      <StatsCard
        label="Uptime"
        metric={duration(SERVER_INFO.uptimeSeconds ?? 0)}
        primary={`${SERVER_INFO.llm?.provider} · ${SERVER_INFO.llm?.model}`}
        secondary={SERVER_INFO.baseUrl}
        healthy
      />
    </div>
  ),
};

/**
 * Long values truncate rather than wrap — a tile keeps its height so the grid
 * row stays level.
 */
export const Overflow: Story = {
  args: {
    label: "Embeddings provider and model configuration",
    metric: "768",
    primary:
      "xenova · bge-base-en-v1.5 · running locally with no network egress at all",
    secondary: "~/.supermemory/state/index.hnsw (rebuilt 4 days ago)",
  },
  render: (args) => (
    <div className="max-w-xs">
      <StatsCard {...args} />
    </div>
  ),
};
