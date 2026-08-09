import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageTransition } from "@/components/blocks/page-transition";
import { PanelCard } from "@/components/blocks/panel-card";
import { Stat } from "@/components/charts";
import { compact } from "@/lib/format";
import { counts, recentMemories } from "@/stories/fixtures";

/**
 * A one-class wrapper that gives every route the same entrance:
 * `animate-fade-in` — 300ms ease-out with a 6px rise.
 *
 * The mechanism is worth knowing, because it explains why there is no router
 * integration here. Each route is its own Server Component file, so navigating
 * unmounts the old page and mounts the new one; the mount is what fires the
 * keyframe. No transition API, no exit animation, no state to coordinate.
 *
 * `PageBody` already wraps its children in this, so route code rarely uses it
 * directly. Reach for it when a region mounts on its own — a tab panel, a
 * lazily loaded section.
 */
const meta = {
  title: "Layout/PageTransition",
  component: PageTransition,
  parameters: { layout: "padded" },
  // Both stories supply their own subtree via `render`.
  args: { children: null },
} satisfies Meta<typeof PageTransition>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Click to remount — the animation only fires on mount. */
export const Replay: Story = {
  render: function Replay() {
    const [key, setKey] = React.useState(0);
    return (
      <div className="max-w-3xl">
        <button
          type="button"
          onClick={() => setKey((k) => k + 1)}
          className="focus-ring mb-5 rounded-xl border border-brand-black/[0.12] px-3 py-2 text-[13px] text-brand-black transition-colors hover:bg-brand-black/[0.03]"
        >
          Navigate
        </button>
        <PageTransition key={key}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="label">Recall</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-black">
                Memory bank
              </h1>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Memories"
              value={compact(counts.memories)}
              accent="var(--color-s3)"
            />
            <Stat
              label="Relations"
              value={compact(counts.relations)}
              accent="var(--color-s5)"
            />
            <Stat
              label="Forgotten"
              value={counts.forgotten}
              accent="var(--color-s4)"
            />
          </div>
          <PanelCard title="Recently extracted" className="mt-3">
            <ul className="divide-y divide-brand-black/[0.05] pt-1">
              {recentMemories.slice(0, 3).map((m) => (
                <li
                  key={m.id}
                  className="px-6 py-3 text-[13px] leading-relaxed text-brand-black"
                >
                  {m.memory}
                </li>
              ))}
            </ul>
          </PanelCard>
        </PageTransition>
      </div>
    );
  },
};

/**
 * The whole subtree fades as one unit. Nesting a second `PageTransition`
 * inside would double the animation on the inner content — use
 * `stagger-children` on the list instead when you want rows to arrive
 * individually.
 */
export const SingleUnit: Story = {
  render: () => (
    <PageTransition className="max-w-xl">
      <PanelCard
        eyebrow="Ingest"
        title="One entrance"
        subtitle="Header, body and footer arrive together."
      >
        <div className="px-6 pt-4 text-[13px] leading-relaxed text-brand-black/70">
          Because the wrapper animates the container rather than its children,
          a page never appears to assemble itself piece by piece.
        </div>
      </PanelCard>
    </PageTransition>
  ),
};
