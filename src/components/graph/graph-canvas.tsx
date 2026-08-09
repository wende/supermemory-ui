"use client";

import { useEffect, useRef } from "react";
import { quadtree as d3Quadtree, type Quadtree } from "d3-quadtree";
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import type { Simulation } from "d3-force";
import {
  DETAIL_PANEL_GUTTER,
  DETAIL_PANEL_WIDTH,
} from "@/components/graph/graph-detail";
import { readPalette, type ThemePalette } from "@/lib/graph/palette";
import {
  buildSimLinks,
  buildSimNodes,
  createSimulation,
  freezeLayout,
  graphTopologyKey,
  isAdditiveChange,
  nodeRadius,
  preSettle,
  unfreezeLayout,
  writePositions,
} from "@/lib/graph/layout";
import { compileColorGroups, resolveCompiledGroup } from "@/lib/graph/query";
import {
  buildSpaceBlobs,
  traceSmoothHull,
  withAlpha,
} from "@/lib/graph/space-blobs";
import { tokenForSpaceIndex } from "@/lib/graph/space-colors";
import type { ColorGroup, ColorToken, GraphSettings, PositionMap, SimLink, SimNode } from "@/lib/graph/types";
import type { GraphEdge, GraphResponse } from "@/lib/types";

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
 * Documents are squircles (superellipse n=4) so they read apart from
 * circular memory nodes — not sharp squares, not circles.
 */
