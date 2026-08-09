# Design

UI/UX methodology, palette, and feel for the supermemory local console.

Tokens live in [`src/app/globals.css`](src/app/globals.css). Layout and shared surfaces live under [`src/components/layouts/`](src/components/layouts/) and [`src/components/blocks/`](src/components/blocks/). Primitives are shadcn-style under [`src/components/ui/`](src/components/ui/).

**This document has an executable half.** `npm run storybook` renders every token, primitive, block, chart and layout surface described below, in both themes, against the seeded corpus. If a rule here is real, there is a story that shows it — start at *Foundations → Introduction*.

---

## Feel

Quiet operator console — not a marketing site, not a dense IDE.

The product is a **window into a memory engine**: ingestion, recall, graph, and settings. The UI stays out of the way. Surfaces are soft and slightly elevated; color is reserved for data and status. Interaction is deliberate rather than playful.

| Attribute | Direction |
|---|---|
| Mood | Calm, precise, airy |
| Density | Comfortable — room to breathe, not sparse |
| Chromaticity | Near-monochrome chrome; chroma only for series and status |
| Depth | Soft cards on a cool gray field; hairline borders, not hard shadows |
| Metaphor | Local console / control room, not dashboard SaaS |

Inspired by an **8claw-style** shell: blended sidebar, quiet sticky header, large rounded panels, uppercase micro-labels.

---

## Methodology

### Information architecture

Navigation is grouped by operator intent, not by API version:

| Group | Purpose |
|---|---|
| **Recall** | Read and query what the engine knows (memory bank, timeline, graph, ask, profile) |
| **Ingest** | Write and organize (add, forget, documents, spaces) |
| **Instance** | Operate the box (settings, API explorer, dashboard) |

Breadcrumbs always start from `supermemory` → current screen. Page titles are short nouns; longer explanation lives in a help tooltip, not in a subtitle under the H1.

### Hierarchy pattern

Almost every surface follows the same stack:

1. **Eyebrow** — 10px bold uppercase, wide tracking (`0.18em`), muted
2. **Title** — 15–24px semibold, tight tracking
3. **Body / meta** — 11–13px at ~45–55% foreground opacity
4. **Primary action** — right-aligned in the header row when present

This keeps scanning consistent across dashboard tiles, panel cards, section headers, and empty states.

### Progressive disclosure

- Default views show the corpus at a glance (counts, recent memories, pipeline).
- Knobs for search, settings, and API live behind the screen that needs them — not in global chrome.
- Destructive or rare actions (org reset, mass-forget) stay on dedicated routes.

### Feedback

| State | Pattern |
|---|---|
| Loading | `Skeleton` grids or `Spinner` from `@/components/ui` |
| Empty | `Empty` (wraps `EmptyState`) — soft icon well, short title, optional CTA |
| Error | Card with critical-tint border and a 1.5px status dot |
| Live / pipeline | Soft pulse on status dots; poll only while work is in flight |
| Success / failure / running | `Badge` tones (`good` / `warning` / `critical`) — never series colors |

### Accessibility baselines

- Focus rings via `--ring` / `.focus-ring`
- `prefers-reduced-motion` collapses all animations and transitions
- Status is never color-only: pills carry uppercase labels; document types pair glyph + label
- Theme respects `prefers-color-scheme` until the user overrides

---

## Palette

The system is **achromatic chrome + two reserved color roles**:

1. **Data series** (`--s1`…`--s5`) — charts and entity accents only  
2. **Status** (`--good`, `--warning-status`, `--serious`, `--critical`, brand status fills) — never used as a series

### Light (default)

| Token | Value | Role |
|---|---|---|
| `--background` | `#f9fafb` | Page field |
| `--foreground` / `--brand-black` | `oklch(0.313 0 0)` | Primary text / brand ink |
| `--card` | `oklch(1 0 0)` | Panel fill |
| `--muted` / `--secondary` | `oklch(0.96 0 0)` | Subtle wells |
| `--muted-foreground` | `oklch(0.45 0 0)` | Secondary copy |
| `--border` / `--input` | `oklch(0.915 0 0)` | Hairlines |
| `--sidebar` | `oklch(0.97 0 0)` | Rail |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Destructive actions |
| `--radius` | `0.75rem` | Base radius (components often go larger) |

**Brand status (light fills):**

| State | Background | Text |
|---|---|---|
| Success | `#b8dcc8` | `#0f5c3a` |
| Ongoing / running | `#b8dce4` | `#0f6a78` |
| Failure | `#f0b8ba` | `#9a1a20` |
| Paused | `#ffd0b8` | `#9a3a00` |

