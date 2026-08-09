import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SimilarityMeter, Legend } from "@/components/charts";
import { PanelCard } from "@/components/blocks/panel-card";
import { searchResults } from "@/stories/fixtures";
import { relTime } from "@/lib/format";

/**
 * Two small pieces that finish the chart set.
 *
 * **`SimilarityMeter`** is one magnitude on a 0–1 scale, shown as a 48px bar
 * plus the number. Both are present on purpose: the bar makes a column of
 * results scannable at a glance, the number is what you quote when tuning a
 * threshold. Its `title` carries three decimals for the cases where 0.71 and
 * 0.714 are a different decision.
 *
 * **`Legend`** is the shared swatch row that `LineChart` renders above the
 * plot. It is exported so a chart with an external or custom layout can reuse
 * the same 8px square marks and 11px labels rather than hand-rolling them.
 */
const meta = {
  title: "Charts/Meters & Legend",
  component: SimilarityMeter,
  parameters: { layout: "padded" },
  args: { value: 0.84 },
} satisfies Meta<typeof SimilarityMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Across the range, including scores below a typical 0.35 threshold. */
export const Range: Story = {
  render: () => (
    <div className="max-w-xs space-y-2">
      {[0.97, 0.84, 0.71, 0.55, 0.36, 0.12].map((v) => (
        <SimilarityMeter key={v} value={v} />
      ))}
    </div>
  ),
};

/** In a result list, which is its only real home. */
export const InSearchResults: Story = {
  render: () => (
    <PanelCard
      eyebrow="Recall"
      title="Ask"
      subtitle="Hybrid search — memories and document chunks, reranked."
      className="max-w-2xl"
    >
      <ul className="divide-y divide-brand-black/[0.05] pt-1">
        {searchResults.map((r) => (
          <li key={r.id} className="flex items-start gap-4 px-6 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed text-brand-black">
                {r.memory}
              </p>
              <span className="mt-1 block text-[11px] text-brand-black/45">
                v{r.version} · updated {relTime(r.updatedAt)}
              </span>
            </div>
            <div className="shrink-0 pt-0.5">
              <SimilarityMeter value={r.similarity} />
            </div>
          </li>
        ))}
      </ul>
    </PanelCard>
  ),
};

/** The standalone legend — same marks a `LineChart` draws for itself. */
export const LegendRow: Story = {
  name: "Legend",
  render: () => (
    <div className="max-w-lg space-y-6">
      <Legend
        series={[
          { label: "Documents", color: "var(--color-s1)" },
          { label: "Memories", color: "var(--color-s3)" },
        ]}
      />
      <Legend
        series={[
          { label: "Indexed", color: "var(--color-good)" },
          { label: "In flight", color: "var(--warning-status)" },
          { label: "Failed", color: "var(--color-critical)" },
        ]}
      />
      <Legend
        series={[
          { label: "Documents", color: "var(--color-s1)" },
          { label: "Spaces", color: "var(--color-s2)" },
          { label: "Memories", color: "var(--color-s3)" },
          { label: "Chunks", color: "var(--color-s4)" },
          { label: "Relations", color: "var(--color-s5)" },
        ]}
      />
    </div>
  ),
};
