"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { NODE_COLOR, tokenCssVar } from "@/lib/graph/palette";
import type { ColorGroup, ColorToken } from "@/lib/graph/types";
import type { GraphNodeKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const EDGE_LEGEND = [
  {
    label: "extends",
    color: "color-mix(in oklab, var(--brand-black) 42%, var(--s5) 12%)",
    dash: false,
    arrow: true,
  },
  {
    label: "derives",
    color: "color-mix(in oklab, var(--brand-black) 48%, transparent)",
    dash: true,
    arrow: true,
  },
  {
    label: "sourced from",
    color: "color-mix(in oklab, var(--s1) 16%, transparent)",
    dash: true,
    arrow: false,
  },
  {
    label: "in space",
    color: "color-mix(in oklab, var(--brand-black) 7%, transparent)",
    dash: false,
    arrow: false,
  },
] as const;

export type SpaceLegendItem = {
  id: string;
  label: string;
  token: ColorToken;
  count: number;
};

export function GraphLegend({
  counts,
  showForgotten,
  colorGroups,
  groupCounts,
  groupHeading = "Nodes",
  showContainsEdges = true,
  spaces,
  trailing,
}: {
  counts: Record<GraphNodeKind, number>;
  showForgotten: boolean;
  colorGroups: ColorGroup[];
  groupCounts: Record<string, number>;
  groupHeading?: string;
  showContainsEdges?: boolean;
  /** Territory colours when space blobs are on (and not using colour-by-space fills). */
  spaces?: SpaceLegendItem[];
  trailing?: React.ReactNode;
}) {
  const useGroups = colorGroups.length > 0;
  const showSpaceTerritories = !!spaces?.length && !useGroups;
  const edgeItems = showContainsEdges
    ? EDGE_LEGEND
    : EDGE_LEGEND.filter((e) => e.label !== "in space");
  const rowRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<HTMLDivElement>(null);
  const edgesRef = useRef<HTMLDivElement>(null);
  const [sameRow, setSameRow] = useState(true);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!row || !nodes || !edges) return;

    const update = () => {
      const aligned = Math.abs(nodes.offsetTop - edges.offsetTop) < 2;
      setSameRow((prev) => {
        if (!aligned) return false;
        if (prev) return true;
        return row.clientWidth - nodes.offsetWidth - edges.offsetWidth > 40;
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(row);
    return () => ro.disconnect();
  }, [
    useGroups,
    showForgotten,
    colorGroups.length,
    showSpaceTerritories,
    spaces?.length,
    edgeItems.length,
  ]);

  return (
    <div className="flex w-full items-center gap-3 border-t border-brand-black/[0.06] bg-background/90 px-3 py-2 backdrop-blur-sm sm:px-4">
      <div
        ref={rowRef}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5"
      >
        <div
          ref={nodesRef}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
        >
          {showSpaceTerritories && (
            <>
              <span className="label shrink-0">Spaces</span>
              <ul className="contents">
                {spaces!.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-1.5 text-[11px] text-brand-black/70"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-[3px] opacity-60"
                      style={{
                        background: `color-mix(in oklab, ${tokenCssVar(s.token)} 40%, transparent)`,
                      }}
                    />
                    <span className="max-w-[9rem] truncate">{s.label}</span>
                    <span className="tnum text-brand-black/40">{s.count}</span>
                  </li>
                ))}
              </ul>
              <span
                className="hidden h-3 w-px shrink-0 bg-brand-black/10 sm:block"
                aria-hidden
              />
            </>
          )}

          <span className="label shrink-0">
            {useGroups ? groupHeading : "Nodes"}
          </span>
          <ul className="contents">
            {useGroups
              ? colorGroups.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-1.5 text-[11px] text-brand-black/70"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: tokenCssVar(g.token) }}
                    />
                    <span className="max-w-[9rem] truncate">
                      {g.label ?? g.query}
                    </span>
                    <span className="tnum text-brand-black/40">
                      {groupCounts[g.id] ?? 0}
                    </span>
                  </li>
                ))
              : (["memory", "document"] as const).map((k) => (
                  <li
                    key={k}
                    className="flex items-center gap-1.5 text-[11px] text-brand-black/70"
                  >
                    <span
                      className={
                        k === "document"
                          ? "size-2 shrink-0 rounded-[3px]"
                          : "size-2 shrink-0 rounded-full"
                      }
                      style={{ background: NODE_COLOR[k] }}
                    />
                    <span className="capitalize">{k}</span>
                    <span className="tnum text-brand-black/40">{counts[k]}</span>
                  </li>
                ))}
            {showForgotten && (
              <li className="flex items-center gap-1.5 text-[11px] text-brand-black/70">
                <span className="size-2 shrink-0 rounded-full border border-[color:var(--muted-foreground)]" />
                Forgotten
              </li>
            )}
          </ul>
        </div>

        <span
          className={cn(
            "hidden h-3 w-px shrink-0 bg-brand-black/10 sm:block",
            !sameRow && "sm:hidden",
          )}
          aria-hidden
        />

        <div
          ref={edgesRef}
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
        >
          <span className="label shrink-0">Edges</span>
          <ul className="contents">
            {edgeItems.map((e) => (
              <li
                key={e.label}
                className="flex items-center gap-1.5 text-[11px] text-brand-black/70"
              >
                <svg width="20" height="8" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="20"
                    y2="4"
                    stroke={e.color}
                    strokeWidth="1.6"
                    strokeDasharray={e.dash ? "3 3" : undefined}
                  />
                  {e.arrow && (
                    <path
                      d="M8.2 1.8 L13.2 4 L8.2 6.2 Z"
                      fill={e.color}
                    />
                  )}
                </svg>
                {e.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
