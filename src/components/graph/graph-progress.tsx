"use client";

import { cn } from "@/lib/utils";

export type GraphPhase = "fetching" | "layout";

/**
 * Build progress for the graph.
 *
 * Laying out a few thousand nodes takes real time even off the main thread, so
 * the wait is reported rather than hidden: which phase is running, and how far
 * through it we are. The canvas paints the settle underneath, so this reads as
 * a progress meter over a graph that is visibly assembling — not a spinner over
 * a blank panel.
 */
export function GraphProgress({
  phase,
  completed,
  total,
  nodes,
  className,
}: {
  phase: GraphPhase;
  /** Ticks completed in the current settle. */
  completed?: number;
  total?: number;
  /** Node count being laid out. */
  nodes?: number;
  className?: string;
}) {
  const ratio =
    phase === "layout" && total && total > 0
      ? Math.min(1, Math.max(0, (completed ?? 0) / total))
      : null;
  const pct = ratio === null ? null : Math.round(ratio * 100);

  const label =
    phase === "fetching"
      ? "Loading memories"
      : nodes
        ? `Building layout · ${nodes.toLocaleString()} nodes`
        : "Building layout";

  return (
    <div
      className={cn(
        "graph-progress pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4",
        className,
      )}
    >
      <div
        className="flex w-full max-w-xs flex-col gap-1.5 rounded-lg border border-brand-black/[0.06] bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm"
        role="status"
        aria-live="polite"
        // The bar is decorative; this carries the same information for AT.
        aria-label={pct === null ? `${label}…` : `${label}, ${pct}% complete`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="label truncate text-brand-black/70">{label}</span>
          {pct !== null && (
            <span className="tnum shrink-0 text-[11px] text-brand-black/45">
              {pct}%
            </span>
          )}
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-brand-black/[0.08]"
          aria-hidden="true"
        >
          <div
            className={cn(
              "h-full rounded-full bg-brand-black/45",
              // Indeterminate phases have no ratio to show, so the bar sits at a
              // fixed sliver rather than implying a position it does not know.
              pct === null && "w-1/4 animate-pulse",
              pct !== null && "transition-[width] duration-150 ease-out",
            )}
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
