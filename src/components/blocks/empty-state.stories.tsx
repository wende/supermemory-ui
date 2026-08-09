import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EmptyState } from "@/components/blocks/empty-state";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PanelCard } from "@/components/blocks/panel-card";

/**
 * Centred placeholder: a soft icon well, a short title, an optional
 * explanation and an optional action.
 *
 * The title should say **what is not there**, not that something is empty —
 * "No memories match that filter" beats "Empty". The description says what
 * would change it. If there is a way forward, the action is that way forward,
 * and it should be one button, not a menu.
 *
 * The icon well is `bg-brand-black/[0.035]` with the glyph at 45% — soft
 * enough that it anchors the block without becoming the loudest thing on an
 * otherwise empty screen.
 */
const meta = {
  title: "Blocks/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  argTypes: { icon: { table: { disable: true } } },
  args: {
    icon: Icon.memory,
    title: "No memories yet",
    description:
      "Add a document or assert a fact directly and the engine will start extracting.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Title only — enough when the context already explains itself. */
export const TitleOnly: Story = {
  args: { icon: undefined, description: undefined },
};

/** With an action, which is the preferred shape whenever one exists. */
export const WithAction: Story = {
  args: {
    action: (
      <Button size="sm" variant="primary">
        <Icon.add size={13} />
        Add memory
      </Button>
    ),
  },
};

/** The states a user actually meets, each with its own icon and way out. */
export const RealCases: Story = {
  render: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <PanelCard eyebrow="Recall" title="Ask">
        <EmptyState
          icon={Icon.search}
          title="No results above the threshold"
          description="Nothing scored higher than 0.35. Lower the threshold or widen the search mode to hybrid."
          action={
            <Button size="sm" variant="outline">
              <Icon.sliders size={13} />
              Adjust threshold
            </Button>
          }
        />
      </PanelCard>

      <PanelCard eyebrow="Ingest" title="Documents">
        <EmptyState
          icon={Icon.document}
          title="Nothing ingested into this space"
          description="Documents added here inherit the space's filter prompt and chunk size."
          action={
            <Button size="sm" variant="primary">
              <Icon.upload size={13} />
              Upload
            </Button>
          }
        />
      </PanelCard>

      <PanelCard eyebrow="Recall" title="Graph">
        <EmptyState
          icon={Icon.graph}
          title="No relations to draw"
          description="Memories become connected once the engine finds one that updates, extends or derives from another."
        />
      </PanelCard>

      <PanelCard eyebrow="Instance" title="Pipeline">
        <EmptyState
          icon={Icon.clock}
          title="Nothing in flight"
          description="Documents appear here while they are being extracted, chunked and embedded."
        />
      </PanelCard>
    </div>
  ),
};
