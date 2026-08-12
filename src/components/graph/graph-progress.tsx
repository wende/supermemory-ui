"use client";

import { cn } from "@/lib/utils";

export type GraphPhase = "fetching" | "layout";

/**
 * Build progress for the graph.
 *
 * Fetching pages the memory corpus and reports loaded/total. Layout settles
 * across animation frames and reports ticks. The canvas paints underneath
 * once data exists, so the meter sits over a graph that is visibly
 * assembling — not a spinner over a blank panel.
 */
export function GraphProgress({
  phase,
  completed = 0,
  total = 0,
  nodes,
  className,
}: {
  phase: GraphPhase;
  /** Units completed in the current phase (memories loaded, or settle ticks). */
  completed?: number;
  total?: number;
  /** Node count being laid out. */
  nodes?: number;
  className?: string;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  // Coarsened to 2% steps so the aria-live region only announces on
  // meaningful progress changes, not every settle tick or fetched page.
  const pct = Math.round(ratio * 50) * 2;

  const label =
    phase === "fetching"
      ? total > 0
        ? `Loading memories · ${completed.toLocaleString()} / ${total.toLocaleString()}`
        : "Loading memories"
      : nodes
        ? `Building layout · ${nodes.toLocaleString()} nodes`
        : "Building layout";

  return (
    <div
      className={cn(
        "graph-progress pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4",
        className,
      )}
    >
      <div
        className="flex w-full max-w-xs flex-col gap-1.5 rounded-lg border border-brand-black/[0.06] bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-label={`${label}, ${pct}% complete`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="label truncate text-brand-black/70">{label}</span>
          <span className="tnum shrink-0 text-[11px] text-brand-black/45">
            {pct}%
          </span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-brand-black/[0.08]"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-brand-black/45 transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
