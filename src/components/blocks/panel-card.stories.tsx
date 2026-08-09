import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PanelCard } from "@/components/blocks/panel-card";
import { StatusPill } from "@/components/blocks/status-pill";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import { recentDocuments, recentMemories } from "@/stories/fixtures";
import { STATUS_COLOR, STATUS_LABEL, TYPE_LABEL, relTime } from "@/lib/format";

/**
 * The signature panel: 28px radius, hairline border, soft shadow, and a header
 * that follows the system's four-beat hierarchy — eyebrow, title, subtitle,
 * right-aligned action.
 *
 * The header is optional. Pass none of `eyebrow` / `title` / `action` and you
 * get a bare surface with no divider; pass any of them and the body picks up a
 * top divider and bottom padding automatically, so a full-bleed list still
 * clears the rounded corner.
 *
 * `stagger` opts the direct children into the 50ms cascade. Use it for list
 * panels, and not for anything past a dozen rows — the tail starts to feel
 * slow.
 */
const meta = {
  title: "Blocks/PanelCard",
  component: PanelCard,
  parameters: { layout: "padded" },
  args: {
    eyebrow: "Recall",
    title: "Memory bank",
    subtitle: "Durable facts the engine has extracted, newest first.",
  },
} satisfies Meta<typeof PanelCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <PanelCard {...args} className="max-w-xl">
      <div className="px-6 pt-4 text-[13px] text-brand-black/70">
        Panel body.
      </div>
    </PanelCard>
  ),
};

/** No header — a bare surface for content that carries its own heading. */
export const Bare: Story = {
  args: { eyebrow: undefined, title: undefined, subtitle: undefined },
  render: (args) => (
    <PanelCard {...args} className="max-w-xl">
      <div className="px-6 py-5 text-[13px] leading-relaxed text-brand-black/70">
        Without a header the body gets no divider and no extra padding, so this
        is the right shape when the content is a single block of prose or a
        chart that supplies its own title.
      </div>
    </PanelCard>
  ),
};

/** With an action, which always sits right-aligned in the header row. */
export const WithAction: Story = {
  render: (args) => (
    <PanelCard
      {...args}
      className="max-w-xl"
      action={
        <Button size="sm" variant="outline">
          <Icon.refresh size={13} />
          Refresh
        </Button>
      }
    >
      <ul className="divide-y divide-brand-black/[0.05] pt-1">
        {recentMemories.slice(0, 3).map((m) => (
          <li key={m.id} className="px-6 py-3">
            <p className="text-[13px] leading-relaxed text-brand-black">
              {m.memory}
            </p>
            <span className="mt-1 block text-[11px] text-brand-black/45">
              {relTime(m.updatedAt)} · {m.sourceCount} sources
            </span>
          </li>
        ))}
      </ul>
    </PanelCard>
  ),
};

/** `stagger` — rows resolve in reading order rather than all at once. */
export const Staggered: Story = {
  args: {
    eyebrow: "Ingest",
    title: "Pipeline",
    subtitle: undefined,
  },
  render: (args) => (
    <PanelCard
      {...args}
      stagger
      className="max-w-xl"
      action={<StatusPill variant="ongoing">Running</StatusPill>}
    >
      {recentDocuments.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-3 px-6 py-2.5 first:pt-4"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: STATUS_COLOR[d.status] }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
            {d.title ?? "Untitled"}
          </span>
          <span className="shrink-0 text-[11px] text-brand-black/45">
            {TYPE_LABEL[d.type]}
          </span>
          <span className="w-20 shrink-0 text-right text-[11px] text-brand-black/45">
            {STATUS_LABEL[d.status]}
          </span>
        </div>
      ))}
    </PanelCard>
  ),
};

/** Panels sit side by side on one plane — they do not nest. */
export const SideBySide: Story = {
  render: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <PanelCard eyebrow="Recall" title="Recently extracted">
        <ul className="divide-y divide-brand-black/[0.05] pt-1">
          {recentMemories.slice(0, 3).map((m) => (
            <li
              key={m.id}
              className="truncate px-6 py-3 text-[13px] text-brand-black"
            >
              {m.memory}
            </li>
          ))}
        </ul>
      </PanelCard>
      <PanelCard eyebrow="Ingest" title="Recently ingested">
        <ul className="divide-y divide-brand-black/[0.05] pt-1">
          {recentDocuments.slice(0, 3).map((d) => (
            <li
              key={d.id}
              className="truncate px-6 py-3 text-[13px] text-brand-black"
            >
              {d.title ?? "Untitled"}
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  ),
};
