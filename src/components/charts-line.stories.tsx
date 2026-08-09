import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LineChart } from "@/components/charts";
import { PanelCard } from "@/components/blocks/panel-card";
import { activityLabels, activitySeries, ACTIVITY } from "@/stories/fixtures";

/**
 * Two-series line chart with a shared crosshair. The rules it encodes, all of
 * which are worth keeping if you touch it:
 *
 * - **2px strokes**, round joins and caps.
 * - **A legend whenever there are two or more series** — the tooltip is not a
 *   substitute, because it only exists while the pointer is over the plot.
 * - **A hover layer on every plotted form.** Moving the pointer snaps to the
 *   nearest index, drops a crosshair, and marks every series at 4.5px with a
 *   card-coloured halo so the dot stays visible on top of its own line.
 * - **Recessive chrome.** Gridlines in `--grid`, the zero line in `--axis`,
 *   tick labels at 9.5px muted.
 * - **Nice ticks.** The Y scale rounds up to a 1/2/2.5/5×10ⁿ step, so the top
 *   gridline is a number a person would have chosen.
 *
 * Only three X labels are drawn — first, middle, last. A 30-point series with
 * 30 date labels is unreadable at any width the console offers.
 */
const meta = {
  title: "Charts/LineChart",
  component: LineChart,
  parameters: { layout: "padded" },
  args: {
    labels: activityLabels,
    series: activitySeries,
    height: 190,
    yLabel: "items per day",
  },
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Thirty days of ingest volume, documents against memories. */
export const Playground: Story = {
  render: (args) => (
    <div className="max-w-3xl">
      <LineChart {...args} />
    </div>
  ),
};

/**
 * One series still gets a legend here — the component always renders it — but
 * a single-series chart should really name itself in the panel title instead.
 * Compare **Charts / Sparkline**, which drops the legend for exactly that
 * reason.
 */
export const SingleSeries: Story = {
  args: {
    series: [activitySeries[1]],
    yLabel: "memories extracted per day",
  },
  render: (args) => (
    <div className="max-w-3xl">
      <LineChart {...args} />
    </div>
  ),
};

/** Inside a panel, which is where it always ships. */
export const InPanel: Story = {
  render: (args) => (
    <PanelCard
      eyebrow="Instance"
      title="Ingest activity"
      subtitle="Documents ingested and memories extracted, last 30 days."
      className="max-w-3xl"
    >
      <div className="px-6 pt-4">
        <LineChart {...args} />
      </div>
    </PanelCard>
  ),
};

/** A short window — the X scale centres a single point rather than dividing by zero. */
export const ShortWindow: Story = {
  args: {
    labels: activityLabels.slice(-7),
    series: activitySeries.map((s) => ({ ...s, values: s.values.slice(-7) })),
    yLabel: "items per day, last 7 days",
  },
  render: (args) => (
    <div className="max-w-2xl">
      <LineChart {...args} />
    </div>
  ),
};

/** Taller, for a panel that has the vertical room to spare. */
export const Tall: Story = {
  args: { height: 300 },
  render: (args) => (
    <div className="max-w-3xl">
      <LineChart {...args} />
    </div>
  ),
};

/** A flat series still renders a sensible axis rather than collapsing. */
export const FlatSeries: Story = {
  args: {
    labels: activityLabels.slice(-10),
    series: [
      {
        key: "failures",
        label: "Failed ingests",
        color: "var(--color-critical)",
        values: Array.from({ length: 10 }, () => 0),
      },
      {
        key: "documents",
        label: "Documents",
        color: "var(--color-s1)",
        values: ACTIVITY.slice(-10).map((a) => a.documents),
      },
    ],
    yLabel: "items per day",
  },
  render: (args) => (
    <div className="max-w-2xl">
      <LineChart {...args} />
    </div>
  ),
};
