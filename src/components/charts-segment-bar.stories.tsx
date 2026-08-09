import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SegmentBar } from "@/components/charts";
import { PanelCard } from "@/components/blocks/panel-card";
import { pipelineSegments, DOCUMENTS } from "@/stories/fixtures";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/format";
import { PIPELINE_STAGES } from "@/lib/types";

/**
 * One bar, split by category — the *composition of a whole*. This is the form
 * the pipeline uses, and it is the one place a chart is allowed **status**
 * colours, because the categories genuinely are states.
 *
 * Details that matter:
 *
 * - **2px gaps** between adjacent fills, so neighbouring segments stay
 *   distinguishable without a stroke.
 * - **Rounded ends on every segment**, not just the outer two.
 * - **Zero-value segments are dropped**, not rendered as slivers — a 0.4px
 *   sliver is noise, and the legend below still reports the count.
 * - **Linked hover.** Pointing at a segment or its legend entry dims the
 *   others to 40%, which is what makes a 6% slice findable.
 *
 * Keep the category count low. Past five or six, the segments are too narrow
 * to hover and `BarRows` is the better form.
 */
const meta = {
  title: "Charts/SegmentBar",
  component: SegmentBar,
  parameters: { layout: "padded" },
  args: { segments: pipelineSegments, height: 10 },
} satisfies Meta<typeof SegmentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The pipeline: indexed, in flight, failed. */
export const Playground: Story = {
  render: (args) => (
    <div className="max-w-lg">
      <SegmentBar {...args} />
    </div>
  ),
};

/** Every stage separately, using the same STATUS_COLOR mapping as the rows. */
export const ByStage: Story = {
  args: {
    segments: PIPELINE_STAGES.map((s) => ({
      label: STATUS_LABEL[s],
      value: DOCUMENTS.filter((d) => d.status === s).length,
      color: STATUS_COLOR[s],
    })),
  },
  render: (args) => (
    <div className="max-w-lg">
      <SegmentBar {...args} />
    </div>
  ),
};

/** Inside a panel — how the dashboard ships it. */
export const InPanel: Story = {
  render: (args) => (
    <PanelCard
      eyebrow="Ingest"
      title="Pipeline"
      subtitle="Where the corpus currently sits."
      className="max-w-xl"
    >
      <div className="px-6 pt-4">
        <SegmentBar {...args} />
      </div>
    </PanelCard>
  ),
};

/** A healthy corpus — one segment, no gaps to draw. */
export const SingleSegment: Story = {
  args: {
    segments: [
      { label: "Indexed", value: 42, color: "var(--color-good)" },
      { label: "In flight", value: 0, color: "var(--warning-status)" },
      { label: "Failed", value: 0, color: "var(--color-critical)" },
    ],
  },
  render: (args) => (
    <div className="max-w-lg">
      <SegmentBar {...args} />
    </div>
  ),
};

/** Thicker, for a bar that is the panel's main subject rather than a summary. */
export const Thick: Story = {
  args: { height: 18 },
  render: (args) => (
    <div className="max-w-lg">
      <SegmentBar {...args} />
    </div>
  ),
};

/** All zeros — the track renders empty rather than dividing by zero. */
export const Empty: Story = {
  args: {
    segments: [
      { label: "Indexed", value: 0, color: "var(--color-good)" },
      { label: "In flight", value: 0, color: "var(--warning-status)" },
      { label: "Failed", value: 0, color: "var(--color-critical)" },
    ],
  },
  render: (args) => (
    <div className="max-w-lg">
      <SegmentBar {...args} />
    </div>
  ),
};
