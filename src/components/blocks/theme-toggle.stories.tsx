import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ThemeToggle } from "@/components/blocks/theme-toggle";
import { PanelCard } from "@/components/blocks/panel-card";
import { StatusPill } from "@/components/blocks/status-pill";
import { Stat } from "@/components/charts";
import { compact } from "@/lib/format";
import { counts } from "@/stories/fixtures";

/**
 * Flips `.dark` on `<html>` and persists the choice to
 * `localStorage["supermemory-theme"]`. On first load, with nothing stored, it
 * follows `prefers-color-scheme` — the user's OS preference wins until they
 * override it here.
 *
 * The app pairs it with an inline script in `layout.tsx` that applies the
 * stored class **before first paint**, which is what prevents a white flash on
 * a dark-themed reload.
 *
 * ⚠️ This button and Storybook's theme switcher both write the same `<html>`
 * class, so the toolbar control is hidden on these stories to keep them from
 * fighting. Everywhere else in this Storybook, the toolbar is the switcher to
 * use; here, the button is the thing under test.
 */
const meta = {
  title: "Blocks/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    layout: "centered",
    // Hide the toolbar switcher here — this component owns the class instead.
    themes: { disable: true },
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With surfaces around it, so the flip can be judged in context. */
export const AgainstSurfaces: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="max-w-2xl">
      <div className="mb-4 flex h-14 items-center justify-between rounded-2xl bg-background px-6">
        <span className="text-[13px] font-medium text-foreground">
          supermemory
        </span>
        <ThemeToggle />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Memories"
          value={compact(counts.memories)}
          hint={`${counts.relations} relations`}
          accent="var(--color-s3)"
        />
        <Stat
          label="Documents"
          value={compact(counts.documents)}
          hint={`${compact(counts.chunks)} chunks`}
          accent="var(--color-s1)"
        />
      </div>
      <PanelCard
        eyebrow="Instance"
        title="Runtime"
        className="mt-3"
        action={<StatusPill variant="solid">Healthy</StatusPill>}
      >
        <div className="px-6 pt-4 text-[13px] leading-relaxed text-brand-black/70">
          Series colours shift brighter in dark mode so they hold contrast
          against a near-black ground; the status fills become translucent
          tinted wells with lighter text.
        </div>
      </PanelCard>
    </div>
  ),
};
