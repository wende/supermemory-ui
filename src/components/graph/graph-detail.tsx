"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Button, Copyable } from "@/components/ui";
import { NODE_COLOR, tokenCssVar } from "@/lib/graph/palette";
import type { ColorGroup } from "@/lib/graph/types";
import { relTime } from "@/lib/format";
import type { GraphNode, MemoryEntry } from "@/lib/types";

/** Shared with GraphCanvas fit insets so selection framing tracks the panel. */
export const DETAIL_PANEL_WIDTH = 320;
/** Outer offset from the canvas edge (`top/right/bottom-3` = 12px). */
export const DETAIL_PANEL_GUTTER = 12;

export function GraphDetail({
  selected,
  detail,
  colorGroup,
  localActive,
  onEnterLocal,
  onClose,
}: {
  selected: GraphNode;
  detail: MemoryEntry | null;
  colorGroup: ColorGroup | null;
  localActive: boolean;
  onEnterLocal: () => void;
  onClose: () => void;
}) {
  const swatch = colorGroup
    ? tokenCssVar(colorGroup.token)
    : selected.forgotten
      ? "var(--muted-foreground)"
      : NODE_COLOR[selected.kind];

  return (
    <aside
      className="absolute overflow-y-auto rounded-xl border border-brand-black/[0.05] bg-background/92"
      style={{
        top: DETAIL_PANEL_GUTTER,
        right: DETAIL_PANEL_GUTTER,
        bottom: DETAIL_PANEL_GUTTER,
        width: `min(calc(100% - ${DETAIL_PANEL_GUTTER * 2}px), ${DETAIL_PANEL_WIDTH}px)`,
      }}
    >
      <div className="border-b border-brand-black/[0.06] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: swatch }} />
            <span className="label truncate">
              {colorGroup
                ? colorGroup.label ?? colorGroup.query
                : selected.forgotten
                  ? "forgotten memory"
                  : selected.kind}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring inline-flex size-6 items-center justify-center rounded-full text-brand-black/40 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black/70"
          >
            <Icon.forget size={14} />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-brand-black/70">
          {selected.label}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <Copyable value={selected.id} className="text-brand-black/40" />

        {detail && (
          <>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-[11px] text-brand-black/35">
                v{detail.version}
              </span>
              {detail.isStatic && <Badge tone="s3">asserted</Badge>}
              {detail.isInference && <Badge tone="s2">inferred</Badge>}
              {detail.isForgotten && <Badge tone="critical">forgotten</Badge>}
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-brand-black/40">Updated</dt>
                <dd className="text-brand-black/70">{relTime(detail.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-black/40">Sources</dt>
                <dd className="text-brand-black/70 tnum">{detail.sourceCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-black/40">Relations</dt>
                <dd className="text-brand-black/70 tnum">
                  {detail.memoryRelations?.length ?? 0}
                </dd>
              </div>
            </dl>
            {detail.isForgotten && detail.forgetReason && (
              <p className="rounded-lg border border-brand-black/[0.06] bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-brand-black/55">
                {detail.forgetReason}
              </p>
            )}
          </>
        )}

        {!localActive && (
          <Button size="sm" className="w-full" onClick={onEnterLocal}>
            <Icon.crosshair size={13} />
            Local graph
          </Button>
        )}

        {selected.kind === "memory" && (
          <Link href={`/memories?q=${encodeURIComponent(selected.label)}`}>
            <Button size="sm" className="w-full">
              <Icon.memory size={13} />
              Open in memory bank
            </Button>
          </Link>
        )}
        {selected.kind === "document" && (
          <Link href={`/documents?doc=${selected.id}`}>
            <Button size="sm" className="w-full">
              <Icon.document size={13} />
              Open document
            </Button>
          </Link>
        )}
        {selected.kind === "space" && (
          <Link href={`/spaces?tag=${selected.id}`}>
            <Button size="sm" className="w-full">
              <Icon.space size={13} />
              Open space
            </Button>
          </Link>
        )}
      </div>
    </aside>
  );
}