**Data series (light) — TE Orange (`data-accent="te-orange"`):**

| Token | Hex | Typical use |
|---|---|---|
| `--s1` | `#2b6fa8` | Documents · steel |
| `--s2` | `#ff5500` | Spaces · orange |
| `--s3` | `#1fa0b5` | Memories · cyan |
| `--s4` | `#6e7c8a` | Chunks · fader grey |
| `--s5` | `#e23a8c` | Relations · magenta |

Defined in [`src/styles/accent-themes.css`](src/styles/accent-themes.css); surfaces stay in `globals.css`. Series colours are for charts and entity accents only — form knobs and toggles use brand black.

**Status (reserved):** `--good` `#1f8a5b` · `--warning-status` `#ff5500` · `--serious` `#c96a42` · `--critical` `#e01820`

**Chart chrome:** `--grid` `#e5e5e3` · `--axis` `#d4d4d0`

### Dark

Same roles, lifted neutrals (`--background` ≈ `oklch(0.145)`, cards ≈ `0.19`). Series colors lift for contrast against dark grounds (TE Orange dark steps in `accent-themes.css`). Status fills become translucent tinted wells with lighter text.

Toggle: `ThemeToggle` flips `.dark` on `<html>` and persists to `localStorage` (`supermemory-theme`).

### Opacity ladder (on brand black)

Used throughout instead of inventing new grays:

| Opacity | Use |
|---|---|
| `/22`–`/35` | Eyebrows, brand microcopy |
| `/40`–`/45` | Hints, empty-state secondary |
| `/55` | Meta, muted body |
| `/70` | Tooltip body |
| `/[0.05]`–`/[0.06]` | Borders, soft wells |
| `/[0.035]` | Icon wells, soft pills |

---

## Typography

| Role | Spec |
|---|---|
| Brand wordmark | **Lexend Exa** weight 200 (`--font-brand`) — sidebar name + collapsed “s” monogram |
| UI sans | System stack: `system-ui, -apple-system, Segoe UI, sans-serif` |
| Mono | `ui-monospace, SF Mono, Menlo` — API paths, IDs, payloads (`.mono`) |
| Numerics | Tabular figures via `.tnum` where columns align |

**Scale in practice:**

- Page title: `text-2xl` semibold, tight tracking  
- Section / panel title: `15px`–`20px` semibold  
- Body / list: `12px`–`13px`  
- Meta / hints: `11px`–`12px` at muted opacity  
- Labels / pills / tabs: `10px`–`11px` bold uppercase, tracking `0.12em`–`0.18em`  
- Metrics: `text-3xl` semibold (stat tiles)

Ligatures off in mono. Prefer compact number formatting (`compact()`, `bytes()`, `relTime()`) over raw ISO strings in the UI.

---

## Layout & surfaces

### Shell

- Collapsible sidebar (`13rem` expanded / `3rem` icon rail), gap spacer so main does not reflow every animation frame
- Quiet sticky header (`h-14`): trigger · breadcrumb · theme toggle — no heavy blur unless `quiet={false}`
- `PageContainer`: centered content, default `max-w-[1400px]`, generous bottom padding (`12dvh`) so lists clear the fold

### Cards & panels

Signature surface: **large radius + soft elevation + hairline border**

```
rounded-[26px|28px]
border border-brand-black/[0.06]
bg-card
shadow-[0_18px_45px_rgba(17,17,17,0.05)]
```

- `Card` + `SectionHeader` from `@/components/ui` — `28px` radius; title row with optional meta / description / action  
- Chart `Stat` from `@/components/charts` — `26px` radius; metric-forward  

Avoid nesting heavy cards inside cards. Prefer a single panel with an internal header row and a light divider.

### Pills & tabs

- `Badge`: compact bordered chip with tone (`neutral` / status / series)  
- `PillTabList`: centered group in a `rounded-[22px]` tray; active tab fills brand black with white type and a soft shadow

### Buttons

shadcn variants (`default`, `outline`, `ghost`, `destructive`, …). Primary is inverted foreground (near-black on light). Prefer ghost/outline for secondary chrome so the page stays quiet.

---

## Borrowed grammar: the timeline

One screen deliberately borrows a vocabulary from outside the console. The
timeline reads as a social feed — author bubble, post, link preview, comment
thread, quote post, reaction row — because that is a layout people parse without
being taught, and the memory engine's own records happen to have the same shape.

The rule that keeps it from becoming decoration: **every borrowed affordance
must be a real record**. The author is the space, the reaction counts are source
and relation counts, "edited" is a genuine version diff. There are no likes, no
invented engagement, no avatars of people.

