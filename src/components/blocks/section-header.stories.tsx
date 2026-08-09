import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SectionHeader } from "@/components/blocks/section-header";
import { Stat } from "@/components/charts";
import { compact } from "@/lib/format";
import { counts } from "@/stories/fixtures";

/**
 * The eyebrow + H2 + description stack used to introduce a **band of content**
 * on a long page — not a panel header. It has no border, no ground and no
 * action slot; it is pure typography with a fixed 24px gap below.
 *
 * Two components share this name. This one (`@/components/blocks`) is the page
 * section intro. **Console Kit / Card → HeaderAnatomy** documents the other
 * one (`@/components/ui`), which is the bordered panel header with a meta slot,
 * a help tooltip and an action.
 */
const meta = {
  title: "Blocks/SectionHeader",
  component: SectionHeader,
  parameters: { layout: "padded" },
  args: {
    eyebrow: "Instance",
    title: "Corpus",
    description: "What the engine currently holds, and where it came from.",
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variations: Story = {
  render: () => (
    <div className="max-w-2xl space-y-10">
      <SectionHeader title="Title only" className="mb-0" />
      <SectionHeader eyebrow="Recall" title="With eyebrow" className="mb-0" />
      <SectionHeader
        title="With description"
        description="One line of context, at 12px and 55% — never more than two."
        className="mb-0"
      />
      <SectionHeader
        eyebrow="Ingest"
        title="Everything"
        description="Eyebrow, title and description together — the full three-beat stack."
        className="mb-0"
      />
    </div>
  ),
};

/** Introducing a band of tiles, which is the job it was built for. */
export const AboveContent: Story = {
  render: () => (
    <div className="max-w-4xl">
      <SectionHeader
        eyebrow="Instance"
        title="Corpus"
        description="What the engine currently holds, and where it came from."
      />
      <div className="grid gap-3 sm:grid-cols-3">
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
        <Stat
          label="Spaces"
          value={counts.spaces}
          hint="container tags in use"
          accent="var(--color-s2)"
        />
      </div>
    </div>
  ),
};
