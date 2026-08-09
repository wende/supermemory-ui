import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Tooltips carry the system's **progressive disclosure** rule: complexity is
 * explained in a tooltip, not in a paragraph under the H1. `PageTitle` and
 * `SectionHeader` both take a `description` prop that renders exactly this.
 *
 * The tooltip is never the only place information lives, because it is
 * unavailable on touch and to some assistive tech. Anything a user must know
 * to act belongs on the page.
 */
const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={200}>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default dress: inverted ground, 12px, short. */
export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Reindex</Button>
      </TooltipTrigger>
      <TooltipContent>Re-embeds every chunk. Takes minutes.</TooltipContent>
    </Tooltip>
  ),
};

/**
 * The help-affordance pattern used across page and section headers: a small
 * circle-help button with an accessible name, and a card-styled panel wide
 * enough for a full sentence.
 */
export const HelpAffordance: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-brand-black">
        Forget
      </h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About Forget"
            className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full text-brand-black/40 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black/70"
          >
            <Icon.help size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-sm border border-brand-black/[0.08] bg-card px-3 py-2 text-[12px] leading-relaxed text-brand-black/70 shadow-[0_12px_32px_rgba(17,17,17,0.12)]"
        >
          Forgetting marks a memory inactive and stops it surfacing in recall.
          Versions are retained, so a forgotten memory can still be audited —
          it is a state, not a delete.
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

/** All four sides, for checking collision behaviour near the viewport edge. */
export const Sides: Story = {
  parameters: { layout: "centered" },
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              {side}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={side}>Anchored {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
};
