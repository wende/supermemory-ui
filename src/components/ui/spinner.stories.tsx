import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Spinner } from "@/components/ui/spinner";

/**
 * A spinning `Loader2` with a `role="status"` wrapper and a visually hidden
 * "Loading..." label, so a screen reader announces the wait even though the
 * glyph carries no text.
 *
 * Prefer **Blocks / LoadingState** (spinner + visible label) for anything the
 * user is actually waiting on; a bare spinner is for inline, sub-second work.
 */
const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
  args: { size: "md" },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-end gap-8 text-brand-black/55">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Spinner size={size} />
          <span className="mono text-[10px] text-brand-black/45">{size}</span>
        </div>
      ))}
    </div>
  ),
};

/** Inline, alongside the thing it is qualifying. */
export const Inline: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/55">
      <Spinner size="sm" />
      Re-embedding 3 documents
    </span>
  ),
};
