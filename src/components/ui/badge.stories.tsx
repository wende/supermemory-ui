import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";

/**
 * The shadcn badge, retuned to the console's pill shape: `rounded-full`, bold
 * uppercase, `tracking-[0.12em]`. It is the base that `StatusPill` builds on.
 *
 * Reach for **Blocks / StatusPill** when the badge means *how something is
 * going*, and for **Console Kit / Badge** when it means *what kind of thing
 * this is*. This primitive is what you use when neither applies.
 */
const meta = {
  title: "Primitives/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "destructive",
        "outline",
        "solid",
        "muted",
        "soft",
      ],
    },
  },
  args: { children: "Healthy", variant: "default" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * `solid` / `muted` / `soft` are the brand additions — the three quiet steps
 * used in card rows for environment tags. The shadcn variants above them are
 * louder and appear far less often.
 */
export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="solid">Live</Badge>
      <Badge variant="muted">Test</Badge>
      <Badge variant="soft">Dev</Badge>
    </div>
  ),
};

/** Where they actually land: a row of instance tags. */
export const InContext: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="max-w-md rounded-[26px] border border-brand-black/[0.06] bg-card px-5 py-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <span className="label">Instance</span>
        <Badge variant="solid">Healthy</Badge>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-brand-black tnum">
        1,284
      </div>
      <p className="mt-2 text-[11px] text-brand-black/45">
        memories across 4 spaces
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="muted">local</Badge>
        <Badge variant="soft">ollama</Badge>
        <Badge variant="soft">bge-base-en-v1.5</Badge>
      </div>
    </div>
  ),
};
