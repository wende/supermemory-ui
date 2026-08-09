import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageBody, PageTitle } from "@/components/shell";
import { PanelCard } from "@/components/blocks/panel-card";
import { StatusPill } from "@/components/blocks/status-pill";
import { Button, Input, Select, Slider, Textarea, Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SERVER_INFO, SETTINGS, SPACES } from "@/stories/fixtures";
import { bytes, duration } from "@/lib/format";

/**
 * Instance settings — a long form, and the pattern for one.
 *
 * The rules the page follows:
 *
 * - **`maxWidth="4xl"`.** A form at 1400px is a form nobody can scan; the
 *   narrow container is the point.
 * - **One panel per concern.** Extraction, filtering, profile buckets and the
 *   danger zone are separate surfaces on one plane, not sections inside a
 *   single card.
 * - **Toggles apply immediately; text fields need an explicit save.** Mixing
 *   the two would make it unclear which changes have landed, so the save
 *   button is scoped to the panel that owns text.
 * - **Destructive work is quarantined.** The reset panel is last, carries a
 *   critical-tinted border, and its action is `danger`.
 */
const meta: Meta = {
  title: "Patterns/Settings",
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "900px", inline: false } },
  },
};

export default meta;
type Story = StoryObj;

export const InstanceSettings: Story = {
  render: function InstanceSettings() {
    const [filter, setFilter] = React.useState(!!SETTINGS.shouldLLMFilter);
    const [summaries, setSummaries] = React.useState(true);
    const [inference, setInference] = React.useState(true);
    const [chunk, setChunk] = React.useState(
      (SETTINGS.chunkSize ?? 1200) / 4000,
    );

    return (
      <div className="min-h-[900px] bg-background">
        <PageBody maxWidth="4xl">
          <PageTitle
            label="Instance"
            title="Settings"
            description="Applies to every space unless a space overrides it. Changes take effect on the next ingest — existing documents are not re-processed."
          >
            <StatusPill variant="solid">Healthy</StatusPill>
          </PageTitle>

          {/* Runtime — read-only facts about the box */}
          <PanelCard
            eyebrow="Instance"
            title="Runtime"
            subtitle="Read-only. Configure these where the binary starts."
            className="mt-6"
          >
            <dl className="grid gap-x-8 gap-y-2.5 px-6 pt-4 text-[12px] sm:grid-cols-2">
              {[
                ["Endpoint", SERVER_INFO.baseUrl],
                ["Version", `v${SERVER_INFO.version}`],
                ["Uptime", duration(SERVER_INFO.uptimeSeconds ?? 0)],
                ["Mode", SERVER_INFO.mode],
                [
                  "Embeddings",
                  `${SERVER_INFO.embeddings?.model} · ${SERVER_INFO.embeddings?.dimensions}d`,
                ],
                [
                  "LLM",
                  `${SERVER_INFO.llm?.provider} · ${SERVER_INFO.llm?.model}`,
                ],
                ["Storage engine", SERVER_INFO.storage?.engine ?? "—"],
                ["Storage size", bytes(SERVER_INFO.storage?.sizeBytes ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-brand-black/40">{k}</dt>
                  <dd className="mono min-w-0 truncate text-brand-black/70">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </PanelCard>

          {/* Extraction — toggles, applied immediately */}
          <PanelCard
            eyebrow="Instance"
            title="Extraction"
            subtitle="Applied immediately."
            className="mt-3"
          >
            <div className="space-y-1 px-6 pt-4">
              <Toggle
                label="LLM filtering"
                hint="Run each chunk past the model before extraction. Slower, and much quieter."
                checked={filter}
                onChange={setFilter}
              />
              <Toggle
                label="Generate summaries"
                hint="One-paragraph summary per document, used by hybrid recall."
                checked={summaries}
                onChange={setSummaries}
              />
              <Toggle
                label="Derive inferences"
                hint="Let the engine assert facts implied by two or more memories."
                checked={inference}
                onChange={setInference}
              />
              <div className="pt-2">
                <Slider
                  label="Chunk size"
                  hint={`${Math.round(chunk * 4000)} tokens`}
                  value={chunk}
                  onChange={setChunk}
                />
              </div>
            </div>
          </PanelCard>

          {/* Prompts — text, so an explicit save */}
          <PanelCard
            eyebrow="Instance"
            title="Prompts"
            subtitle="Saved explicitly, unlike the toggles above."
            className="mt-3"
          >
            <div className="space-y-4 px-6 pt-4">
              <label className="block">
                <span className="label mb-1.5 block">Filter prompt</span>
                <Textarea rows={4} defaultValue={SETTINGS.filterPrompt ?? ""} />
                <span className="mt-1.5 block text-[11px] text-brand-black/45">
                  Runs before chunking — excluded content never reaches the
                  embedder.
                </span>
              </label>
              <label className="block">
                <span className="label mb-1.5 block">Workspace prompt</span>
                <Textarea
                  rows={3}
                  defaultValue={SETTINGS.workspacePrompt ?? ""}
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost">
                  Revert
                </Button>
                <Button size="sm" variant="primary">
                  Save prompts
                </Button>
              </div>
            </div>
          </PanelCard>

          {/* Paths */}
          <PanelCard
            eyebrow="Instance"
            title="Include / exclude"
            subtitle="Glob patterns applied at ingest."
            className="mt-3"
          >
            <div className="grid gap-4 px-6 pt-4 sm:grid-cols-2">
              <div>
                <span className="label mb-1.5 block">Include</span>
                <div className="flex flex-wrap gap-1.5">
                  {SETTINGS.includeItems.map((p) => (
                    <span
                      key={p}
                      className="mono rounded-md border border-brand-black/[0.12] px-1.5 py-0.5 text-[11px] text-brand-black/70"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <Input className="mono mt-2 h-9" placeholder="add a pattern…" />
              </div>
              <div>
                <span className="label mb-1.5 block">Exclude</span>
                <div className="flex flex-wrap gap-1.5">
                  {SETTINGS.excludeItems.map((p) => (
                    <span
                      key={p}
                      className="mono rounded-md border border-brand-black/[0.12] px-1.5 py-0.5 text-[11px] text-brand-black/70"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <Input className="mono mt-2 h-9" placeholder="add a pattern…" />
              </div>
            </div>
          </PanelCard>

          {/* Profile buckets */}
          <PanelCard
            eyebrow="Recall"
            title="Profile buckets"
            subtitle="Categories the engine sorts durable facts into."
            className="mt-3"
          >
            <div className="divide-y divide-brand-black/[0.05] pt-1">
              {SETTINGS.profileBuckets.map((b) => (
                <div key={b.key} className="px-6 py-3">
                  <span className="mono text-[12px] text-brand-black">
                    {b.key}
                  </span>
                  <p className="mt-0.5 text-[12px] text-brand-black/55">
                    {b.description}
                  </p>
                </div>
              ))}
            </div>
          </PanelCard>

          {/* Danger zone — last, quarantined */}
          <div className="mt-3 overflow-hidden rounded-[28px] border border-[color:var(--color-critical)]/35 bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
            <div className="px-6 py-5">
              <div className="label">Danger</div>
              <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
                Reset instance
              </h3>
              <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-brand-black/45">
                Drops every document, memory and space on this box and rebuilds
                the index from empty. There is no undo, and forgotten memories
                go with everything else.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-brand-black/[0.05] px-6 py-4">
              <Select defaultValue="" className="h-9 w-56" aria-label="Scope">
                <option value="">Everything</option>
                {SPACES.map((s) => (
                  <option key={s.containerTag} value={s.containerTag}>
                    Only {s.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="danger">
                <Icon.trash size={13} />
                Reset
              </Button>
            </div>
          </div>
        </PageBody>
      </div>
    );
  },
};
