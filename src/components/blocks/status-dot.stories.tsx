import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatusDot } from "@/components/blocks/status-dot";

/**
 * A 6px dot. The smallest status marker in the system, for places where a pill
 * would be too heavy — list rows, inline meta, the sidebar footer.
 *
 * It is `aria-hidden` by design: **a dot is never the only signal.** It always
 * sits next to text that says the same thing, which is what keeps status
 * legible without colour and available to a screen reader.
 *
 * `pulsing` attaches the 2s soft pulse and means *this is happening right
 * now*. A finished state must not keep pulsing.
 */
const meta = {
  title: "Blocks/StatusDot",
  component: StatusDot,
  parameters: { layout: "centered" },
  argTypes: {
    tone: {
      control: "select",
      options: [
        "success",
        "running",
        "failure",
        "paused",
        "pending",
        "neutral",
        "live",
        "building",
      ],
    },
    pulsing: { control: "boolean" },
  },
  args: { tone: "success", pulsing: false },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {(
        [
          ["success", "Indexed"],
          ["running", "Embedding"],
          ["failure", "Failed"],
          ["paused", "Paused"],
          ["pending", "Queued"],
          ["neutral", "Unknown"],
          ["live", "Live"],
          ["building", "Building"],
        ] as const
      ).map(([tone, label]) => (
        <span
          key={tone}
          className="inline-flex items-center gap-2 text-[12px] text-brand-black/70"
        >
          <StatusDot tone={tone} />
          {label}
          <span className="mono text-[10px] text-brand-black/35">{tone}</span>
        </span>
      ))}
    </div>
  ),
};

/** Pulsing marks in-flight work — and only in-flight work. */
export const Pulsing: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/70">
        <StatusDot tone="running" pulsing />
        Embedding 18 chunks
      </span>
      <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/70">
        <StatusDot tone="live" pulsing />
        Connected
      </span>
      <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/55">
        <StatusDot tone="success" />
        Indexed — at rest
      </span>
    </div>
  ),
};

/** The intended density: one dot per row, paired with its label. */
export const InList: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <ul className="max-w-lg divide-y divide-brand-black/[0.05] overflow-hidden rounded-[22px] border border-brand-black/[0.06] bg-card">
      {(
        [
          ["RFC-014 — replay correctness.md", "success", "Indexed"],
          ["2026-07-19 retry storm postmortem.pdf", "running", "Chunking"],
          ["HNSW recall benchmarks.xlsx", "pending", "Queued"],
          ["scanned-whiteboard.png", "failure", "Failed"],
        ] as const
      ).map(([name, tone, label]) => (
        <li key={name} className="flex items-center gap-3 px-5 py-3">
          <StatusDot tone={tone} pulsing={tone === "running"} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-brand-black">
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-brand-black/45">
            {label}
          </span>
        </li>
      ))}
    </ul>
  ),
};
