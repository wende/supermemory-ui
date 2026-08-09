import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatusPill } from "@/components/blocks/status-pill";

/**
 * The filled uppercase chip. `StatusPill` is the system's answer to *how is
 * this going* — it uses the brand status fills and never a series colour.
 *
 * Two things make it accessible by construction:
 *
 * 1. **The label is the signal.** The fill reinforces a word that is always
 *    present, so the pill still works in grayscale and for a colour-blind
 *    reader.
 * 2. **The tracking and weight are fixed.** 11px bold, `0.12em`, `leading-none`
 *    — enough presence at a small size that it reads as a chip rather than as
 *    tinted text.
 */
const meta = {
  title: "Blocks/StatusPill",
  component: StatusPill,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "solid",
        "muted",
        "soft",
        "success",
        "ongoing",
        "failure",
        "paused",
      ],
    },
  },
  args: { children: "Healthy", variant: "solid" },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * The three neutral steps carry environment and identity; the four tinted ones
 * carry run state.
 */
export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">Neutral — identity and environment</div>
        <div className="flex flex-wrap gap-2">
          <StatusPill variant="solid">Live</StatusPill>
          <StatusPill variant="muted">Test</StatusPill>
          <StatusPill variant="soft">Dev</StatusPill>
        </div>
      </div>
      <div>
        <div className="label mb-2">Tinted — run state</div>
        <div className="flex flex-wrap gap-2">
          <StatusPill variant="success">Indexed</StatusPill>
          <StatusPill variant="ongoing">Running</StatusPill>
          <StatusPill variant="failure">Failed</StatusPill>
          <StatusPill variant="paused">Paused</StatusPill>
          <StatusPill variant="paused">Pending</StatusPill>
        </div>
      </div>
    </div>
  ),
};

/**
 * `solid` / `muted` is the pair `StatsCard` uses for its `healthy` prop — an
 * instance is either reachable or it is not.
 */
export const HealthPair: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <StatusPill variant="solid">Healthy</StatusPill>
      <StatusPill variant="muted">Offline</StatusPill>
    </div>
  ),
};

/** In a header row, right-aligned against the eyebrow. */
export const InCardHeader: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="max-w-sm rounded-[26px] border border-brand-black/[0.06] bg-card px-5 py-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/40">
          Local instance
        </span>
        <StatusPill variant="solid">Healthy</StatusPill>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-brand-black tnum">
        4d 7h
      </div>
      <p className="mt-2 truncate text-[11px] text-brand-black/45">
        localhost:6767 · v1.4.2
      </p>
    </div>
  ),
};
