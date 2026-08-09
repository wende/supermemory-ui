import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GraphLegend } from "@/components/graph/graph-legend";
import { graphCounts } from "@/stories/fixtures";
import type { ColorGroup } from "@/lib/graph/types";

/**
 * The bar under the graph canvas. It explains both halves of the drawing:
 * **node colour** on the left, **edge style** on the right.
 *
 * The node half is mode-dependent. With no colour groups configured it lists
 * the three node kinds against their series colours; the moment a group exists
 * it switches to listing groups instead, because the kind colours are no
 * longer what you are seeing.
 *
 * Edge semantics are carried by **colour and dash together**, never colour
 * alone — `derives` and `sourced from` are dashed, `extends` and `in space`
 * are solid, so the four relations stay distinguishable in grayscale.
 *
 * The divider between the halves is measured rather than assumed: a
 * `ResizeObserver` compares the two groups' offsets and only draws the rule
 * while they share a row and there is at least 40px of slack. That hysteresis
 * is what stops it flickering as the panel is dragged.
 */
const meta = {
  title: "Graph/GraphLegend",
  component: GraphLegend,
  parameters: { layout: "padded" },
  args: {
    counts: graphCounts,
    showForgotten: false,
    colorGroups: [],
    groupCounts: {},
  },
} satisfies Meta<typeof GraphLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Kind mode — the default. */
export const NodeKinds: Story = {
  render: (args) => (
    <div className="overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};

/** With forgotten memories shown, which adds the hollow-ring entry. */
export const WithForgotten: Story = {
  args: { showForgotten: true },
  render: (args) => (
    <div className="overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};

/**
 * Group mode. Once queries define the colouring, the kind legend would be a
 * lie — so it is replaced rather than appended to.
 */
export const ColorGroups: Story = {
  args: {
    colorGroups: [
      { id: "g1", query: "orbital", token: "s1", label: "Orbital" },
      { id: "g2", query: "retrieval OR embedding", token: "s3", label: "Retrieval" },
      { id: "g3", query: "postmortem", token: "critical", label: "Incidents" },
    ] satisfies ColorGroup[],
    groupCounts: { g1: 24, g2: 17, g3: 5 },
  },
  render: (args) => (
    <div className="overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};

/** Long group labels truncate at 9rem so the bar cannot be pushed off-screen. */
export const LongGroupLabels: Story = {
  args: {
    colorGroups: [
      {
        id: "g1",
        query: "orbital AND (dispatch OR scheduling)",
        token: "s1",
      },
      {
        id: "g2",
        query: "retrieval AND reranking AND long-context",
        token: "s5",
      },
    ] satisfies ColorGroup[],
    groupCounts: { g1: 12, g2: 8 },
  },
  render: (args) => (
    <div className="overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};

/** Narrow — the two halves wrap and the divider withdraws. */
export const Narrow: Story = {
  render: (args) => (
    <div className="max-w-md overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};

/** The `trailing` slot holds canvas controls — zoom-to-fit, customise. */
export const WithTrailing: Story = {
  args: {
    trailing: (
      <div className="flex items-center gap-1.5">
        <span className="tnum text-[11px] text-brand-black/45">
          {graphCounts.memory + graphCounts.document + graphCounts.space} nodes
        </span>
      </div>
    ),
  },
  render: (args) => (
    <div className="overflow-hidden rounded-2xl border border-brand-black/[0.08]">
      <GraphLegend {...args} />
    </div>
  ),
};