function pathNodeDisk(
  ctx: CanvasRenderingContext2D,
  kind: SimNode["kind"],
  x: number,
  y: number,
  r: number,
): void {
  if (kind !== "document") {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const n = 4;
  const steps = 48;
  ctx.beginPath();
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

export function GraphCanvas({
  data,
  settings,
  spaceTokens,
  selectedId,
  onSelect,
  onHoverChange,
  fitRef,
}: {
  data: GraphResponse;
  settings: GraphSettings;
  /** Full-corpus space → token map so filters don't reshuffle territories. */
  spaceTokens?: Map<string, ColorToken>;
  selectedId: string | null;
  onSelect: (node: SimNode | null) => void;
  onHoverChange?: (info: HoverInfo | null) => void;
  fitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<PositionMap>(new Map());
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const paletteRef = useRef<ThemePalette | null>(null);
  const settingsRef = useRef(settings);
  const spaceTokensRef = useRef(spaceTokens);
  const dataRef = useRef(data);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHoverChange);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const topoKeyRef = useRef<string>("");
  const byIdRef = useRef<Map<string, SimNode>>(new Map());
  const byIdNodesRef = useRef<SimNode[] | null>(null);
  const spaceBlobCacheRef = useRef<{
    nodes: SimNode[];
    sig: string;
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
      if (ix.current.dirty || ix.current.simActive) {
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

  const applyForcesFromSettings = () => {
    const sim = simRef.current;
    if (!sim) return;
    const s = settingsRef.current;
    const charge = sim.force("charge") as ReturnType<typeof import("d3-force").forceManyBody> | null;
    const fx = sim.force("x") as ReturnType<typeof import("d3-force").forceX> | null;
    const fy = sim.force("y") as ReturnType<typeof import("d3-force").forceY> | null;
    const link = sim.force("link") as ReturnType<typeof import("d3-force").forceLink<SimNode, SimLink>> | null;
    charge?.strength(-s.repelForce * 300);
    fx?.strength(s.centerForce * 0.05);
    fy?.strength(s.centerForce * 0.05);
    if (link) {
      const baseDist = 50 + s.linkDistance * 80;
      link.distance((l) => {
        const rel = (l as SimLink).relation;
        const REST: Record<string, number> = {
          contains: 1.5,
          sources: 1,
          extends: 0.85,
          derives: 0.85,
          updates: 0.85,
        };
        return baseDist * (REST[rel] ?? 1);
      });
      link.strength((l) => {
        const src = l.source as SimNode;
        const tgt = l.target as SimNode;
        const degNorm =
          1 / Math.max(1, Math.min(src.degree || 1, tgt.degree || 1));
        const STIFF: Record<string, number> = {
          // Hidden membership edges should not pull every node into a star.
          contains: s.showContainsEdges ? 0.28 : 0,
          sources: 1,
          extends: 1,
          derives: 1,
          updates: 1,
        };
        return degNorm * s.linkForce * (STIFF[(l as SimLink).relation] ?? 1);
      });
    }
    for (const n of nodesRef.current) {
      n.r = nodeRadius(n, n.degree, s.nodeSize);
    }
    refreshMaxRadius(nodesRef.current);
    unfreezeLayout(nodesRef.current);
    // Nudge rather than scramble — slider tweaks should settle quickly.
    sim.alpha(0.12).restart();
    ix.current.simActive = true;
    requestDraw();
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

    if (opts?.animate) animateToTransform(t, 220);
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
      const needRebuild =
        !cache ||
        cache.nodes !== nodes ||
        cache.sig !== tokenSig ||
        ix.current.simActive;
      if (needRebuild) {
        spaceBlobCacheRef.current = {
          nodes,
          sig: tokenSig,
          blobs: buildSpaceBlobs(
            nodes,
            (id) => tokenBySpace.get(id) ?? "s1",
            36,
          ),
        };
      }
      const blobs = spaceBlobCacheRef.current!.blobs;

      for (const blob of blobs) {
        const base = palette[blob.token] ?? palette.s1;
        // One fill + gaussian blur → smooth fringe without stacked darkening.
        // Blur is in screen px so the edge stays soft at any zoom.
        ctx.save();
        ctx.filter = `blur(${Math.max(8, 14 / Math.max(0.35, t.k))}px)`;
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

    for (const n of nodes) {
      if (n.x < worldL - nm || n.x > worldR + nm || n.y < worldT - nm || n.y > worldB + nm) {
        continue;
      }
      const dim = activeId ? !neighbours.has(n.id) : false;
      ctx.globalAlpha = dim ? 0.16 : 1;

      let color = n.forgotten ? palette.forgotten : palette[n.kind];
      if (n.groupToken && palette[n.groupToken]) {
        color = palette[n.groupToken];
      }

      pathNodeDisk(ctx, n.kind, n.x, n.y, n.r + 2 / t.k);
      ctx.fillStyle = palette.card;
      ctx.fill();

      pathNodeDisk(ctx, n.kind, n.x, n.y, n.r);
      if (n.forgotten) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4 / t.k;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (n.pinned) {
        pathNodeDisk(ctx, n.kind, n.x, n.y, n.r + 3.5 / t.k);
        ctx.strokeStyle = palette.foreground;
        ctx.lineWidth = 1.2 / t.k;
        ctx.setLineDash([2 / t.k, 2 / t.k]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (n.id === ix.current.selectedId) {
        pathNodeDisk(ctx, n.kind, n.x, n.y, n.r + 5 / t.k);
        ctx.strokeStyle = palette.foreground;
        ctx.lineWidth = 1.5 / t.k;
        ctx.stroke();
      }

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

    writePositions(nodes, positionsRef.current);
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

    simRef.current?.stop();
    const sim = createSimulation(nodes, links, settingsRef.current);
    simRef.current = sim;

    const finishStatic = () => {
      freezeLayout(nodesRef.current);
      writePositions(nodesRef.current, positionsRef.current);
      ix.current.simActive = false;
      ix.current.quadStale = true;
      rebuildQuad(nodesRef.current);
      requestDraw();
    };

    sim.on("tick", () => {
      ix.current.simActive = true;
      // Positions moved; the next hit-test needs a fresh index.
      ix.current.quadStale = true;
      requestDraw();
    });
    sim.on("end", finishStatic);

    // Full re-layout when the visible set changes structurally; freeze when done.
    // Additive growth gets a short settle so new nodes can find a home.
    if (!additive || positionsRef.current.size === 0) {
      unfreezeLayout(nodes);
      preSettle(sim, nodes.length);
      finishStatic();
      sim.stop();
    } else {
      unfreezeLayout(nodes);
      sim.alpha(0.12).restart();
      ix.current.simActive = true;
    }

    if (!additive || grew || positionsRef.current.size === 0) {
      requestAnimationFrame(() => {
        const id = selectedRef.current;
        if (id) fitSelection(id);
        else fitView();
      });
    }

    ix.current.quad = null;
    ix.current.quadStale = true;
    requestDraw();
    return () => {
      sim.stop();
      sim.on("tick", null);
      sim.on("end", null);
    };
    // showContainsEdges changes membership of force links; other settings
    // are handled by the force / display effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings.showContainsEdges]);

  /* Force slider changes — brief re-layout, then freeze again.
   * showContainsEdges is intentionally omitted: the topology effect above
   * already rebuilds link membership and settles. */
  useEffect(() => {
    if (!simRef.current) return;
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
      simRef.current?.stop();
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