Two rules govern what a post spends space on:

1. **The payload leads.** The memories are the reason the post exists, so they
   are the body at 14px in full-strength ink; the document that produced them is
   a byline at 11px/40%. Chrome that repeats the byline (an action bar saying
   "open document" under a line that already opens the document) is cut, not
   styled smaller.
2. **Reading a source costs nothing.** Documents open in a `Modal` over the
   feed. Deep-linking to another tab's detail view (`/documents?doc=…`) strands
   the reader inside a page with no way back and throws away their scroll
   position.

It stays inside the system elsewhere:

- Feed column is `max-w-2xl` — a claim should be read, not scanned across.
- Page chrome above the first post stays under ~250px: the space filter rides in
  the `PageTitle` actions slot, the composer is a single collapsed pill.
- Event kinds are accented with series colours (`--s1`…`--s5`); `forgotten` drops
  out of the series into muted ink rather than borrowing a status colour.
- Colour is never alone: every post carries an uppercase kind chip and a verb.
- Card recipe, radii, opacity ladder and motion are the console's own.
- Sticky rows (`filters`, day dividers) use opaque `--background`, since posts
  scroll underneath them.

An inverted pill uses `bg-brand-black text-background`, not `text-white` —
`--brand-black` maps to the foreground and flips in dark mode.

## Motion

Motion is **presence, not decoration**. Short, easing toward rest:

| Token | Behavior |
|---|---|
| `animate-fade-in` | 300ms ease-out, 6px rise |
| `animate-fade-in-scale` | 250ms, 0.97 → 1 |
| `slide-up` | 500ms cubic-bezier(0.16, 1, 0.3, 1) |
| `stagger-children` | 50ms delay steps for list mounts |
| `animate-soft-pulse` | 2s opacity pulse for live indicators |

Route mounts wrap content in `PageTransition` so every navigation shares the same entrance.

---

## Data visualization

Held in [`src/components/charts.tsx`](src/components/charts.tsx):

- 2px stroke weight; ≥8px hover markers  
- 2px gaps between adjacent fills; 4px rounded bar ends  
- Legend whenever two or more series are present  
- Recessive grid/axis colors; hover crosshair or highlight on every plotted form  
- Optional left accent bar on `Stat` tiles using a series color — never status colors for series

---

## Component map

| Need | Prefer |
|---|---|
| App chrome | `Shell` / `AppShell`, `PageBody` |
| Page intro | `PageTitle` (eyebrow + H1 + help tooltip + actions) |
| Panel | `Card` + `SectionHeader` from `@/components/ui` |
| Metric | `Stat` from `@/components/charts` |
| Status chip | `Badge` from `@/components/ui` |
| Tabs | `PillTabList` |
| Empty / load | `Empty`, `Skeleton`, `Spinner` |
| Triage suggestions | `MemoryReviewDeck` / `useMemoryReview` — swipe-or-click card deck for inferred memories |
| Theme | `ThemeToggle` |

Icons: Lucide via [`src/components/icons.tsx`](src/components/icons.tsx). Keep stroke weight consistent; icon wells use soft brand-black fills, not colored backgrounds.

---

## Do / don't

**Do**

- Lead with the noun (Memories, Documents, Ask)  
- Use uppercase micro-labels for category and status  
- Keep chrome monochrome; spend color on meaning  
- Match existing radii and the soft shadow recipe when adding panels  
- Explain complexity in tooltips, not long page blurbs  

**Don't**

- Introduce purple / indigo / glow marketing aesthetics  
- Use series colors for success/error or status colors for chart series  
- Add dense card grids for their own sake on content pages  
- Overpower the Lexend Exa brand mark with a louder display font  
- Animate without an exit-to-rest ease, or ignore reduced-motion  

---

## Source of truth

| Concern | File |
|---|---|
| Living reference for all of the below | `npm run storybook` — config in `.storybook/`, stories in `src/components/**/*.stories.tsx` and `src/stories/` |
| Tokens, glass, motion, label utility | `src/app/globals.css` |
| Brand font + theme boot | `src/app/layout.tsx` |
| Nav IA + page chrome | `src/components/shell.tsx` |
| Shell layout | `src/components/layouts/app-shell.tsx` |
| Shared UI (`Card`, `Badge`, `Empty`, …) | `src/components/ui/index.tsx` |
| Live blocks (empty, tabs, theme, page header) | `src/components/blocks/*` |
| Charts + series rules | `src/components/charts.tsx` |
| Status color mapping | `src/lib/format.ts` |
