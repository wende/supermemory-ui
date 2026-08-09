import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Grid, Row, Section, SpecRow, Stack } from "@/stories/story-kit";

/**
 * The signature surface is **large radius + soft elevation + hairline border**
 * on a cool gray field:
 *
 * ```
 * rounded-[26px|28px]
 * border border-brand-black/[0.06]
 * bg-card
 * shadow-[0_18px_45px_rgba(17,17,17,0.05)]
 * ```
 *
 * The shadow is wide and very light — it reads as lift, not as a drop shadow.
 * Match this recipe when adding a panel; a card that uses a different radius
 * or a harder shadow will look like it came from a different product.
 */
const meta: Meta = {
  title: "Foundations/Surfaces",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

/** The radius ladder, from field controls up to the signature panel. */
export const Radius: Story = {
  render: () => {
    const steps = [
      { name: "rounded-md", cls: "rounded-md", use: "Buttons, dense chrome" },
      { name: "rounded-lg", cls: "rounded-lg", use: "Icon buttons, popovers" },
      { name: "rounded-xl", cls: "rounded-xl", use: "Inputs, console buttons" },
      { name: "rounded-2xl", cls: "rounded-2xl", use: "Icon wells, toasts" },
      { name: "rounded-[22px]", cls: "rounded-[22px]", use: "Pill tab tray" },
      { name: "rounded-[26px]", cls: "rounded-[26px]", use: "Stat tiles" },
      { name: "rounded-[28px]", cls: "rounded-[28px]", use: "Panels, cards" },
      { name: "rounded-full", cls: "rounded-full", use: "Pills, dots, tracks" },
    ];
    return (
      <Section
        title="Radius"
        note="--radius is 0.75rem, but the panel surfaces deliberately go much larger. The jump from 12px chrome to 28px panels is what gives the console its airy feel."
      >
        <Grid min={160}>
          {steps.map((s) => (
            <div key={s.name}>
              <div
                className={`h-20 border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)] ${s.cls}`}
              />
              <div className="mono mt-2 truncate text-[11px] text-brand-black">
                {s.name}
              </div>
              <div className="truncate text-[11px] text-brand-black/45">
                {s.use}
              </div>
            </div>
          ))}
        </Grid>
      </Section>
    );
  },
};

/** Four levels of lift, and where each belongs. */
export const Elevation: Story = {
  render: () => (
    <Section
      title="Elevation"
      note="Elevation is used sparingly: the page has one plane of panels, and only transient layers (tooltips, drawers, toasts) sit above it."
    >
      <Grid min={220}>
        <div>
          <div className="h-24 rounded-[28px] border border-brand-black/[0.06] bg-card" />
          <div className="mt-2 text-[11px] text-brand-black/55">
            Flat — nested regions inside a panel
          </div>
        </div>
        <div>
          <div className="soft-card h-24 rounded-[28px]" />
          <div className="mt-2 text-[11px] text-brand-black/55">
            <code className="mono">.soft-card</code> — translucent, hover-lifts
          </div>
        </div>
        <div>
          <div className="h-24 rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]" />
          <div className="mt-2 text-[11px] text-brand-black/55">
            Panel — the default surface
          </div>
        </div>
        <div>
          <div className="h-24 rounded-2xl border border-brand-black/[0.06] bg-card shadow-[0_12px_32px_rgba(17,17,17,0.12)]" />
          <div className="mt-2 text-[11px] text-brand-black/55">
            Overlay — tooltips, popovers, drawers
          </div>
        </div>
      </Grid>
    </Section>
  ),
};

/**
 * Blurred layers are for chrome that sits over scrolling content — the sticky
 * header and the graph legend — not for decoration.
 */
export const GlassLayers: Story = {
  render: () => (
    <Section
      title="Glass"
      note=".glass-header and .glass-surface exist so a sticky bar can stay legible over moving content. The default header is quiet (no blur); reach for glass only when content actually passes beneath."
    >
      <div className="relative overflow-hidden rounded-[28px] border border-brand-black/[0.06]">
        <div className="glass-header absolute inset-x-0 top-0 z-10 flex h-14 items-center px-6">
          <span className="text-[13px] font-medium text-brand-black">
            supermemory
          </span>
          <span className="mx-2 text-[13px] text-brand-black/30">/</span>
          <span className="text-[13px] text-brand-black/55">Documents</span>
        </div>
        <div className="space-y-2 bg-background px-6 pt-20 pb-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-10 rounded-xl"
              style={{
                background: `color-mix(in oklab, var(--s${(i % 5) + 1}) 14%, transparent)`,
              }}
            />
          ))}
        </div>
      </div>
    </Section>
  ),
};

/** Hairlines, not rules. The border is a boundary hint, never a divider bar. */
export const Borders: Story = {
  render: () => (
    <Section
      title="Borders & dividers"
      note="Panel edges use brand black at 6%; internal dividers drop to 5% so a section break is quieter than the panel's own outline."
    >
      <Stack gap={0} className="max-w-2xl">
        <SpecRow name="border-brand-black/[0.06]" hint="Panel edge">
          <div className="h-10 rounded-xl border border-brand-black/[0.06] bg-card" />
        </SpecRow>
        <SpecRow name="border-brand-black/[0.05]" hint="Internal divider">
          <div className="border-t border-brand-black/[0.05] pt-3 text-[12px] text-brand-black/55">
            Section below the divider
          </div>
        </SpecRow>
        <SpecRow name="border-brand-black/[0.12]" hint="Field border">
          <input
            readOnly
            value="sm_research"
            className="w-full rounded-xl border border-brand-black/[0.12] bg-card px-3 py-2 text-sm text-brand-black"
          />
        </SpecRow>
        <SpecRow name="border-border" hint="Token-driven (theme aware)">
          <div className="h-10 rounded-xl border border-border bg-card" />
        </SpecRow>
      </Stack>
    </Section>
  ),
};

/**
 * Panels do not nest. When a panel needs internal structure, use a header row
 * and a light divider — not a second card.
 */
export const NestingRule: Story = {
  name: "Nesting: do / don't",
  render: () => (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <div className="label mb-3">Do — one panel, divided</div>
        <div className="overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
          <div className="px-6 py-5">
            <div className="label">Ingest</div>
            <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
              Pipeline
            </h3>
          </div>
          <div className="border-t border-brand-black/[0.05] px-6 py-4">
            <Row className="gap-6">
              <span className="text-[12px] text-brand-black/55">
                Queued <span className="tnum text-brand-black">3</span>
              </span>
              <span className="text-[12px] text-brand-black/55">
                Indexing <span className="tnum text-brand-black">1</span>
              </span>
              <span className="text-[12px] text-brand-black/55">
                Done <span className="tnum text-brand-black">42</span>
              </span>
            </Row>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-3">Don&apos;t — cards inside cards</div>
        <div className="overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card p-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
          <div className="rounded-[22px] border border-brand-black/[0.06] bg-card p-4 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
            <div className="rounded-2xl border border-brand-black/[0.06] bg-card p-3 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
              <span className="text-[12px] text-brand-black/55">
                Three shadows, no added meaning
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};
