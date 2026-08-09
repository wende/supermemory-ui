import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GraphCanvas, type HoverInfo } from "@/components/graph/graph-canvas";
import { GraphLegend } from "@/components/graph/graph-legend";
import { DEFAULT_SETTINGS } from "@/lib/graph/settings";
import type { GraphSettings, SimNode } from "@/lib/graph/types";
import { fullGraph, memoryGraph, graphCounts } from "@/stories/fixtures";

/**
 * The memory graph itself — a d3-force simulation rendered to `<canvas>`,
 * because an SVG node per memory stops being viable somewhere in the low
 * hundreds and the corpus is expected to outgrow that.
 *
 * What to try in these stories:
 *
 * - **Drag a node.** It pins there. The pinned position survives a filter
 *   change, so the layout you arranged is not thrown away when you narrow the
 *   view.
 * - **Scroll to zoom, drag the background to pan.** Labels fade in past the
 *   `textFade` threshold rather than all at once, which keeps a dense middle
 *   zoom readable.
 * - **Click a node.** Selection is reported up through `onSelect` — the graph
 *   page turns that into a `GraphDetail` panel.
 *
 * It needs a sized parent: the canvas measures its container, so a
 * zero-height wrapper renders nothing. Every story below supplies a frame.
 */
const meta = {
  title: "Graph/GraphCanvas",
  component: GraphCanvas,
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "560px" } },
    // A canvas has no accessible tree to audit; the surrounding page carries
    // the equivalent information as text.
    a11y: { disable: true },
  },
  argTypes: {
    onSelect: { table: { disable: true } },
    onHoverChange: { table: { disable: true } },
    fitRef: { table: { disable: true } },
  },
  args: {
    data: fullGraph,
    settings: DEFAULT_SETTINGS,
    selectedId: null,
    onSelect: () => {},
  },
} satisfies Meta<typeof GraphCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[560px] w-full overflow-hidden bg-background">
      {children}
    </div>
  );
}

/** The whole corpus: spaces, memories and the documents they came from. */
export const FullGraph: Story = {
  render: function FullGraph(args) {
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
      <Frame>
        <GraphCanvas
          {...args}
          selectedId={selected}
          onSelect={(n: SimNode | null) => setSelected(n?.id ?? null)}
        />
      </Frame>
    );
  },
};

/** Memories and spaces only — the view when source documents are hidden. */
export const MemoriesOnly: Story = {
  args: {
    data: memoryGraph,
    settings: { ...DEFAULT_SETTINGS, showDocuments: false },
  },
  render: function MemoriesOnly(args) {
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
      <Frame>
        <GraphCanvas
          {...args}
          selectedId={selected}
          onSelect={(n: SimNode | null) => setSelected(n?.id ?? null)}
        />
      </Frame>
    );
  },
};

/**
 * Colour groups override the kind palette. Queries are compiled once and
 * matched against node labels, so a node in two groups takes the first match.
 */
export const WithColorGroups: Story = {
  args: {
    settings: {
      ...DEFAULT_SETTINGS,
      colorGroups: [
        { id: "g1", query: "orbital", token: "s1", label: "Orbital" },
        { id: "g2", query: "retrieval", token: "s5", label: "Retrieval" },
        { id: "g3", query: "replay", token: "s4", label: "Replay" },
      ],
    } satisfies GraphSettings,
  },
  render: function WithColorGroups(args) {
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
      <Frame>
        <GraphCanvas
          {...args}
          selectedId={selected}
          onSelect={(n: SimNode | null) => setSelected(n?.id ?? null)}
        />
      </Frame>
    );
  },
};

/** Loosened forces — a sparser layout, easier to read at low zoom. */
export const LooseLayout: Story = {
  args: {
    settings: {
      ...DEFAULT_SETTINGS,
      repelForce: 0.85,
      linkDistance: 0.8,
      centerForce: 0.25,
      nodeSize: 0.7,
      textFade: 0.2,
    } satisfies GraphSettings,
  },
  render: function LooseLayout(args) {
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
      <Frame>
        <GraphCanvas
          {...args}
          selectedId={selected}
          onSelect={(n: SimNode | null) => setSelected(n?.id ?? null)}
        />
      </Frame>
    );
  },
};

/** Canvas, legend and a live hover readout — the assembled graph view. */
export const WithLegend: Story = {
  render: function WithLegend(args) {
    const [selected, setSelected] = React.useState<string | null>(null);
    const [hover, setHover] = React.useState<HoverInfo | null>(null);
    return (
      <div className="flex h-[560px] w-full flex-col bg-background">
        <div className="relative min-h-0 flex-1">
          <GraphCanvas
            {...args}
            selectedId={selected}
            onSelect={(n: SimNode | null) => setSelected(n?.id ?? null)}
            onHoverChange={setHover}
          />
        </div>
        <GraphLegend
          counts={graphCounts}
          showForgotten={false}
          colorGroups={[]}
          groupCounts={{}}
          trailing={
            <span className="max-w-[16rem] truncate text-[11px] text-brand-black/45">
              {hover ? `${hover.label} · ${hover.degree} links` : "—"}
            </span>
          }
        />
      </div>
    );
  },
};
