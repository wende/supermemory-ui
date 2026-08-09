import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageBody, PageTitle } from "@/components/shell";
import { PanelCard } from "@/components/blocks/panel-card";
import { EmptyState } from "@/components/blocks/empty-state";
import { LoadingState } from "@/components/blocks/loading-state";
import { Badge, Button, Input, Select, Slider, Toggle } from "@/components/ui";
import { SimilarityMeter } from "@/components/charts";
import { Icon } from "@/components/icons";
import { SPACES, searchResults } from "@/stories/fixtures";
import { relTime } from "@/lib/format";

/**
 * Memory bank · semantic — the ask surface that lives behind the Semantic
 * filter mode on `/memories`. Two things here are worth copying into any future
 * query surface.
 *
 * **Knobs live with the screen that needs them.** Threshold, rerank and
 * search mode are not in global chrome; they sit beside the query box, because
 * they only mean anything while you are searching.
 *
 * **The score is shown twice, on purpose.** `SimilarityMeter` renders a bar
 * *and* the number: the bar makes a result list scannable, the number is what
 * you quote when deciding where the threshold should sit.
 */
const meta: Meta = {
  title: "Patterns/MemoryBankSemantic",
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "760px", inline: false } },
  },
};

export default meta;
type Story = StoryObj;

function Controls({
  threshold,
  setThreshold,
}: {
  threshold: number;
  setThreshold: (v: number) => void;
}) {
  const [rerank, setRerank] = React.useState(true);
  const [rewrite, setRewrite] = React.useState(false);
  return (
    <PanelCard eyebrow="Memory" title="Query" subtitle="Knobs for this search.">
      <div className="space-y-1 px-6 pt-4">
        <label className="block">
          <span className="label mb-1.5 block">Search mode</span>
          <Select defaultValue="hybrid" className="h-9">
            <option value="memories">Memories</option>
            <option value="hybrid">Hybrid</option>
            <option value="documents">Documents</option>
          </Select>
        </label>
        <label className="mt-3 block">
          <span className="label mb-1.5 block">Space</span>
          <Select defaultValue="" className="h-9">
            <option value="">All spaces</option>
            {SPACES.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="mt-4">
          <Slider
            label="Threshold"
            hint={threshold.toFixed(2)}
            value={threshold}
            onChange={setThreshold}
          />
        </div>
        <div className="mt-2">
          <Toggle
            label="Rerank"
            hint="Cross-encoder pass over the top 50. Slower, better ordering."
            checked={rerank}
            onChange={setRerank}
          />
          <Toggle
            label="Rewrite query"
            hint="Let the model expand the query before embedding it."
            checked={rewrite}
            onChange={setRewrite}
          />
        </div>
      </div>
    </PanelCard>
  );
}

/** Results above the threshold, ordered by score. */
export const Results: Story = {
  render: function Results() {
    const [threshold, setThreshold] = React.useState(0.35);
    const shown = searchResults.filter((r) => r.similarity >= threshold);

    return (
      <div className="min-h-[760px] bg-background">
        <PageBody>
          <PageTitle
            label="Memory"
            title="Memory bank"
            description="Semantic mode ranks claims by similarity. Raise the threshold to trade recall for precision."
          />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Input
              defaultValue="is replay correctness safe under partitions"
              aria-label="Query"
              className="h-10 min-w-0 flex-1"
            />
            <Button size="md" variant="primary">
              <Icon.search size={14} />
              Ask
            </Button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_300px]">
            <PanelCard
              eyebrow="Memory"
              title="Results"
              subtitle={`${shown.length} above ${threshold.toFixed(2)} · 41ms`}
              stagger
            >
              {shown.length === 0 ? (
                <EmptyState
                  icon={Icon.search}
                  title="No results above the threshold"
                  description="Nothing scored high enough. Lower the threshold or widen the search mode to hybrid."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setThreshold(0.1)}
                    >
                      <Icon.sliders size={13} />
                      Lower to 0.10
                    </Button>
                  }
                />
              ) : (
                <div className="divide-y divide-brand-black/[0.05]">
                  {shown.map((r) => (
                    <div key={r.id} className="flex items-start gap-4 px-6 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-relaxed text-brand-black">
                          {r.memory}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-brand-black/45">
                            updated {relTime(r.updatedAt)}
                          </span>
                          <span className="text-[11px] text-brand-black/35">
                            v{r.version}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <SimilarityMeter value={r.similarity} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>

            <Controls threshold={threshold} setThreshold={setThreshold} />
          </div>
        </PageBody>
      </div>
    );
  },
};

/** Query in flight — the shape of the result is unknown, so no skeleton. */
export const Searching: Story = {
  render: () => (
    <div className="min-h-[520px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle label="Memory" title="Memory bank" />
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Input
            defaultValue="is replay correctness safe under partitions"
            aria-label="Query"
            className="h-10 min-w-0 flex-1"
          />
          <Button size="md" variant="primary" disabled>
            <Icon.search size={14} />
            Ask
          </Button>
        </div>
        <PanelCard eyebrow="Memory" title="Results" className="mt-4">
          <LoadingState label="Searching 1,284 memories" className="py-10" />
        </PanelCard>
      </PageBody>
    </div>
  ),
};

/** Before the first query — a prompt, not an error. */
export const Initial: Story = {
  render: () => (
    <div className="min-h-[520px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle
          label="Memory"
          title="Memory bank"
          description="Semantic search over memories and document chunks."
        />
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Input
            placeholder="What do you know about how I like to work?"
            aria-label="Query"
            className="h-10 min-w-0 flex-1"
          />
          <Button size="md" variant="primary">
            <Icon.search size={14} />
            Ask
          </Button>
        </div>
        <PanelCard className="mt-4">
          <EmptyState
            icon={Icon.search}
            title="Ask the corpus something"
            description="Semantic mode reads memories first, then falls back to document chunks when hybrid mode is on."
          />
        </PanelCard>
      </PageBody>
    </div>
  ),
};
