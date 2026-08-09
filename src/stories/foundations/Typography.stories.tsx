import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Section, SpecRow, Stack, Well } from "@/stories/story-kit";

/**
 * Three faces, one job each.
 *
 * - **Lexend Exa 200** (`--font-brand`) is the wordmark. Nothing else uses it.
 * - **System sans** carries the entire UI.
 * - **Mono** is for things the machine owns: IDs, paths, payloads.
 *
 * The scale is deliberately short. Most of the hierarchy comes from weight and
 * the opacity ladder rather than from size steps.
 */
const meta: Meta = {
  title: "Foundations/Typography",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

/** Every step actually used in the product, in the order you meet them. */
export const Scale: Story = {
  render: () => (
    <Section
      title="Scale in practice"
      note="If a size isn't on this list, it probably shouldn't be in a component either."
    >
      <div>
        <SpecRow name="text-2xl / 600" hint="Page title">
          <h1 className="text-2xl font-semibold tracking-tight text-brand-black">
            Memory bank
          </h1>
        </SpecRow>
        <SpecRow name="20px / 600" hint="Section title">
          <h2 className="text-[20px] font-semibold tracking-tight text-brand-black">
            Ingestion pipeline
          </h2>
        </SpecRow>
        <SpecRow name="15px / 600" hint="Panel title">
          <h3 className="text-[15px] font-semibold text-brand-black">
            Recently extracted
          </h3>
        </SpecRow>
        <SpecRow name="13px / 400" hint="Body, list rows">
          <p className="text-[13px] text-brand-black">
            Replay correctness holds under partial partitions when the
            membership snapshot is pinned at dispatch.
          </p>
        </SpecRow>
        <SpecRow name="12px / 400 @ /55" hint="Meta, muted body">
          <p className="text-[12px] text-brand-black/55">
            Extracted from RFC-014 · 4 sources · updated 2d ago
          </p>
        </SpecRow>
        <SpecRow name="11px / 400 @ /45" hint="Hints">
          <p className="text-[11px] text-brand-black/45">
            Filtering runs before chunking, so excluded files never reach the
            embedder.
          </p>
        </SpecRow>
        <SpecRow name="10px / 700 · 0.18em" hint="Eyebrow / micro-label">
          <div className="label">Instance</div>
        </SpecRow>
        <SpecRow name="text-3xl / 600" hint="Stat metric">
          <span className="text-3xl font-semibold tracking-tight text-brand-black tnum">
            1,284
          </span>
        </SpecRow>
      </div>
    </Section>
  ),
};

/**
 * The hierarchy pattern almost every surface follows: eyebrow, title,
 * body/meta, then the action. Dashboard tiles, panel cards, section headers
 * and empty states are all the same four beats at different sizes.
 */
export const HierarchyPattern: Story = {
  render: () => (
    <Section
      title="The four-beat stack"
      note="Keeping this order consistent is what makes the console scannable — you always know where to look for the category, the noun, and the way out."
    >
      <Well>
        <div className="max-w-md">
          <div className="label">Recall</div>
          <h3 className="mt-1.5 text-[20px] font-semibold tracking-tight text-brand-black">
            Memory bank
          </h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-brand-black/55">
            Every durable fact the engine has extracted, newest first. Versions
            are kept — forgetting is a state, not a delete.
          </p>
          <button
            type="button"
            className="focus-ring mt-4 rounded-xl border border-brand-black/[0.12] px-3 py-2 text-[13px] text-brand-black transition-colors hover:bg-brand-black/[0.03]"
          >
            Add memory
          </button>
        </div>
      </Well>
    </Section>
  ),
};

/** The wordmark. Weight 200, tight tracking, and never louder than the page. */
export const BrandMark: Story = {
  render: () => (
    <Section
      title="Brand wordmark"
      note="Lexend Exa 200 via --font-brand, loaded by next/font in the app. Used for the sidebar name and the collapsed “s” monogram — nothing else."
    >
      <Stack gap={20}>
        <div className="rounded-2xl bg-sidebar px-6 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-black/22">
            by WENDE
          </div>
          <span className="mt-1.5 block font-[family-name:var(--font-brand)] text-[1.25rem] font-[200] tracking-tight text-brand-black">
            supermemory
          </span>
        </div>
        <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar font-[family-name:var(--font-brand)] text-[1.35rem] font-[200] tracking-tight text-brand-black">
          s
        </div>
      </Stack>
    </Section>
  ),
};

/**
 * `.mono` turns ligatures off — an ID with `fi` or `->` in it should read as
 * the characters it actually contains.
 */
export const Mono: Story = {
  render: () => (
    <Section
      title="Mono"
      note="Machine-owned strings: identifiers, routes, filesystem paths, payload keys. Always .mono, never for prose."
    >
      <Stack gap={8}>
        <div className="mono text-xs text-brand-black">
          mem_7f3a91c04e2b8d5a
        </div>
        <div className="mono text-xs text-brand-black">
          POST /v3/documents/list
        </div>
        <div className="mono text-xs text-brand-black">
          ~/.supermemory/state/index.hnsw
        </div>
        <div className="mono text-xs text-brand-black/55">
          {"{ containerTags: [\"sm_research\"], limit: 100 }"}
        </div>
      </Stack>
    </Section>
  ),
};

/**
 * `.tnum` gives tabular figures. Any number that sits in a column — metrics,
 * counts, latencies, scores — needs it, or the digits jitter as values change.
 */
export const Numerics: Story = {
  render: () => (
    <Section
      title="Tabular figures"
      note="Compare the right edges. Without .tnum the counts drift, which reads as movement in a list that hasn't changed."
    >
      <div className="grid max-w-md gap-6 sm:grid-cols-2">
        <Well label="Without .tnum">
          <Stack gap={4}>
            {[1284, 391, 47, 1111].map((n) => (
              <div
                key={n}
                className="text-right text-[13px] text-brand-black/70"
              >
                {n.toLocaleString()}
              </div>
            ))}
          </Stack>
        </Well>
        <Well label="With .tnum">
          <Stack gap={4}>
            {[1284, 391, 47, 1111].map((n) => (
              <div
                key={n}
                className="tnum text-right text-[13px] text-brand-black/70"
              >
                {n.toLocaleString()}
              </div>
            ))}
          </Stack>
        </Well>
      </div>
    </Section>
  ),
};

/**
 * `.label` is the single utility behind every eyebrow, legend heading and
 * category marker: 10px, 700, 0.18em tracking, uppercase, brand black at 55%.
 */
export const LabelUtility: Story = {
  render: () => (
    <Section
      title=".label"
      note="Reach for the utility rather than re-typing the five declarations — it is what keeps eyebrows identical across panels, legends and empty states."
    >
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {["Recall", "Ingest", "Instance", "Nodes", "Edges", "Pipeline"].map(
          (l) => (
            <span key={l} className="label">
              {l}
            </span>
          ),
        )}
      </div>
    </Section>
  ),
};
