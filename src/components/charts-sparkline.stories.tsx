import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Sparkline } from "@/components/charts";
import { PanelCard } from "@/components/blocks/panel-card";
import { LATENCIES, ACTIVITY } from "@/stories/fixtures";

/**
 * A single series at small size — shape only, no axes. **No legend**, because
 * with one series the legend would just repeat the caption; the panel title or
 * the surrounding text names what is being plotted.
 *
 * The p50 / p95 caption underneath is the deliberate trade for the missing Y
 * axis: you cannot read a value off the curve, so the two numbers that matter
 * for a latency series are stated outright.
 *
 * The SVG stretches with `preserveAspectRatio="none"`, which would normally
 * distort the stroke — `vector-effect="non-scaling-stroke"` keeps it a true
 * 2px at any container width.
 *
 * Note the Y scale runs min→max, not 0→max. A sparkline shows **variation**,
 * not magnitude; if the absolute level matters, use `LineChart`.
 */
const meta = {
  title: "Charts/Sparkline",
  component: Sparkline,
  parameters: { layout: "padded" },
  args: {
    values: LATENCIES,
    color: "var(--color-s1)",
    height: 40,
    suffix: "ms",
  },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recent query latencies. Hover for the value at a point. */
export const Playground: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <Sparkline {...args} />
    </div>
  ),
};

/** Named by its panel, which is what replaces the legend. */
export const InPanel: Story = {
  render: (args) => (
    <PanelCard
      eyebrow="Instance"
      title="Recall latency"
      subtitle="Last 40 queries, hybrid mode."
      className="max-w-sm"
    >
      <div className="px-6 pt-4">
        <Sparkline {...args} />
      </div>
    </PanelCard>
  ),
};

/** Taller, when the shape is the point rather than a footnote. */
export const Tall: Story = {
  args: { height: 72 },
  render: (args) => (
    <div className="max-w-md">
      <Sparkline {...args} />
    </div>
  ),
};

/** Counts rather than durations — drop the suffix. */
export const Counts: Story = {
  args: {
    values: ACTIVITY.map((a) => a.memories),
    color: "var(--color-s3)",
    suffix: "",
  },
  render: (args) => (
    <div className="max-w-sm">
      <Sparkline {...args} />
    </div>
  ),
};

/** A row of them — the compact instance summary. */
export const Row: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
      <PanelCard eyebrow="Instance" title="Recall p95">
        <div className="px-6 pt-4">
          <Sparkline values={LATENCIES} suffix="ms" />
        </div>
      </PanelCard>
      <PanelCard eyebrow="Ingest" title="Documents / day">
        <div className="px-6 pt-4">
          <Sparkline
            values={ACTIVITY.map((a) => a.documents)}
            color="var(--color-s1)"
          />
        </div>
      </PanelCard>
      <PanelCard eyebrow="Recall" title="Memories / day">
        <div className="px-6 pt-4">
          <Sparkline
            values={ACTIVITY.map((a) => a.memories)}
            color="var(--color-s3)"
          />
        </div>
      </PanelCard>
    </div>
  ),
};
