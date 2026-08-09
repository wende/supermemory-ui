import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { recentMemories } from "@/stories/fixtures";
import { relTime } from "@/lib/format";

/**
 * `Card` is the signature surface: 28px radius, hairline border, card ground,
 * and the wide soft shadow. It fades in on mount and clips its children, so a
 * full-bleed list inside it picks up the rounded corners for free.
 *
 * Pair it with `SectionHeader` for a titled panel, or use it bare when the
 * content supplies its own heading. It is the same recipe as
 * **Blocks / PanelCard** — `Card` gives you the shell and nothing else, while
 * `PanelCard` bakes in the eyebrow/title/action header.
 */
const meta = {
  title: "Console Kit/Card",
  component: Card,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bare — just the surface. */
export const Default: Story = {
  render: () => (
    <Card className="max-w-xl">
      <div className="px-6 py-5 text-[13px] leading-relaxed text-brand-black/70">
        The engine keeps every version of a memory. Forgetting sets a flag and
        stops the fact surfacing in recall; nothing is deleted, so an audit can
        always answer what was known and when.
      </div>
    </Card>
  ),
};

/** With a `SectionHeader` — the standard titled panel. */
export const WithHeader: Story = {
  render: () => (
    <Card className="max-w-xl">
      <SectionHeader
        title="Recently extracted"
        meta="last 24h"
        description="Facts the engine pulled out of newly ingested documents. A memory appears here once, on the version that first asserted it."
        action={
          <Button size="sm" variant="ghost">
            <Icon.refresh size={13} />
            Refresh
          </Button>
        }
      />
      <ul className="divide-y divide-brand-black/[0.05]">
        {recentMemories.slice(0, 4).map((m) => (
          <li key={m.id} className="px-6 py-3.5">
            <p className="text-[13px] leading-relaxed text-brand-black">
              {m.memory}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-brand-black/45">
                {relTime(m.updatedAt)}
              </span>
              <span className="text-[11px] text-brand-black/25">·</span>
              <span className="tnum text-[11px] text-brand-black/45">
                {m.sourceCount} sources
              </span>
              {m.isStatic && <Badge tone="s3">asserted</Badge>}
              {m.isInference && <Badge tone="s2">inferred</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  ),
};

/**
 * `SectionHeader` on its own: title, optional meta, an optional help tooltip,
 * and a right-aligned action. The `description` prop is what renders the help
 * button — that is where complexity belongs, not in a paragraph under the
 * title.
 */
export const HeaderAnatomy: Story = {
  render: () => (
    <div className="max-w-xl space-y-4">
      <Card>
        <SectionHeader title="Title only" />
      </Card>
      <Card>
        <SectionHeader title="With meta" meta="4 spaces" />
      </Card>
      <Card>
        <SectionHeader
          title="With help"
          description="The tooltip is progressive disclosure — anything a user needs in order to act belongs on the page instead."
        />
      </Card>
      <Card>
        <SectionHeader
          title="Everything"
          meta="18 documents"
          description="Title, meta, help affordance and a right-aligned action, which is the full anatomy."
          action={
            <Button size="sm" variant="outline">
              <Icon.upload size={13} />
              Ingest
            </Button>
          }
        />
      </Card>
    </div>
  ),
};

/** Cards in a grid — the dashboard layout. */
export const Grid: Story = {
  render: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionHeader title="Pipeline" meta="3 in flight" />
        <div className="px-6 py-4 text-[13px] text-brand-black/70">
          Two documents extracting, one embedding.
        </div>
      </Card>
      <Card>
        <SectionHeader title="Spaces" meta="4" />
        <div className="px-6 py-4 text-[13px] text-brand-black/70">
          Orbital, Research, Personal, Archive.
        </div>
      </Card>
    </div>
  ),
};
