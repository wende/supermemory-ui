import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Grid, Row, Section, Swatch, Well } from "@/stories/story-kit";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/format";
import { DOCUMENT_STATUSES } from "@/lib/types";

/**
 * The system is **achromatic chrome plus two reserved colour roles**.
 *
 * 1. **Data series** (`--s1`…`--s5`) — charts and entity accents only.
 * 2. **Status** (`--good`, `--warning-status`, `--serious`, `--critical`, and
 *    the brand status fills) — never used as a series.
 *
 * Those roles do not swap. Everything else — page field, panels, wells,
 * hairlines, sidebar — is neutral, and depth comes from lightness rather than
 * hue. Flip the theme in the toolbar: every swatch below re-resolves live, so
 * a token that only works in one theme is visible immediately.
 */
const meta: Meta = {
  title: "Foundations/Colour",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Colour tokens, their resolved values in the active theme, and the rules that decide which role a colour may play.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/** Chrome. Page field, panel fill, wells, hairlines, sidebar rail. */
export const Neutrals: Story = {
  render: () => (
    <Section
      title="Neutrals"
      note="Near-monochrome by design. Depth is lightness, not hue — the whole chrome layer lives between --background and --foreground with hairline borders in between."
    >
      <Grid min={150}>
        <Swatch token="--background" role="Page field" border />
        <Swatch token="--card" role="Panel fill" border />
        <Swatch token="--muted" role="Subtle well" border />
        <Swatch token="--secondary" role="Tray / tooltip ground" border />
        <Swatch token="--border" role="Hairline" border />
        <Swatch token="--input" role="Field border" border />
        <Swatch token="--ring" role="Focus ring" />
        <Swatch token="--muted-foreground" role="Secondary copy" />
        <Swatch token="--foreground" role="Primary text" />
        <Swatch token="--brand-black" role="Brand ink" />
        <Swatch token="--sidebar" role="Rail" border />
        <Swatch token="--destructive" role="Destructive action" />
      </Grid>
    </Section>
  ),
};

/**
 * Series colours answer *what kind of thing is this* — never *how is it
 * going*. Each one is bound to an entity in the corpus.
 */
export const DataSeries: Story = {
  render: () => (
    <Section
      title="Data series"
      note="TE Orange (html[data-accent=te-orange]) — charts and entity accents only. Form knobs and toggles stay on brand black."
    >
      <Grid min={150}>
        <Swatch token="--s1" role="Documents · steel" />
        <Swatch token="--s2" role="Spaces · orange" />
        <Swatch token="--s3" role="Memories · LED cyan" />
        <Swatch token="--s4" role="Chunks · fader grey" />
        <Swatch token="--s5" role="Relations · magenta" />
      </Grid>
    </Section>
  ),
};

/**
 * Status colours are reserved. A failing document is `--critical`, never
 * `--s2`; the documents series is `--s1`, never `--good`.
 */
export const Status: Story = {
  render: () => (
    <>
      <Section
        title="Status"
        note="Four steps of severity, plus the neutral muted foreground for “nothing is happening yet”. Reserved — these never appear as a chart series."
      >
        <Grid min={150}>
          <Swatch token="--good" role="Healthy / indexed" />
          <Swatch token="--warning-status" role="In flight" />
          <Swatch token="--serious" role="Degraded" />
          <Swatch token="--critical" role="Failed" />
        </Grid>
      </Section>

      <Section
        title="Pipeline status mapping"
        note="STATUS_COLOR in src/lib/format.ts is the only place a document status becomes a colour. Status is never colour-only — each dot ships with its written label."
      >
        <Row>
          {DOCUMENT_STATUSES.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-2 rounded-full border border-brand-black/[0.08] px-3 py-1.5"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: STATUS_COLOR[status] }}
              />
              <span className="text-[11px] text-brand-black/70">
                {STATUS_LABEL[status]}
              </span>
            </span>
          ))}
        </Row>
      </Section>
    </>
  ),
};

/**
 * The brand status fills are the pill treatment: a soft tinted ground with
 * text tuned for contrast on it. In dark mode they become translucent wells.
 */
export const BrandStatusFills: Story = {
  render: () => {
    const fills = [
      { name: "Success", bg: "--brand-success-bg", fg: "--brand-success-text" },
      { name: "Ongoing", bg: "--brand-ongoing", fg: "--brand-ongoing-text" },
      { name: "Failure", bg: "--brand-failure", fg: "--brand-failure-text" },
      { name: "Paused", bg: "--brand-paused-bg", fg: "--brand-paused-text" },
    ];
    return (
      <Section
        title="Brand status fills"
        note="Ground + text pairs used by StatusPill. Always uppercase and labelled, so the fill reinforces the word rather than replacing it."
      >
        <Grid min={200}>
          {fills.map((f) => (
            <div key={f.name}>
              <div
                className="flex h-14 items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: `var(${f.bg})`,
                  color: `var(${f.fg})`,
                }}
              >
                {f.name}
              </div>
              <div className="mono mt-2 truncate text-[11px] text-brand-black/45">
                {f.bg}
              </div>
              <div className="mono truncate text-[11px] text-brand-black/45">
                {f.fg}
              </div>
            </div>
          ))}
        </Grid>
      </Section>
    );
  },
};

