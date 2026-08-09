import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stat } from "@/components/charts";
import { compact, bytes, duration } from "@/lib/format";
import { counts, SERVER_INFO } from "@/stories/fixtures";

/**
 * A number, not a chart — but it lives with the charts because it obeys the
 * same colour law.
 *
 * The optional `accent` is a 2px bar down the left edge, and it takes a
 * **series** colour to say what the number is about: `--s1` documents, `--s3`
 * memories, `--s5` relations. It must never take a status colour; a green bar
 * on a tile reads as "healthy", which is not what an accent means.
 *
 * `delta` is the one place a status colour appears here, and only as text:
 * `good: true` renders `--good`, `good: false` falls back to muted rather than
 * red. A movement in the wrong direction is not automatically an incident.
 */
const meta = {
  title: "Charts/Stat",
  component: Stat,
  parameters: { layout: "padded" },
  args: {
    label: "Memories",
    value: compact(counts.memories),
    hint: `${counts.relations} relations`,
  },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div className="max-w-xs">
      <Stat {...args} />
    </div>
  ),
};

/** Each accent names the entity the number counts. */
export const SeriesAccents: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Documents"
        value={compact(counts.documents)}
        hint="ingested sources"
        accent="var(--color-s1)"
      />
      <Stat
        label="Spaces"
        value={counts.spaces}
        hint="container tags"
        accent="var(--color-s2)"
      />
      <Stat
        label="Memories"
        value={compact(counts.memories)}
        hint="durable facts"
        accent="var(--color-s3)"
      />
      <Stat
        label="Chunks"
        value={compact(counts.chunks)}
        hint="embedded segments"
        accent="var(--color-s4)"
      />
    </div>
  ),
};

/** With a delta. Good is green; not-good is muted, never red. */
export const WithDelta: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat
        label="Memories"
        value={compact(counts.memories)}
        delta={{ value: "+34 this week", good: true }}
        accent="var(--color-s3)"
      />
      <Stat
        label="Recall p95"
        value="112ms"
        delta={{ value: "+38ms", good: false }}
        hint="after enabling reranking"
        accent="var(--color-s1)"
      />
      <Stat
        label="Failed ingests"
        value={2}
        delta={{ value: "−3", good: true }}
        hint="last 7 days"
      />
    </div>
  ),
};

/** No accent, no delta — the plain tile. */
export const Plain: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat
        label="Storage"
        value={bytes(SERVER_INFO.storage?.sizeBytes ?? 0)}
        hint={SERVER_INFO.storage?.engine}
      />
      <Stat
        label="Uptime"
        value={duration(SERVER_INFO.uptimeSeconds ?? 0)}
        hint={SERVER_INFO.baseUrl}
      />
      <Stat
        label="Dimensions"
        value={SERVER_INFO.embeddings?.dimensions ?? 0}
        hint={SERVER_INFO.embeddings?.model}
      />
    </div>
  ),
};

/**
 * The rule this component exists to make visible: series colours name a kind
 * of thing, status colours name a condition. Swapping them makes the tile
 * assert something it does not mean.
 */
export const AccentRule: Story = {
  name: "Accent: do / don't",
  render: () => (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <div className="label mb-3">Do — series accent</div>
        <Stat
          label="Memories"
          value={compact(counts.memories)}
          hint="--s3 says “this is about memories”"
          accent="var(--color-s3)"
        />
      </div>
      <div>
        <div className="label mb-3">Don&apos;t — status accent</div>
        <Stat
          label="Memories"
          value={compact(counts.memories)}
          hint="--good reads as “memories are healthy”"
          accent="var(--color-good)"
        />
      </div>
    </div>
  ),
};
