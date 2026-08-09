import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Copyable } from "@/components/ui";
import { doc, memory } from "@/stories/fixtures";

/**
 * Click-to-copy for machine strings. The affordance is deliberately quiet — a
 * `copy` hint that only appears on hover — because IDs appear in nearly every
 * row and a visible button on each one would be louder than the data.
 *
 * After a copy the hint switches to `copied` for 1.4s. The timer is cleared on
 * unmount, so a row that scrolls out mid-copy does not set state on a dead
 * component.
 *
 * Note the trade-off: hover-only reveal means the affordance is invisible on
 * touch. The button itself is always focusable and clickable, so the action
 * works — it is only the label that waits for hover.
 */
const meta = {
  title: "Console Kit/Copyable",
  component: Copyable,
  parameters: { layout: "padded" },
  args: { value: memory.id },
} satisfies Meta<typeof Copyable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default rendering: the value itself, in mono at 12px. */
export const Default: Story = {};

/** Muted, which is how detail panels show an ID under the title. */
export const Muted: Story = {
  args: { className: "text-brand-black/40" },
};

/**
 * With children, the copied value and the displayed value can differ — show a
 * readable label, copy the full string.
 */
export const CustomLabel: Story = {
  args: {
    value: `curl http://localhost:6767/v3/documents/${doc.id}`,
    children: (
      <span className="mono text-xs text-brand-black/70">
        GET /v3/documents/{doc.id.slice(0, 12)}…
      </span>
    ),
  },
};

/** A list of identifiers — the density this component was designed for. */
export const InRows: Story = {
  render: () => (
    <div className="max-w-lg divide-y divide-brand-black/[0.05] overflow-hidden rounded-[22px] border border-brand-black/[0.06] bg-card">
      {[
        ["Memory", memory.id],
        ["Document", doc.id],
        ["Space", "sm_project_orbital"],
        ["Org", "org_local_7f3a"],
      ].map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 px-5 py-3"
        >
          <span className="label">{label}</span>
          <Copyable value={value} className="text-brand-black/55" />
        </div>
      ))}
    </div>
  ),
};
