import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Card, Empty, SectionHeader, Skeleton, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The console kit's three re-exported feedback primitives, and the rule for
 * choosing between them:
 *
 * | Situation | Reach for |
 * | --- | --- |
 * | Shape of the result is known | `Skeleton` |
 * | Shape unknown, wait is visible | `LoadingState` (Blocks) or a labelled `Spinner` |
 * | Work is inline and sub-second | bare `Spinner` |
 * | Query returned nothing | `Empty` |
 *
 * `Empty` is a thin alias over **Blocks / EmptyState** with `hint` instead of
 * `description` — it exists so page code importing from `@/components/ui` does
 * not need a second import path.
 */
const meta: Meta = {
  title: "Console Kit/Feedback",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

/** No results — with a way forward, which every empty state should have. */
export const EmptyWithAction: Story = {
  render: () => (
    <Card className="max-w-xl">
      <SectionHeader title="Memory bank" meta="0 results" />
      <Empty
        title="No memories match that filter"
        hint="Try a broader query, or clear the space filter to search the whole corpus."
        action={
          <Button size="sm" variant="outline">
            <Icon.filter size={13} />
            Clear filters
          </Button>
        }
      />
    </Card>
  ),
};

/** No action — correct when there is genuinely nothing to do but wait. */
export const EmptyWithoutAction: Story = {
  render: () => (
    <Card className="max-w-xl">
      <SectionHeader title="Pipeline" />
      <Empty
        title="Nothing in flight"
        hint="Documents appear here while they are being extracted, chunked and embedded."
      />
    </Card>
  ),
};

/** Skeletons matched to the row they become. */
export const Loading: Story = {
  render: () => (
    <Card className="max-w-xl">
      <SectionHeader title="Recently extracted" />
      <div className="space-y-3 px-6 py-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3.5 w-3/4" />
            <div className="mt-2 flex gap-3">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  ),
};

/** Inline spinner, for work too short to justify a skeleton. */
export const InlineWait: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-[12px] text-brand-black/55">
      <Spinner />
      Recomputing profile buckets
    </div>
  ),
};
