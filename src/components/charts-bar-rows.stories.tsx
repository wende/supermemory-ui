import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarRows } from "@/components/charts";
import { PanelCard } from "@/components/blocks/panel-card";
import { spaceRows, DOCUMENTS } from "@/stories/fixtures";
import { TYPE_LABEL } from "@/lib/format";
import { DOCUMENT_TYPES } from "@/lib/types";

/**
 * Horizontal bars with direct labels — the right form for **comparing a
 * category across one measure**, which is most of what a corpus view needs.
 *
 * Horizontal rather than vertical because the categories are text: space
 * names and document types do not fit under a vertical axis without rotating,
 * and rotated labels are a tax on every read.
 *
 * A **single hue** for all rows, because there is one measure. Colouring each
 * bar differently would imply the categories carry a series meaning they do
 * not have. Pass `color` to pick which series the whole chart is about.
 *
 * Bars have a 2% floor width so a zero-value row still shows its track and
 * stays clickable, and the value sits at the right in tabular figures so the
 * column of numbers reads straight down.
 */
const meta = {
  title: "Charts/BarRows",
  component: BarRows,
  parameters: { layout: "padded" },
  args: {
    rows: spaceRows,
    color: "var(--color-s2)",
  },
} satisfies Meta<typeof BarRows>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Documents per space — hover a row for the space description. */
export const Playground: Story = {
  render: (args) => (
    <div className="max-w-lg">
      <BarRows {...args} />
    </div>
  ),
};

/** Recoloured for a different measure — one hue, chosen by what it counts. */
export const ByDocumentType: Story = {
  args: {
    color: "var(--color-s1)",
    rows: DOCUMENT_TYPES.map((t) => ({
      label: TYPE_LABEL[t],
      value: DOCUMENTS.filter((d) => d.type === t).length,
    }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value),
  },
  render: (args) => (
    <div className="max-w-lg">
      <BarRows {...args} />
    </div>
  ),
};

/**
 * `max` pins the scale so two charts can be compared directly. Without it each
 * chart normalises to its own largest row, and the same bar length means a
 * different number in each.
 */
export const SharedScale: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-4 md:grid-cols-2">
      <PanelCard eyebrow="Ingest" title="Documents per space">
        <div className="px-6 pt-4">
          <BarRows rows={spaceRows} color="var(--color-s1)" max={12} />
        </div>
      </PanelCard>
      <PanelCard eyebrow="Recall" title="Memories per space">
        <div className="px-6 pt-4">
          <BarRows
            rows={spaceRows.map((r) => ({
              ...r,
              value: Math.round(r.value * 1.8),
            }))}
            color="var(--color-s3)"
            max={12}
          />
        </div>
      </PanelCard>
    </div>
  ),
};

/** A zero row keeps its track, so the category does not silently disappear. */
export const WithZero: Story = {
  args: {
    rows: [
      { label: "Orbital", value: 9 },
      { label: "Research", value: 6 },
      { label: "Personal", value: 3 },
      { label: "Archive", value: 0, hint: "No documents ingested yet" },
    ],
  },
  render: (args) => (
    <div className="max-w-lg">
      <BarRows {...args} />
    </div>
  ),
};

/** Long labels truncate at the fixed 7rem label column. */
export const LongLabels: Story = {
  args: {
    rows: [
      { label: "Orbital — edge scheduling engine", value: 9 },
      { label: "Research — retrieval and long context", value: 6 },
      { label: "Personal", value: 3 },
    ],
  },
  render: (args) => (
    <div className="max-w-lg">
      <BarRows {...args} />
    </div>
  ),
};
