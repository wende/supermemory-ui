import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Section, Well } from "@/stories/story-kit";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_GLYPH,
  TYPE_LABEL,
  bytes,
  compact,
  duration,
  relTime,
  shortDate,
} from "@/lib/format";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/types";
import { SERVER_INFO } from "@/stories/fixtures";

/**
 * Formatting is part of the design system, not an implementation detail. The
 * console shows a **person operating a box**, so numbers are compact,
 * timestamps are relative, and nothing renders a raw ISO string.
 *
 * All of it lives in `src/lib/format.ts`. If you find yourself writing
 * `new Date(x).toLocaleString()` in a component, the helper you want is
 * already here.
 */
const meta: Meta = {
  title: "Foundations/Formatting",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="label pb-2 pr-6 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-brand-black/[0.05]">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2 pr-6 text-[12px] ${
                    j === 0
                      ? "mono text-brand-black/55"
                      : "text-brand-black tnum"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Relative time everywhere a human is reading; absolute only on demand. */
export const Time: Story = {
  render: () => {
    const now = Date.now();
    const at = (ms: number) => new Date(now - ms).toISOString();
    const cases: [string, string][] = [
      ["30 seconds", at(30_000)],
      ["12 minutes", at(12 * 60_000)],
      ["5 hours", at(5 * 3_600_000)],
      ["2 days", at(2 * 86_400_000)],
      ["3 weeks", at(21 * 86_400_000)],
      ["4 months", at(120 * 86_400_000)],
      ["2 years", at(730 * 86_400_000)],
      ["in 3 hours (future)", new Date(now + 3 * 3_600_000).toISOString()],
    ];
    return (
      <Section
        title="relTime() / shortDate()"
        note="relTime is what a list row shows — one unit, no “about”, and future values read “in 3h”. shortDate is the fallback when an exact day matters, e.g. a temporal-context range on a memory."
      >
        <Table
          head={["Input", "relTime", "shortDate"]}
          rows={cases.map(([name, iso]) => [
            name,
            relTime(iso, now),
            shortDate(iso),
          ])}
        />
      </Section>
    );
  },
};

/** Counts, sizes and uptimes — all compacted so columns stay narrow. */
export const Numbers: Story = {
  render: () => (
    <>
      <Section
        title="compact()"
        note="Metrics on stat tiles. Below 1000 the exact number is shown; above it, one decimal until the scale changes."
      >
        <Table
          head={["Input", "Output"]}
          rows={[42, 999, 1_284, 9_900, 12_400, 486_000, 2_400_000].map((n) => [
            n.toLocaleString(),
            compact(n),
          ])}
        />
      </Section>

      <Section
        title="bytes()"
        note="Storage footprint on the instance panel. Binary units, one decimal below 10."
      >
        <Table
          head={["Input", "Output"]}
          rows={[
            [512, bytes(512)],
            [4_096, bytes(4_096)],
            [1_500_000, bytes(1_500_000)],
            [
              SERVER_INFO.storage?.sizeBytes ?? 0,
              bytes(SERVER_INFO.storage?.sizeBytes ?? 0),
            ],
            [42_000_000_000, bytes(42_000_000_000)],
          ]}
        />
      </Section>

      <Section
        title="duration()"
        note="Uptime. Two units maximum — an operator reading “4d 7h” does not also need the minutes."
      >
        <Table
          head={["Seconds", "Output"]}
          rows={[
            [90, duration(90)],
            [3_600, duration(3_600)],
            [9_045, duration(9_045)],
            [
              SERVER_INFO.uptimeSeconds ?? 0,
              duration(SERVER_INFO.uptimeSeconds ?? 0),
            ],
          ]}
        />
      </Section>
    </>
  ),
};

/**
 * Document types get a glyph **and** a label. The glyph alone would be a
 * colour-blind-safe but literacy-unsafe signal — it never ships on its own.
 */
export const DocumentTypes: Story = {
  render: () => (
    <Section
      title="TYPE_GLYPH + TYPE_LABEL"
      note="Fourteen source types, each with a single-character mark. Pair them; the glyph is a scanning aid, the label is the actual information."
    >
      <Well>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((t) => (
            <div key={t} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-center text-[15px] text-brand-black/70">
                {TYPE_GLYPH[t]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-brand-black">
                {TYPE_LABEL[t]}
              </span>
              <span className="mono shrink-0 text-[10px] text-brand-black/40">
                {t}
              </span>
            </div>
          ))}
        </div>
      </Well>
    </Section>
  ),
};

/** The pipeline vocabulary, and the reserved colour each stage maps to. */
export const PipelineStatus: Story = {
  render: () => (
    <Section
      title="STATUS_LABEL + STATUS_COLOR"
      note="Five in-flight stages share the warning tone — the distinction between them is carried by the word, not the colour. Only the terminal states get their own hue."
    >
      <Well>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {DOCUMENT_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: STATUS_COLOR[s] }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-brand-black">
                {STATUS_LABEL[s]}
              </span>
              <span className="mono shrink-0 text-[10px] text-brand-black/40">
                {s}
              </span>
            </div>
          ))}
        </div>
      </Well>
    </Section>
  ),
};
