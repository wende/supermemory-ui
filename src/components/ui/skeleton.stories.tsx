import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A pulsing muted block. Skeletons are for content whose **shape is already
 * known** — a list of memory rows, a grid of stat tiles. When you cannot
 * predict the shape, use `LoadingState` instead; a skeleton that guesses wrong
 * is worse than a spinner.
 *
 * Match the real content's dimensions. A skeleton row that is taller than the
 * row it becomes causes a visible jump on resolve.
 */
const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
  args: { className: "h-4 w-48" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The memory-bank loading state: six rows at the real row height. */
export const ListRows: Story = {
  render: () => (
    <div className="max-w-2xl space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="rounded-[22px] border border-brand-black/[0.06] bg-card px-5 py-4"
        >
          <Skeleton className="h-3.5 w-3/4" />
          <div className="mt-2.5 flex gap-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        </div>
      ))}
    </div>
  ),
};

/** The dashboard loading state: four stat tiles at their final radius. */
export const StatGrid: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="rounded-[26px] border border-brand-black/[0.06] bg-card px-5 py-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]"
        >
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-3 h-2.5 w-28" />
        </div>
      ))}
    </div>
  ),
};
