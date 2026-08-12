"use client";

import { useEffect, useRef } from "react";
import { quadtree as d3Quadtree, type Quadtree } from "d3-quadtree";
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import {
  DETAIL_PANEL_GUTTER,
  DETAIL_PANEL_WIDTH,
} from "@/components/graph/graph-detail";
import { readPalette, type ThemePalette } from "@/lib/graph/palette";
import {
  buildSimLinks,
  buildSimNodes,
  graphTopologyKey,
  isAdditiveChange,
  nodeRadius,
  settleTicks,
  writePositions,
} from "@/lib/graph/layout";
import {
  warmTicks,
  type LayoutLinkInput,
  type LayoutNodeInput,
  type LayoutProgress,
} from "@/lib/graph/layout-engine";
import { LayoutRunner } from "@/lib/graph/layout-runner";
import { compileColorGroups, resolveCompiledGroup } from "@/lib/graph/query";
import {
  buildSpaceBlobs,
  traceSmoothHull,
  withAlpha,
} from "@/lib/graph/space-blobs";
import { tokenForSpaceIndex } from "@/lib/graph/space-colors";
import type { ColorGroup, ColorToken, GraphSettings, PositionMap, SimLink, SimNode } from "@/lib/graph/types";
import type { GraphEdge, GraphResponse } from "@/lib/types";

/**
 * Intermediate frames drawn while a layout settles — enough to watch the graph
 * take shape, few enough that redrawing does not outweigh the settle itself.
 */
const LAYOUT_PREVIEW_FRAMES = 8;

/** Above this, zoom fits jump instead of tweening — see `fitToNodes`. */
const FIT_ANIMATE_MAX_NODES = 1500;

/** Layout progress, for the host to render while the graph builds. */
export type LayoutStatus = {
  active: boolean;
  /** Settle ticks completed / budgeted. */
  completed: number;
  total: number;
  /** Nodes being laid out. */
  nodes: number;
};

export type HoverInfo = {
  id: string;
  label: string;
  kind: SimNode["kind"];
  forgotten?: boolean;
  degree: number;
  groupLabel?: string | null;
  groupToken?: ColorGroup["token"] | null;
};

