import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * An outlined chip whose tone names a **role**, not a colour. That is the
 * whole point of the API: `tone="s3"` says *this is about memories*, and if
 * the memories series is ever re-tuned every badge follows.
 *
 * The tone list splits along the system's two colour roles:
 *
 * - `s1`, `s2`, `s3`, `s5` — series. What kind of thing this is.
 * - `good`, `warning`, `critical` — status. How it is going.
 * - `neutral` — neither; the default.
 *
 * Unlike `StatusPill` this is an outline, not a fill, so it can sit inside
 * dense rows without turning them into a colour field.
 */
const meta = {
  title: "Console Kit/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  argTypes: {
    tone: {
      control: "select",
      options: [
        "neutral",
        "good",
        "warning",
        "critical",
        "s1",
        "s2",
        "s3",
        "s5",
      ],
    },
  },
  args: { children: "v4", tone: "neutral" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">Neutral</div>
        <Badge tone="neutral">default</Badge>
      </div>
      <div>
        <div className="label mb-2">Series — what kind of thing</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="s1">document</Badge>
          <Badge tone="s2">space</Badge>
          <Badge tone="s3">memory</Badge>
          <Badge tone="s5">relation</Badge>
        </div>
      </div>
      <div>
        <div className="label mb-2">Status — how it is going</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="good">indexed</Badge>
          <Badge tone="warning">embedding</Badge>
          <Badge tone="critical">failed</Badge>
        </div>
      </div>
    </div>
  ),
};

/** With a glyph. Keep the icon at 11–12px so it matches the cap height. */
export const WithIcon: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge tone="s3">
        <Icon.memory size={11} />
        memory
      </Badge>
      <Badge tone="s1">
        <Icon.document size={11} />
        document
      </Badge>
      <Badge tone="s2">
        <Icon.space size={11} />
        space
      </Badge>
      <Badge tone="critical">
        <Icon.forget size={11} />
        forgotten
      </Badge>
    </div>
  ),
};

/** How the graph detail panel stacks them on a memory node. */
export const MemoryFlags: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="max-w-xs rounded-xl border border-brand-black/[0.06] bg-card p-4">
      <p className="text-[13px] leading-relaxed text-brand-black/70">
        HRW dispatch is unsafe without a pinned membership snapshot.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[11px] text-brand-black/35">v3</span>
        <Badge tone="s3">asserted</Badge>
        <Badge tone="s2">inferred</Badge>
        <Badge tone="critical">forgotten</Badge>
      </div>
    </div>
  ),
};
