import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoadingState } from "@/components/blocks/loading-state";
import { PanelCard } from "@/components/blocks/panel-card";

/**
 * Spinner plus a 12px muted label. Use it when the **shape of the result is
 * not known** — a search that may return one row or forty. When the shape is
 * known, a `Skeleton` grid is better, because it holds the layout and the page
 * does not jump on resolve.
 *
 * The label should name the work, not the wait. "Searching 1,284 memories"
 * tells an operator something; "Loading..." does not.
 */
const meta = {
  title: "Blocks/LoadingState",
  component: LoadingState,
  parameters: { layout: "padded" },
  args: { label: "Loading..." },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Labels that name the work. */
export const DescriptiveLabels: Story = {
  render: () => (
    <div className="max-w-md">
      <LoadingState label="Searching 1,284 memories" />
      <LoadingState label="Assembling graph from 412 relations" />
      <LoadingState label="Re-embedding 18 chunks with bge-base-en-v1.5" />
      <LoadingState label="Reaching localhost:6767" />
    </div>
  ),
};

/** Inside a panel, which is where it usually lands. */
export const InPanel: Story = {
  render: () => (
    <PanelCard
      eyebrow="Recall"
      title="Ask"
      subtitle="Hybrid search across memories and document chunks."
      className="max-w-xl"
    >
      <LoadingState label="Searching 1,284 memories" className="py-8" />
    </PanelCard>
  ),
};