type Interaction = {
  hoverId: string | null;
  selectedId: string | null;
  transform: ZoomTransform;
  pointerDownOnNode: boolean;
  downX: number;
  downY: number;
  touchWorld: { x: number; y: number } | null;
  quad: Quadtree<SimNode> | null;
  quadStale: boolean;
  maxRadius: number;
  dirty: boolean;
  raf: number;
  simActive: boolean;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const edgeBatchKey = (
  relation: GraphEdge["relation"],
  color: string,
  width: number,
  dash: string,
  dimmed: boolean,
) => `${relation}|${color}|${width}|${dash}|${dimmed ? 1 : 0}`;

/** Trim a segment to node rims; tip is mid-edge for directed relations. */
function trimSegmentToRim(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): { x1: number; y1: number; x2: number; y2: number; tipX: number; tipY: number; angle: number } | null {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return null;
  const ux = dx / dist;
  const uy = dy / dist;
  const start = ar + 1;
  const end = br + 1;
  if (dist <= start + end + 2) return null;
  const x1 = ax + ux * start;
  const y1 = ay + uy * start;
  const x2 = bx - ux * end;
  const y2 = by - uy * end;
  return {
    x1,
    y1,
    x2,
    y2,
    tipX: (x1 + x2) / 2,
    tipY: (y1 + y2) / 2,
    angle: Math.atan2(uy, ux),
  };
}

function paintArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - size * Math.cos(angle - Math.PI / 7),
    tipY - size * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    tipX - size * Math.cos(angle + Math.PI / 7),
    tipY - size * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Add a node outline to the current path — no `beginPath`, so many nodes can
 * share one path and be filled in a single call.
 *
 * Documents are squircles (superellipse n=4) so they read apart from circular
 * memory nodes — not sharp squares, not circles. The segment count follows the
 * node's on-screen size: a squircle three pixels wide gains nothing from 48
 * segments, and there can be hundreds of them.
 */
function traceNodeDisk(
  ctx: CanvasRenderingContext2D,
  kind: SimNode["kind"],
  x: number,
  y: number,
  r: number,
  screenScale: number,
): void {
  if (kind !== "document") {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const n = 4;
  const screenR = r * screenScale;
  const steps = Math.max(8, Math.min(48, Math.ceil(screenR * 2)));
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const px = x + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const py = y + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Single-node convenience for the decoration rings. */
function pathNodeDisk(
  ctx: CanvasRenderingContext2D,
  kind: SimNode["kind"],
  x: number,
  y: number,
  r: number,
  screenScale: number,
): void {
  ctx.beginPath();
  traceNodeDisk(ctx, kind, x, y, r, screenScale);
}

export function GraphCanvas({
  data,
  settings,
  spaceTokens,
  selectedId,
  onSelect,
  onHoverChange,
  onLayoutStatus,
  fitRef,
}: {
  data: GraphResponse;
  settings: GraphSettings;
  /** Full-corpus space → token map so filters don't reshuffle territories. */
  spaceTokens?: Map<string, ColorToken>;
  selectedId: string | null;
  onSelect: (node: SimNode | null) => void;
  onHoverChange?: (info: HoverInfo | null) => void;
  onLayoutStatus?: (status: LayoutStatus) => void;
  fitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<PositionMap>(new Map());
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const runnerRef = useRef<LayoutRunner | null>(null);
  /** Tick count at the last preview repaint, for the settle frame budget. */
  const lastLayoutPaintRef = useRef(0);
  const paletteRef = useRef<ThemePalette | null>(null);
  const settingsRef = useRef(settings);
  const spaceTokensRef = useRef(spaceTokens);
  const dataRef = useRef(data);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHoverChange);
  const onLayoutStatusRef = useRef(onLayoutStatus);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const topoKeyRef = useRef<string>("");
  const byIdRef = useRef<Map<string, SimNode>>(new Map());
  const byIdNodesRef = useRef<SimNode[] | null>(null);
  const spaceBlobCacheRef = useRef<{
    nodes: SimNode[];
    sig: string;
    /** Rebuild timestamp, for the refresh budget during a settle. */
    at: number;
    blobs: ReturnType<typeof buildSpaceBlobs>;
  } | null>(null);
  const ix = useRef<Interaction>({
    hoverId: null,
    selectedId: null,
    transform: zoomIdentity,
    pointerDownOnNode: false,
    downX: 0,
    downY: 0,
    touchWorld: null,
    quad: null,
    quadStale: true,
    maxRadius: 0,
    dirty: true,
    raf: 0,
    simActive: false,
  });

  settingsRef.current = settings;
  spaceTokensRef.current = spaceTokens;
  dataRef.current = data;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;
  onHoverRef.current = onHoverChange;
  onLayoutStatusRef.current = onLayoutStatus;
  ix.current.selectedId = selectedId;

  const drawImplRef = useRef<() => void>(() => {});
  const requestDrawRef = useRef<() => void>(() => {});
  requestDrawRef.current = () => {
    ix.current.dirty = true;
    if (ix.current.raf) return;
    ix.current.raf = requestAnimationFrame(() => {
      ix.current.raf = 0;
      try {
        drawImplRef.current();
      } catch (err) {
        console.error("[graph-canvas] draw failed", err);
      }
      // Only chase the next frame when something still wants painting. This
      // used to also spin for the whole of `simActive`, which pinned the
      // renderer at full rate for the entire settle.
      if (ix.current.dirty) {
        requestDrawRef.current();
      }
    });
  };
  const requestDraw = () => requestDrawRef.current();

  /** Cached so hit-testing does not rescan every node on each pointer move. */
  const refreshMaxRadius = (nodes: SimNode[]) => {
    let max = 0;
    for (const n of nodes) max = Math.max(max, n.r);
    ix.current.maxRadius = max;
  };

  const ensureRunner = () => {
    if (!runnerRef.current) runnerRef.current = new LayoutRunner();
    return runnerRef.current;
  };

  const rebuildQuad = (nodes: SimNode[]) => {
    if (!ix.current.quadStale && ix.current.quad) return;
    ix.current.quadStale = false;
    ix.current.quad = d3Quadtree<SimNode>()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(nodes);
  };

  const pick = (wx: number, wy: number): SimNode | null => {
    const nodes = nodesRef.current;
    if (!nodes.length) return null;
    rebuildQuad(nodes);
    const tree = ix.current.quad;
    if (!tree) return null;

    // Screen-constant padding so small nodes stay easy to hit when zoomed out.
    const pad = Math.max(3, 6 / Math.max(0.001, ix.current.transform.k));
    const searchR = ix.current.maxRadius + pad;

    let best: SimNode | null = null;
    let bestKey = Infinity;
    tree.visit((quad, x1, y1, x2, y2) => {
      if (quad.length) {
        return (
          x1 > wx + searchR ||
          y1 > wy + searchR ||
          x2 < wx - searchR ||
          y2 < wy - searchR
        );
      }
      // Leaf: walk the collision list
      let leaf: typeof quad | null = quad;
      do {
        const n = leaf.data;
        if (n) {
          const d = Math.hypot(n.x - wx, n.y - wy);
          if (d <= n.r + pad) {
            // Prefer smaller nodes when overlapping (memory over space hub).
            const key = n.r * 1e6 + d;
            if (key < bestKey) {
              best = n;
              bestKey = key;
            }
          }
        }
        leaf = leaf.next ?? null;
      } while (leaf);
      return false;
    });
    return best;
  };

  const screenToWorld = (sx: number, sy: number) => {
    const t = ix.current.transform;
    return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
  };

  const reportLayoutStatus = (status: LayoutStatus) => {
    onLayoutStatusRef.current?.(status);
  };

  /** Copy a settle snapshot onto the live nodes and repaint. */
  const applyLayoutProgress = (p: LayoutProgress, onDone?: () => void) => {
    const nodes = nodesRef.current;
    // Snapshots are index-aligned with the set that was submitted; a length
    // mismatch means the topology moved on and this snapshot is stale.
    if (p.x.length !== nodes.length) return;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.pinned) continue;
      n.x = p.x[i]!;
      n.y = p.y[i]!;
    }
    ix.current.quadStale = true;
    ix.current.simActive = !p.done;

    // Repainting a large graph costs several times what a settle tick does —
    // and most of that is rasterisation, which JS timing cannot see, so a
    // wall-clock throttle silently lets a slow renderer spend the whole build
    // redrawing. Budgeting by progress instead bounds it at a fixed number of
    // intermediate frames on any machine. Status reports (which drive the
    // aria-live progress meter) ride the same gate, so a 90-tick settle on a
    // small graph doesn't fire 90 screen-reader announcements.
    const stride = Math.max(1, Math.ceil(p.total / LAYOUT_PREVIEW_FRAMES));
    const onStride = p.completed - lastLayoutPaintRef.current >= stride;

    if (p.done) {
      lastLayoutPaintRef.current = p.completed;
      reportLayoutStatus({
        active: false,
        completed: p.completed,
        total: p.total,
        nodes: nodes.length,
      });
      writePositions(nodes, positionsRef.current);
      rebuildQuad(nodes);
      onDone?.();
      requestDraw();
      return;
    }

    if (onStride) {
      lastLayoutPaintRef.current = p.completed;
      reportLayoutStatus({
        active: true,
        completed: p.completed,
        total: p.total,
        nodes: nodes.length,
      });
      requestDraw();
    }
  };

  /**
   * Hand the current node/link set to the layout runner and stream positions
   * back. `warm` keeps the existing arrangement and only relaxes it, which is
   * what slider tweaks and additive growth want.
   */
  const startLayout = (opts: { warm: boolean; onDone?: () => void }) => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    if (!nodes.length) {
      reportLayoutStatus({ active: false, completed: 0, total: 0, nodes: 0 });
      opts.onDone?.();
      return;
    }

    const payloadNodes: LayoutNodeInput[] = nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      r: n.r,
      degree: n.degree,
      spaceId: n.spaceId,
      fx: n.pinned ? n.x : null,
      fy: n.pinned ? n.y : null,
    }));
    const payloadLinks: LayoutLinkInput[] = links.map((l) => ({
      source: typeof l.source === "object" ? l.source.id : l.source,
      target: typeof l.target === "object" ? l.target.id : l.target,
      relation: l.relation,
    }));

    const total = opts.warm ? warmTicks(nodes.length) : settleTicks(nodes.length);
    lastLayoutPaintRef.current = 0;
    ix.current.simActive = true;
    reportLayoutStatus({
      active: true,
      completed: 0,
      total,
      nodes: nodes.length,
    });

    ensureRunner().run(
      {
        nodes: payloadNodes,
        links: payloadLinks,
        settings: settingsRef.current,
        ticks: total,
        alpha: opts.warm ? 0.3 : 1,
      },
      { onProgress: (p) => applyLayoutProgress(p, opts.onDone) },
    );
  };

  /**
   * Force sliders change the shape but not the membership, so the graph relaxes
   * from where it already is rather than being laid out from scratch.
   */
  const applyForcesFromSettings = () => {
    if (!nodesRef.current.length) return;
    const s = settingsRef.current;
    for (const n of nodesRef.current) {
      n.r = nodeRadius(n, n.degree, s.nodeSize);
    }
    refreshMaxRadius(nodesRef.current);
    startLayout({ warm: true });
  };

  const fitAnimRef = useRef<number | null>(null);

  /** Right inset matching GraphDetail panel width + gutters. */
  const detailInsetRight = () => {
    const wrap = wrapRef.current;
    if (!wrap || !selectedRef.current) return 0;
    const W = wrap.clientWidth;
    return Math.min(
      W * 0.55,
      DETAIL_PANEL_GUTTER + DETAIL_PANEL_WIDTH + DETAIL_PANEL_GUTTER,
    );
  };

  const cancelFitAnim = () => {
    if (fitAnimRef.current != null) {
      cancelAnimationFrame(fitAnimRef.current);
      fitAnimRef.current = null;
    }
  };

  const applyTransform = (t: ZoomTransform) => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    select(canvas).call(zoom.transform, t);
  };

  /** Smooth, short zoom/pan. Interrupted by a later fit or user gesture. */
  const animateToTransform = (target: ZoomTransform, durationMs = 220) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      durationMs = 0;
    }
    cancelFitAnim();
    if (durationMs <= 0) {
      applyTransform(target);
      return;
    }

    const start = ix.current.transform;
    const t0 = performance.now();
    const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / durationMs);
      const e = easeOutCubic(u);
      applyTransform(
        zoomIdentity
          .translate(
            start.x + (target.x - start.x) * e,
            start.y + (target.y - start.y) * e,
          )
          .scale(start.k + (target.k - start.k) * e),
      );
      if (u < 1) fitAnimRef.current = requestAnimationFrame(tick);
      else fitAnimRef.current = null;
    };
    fitAnimRef.current = requestAnimationFrame(tick);
  };

  const fitToNodes = (targets: SimNode[], opts?: { animate?: boolean }) => {
    const wrap = wrapRef.current;
    const zoom = zoomRef.current;
    if (!wrap || !zoom || !targets.length) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of targets) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = targets.length <= 12 ? 72 : 56;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const rightInset = detailInsetRight();
    const viewW = Math.max(1, W - rightInset);
    const k = Math.min(
      3,
      Math.max(0.05, Math.min((viewW - pad * 2) / w, (H - pad * 2) / h)),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Centre in the visible area left of the detail panel.
    const t = zoomIdentity
      .translate(viewW / 2 - cx * k, H / 2 - cy * k)
      .scale(k);

    // A tweened fit repaints the whole scene on every frame of the tween. Past
    // a few thousand nodes one repaint already overruns a frame, so the
    // "animation" degrades into a long stutter — jumping straight there is
    // both faster and calmer.
    const animate =
      opts?.animate && nodesRef.current.length <= FIT_ANIMATE_MAX_NODES;
    if (animate) animateToTransform(t, 220);
    else applyTransform(t);
  };

  const fitView = () => {
    fitToNodes(nodesRef.current, { animate: true });
  };

  const fitSelection = (id: string) => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    if (!byId.has(id)) {
      fitView();
      return;
    }
    const keep = new Set<string>([id]);
    for (const e of links) {
      const src = typeof e.source === "object" ? e.source.id : e.source;
      const tgt = typeof e.target === "object" ? e.target.id : e.target;
      if (src === id) keep.add(tgt);
      if (tgt === id) keep.add(src);
    }
    fitToNodes(
      nodes.filter((n) => keep.has(n.id)),
      { animate: true },
    );
  };

  if (fitRef) fitRef.current = fitView;

  function paint() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const W = Math.max(1, wrap.clientWidth);
    const H = Math.max(1, wrap.clientHeight);
    const dpr = Math.min(
      16384 / W,
      16384 / H,
      window.devicePixelRatio || 1,
    );
    const bw = Math.floor(W * dpr);
    const bh = Math.floor(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const nodes = nodesRef.current;
    const links = linksRef.current;
    if (byIdNodesRef.current !== nodes) {
      byIdRef.current = new Map(nodes.map((n) => [n.id, n]));
      byIdNodesRef.current = nodes;
      spaceBlobCacheRef.current = null;
    }
    const byId = byIdRef.current;
    const palette = paletteRef.current ?? readPalette(canvas);
    paletteRef.current = palette;
    const s = settingsRef.current;
    const t = ix.current.transform;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const worldL = -t.x / t.k;
    const worldT = -t.y / t.k;
    const worldR = (W - t.x) / t.k;
    const worldB = (H - t.y) / t.k;
    const nm = 60;
    const em = 100;

    const activeId = ix.current.hoverId ?? ix.current.selectedId;
    const neighbours = new Set<string>();
    if (activeId) {
      neighbours.add(activeId);
      for (const e of links) {
        const src = typeof e.source === "object" ? e.source.id : e.source;
        const tgt = typeof e.target === "object" ? e.target.id : e.target;
        if (src === activeId) neighbours.add(tgt);
        if (tgt === activeId) neighbours.add(src);
      }
      // Membership is on nodes via spaceId (no contains edges in live/mock data).
      const active = byId.get(activeId);
      if (active?.kind === "space") {
        for (const n of nodes) {
          if (n.spaceId === active.id) neighbours.add(n.id);
        }
      } else if (active?.spaceId) {
        neighbours.add(active.spaceId);
      }
    }

    /* Space territories — soft blobs behind edges + nodes */
    if (s.showSpaceBlobs && nodes.length) {
      const tokenBySpace = new Map<string, ColorToken>();
      const corpusTokens = spaceTokensRef.current;
      const spaceIds = Array.from(
        new Set(
          nodes.map((n) => (n.kind === "space" ? n.id : n.spaceId)).filter(Boolean),
        ),
      ).sort();
      spaceIds.forEach((id, i) => {
        tokenBySpace.set(
          id,
          corpusTokens?.get(id) ?? tokenForSpaceIndex(i),
        );
      });
      // Prefer tokens already resolved onto nodes (colour groups / space mode).
      for (const n of nodes) {
        if (n.groupToken && n.spaceId) tokenBySpace.set(n.spaceId, n.groupToken);
        if (n.kind === "space" && n.groupToken) tokenBySpace.set(n.id, n.groupToken);
      }

      const tokenSig = spaceIds
        .map((id) => `${id}:${tokenBySpace.get(id) ?? "s1"}`)
        .join("|");
      const cache = spaceBlobCacheRef.current;
      // Hulls cost ~17ms at 3k nodes — far too much to redo on every frame of
      // a settle, so while the layout is moving they refresh on a time budget
      // and the territories simply lag the nodes slightly.
      const nowMs = performance.now();
      const needRebuild =
        !cache ||
        cache.nodes !== nodes ||
        cache.sig !== tokenSig ||
        (ix.current.simActive && nowMs - cache.at > 250);
      if (needRebuild) {
        spaceBlobCacheRef.current = {
          nodes,
          sig: tokenSig,
          at: nowMs,
          blobs: buildSpaceBlobs(
            nodes,
            (id) => tokenBySpace.get(id) ?? "s1",
            36,
          ),
        };
      }
      const blobs = spaceBlobCacheRef.current!.blobs;

      // The blurred fringe is by far the most expensive thing on the canvas —
      // it rasterises a full-size gaussian per territory, which costs more per
      // frame than a settle tick does. During a settle the hulls are chasing
      // moving nodes anyway, so the fringe is dropped until the graph is still.
      const blurred = !ix.current.simActive;
      for (const blob of blobs) {
        const base = palette[blob.token] ?? palette.s1;
        // One fill + gaussian blur → smooth fringe without stacked darkening.
        // Blur is in screen px so the edge stays soft at any zoom.
        ctx.save();
        if (blurred) {
          ctx.filter = `blur(${Math.max(8, 14 / Math.max(0.35, t.k))}px)`;
        }
        traceSmoothHull(ctx, blob.hull, blob.pad);
        ctx.fillStyle = withAlpha(base, 0.11);
        ctx.fill();
        ctx.restore();
      }
    }

    const edgeStyle: Record<
      GraphEdge["relation"],
      { color: string; width: number; dash?: number[] }
    > = {
      contains: { color: palette.edgeContains, width: 1 },
      sources: { color: palette.edgeSources, width: 1, dash: [3, 3] },
      extends: { color: palette.edgeExtends, width: 1.35 },
      derives: { color: palette.edgeDerives, width: 1.35, dash: [5, 3] },
      updates: { color: palette.edgeUpdates, width: 1.6 },
    };

    const thickness = 0.6 + s.linkThickness * 1.2;
    const batches = new Map<
      string,
      { color: string; width: number; dash: number[]; dimmed: boolean; segs: number[] }
    >();
    type ArrowSeg = {
      tipX: number;
      tipY: number;
      angle: number;
      size: number;
      color: string;
      dimmed: boolean;
    };
    const arrows: ArrowSeg[] = [];

    for (const e of links) {
      if (e.relation === "contains" && !s.showContainsEdges) continue;
      const a = typeof e.source === "object" ? e.source : byId.get(e.source);
      const b = typeof e.target === "object" ? e.target : byId.get(e.target);
      if (!a || !b) continue;
      const bothOff =
        (a.x < worldL - em && b.x < worldL - em) ||
        (a.x > worldR + em && b.x > worldR + em) ||
        (a.y < worldT - em && b.y < worldT - em) ||
        (a.y > worldB + em && b.y > worldB + em);
      if (bothOff) continue;

      const style = edgeStyle[e.relation] ?? edgeStyle.contains;
      const lit = activeId
        ? (typeof e.source === "object" ? e.source.id : e.source) === activeId ||
          (typeof e.target === "object" ? e.target.id : e.target) === activeId
        : false;
      const dimmed = !!activeId && !lit;
      const width = (style.width * thickness) / t.k;
      const dash = (style.dash ?? []).map((d) => d / t.k);
      const directed =
        e.relation === "extends" || e.relation === "derives";
      // Always paint a line, even when there's no room for an arrowhead.
      let x1 = a.x;
      let y1 = a.y;
      let x2 = b.x;
      let y2 = b.y;
      let tipX = (a.x + b.x) / 2;
      let tipY = (a.y + b.y) / 2;
      let angle = Math.atan2(b.y - a.y, b.x - a.x);
      const seg = trimSegmentToRim(a.x, a.y, a.r, b.x, b.y, b.r);
      if (seg) {
        x1 = seg.x1;
        y1 = seg.y1;
        x2 = seg.x2;
        y2 = seg.y2;
        tipX = seg.tipX;
        tipY = seg.tipY;
        angle = seg.angle;
      }

      const key = edgeBatchKey(
        e.relation,
        style.color,
        width,
        dash.join(","),
        dimmed,
      );
      let batch = batches.get(key);
      if (!batch) {
        batch = { color: style.color, width, dash, dimmed, segs: [] };
        batches.set(key, batch);
      }
      batch.segs.push(x1, y1, x2, y2);

      if (directed && seg) {
        const size = Math.max(3.8, 4.8 * thickness) / t.k;
        // Centre the chevron on the midpoint (tip sits slightly toward the target).
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        arrows.push({
          tipX: tipX + ux * size * 0.35,
          tipY: tipY + uy * size * 0.35,
          angle,
          size,
          color: style.color,
          dimmed,
        });
      }
    }

    for (const batch of batches.values()) {
      ctx.globalAlpha = batch.dimmed ? 0.12 : 1;
      ctx.strokeStyle = batch.color;
      ctx.lineWidth = batch.width;
      ctx.lineCap = "round";
      ctx.setLineDash(batch.dash);
      ctx.beginPath();
      for (let i = 0; i < batch.segs.length; i += 4) {
        ctx.moveTo(batch.segs[i], batch.segs[i + 1]);
        ctx.lineTo(batch.segs[i + 2], batch.segs[i + 3]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const arrow of arrows) {
      ctx.globalAlpha = arrow.dimmed ? 0.12 : 1;
      paintArrowHead(ctx, arrow.tipX, arrow.tipY, arrow.angle, arrow.size, arrow.color);
    }
    ctx.globalAlpha = 1;

    const kOn = lerp(0.2, 3, s.textFade);
    const kOff = kOn * 1.6;
    const labelAlpha = smoothstep(kOn, kOff, t.k);

    type LabelCand = { n: SimNode; text: string; x: number; y: number; w: number; h: number };
    const labelCands: LabelCand[] = [];

    /* Nodes.
     *
     * Grouped into one path per (fill, dimmed) pair rather than a fill call
     * per node: at a few thousand nodes the per-call overhead dominated the
     * frame, and every pan, zoom and hover pays for a repaint. Halos are laid
     * down as a single pass underneath, which also stops one node's halo from
     * punching a hole in its neighbour.
     */
    type NodeBatch = { color: string; dimmed: boolean; stroke: boolean; nodes: SimNode[] };
    const nodeBatches = new Map<string, NodeBatch>();
    const haloed: { dimmed: boolean; nodes: SimNode[] }[] = [
      { dimmed: false, nodes: [] },
      { dimmed: true, nodes: [] },
    ];
    const decorated: SimNode[] = [];

    for (const n of nodes) {
      if (n.x < worldL - nm || n.x > worldR + nm || n.y < worldT - nm || n.y > worldB + nm) {
        continue;
      }
      const dim = activeId ? !neighbours.has(n.id) : false;

      let color = n.forgotten ? palette.forgotten : palette[n.kind];
      if (n.groupToken && palette[n.groupToken]) {
        color = palette[n.groupToken];
      }

      haloed[dim ? 1 : 0]!.nodes.push(n);
      const key = `${color}|${dim ? 1 : 0}|${n.forgotten ? 1 : 0}`;
      let batch = nodeBatches.get(key);
      if (!batch) {
        batch = { color, dimmed: dim, stroke: !!n.forgotten, nodes: [] };
        nodeBatches.set(key, batch);
      }
      batch.nodes.push(n);
      if (n.pinned || n.id === ix.current.selectedId) decorated.push(n);

      const alwaysLabel =
        n.kind === "space" || (!!activeId && neighbours.has(n.id));
      if (alwaysLabel || labelAlpha > 0.05) {
        const text =
          n.kind === "space"
            ? n.label
            : n.label.length > 46
              ? n.label.slice(0, 44) + "…"
              : n.label;
        const fontSize = (n.kind === "space" ? 12 : 10.5) / t.k;
        ctx.font = `${n.kind === "space" ? 600 : 400} ${fontSize}px system-ui, sans-serif`;
        const metrics = ctx.measureText(text);
        labelCands.push({
          n,
          text,
          x: n.x,
          y: n.y + n.r + 5 / t.k,
          w: metrics.width,
          h: fontSize,
        });
      }
    }

    // Halos first, then bodies, then the per-node decorations.
    ctx.fillStyle = palette.card;
    for (const layer of haloed) {
      if (!layer.nodes.length) continue;
      ctx.globalAlpha = layer.dimmed ? 0.16 : 1;
      ctx.beginPath();
      for (const n of layer.nodes) {
        traceNodeDisk(ctx, n.kind, n.x, n.y, n.r + 2 / t.k, t.k);
      }
      ctx.fill();
    }

    for (const batch of nodeBatches.values()) {
      ctx.globalAlpha = batch.dimmed ? 0.16 : 1;
      ctx.beginPath();
      for (const n of batch.nodes) {
        traceNodeDisk(ctx, n.kind, n.x, n.y, n.r, t.k);
      }
      if (batch.stroke) {
        ctx.strokeStyle = batch.color;
        ctx.lineWidth = 1.4 / t.k;
        ctx.stroke();
      } else {
        ctx.fillStyle = batch.color;
        ctx.fill();
      }
    }

    for (const n of decorated) {
      ctx.globalAlpha = activeId && !neighbours.has(n.id) ? 0.16 : 1;
      if (n.pinned) {
        pathNodeDisk(ctx, n.kind, n.x, n.y, n.r + 3.5 / t.k, t.k);
        ctx.strokeStyle = palette.foreground;
        ctx.lineWidth = 1.2 / t.k;
        ctx.setLineDash([2 / t.k, 2 / t.k]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (n.id === ix.current.selectedId) {
        pathNodeDisk(ctx, n.kind, n.x, n.y, n.r + 5 / t.k, t.k);
        ctx.strokeStyle = palette.foreground;
        ctx.lineWidth = 1.5 / t.k;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    labelCands.sort((a, b) => b.n.degree - a.n.degree);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const c of labelCands) {
      const always =
        c.n.kind === "space" || (!!activeId && neighbours.has(c.n.id));
      const alpha = always ? 1 : labelAlpha;
      if (alpha < 0.05) continue;
      const rect = {
        x: c.x - c.w / 2,
        y: c.y,
        w: c.w,
        h: c.h * 1.2,
      };
      const overlaps = placed.some(
        (p) =>
          !(
            rect.x + rect.w < p.x ||
            p.x + p.w < rect.x ||
            rect.y + rect.h < p.y ||
            p.y + p.h < rect.y
          ),
      );
      if (overlaps && !always) continue;
      placed.push(rect);
      ctx.globalAlpha = alpha * (activeId && !neighbours.has(c.n.id) ? 0.16 : 1);
      ctx.font = `${c.n.kind === "space" ? 600 : 400} ${c.h}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 3 / t.k;
      ctx.strokeStyle = palette.labelStroke;
      ctx.strokeText(c.text, c.x, c.y);
      ctx.fillStyle =
        c.n.kind === "space" ? palette.foreground : palette.ink70;
      ctx.fillText(c.text, c.x, c.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    // Positions are persisted when a settle finishes, not per frame: writing
    // 3k map entries every frame was pure overhead during a layout run.
    ix.current.dirty = false;
  }
  drawImplRef.current = paint;

  /* Theme palette */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const refresh = () => {
      paletteRef.current = readPalette(canvas);
      requestDraw();
    };
    refresh();
    const obs = new MutationObserver(refresh);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-accent"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => {
      obs.disconnect();
      mq.removeEventListener("change", refresh);
    };
  }, []);

  /* Keep canvas buffer in sync with layout size */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => requestDraw());
    ro.observe(wrap);
    requestDraw();
    return () => ro.disconnect();
  }, []);

  /* Build / rebuild simulation when graph topology changes */
  useEffect(() => {
    const nextKey = `${graphTopologyKey(data)}|contains:${settings.showContainsEdges ? 1 : 0}`;
    const nextIds = new Set(data.nodes.map((n) => n.id));
    const prevIds = prevIdsRef.current;
    const prevKey = topoKeyRef.current;
    const containsToggled =
      prevKey !== "" &&
      prevKey.endsWith("|contains:1") !== settings.showContainsEdges;
    const additive =
      !containsToggled && isAdditiveChange(prevIds, nextIds);
    const grew = nextIds.size > prevIds.size;
    const sameTopology = nextKey === prevKey && prevIds.size > 0;

    const groups = compileColorGroups(settingsRef.current.colorGroups);

    // Selection / highlight-only updates keep the same membership — do not re-sim.
    if (sameTopology) {
      for (const n of nodesRef.current) {
        const g = resolveCompiledGroup(groups, n, data.edges);
        n.groupId = g?.id ?? null;
        n.groupToken = g?.token ?? null;
      }
      requestDraw();
      return;
    }

    const nodes = buildSimNodes(data, settingsRef.current, positionsRef.current);
    const layoutEdges = settingsRef.current.showContainsEdges
      ? data.edges
      : data.edges.filter((e) => e.relation !== "contains");
    const links = buildSimLinks(layoutEdges);

    for (const n of nodes) {
      const g = resolveCompiledGroup(groups, n, data.edges);
      n.groupId = g?.id ?? null;
      n.groupToken = g?.token ?? null;
    }
    refreshMaxRadius(nodes);

    nodesRef.current = nodes;
    linksRef.current = links;
    prevIdsRef.current = nextIds;
    topoKeyRef.current = nextKey;

    // Every node already carries a settled position, so this is a filter or a
    // membership tweak rather than a new graph — relax it rather than pay for
    // a cold settle.
    const allSeeded =
      positionsRef.current.size > 0 &&
      nodes.every((n) => positionsRef.current.has(n.id));
    const shouldRefit =
      !additive || grew || positionsRef.current.size === 0;

    const refit = () => {
      const id = selectedRef.current;
      if (id) fitSelection(id);
      else fitView();
    };

    ix.current.quad = null;
    ix.current.quadStale = true;

    startLayout({
      warm: additive || allSeeded,
      onDone: shouldRefit ? refit : undefined,
    });

    // Frame the work in progress too, so a long settle is watchable instead of
    // a graph drifting off-screen until it finishes.
    if (shouldRefit) requestAnimationFrame(refit);

    requestDraw();
    // Deliberately no cleanup that cancels the run: this effect re-fires on
    // every new `data` identity, including ones that leave the topology
    // untouched and return early above. Cancelling there would abandon a
    // settle nothing restarts, freezing the graph part-built. Starting a run
    // already supersedes the previous one, and unmount disposes the runner.
    // showContainsEdges changes membership of force links; other settings
    // are handled by the force / display effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings.showContainsEdges]);

  /* Force slider changes — brief re-layout, then freeze again.
   * showContainsEdges is intentionally omitted: the topology effect above
   * already rebuilds link membership and settles. */
  const forcesReady = useRef(false);
  useEffect(() => {
    // On mount the topology effect above has just started a settle with these
    // very settings; relaxing again here would cancel it and leave the first
    // layout unfinished.
    if (!forcesReady.current) {
      forcesReady.current = true;
      return;
    }
    applyForcesFromSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.centerForce,
    settings.repelForce,
    settings.linkForce,
    settings.linkDistance,
    settings.nodeSize,
  ]);

  /* Display-only settings — redraw without moving nodes */
  useEffect(() => {
    const groups = compileColorGroups(settings.colorGroups);
    for (const n of nodesRef.current) {
      const g = resolveCompiledGroup(groups, n, dataRef.current.edges);
      n.groupId = g?.id ?? null;
      n.groupToken = g?.token ?? null;
      n.r = nodeRadius(n, n.degree, settings.nodeSize);
    }
    refreshMaxRadius(nodesRef.current);
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.linkThickness,
    settings.textFade,
    settings.colorGroups,
    settings.showContainsEdges,
    settings.showSpaceBlobs,
    spaceTokens,
  ]);

  /* Selection highlight + frame focus / restore */
  const selectedFitReady = useRef(false);
  useEffect(() => {
    requestDraw();
    // Skip the initial null selection so first layout's own fitView wins.
    if (!selectedFitReady.current) {
      selectedFitReady.current = true;
      if (!selectedId) return;
    }
    requestAnimationFrame(() => {
      if (selectedId) fitSelection(selectedId);
      else fitView();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* Zoom behaviour */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoom = d3Zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 8])
      .filter((event) => {
        // No double-click zoom — selection owns click/focus.
        if (event.type === "dblclick") return false;
        if (event.type === "wheel") return true;
        if (ix.current.pointerDownOnNode) return false;
        // Allow touch / pointer pan when not on a node
        return !event.ctrlKey;
      })
      .on("zoom", (event) => {
        // User pan/wheel supersedes a programmatic fit animation.
        if (event.sourceEvent) cancelFitAnim();
        ix.current.transform = event.transform;
        requestDraw();
      });

    zoomRef.current = zoom;
    const sel = select(canvas);
    sel.call(zoom);
    // d3-zoom enables dblclick zoom by default; remove it explicitly.
    sel.on("dblclick.zoom", null);
    // Start centred
    const wrap = wrapRef.current;
    if (wrap) {
      const t = zoomIdentity.translate(wrap.clientWidth / 2, wrap.clientHeight / 2);
      sel.call(zoom.transform, t);
    }

    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  /* Pointer handlers */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setHover = (n: SimNode | null) => {
      const id = n?.id ?? null;
      if (id === ix.current.hoverId) return;
      ix.current.hoverId = id;
      if (n) {
        const g = settingsRef.current.colorGroups.find((x) => x.id === n.groupId);
        onHoverRef.current?.({
          id: n.id,
          label: n.label,
          kind: n.kind,
          forgotten: n.forgotten,
          degree: n.degree,
          groupLabel: g ? g.label ?? g.query : null,
          groupToken: n.groupToken ?? null,
        });
      } else {
        onHoverRef.current?.(null);
      }
      requestDraw();
    };

    // Hover is mouse-only. Touch/pen "hover" thrash the highlight + readout
    // while panning, and leave sticky state after a tap — nonsense on mobile.
    const hoverCapable = window.matchMedia("(hover: hover)").matches;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") setHover(null);

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = screenToWorld(sx, sy);
      const n = pick(x, y);
      ix.current.pointerDownOnNode = !!n;
      ix.current.touchWorld = { x, y };
      ix.current.downX = e.clientX;
      ix.current.downY = e.clientY;
      if (n) {
        // Block pan/zoom start so a click can select without moving the view.
        e.stopPropagation();
        canvas.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!hoverCapable || e.pointerType !== "mouse") return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = screenToWorld(sx, sy);
      setHover(pick(x, y));
    };

    const onPointerUp = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = ix.current.touchWorld ?? screenToWorld(sx, sy);
      const moved =
        Math.hypot(e.clientX - ix.current.downX, e.clientY - ix.current.downY) > 4;

      if (!moved) {
        const n = pick(world.x, world.y);
        if (ix.current.pointerDownOnNode) {
          if (n) onSelectRef.current(n);
        } else if (!n) {
          onSelectRef.current(null);
        }
      }

      ix.current.pointerDownOnNode = false;
      ix.current.touchWorld = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    };

    const onPointerLeave = () => {
      setHover(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (ix.current.raf) {
        cancelAnimationFrame(ix.current.raf);
        ix.current.raf = 0;
      }
      runnerRef.current?.dispose();
      runnerRef.current = null;
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none cursor-default"
        role="img"
        aria-label={`Memory graph: ${data.nodes.length} nodes, ${data.edges.length} edges`}
      />
    </div>
  );
}
