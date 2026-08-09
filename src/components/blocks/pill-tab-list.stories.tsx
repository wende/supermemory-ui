import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PillTabList } from "@/components/blocks/pill-tab-list";
import { PanelCard } from "@/components/blocks/panel-card";
import { Stat } from "@/components/charts";
import { EmptyState } from "@/components/blocks/empty-state";
import { Icon } from "@/components/icons";
import { compact } from "@/lib/format";
import { counts, recentMemories, recentDocuments } from "@/stories/fixtures";

/**
 * The brand tab group: a centred `rounded-[22px]` tray, uppercase
 * `tracking-[0.16em]` labels, and an active tab that fills brand black with
 * white type and a soft shadow.
 *
 * This is the **top-level** switcher — for the two or three big views a page
 * offers. Inside a panel, use **Primitives / Tabs**, which is the same Radix
 * root wearing a much quieter dress.
 *
 * Triggers have a `min-w-[116px]` floor so a two-tab group does not collapse
 * into two tiny chips, and the tray wraps rather than scrolling — keep the set
 * small enough that it does not need to.
 */
const meta = {
  title: "Blocks/PillTabList",
  component: PillTabList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PillTabList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tabs: [
      {
        value: "memories",
        label: "Memories",
        content: (
          <PanelCard eyebrow="Recall" title="Memory bank">
            <ul className="divide-y divide-brand-black/[0.05] pt-1">
              {recentMemories.slice(0, 4).map((m) => (
                <li
                  key={m.id}
                  className="px-6 py-3 text-[13px] leading-relaxed text-brand-black"
                >
                  {m.memory}
                </li>
              ))}
            </ul>
          </PanelCard>
        ),
      },
      {
        value: "documents",
        label: "Documents",
        content: (
          <PanelCard eyebrow="Ingest" title="Documents">
            <ul className="divide-y divide-brand-black/[0.05] pt-1">
              {recentDocuments.slice(0, 4).map((d) => (
                <li
                  key={d.id}
                  className="truncate px-6 py-3 text-[13px] text-brand-black"
                >
                  {d.title ?? "Untitled"}
                </li>
              ))}
            </ul>
          </PanelCard>
        ),
      },
      {
        value: "graph",
        label: "Graph",
        content: (
          <PanelCard eyebrow="Recall" title="Graph">
            <EmptyState
              icon={Icon.graph}
              title="Graph renders on its own route"
              description="The canvas needs the full viewport, so it is a page rather than a tab panel."
            />
          </PanelCard>
        ),
      },
    ],
  },
};

/** Two tabs — the `min-w` floor keeps the tray balanced. */
export const TwoTabs: Story = {
  args: {
    tabs: [
      {
        value: "overview",
        label: "Overview",
        content: (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Memories"
              value={compact(counts.memories)}
              accent="var(--color-s3)"
            />
            <Stat
              label="Documents"
              value={compact(counts.documents)}
              accent="var(--color-s1)"
            />
            <Stat
              label="Spaces"
              value={counts.spaces}
              accent="var(--color-s2)"
            />
          </div>
        ),
      },
      {
        value: "activity",
        label: "Activity",
        content: (
          <PanelCard eyebrow="Instance" title="Last 30 days">
            <div className="px-6 pt-4 text-[13px] text-brand-black/70">
              Ingest volume by day.
            </div>
          </PanelCard>
        ),
      },
    ],
  },
};

/** Five tabs — past this the tray wraps, which is the signal to cut some. */
export const Wrapping: Story = {
  args: {
    tabs: ["Memories", "Documents", "Spaces", "Profile", "Settings"].map(
      (label) => ({
        value: label.toLowerCase(),
        label,
        content: (
          <PanelCard title={label}>
            <div className="px-6 pt-4 text-[13px] text-brand-black/70">
              {label} panel.
            </div>
          </PanelCard>
        ),
      }),
    ),
  },
};
