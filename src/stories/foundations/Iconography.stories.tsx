import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Grid, Row, Section, Well } from "@/stories/story-kit";
import { Icon, type IconName } from "@/components/icons";

/**
 * Icons come from **Lucide**, but the app never imports Lucide directly — it
 * imports the `Icon` map in `src/components/icons.tsx`. The map is keyed by
 * *meaning* (`memory`, `forget`, `space`) rather than by glyph name, so a
 * concept can be redrawn in one place without touching call sites.
 *
 * Adding an icon means adding a key here first. If there is no key for what
 * you are labelling, that is usually a sign the concept needs naming.
 */
const meta: Meta = {
  title: "Foundations/Iconography",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

const NAMES = Object.keys(Icon) as IconName[];

/** Every key in the map. Hover for the import path. */
export const TheSet: Story = {
  name: "The set",
  render: () => (
    <Section
      title={`Icon map — ${NAMES.length} keys`}
      note={
        <>
          Semantic names, stable across redraws. Import the map with{" "}
          <code className="mono">
            import {"{ Icon }"} from &quot;@/components/icons&quot;
          </code>{" "}
          and render <code className="mono">&lt;Icon.memory /&gt;</code>.
        </>
      }
    >
      <Grid min={128}>
        {NAMES.map((name) => {
          const Glyph = Icon[name];
          return (
            <div
              key={name}
              title={`Icon.${name}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-brand-black/[0.06] bg-card px-3 py-4"
            >
              <Glyph className="size-5 text-brand-black/70" />
              <span className="mono truncate text-[10px] text-brand-black/55">
                {name}
              </span>
            </div>
          );
        })}
      </Grid>
    </Section>
  ),
};

/** Sizes actually used, and where. */
export const Sizes: Story = {
  render: () => (
    <Section
      title="Sizes"
      note="16px is the workhorse — buttons auto-size their icons to it. 13–15px belongs in dense chrome (help affordances, detail rows); 20px only inside an icon well."
    >
      <Row className="gap-8" align="end">
        {[13, 14, 16, 20].map((size) => (
          <div key={size} className="flex flex-col items-center gap-2">
            <Icon.graph size={size} className="text-brand-black/70" />
            <span className="mono text-[10px] text-brand-black/45">
              {size}px
            </span>
          </div>
        ))}
      </Row>
    </Section>
  ),
};

/**
 * Icon wells are soft brand-black fills — never coloured backgrounds. Colour
 * on an icon would compete with the series and status roles.
 */
export const Wells: Story = {
  render: () => (
    <Section
      title="Icon wells"
      note="bg-brand-black/[0.035] with the glyph at /45. Used by EmptyState and by dashboard tiles that need a visual anchor without adding chroma."
    >
      <Row className="gap-4">
        {(["memory", "document", "space", "graph", "search"] as const).map(
          (name) => {
            const Glyph = Icon[name];
            return (
              <div
                key={name}
                className="flex size-12 items-center justify-center rounded-2xl bg-brand-black/[0.035]"
              >
                <Glyph className="size-5 text-brand-black/45" />
              </div>
            );
          },
        )}
      </Row>
    </Section>
  ),
};

/** The keys that carry a fixed meaning across the whole console. */
export const SemanticPairs: Story = {
  render: () => {
    const pairs: { name: IconName; means: string }[] = [
      { name: "memory", means: "A durable extracted fact" },
      { name: "document", means: "An ingested source" },
      { name: "space", means: "A container tag / corpus partition" },
      { name: "graph", means: "Relations between memories" },
      { name: "search", means: "Semantic ask — memory bank filter mode" },
      { name: "add", means: "Write into the engine" },
      { name: "forget", means: "Retire a memory (also: dismiss)" },
      { name: "profile", means: "Derived picture of the user" },
      { name: "settings", means: "Operate the instance" },
      { name: "terminal", means: "Raw API surface" },
      { name: "crosshair", means: "Focus the local graph on a node" },
      { name: "sliders", means: "Open the customise panel" },
    ];
    return (
      <Section
        title="Fixed meanings"
        note="These pairings are load-bearing — reusing `forget` for a generic close is fine (it is the same X), but never reuse `memory` for a document or `spark` for status."
      >
        <Well>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {pairs.map(({ name, means }) => {
              const Glyph = Icon[name];
              return (
                <div key={name} className="flex items-center gap-3">
                  <Glyph className="size-4 shrink-0 text-brand-black/55" />
                  <span className="mono w-24 shrink-0 text-[11px] text-brand-black/70">
                    {name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-brand-black/55">
                    {means}
                  </span>
                </div>
              );
            })}
          </div>
        </Well>
      </Section>
    );
  },
};

/** Navigation reads left-to-right as icon, then label — never icon alone. */
export const InNavigation: Story = {
  render: () => (
    <Section
      title="In navigation"
      note="Icons carry the rail when it collapses to 3rem, which is the one place they stand alone. Everywhere else they accompany a label."
    >
      <div className="max-w-56 rounded-2xl bg-sidebar p-3">
        <div className="mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-black/24">
          Recall
        </div>
        {(
          [
            ["memory", "Memory bank", true],
            ["graph", "Graph", false],
            ["search", "Ask", false],
            ["profile", "Profile", false],
          ] as const
        ).map(([name, label, active]) => {
          const Glyph = Icon[name];
          return (
            <div
              key={label}
              className={`flex h-11 items-center gap-3 rounded-xl px-4 ${
                active
                  ? "bg-brand-black/[0.07] text-brand-black"
                  : "text-brand-black/58"
              }`}
            >
              <Glyph
                className={`size-4 shrink-0 ${active ? "opacity-90" : "opacity-45"}`}
              />
              <span className="truncate text-[13px] font-medium">{label}</span>
            </div>
          );
        })}
      </div>
    </Section>
  ),
};
