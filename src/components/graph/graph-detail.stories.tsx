import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GraphDetail } from "@/components/graph/graph-detail";
import { fullGraph, memory, forgottenMemory } from "@/stories/fixtures";
import type { GraphNode } from "@/lib/types";

/**
 * The node inspector that floats over the graph canvas. It is positioned
 * `absolute` inside the canvas frame rather than being a drawer, so the graph
 * stays visible and you can keep clicking nodes with the panel open — the
 * point of a graph view is the surrounding structure, and a modal would hide
 * exactly that.
 *
 * The header swatch resolves in a fixed order: colour group first (if the node
 * matches one), then the forgotten treatment, then the node's kind colour.
 * That order matters — a forgotten node inside a colour group takes the group
 * colour, because the group is what you asked to see.
 *
 * `detail` is the full `MemoryEntry`, fetched separately from the graph
 * payload. It can be `null` while that request is in flight, so every block
 * below the identity line is conditional.
 */
const meta = {
  title: "Graph/GraphDetail",
  component: GraphDetail,
  parameters: {
    layout: "padded",
    nextjs: { appDirectory: true },
  },
  argTypes: {
    onEnterLocal: { table: { disable: true } },
    onClose: { table: { disable: true } },
  },
  args: {
    detail: memory,
    colorGroup: null,
    localActive: false,
    onEnterLocal: () => {},
    onClose: () => {},
    selected: {
      id: memory.id,
      kind: "memory",
      label: memory.memory,
      weight: 1 + memory.sourceCount,
      spaceId: memory.spaceId,
    } satisfies GraphNode,
  },
} satisfies Meta<typeof GraphDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Wraps the panel in a canvas-sized frame, since it positions absolutely. */
function OnCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[460px] overflow-hidden rounded-2xl border border-brand-black/[0.08] bg-background">
      <div className="absolute inset-0 flex items-center justify-center text-[12px] text-brand-black/25">
        graph canvas
      </div>
      {children}
    </div>
  );
}

/** A memory with relations and history — the full panel. */
export const MemoryNode: Story = {
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** Detail still loading: identity only, no flags or metadata yet. */
export const DetailPending: Story = {
  args: { detail: null },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** A document node — the action switches to "Open document". */
export const DocumentNode: Story = {
  args: {
    detail: null,
    selected: (fullGraph.nodes.find((n) => n.kind === "document") ??
      fullGraph.nodes[0]) as GraphNode,
  },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** A space node — the container tag itself. */
export const SpaceNode: Story = {
  args: {
    detail: null,
    selected: (fullGraph.nodes.find((n) => n.kind === "space") ??
      fullGraph.nodes[0]) as GraphNode,
  },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** Forgotten: muted swatch, an explicit eyebrow, and the reason if there is one. */
export const ForgottenMemory: Story = {
  args: {
    detail: forgottenMemory ?? memory,
    selected: {
      id: (forgottenMemory ?? memory).id,
      kind: "memory",
      label: (forgottenMemory ?? memory).memory,
      weight: 1,
      spaceId: (forgottenMemory ?? memory).spaceId,
      forgotten: true,
    } satisfies GraphNode,
  },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** Inside a colour group — the group swatch and label win over the kind. */
export const InColorGroup: Story = {
  args: {
    colorGroup: {
      id: "g1",
      query: "orbital",
      token: "s1",
      label: "Orbital",
    },
  },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};

/** Already in local-graph mode — the "Local graph" button is withdrawn. */
export const LocalActive: Story = {
  args: { localActive: true },
  render: (args) => (
    <OnCanvas>
      <GraphDetail {...args} />
    </OnCanvas>
  ),
};