/**
 * Rather than inventing new grays, the UI layers brand black at fixed
 * opacities. Learn this ladder and most spacing-adjacent colour decisions
 * answer themselves.
 */
export const OpacityLadder: Story = {
  render: () => {
    const steps: { cls: string; token: string; use: string }[] = [
      { cls: "text-brand-black/22", token: "/22", use: "Brand microcopy" },
      { cls: "text-brand-black/35", token: "/35", use: "Eyebrows" },
      { cls: "text-brand-black/40", token: "/40", use: "Hints" },
      { cls: "text-brand-black/45", token: "/45", use: "Empty-state secondary" },
      { cls: "text-brand-black/55", token: "/55", use: "Meta, muted body" },
      { cls: "text-brand-black/70", token: "/70", use: "Tooltip body" },
      { cls: "text-brand-black", token: "full", use: "Primary text" },
    ];
    const fills: { cls: string; token: string; use: string }[] = [
      { cls: "bg-brand-black/[0.035]", token: "/[0.035]", use: "Icon wells, soft pills" },
      { cls: "bg-brand-black/[0.05]", token: "/[0.05]", use: "Borders, muted pills" },
      { cls: "bg-brand-black/[0.06]", token: "/[0.06]", use: "Panel hairline, track" },
      { cls: "bg-brand-black/[0.12]", token: "/[0.12]", use: "Field border" },
    ];

    return (
      <>
        <Section
          title="Text opacity"
          note="Applied to --brand-black, which is the foreground in both themes — so the ladder survives the theme flip without a second set of tokens."
        >
          <div>
            {steps.map((s) => (
              <div
                key={s.token}
                className="flex flex-wrap items-baseline gap-x-6 border-b border-brand-black/[0.05] py-2.5 last:border-b-0"
              >
                <span className="mono w-16 shrink-0 text-[11px] text-brand-black/45">
                  {s.token}
                </span>
                <span className={`flex-1 text-[13px] ${s.cls}`}>
                  Replay correctness holds under partial partitions.
                </span>
                <span className="text-[11px] text-brand-black/40">{s.use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Surface opacity">
          <Grid min={200}>
            {fills.map((f) => (
              <Well key={f.token} label={f.token}>
                <div className={`h-10 rounded-lg ${f.cls}`} />
                <div className="mt-2 text-[11px] text-brand-black/55">
                  {f.use}
                </div>
              </Well>
            ))}
          </Grid>
        </Section>
      </>
    );
  },
};

/** Grid and axis stay recessive so the data reads first. */
export const ChartChrome: Story = {
  render: () => (
    <Section
      title="Chart chrome"
      note="Gridlines and the zero axis are the only chrome a chart gets. They sit far enough below the series to disappear when you look at the line."
    >
      <Grid min={150}>
        <Swatch token="--grid" role="Gridlines" border />
        <Swatch token="--axis" role="Zero axis" border />
      </Grid>
    </Section>
  ),
};

/** The one thing to get right: which role a colour is allowed to play. */
export const RoleRules: Story = {
  name: "Do / don't",
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-[26px] border border-[color:var(--color-good)]/35 bg-card p-6">
        <div className="label mb-3">Do</div>
        <ul className="space-y-2 text-[13px] leading-relaxed text-brand-black/70">
          <li>Keep chrome monochrome; spend colour on meaning.</li>
          <li>
            Use <code className="mono">--s1…--s5</code> for entity kinds and
            chart series — never for knobs or toggles.
          </li>
          <li>
            Use <code className="mono">--good</code> /{" "}
            <code className="mono">--critical</code> for how something is going.
          </li>
          <li>Pair every colour signal with a label or glyph.</li>
        </ul>
      </div>
      <div className="rounded-[26px] border border-[color:var(--color-critical)]/35 bg-card p-6">
        <div className="label mb-3">Don&apos;t</div>
        <ul className="space-y-2 text-[13px] leading-relaxed text-brand-black/70">
          <li>Use a series colour for success, error, or form chrome.</li>
          <li>Use a status colour for a chart series.</li>
          <li>Introduce purple / indigo / glow marketing accents.</li>
          <li>Signal state with colour alone.</li>
        </ul>
      </div>
    </div>
  ),
};
