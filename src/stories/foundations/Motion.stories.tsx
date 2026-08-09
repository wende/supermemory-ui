import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Grid, Row, Section, Well } from "@/stories/story-kit";

/**
 * Motion is **presence, not decoration**. Every animation is short and eases
 * toward rest: things arrive, they do not perform.
 *
 * All of it collapses to ~0ms under `prefers-reduced-motion: reduce`, which is
 * enforced globally in `globals.css` — you do not need to guard individual
 * components.
 *
 * Animations only fire on mount, so each story below has a **Replay** button
 * that remounts the specimen.
 */
const meta: Meta = {
  title: "Foundations/Motion",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

/** Remount-on-click wrapper so a mount animation can be watched repeatedly. */
function Replay({
  children,
  label = "Replay",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [key, setKey] = React.useState(0);
  return (
    <div>
      <button
        type="button"
        onClick={() => setKey((k) => k + 1)}
        className="focus-ring mb-3 rounded-lg border border-brand-black/[0.12] px-2.5 py-1 text-[11px] font-medium text-brand-black/70 transition-colors hover:bg-brand-black/[0.03] hover:text-brand-black"
      >
        {label}
      </button>
      <div key={key}>{children}</div>
    </div>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-16 items-center justify-center rounded-[22px] border border-brand-black/[0.06] bg-card text-[12px] text-brand-black/70 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
      {children}
    </div>
  );
}

/** The three mount entrances, side by side. */
export const Entrances: Story = {
  render: () => (
    <Section
      title="Entrances"
      note="Route content uses animate-fade-in via PageTransition; panels reuse it on mount; slide-up is reserved for the softer, longer arrival of empty states."
    >
      <Grid min={240}>
        <Well label="animate-fade-in · 300ms ease-out · 6px rise">
          <Replay>
            <Tile>
              <span className="animate-fade-in">Panel content</span>
            </Tile>
          </Replay>
        </Well>
        <Well label="animate-fade-in-scale · 250ms · 0.97 → 1">
          <Replay>
            <Tile>
              <span className="animate-fade-in-scale">Popover</span>
            </Tile>
          </Replay>
        </Well>
        <Well label="slide-up · 500ms cubic-bezier(0.16, 1, 0.3, 1)">
          <Replay>
            <Tile>
              <span className="slide-up">Empty state</span>
            </Tile>
          </Replay>
        </Well>
      </Grid>
    </Section>
  ),
};

/**
 * `stagger-children` walks its direct children in 50ms steps, up to twelve.
 * Use it for list panels so rows resolve in reading order instead of all at
 * once — and not for anything longer, where the tail feels slow.
 */
export const StaggeredList: Story = {
  render: () => (
    <Section
      title="stagger-children"
      note="Opt-in on PanelCard via the `stagger` prop. Twelve delay steps are defined; beyond that children mount with no delay."
    >
      <Replay>
        <div className="stagger-children max-w-lg space-y-2">
          {[
            "Replay correctness holds under partial partitions",
            "HRW dispatch is unsafe without a pinned membership snapshot",
            "Reranking changed the p95 recall latency by +38ms",
            "Research corpus must not leave the machine",
            "Ollama endpoint satisfies the security review condition",
            "RFC-014 supersedes the 2026-05 dispatch note",
          ].map((t) => (
            <div
              key={t}
              className="rounded-xl border border-brand-black/[0.06] bg-card px-4 py-3 text-[13px] text-brand-black/70"
            >
              {t}
            </div>
          ))}
        </div>
      </Replay>
    </Section>
  ),
};

/**
 * The one looping animation in the system. It marks *work is in flight right
 * now* — a polling pipeline, a live connection — and nothing else.
 */
export const LiveIndicators: Story = {
  render: () => (
    <Section
      title="animate-soft-pulse"
      note="2s opacity pulse between 1 and 0.4. Because it loops, it is only ever attached to something that is genuinely still happening; a finished state must not keep pulsing."
    >
      <Row className="gap-8">
        <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/70">
          <span className="animate-soft-pulse size-1.5 rounded-full bg-[color:var(--warning-status)]" />
          Indexing 3 documents
        </span>
        <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/70">
          <span className="animate-soft-pulse size-1.5 rounded-full bg-brand-black" />
          Live
        </span>
        <span className="inline-flex items-center gap-2 text-[12px] text-brand-black/55">
          <span className="size-1.5 rounded-full bg-[color:var(--color-good)]" />
          Indexed — at rest, no pulse
        </span>
      </Row>
    </Section>
  ),
};

/**
 * Hover transitions land in the 150–250ms range and only ever move shadow,
 * colour or a couple of pixels of transform.
 */
export const HoverTransitions: Story = {
  render: () => (
    <Section
      title="Hover"
      note="Hover feedback is confirmation that a thing is interactive — not an invitation to play with it. Nothing scales, nothing bounces."
    >
      <Grid min={220}>
        <div className="soft-card flex h-24 cursor-pointer items-center justify-center rounded-[26px] text-[12px] text-brand-black/70">
          .soft-card — 250ms shadow
        </div>
        <button
          type="button"
          className="focus-ring h-24 rounded-[26px] border border-brand-black/[0.06] bg-card text-[12px] text-brand-black/55 transition-colors duration-200 hover:bg-brand-black/[0.03] hover:text-brand-black"
        >
          150–200ms colour
        </button>
        <div className="flex h-24 items-center justify-center rounded-[26px] border border-brand-black/[0.06] bg-card">
          <span className="group inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-brand-black/70">
            mem_7f3a91c04e2b8d5a
            <span className="text-[10px] text-brand-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              copy
            </span>
          </span>
        </div>
      </Grid>
    </Section>
  ),
};

/** What a reduced-motion visitor gets: the end state, immediately. */
export const ReducedMotion: Story = {
  render: () => (
    <Section
      title="prefers-reduced-motion"
      note="globals.css clamps every animation and transition to 0.001ms and one iteration. That includes the soft pulse — a live indicator becomes a static dot rather than disappearing, which is why status is never conveyed by the motion alone."
    >
      <Well>
        <pre className="mono overflow-x-auto text-[11px] leading-relaxed text-brand-black/70">
{`@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}`}
        </pre>
      </Well>
    </Section>
  ),
};
