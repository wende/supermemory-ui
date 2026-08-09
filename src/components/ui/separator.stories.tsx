import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Separator } from "@/components/ui/separator";

/**
 * Radix separator on `--border`. Decorative by default, which is what you want
 * for visual rhythm; pass `decorative={false}` only when the divider genuinely
 * separates two groups a screen reader should hear about.
 *
 * The console leans on whitespace and hairline card borders far more than on
 * explicit separators — the main real use is the vertical rule in the sticky
 * header, between the sidebar trigger and the breadcrumb.
 */
const meta = {
  title: "Primitives/Separator",
  component: Separator,
  parameters: { layout: "padded" },
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
  },
  args: { orientation: "horizontal" },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="max-w-md">
      <p className="text-[13px] text-brand-black/70">Embeddings</p>
      <Separator {...args} className="my-3" />
      <p className="text-[13px] text-brand-black/70">Language model</p>
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div className="flex h-5 items-center gap-3 text-[13px] text-brand-black/70">
      <span>Local</span>
      <Separator {...args} className="opacity-40" />
      <span>:6767</span>
      <Separator {...args} className="opacity-40" />
      <span>v1.4.2</span>
    </div>
  ),
};

/** How the sticky header uses it — short, faint, purely rhythmic. */
export const InHeader: Story = {
  render: () => (
    <div className="flex h-14 items-center gap-3 rounded-2xl bg-background px-6">
      <div className="size-4 rounded bg-brand-black/20" />
      <Separator orientation="vertical" className="h-4 opacity-40" />
      <span className="text-[13px] text-muted-foreground">supermemory</span>
      <span className="text-[13px] text-muted-foreground/30">/</span>
      <span className="text-[13px] font-medium text-foreground">Documents</span>
    </div>
  ),
};
