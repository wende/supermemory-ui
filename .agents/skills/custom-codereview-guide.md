---
name: custom-codereview-guide
description: Repo-specific review guidelines for supermemory-ui (accent themes, contrast, console chrome).
triggers:
  - /codereview
---

# supermemory-ui code review guidelines

Repo-specific rules for `/codereview`. These override generic accessibility
perfectionism when they conflict with intentional product decisions.

## Accent themes and contrast

TE Orange (`data-accent="te-orange"`) uses vivid hues for series, status
pills, badges, and destructive accents. Some pairings fall below a strict
WCAG AA **4.5:1** normal-text ratio (e.g. dark destructive `#ff2a32` on white
≈ 3.73:1; light ongoing pill ≈ 4.29:1; vivid `--s2` / `--s3` / `--s5` /
`--warning-status` as 11px Badge text on light surfaces).

**This is accepted.** Do **not** flag those ratios as Important/Critical, and
do **not** block merge on them. Prefer preserving brand chroma over darkening
text-safe tokens. Large body copy still uses neutral `--brand-black` /
surface tokens from `globals.css`, which carry readability.

If you mention contrast at all, treat it as a **Nit** or skip it. Do not
re-open previously declined contrast findings on later review runs unless
the author changed the tokens and introduced a new failure mode they asked to
revisit.

## Where this comes from

There is **no** WCAG / 4.5:1 requirement in this repository's `AGENTS.md`,
`DESIGN.md`, CI, or review workflow. The OpenHands `/codereview` skill
(`code-review` CRITICAL ANALYSIS FRAMEWORK) also does not require AA contrast
checks — earlier agentic reviews applied general WCAG knowledge on their own.
This guide records the maintainer decision so that does not keep failing the PR.
