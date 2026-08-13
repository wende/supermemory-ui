import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import type { GraphEdge, GraphNode, GraphResponse } from "@/lib/types";
import type { GraphSettings, PositionMap, SimLink, SimNode } from "./types";

/** Rest distance multipliers relative to sources (=1.0). */
export const REST: Record<GraphEdge["relation"], number> = {
  contains: 1.5,
  sources: 1.0,
  extends: 0.85,
  derives: 0.85,
  updates: 0.85,
};

/** Stiffness multipliers; contains is soft so space hubs don't dominate. */
export const STIFF: Record<GraphEdge["relation"], number> = {
  contains: 0.28,
  sources: 1,
  extends: 1,
  derives: 1,
  updates: 1,
};

export function nodeRadius(
  node: GraphNode,
  degree: number,
  nodeSize: number,
): number {
  const scale = 0.55 + nodeSize * 0.9;
  if (node.kind === "space") {
    return (11 + Math.min(8, Math.sqrt(degree) * 2.2)) * scale;
  }
  if (node.kind === "document") {
    return (4.2 + Math.min(4, Math.sqrt(degree) * 1.1)) * scale;
  }
  return (3.8 + Math.min(5, Math.sqrt(degree) * 1.2)) * scale;
}

/** Deterministic ring seeding — one sector per space, members scattered in it. */
export function seedPositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const spaceIds = Array.from(
    new Set(
      nodes
        .map((n) => (n.kind === "space" ? n.id : n.spaceId))
        .filter(Boolean),
    ),
  ).sort();
  const spaceAngle = new Map(
    spaceIds.map((id, i) => [
      id,
      (i / Math.max(1, spaceIds.length)) * Math.PI * 2,
    ]),
  );
  const out = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const sid = n.kind === "space" ? n.id : n.spaceId;
    const base = spaceAngle.get(sid) ?? 0;
    const isSpace = n.kind === "space";
    const spread = isSpace ? 0 : ((i * 2654435761) % 1000) / 1000 - 0.5;
    const angle = base + spread * 1.15;
    const dist = isSpace ? 150 : 250 + (((i * 40503) % 1000) / 1000) * 180;
    out.set(n.id, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    });
  });
  return out;
}

export function isAdditiveChange(
  prevIds: Set<string>,
  nextIds: Set<string>,
): boolean {
  if (prevIds.size === 0) return false;
  for (const id of prevIds) {
    if (!nextIds.has(id)) return false;
  }
  return nextIds.size >= prevIds.size;
}

export function buildSimNodes(
  data: GraphResponse,
  settings: Pick<GraphSettings, "nodeSize">,
  positions: PositionMap,
): SimNode[] {
  const degree = new Map<string, number>();
  for (const e of data.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const seeds = seedPositions(data.nodes);

  return data.nodes.map((n) => {
    const d = degree.get(n.id) ?? 1;
    const prev = positions.get(n.id);
    const seed = seeds.get(n.id)!;
    const node: SimNode = {
      ...n,
      x: prev?.x ?? seed.x,
      y: prev?.y ?? seed.y,
      vx: 0,
      vy: 0,
      degree: d,
      r: nodeRadius(n, d, settings.nodeSize),
      pinned: prev?.pinned ?? false,
    };
    if (prev?.pinned) {
      node.fx = prev.x;
      node.fy = prev.y;
    }
    return node;
  });
}

export function buildSimLinks(edges: GraphEdge[]): SimLink[] {
  return edges.map((e) => ({
    source: e.source,
    target: e.target,
    relation: e.relation,
    strength: 1,
  }));
}

export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  settings: Pick<
    GraphSettings,
    "centerForce" | "repelForce" | "linkForce" | "linkDistance"
  >,
): Simulation<SimNode, SimLink> {
  const baseDist = 50 + settings.linkDistance * 80;
  const sim = forceSimulation<SimNode>(nodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => baseDist * (REST[l.relation] ?? 1))
        .strength((l) => {
          const sNode = l.source as SimNode;
          const tNode = l.target as SimNode;
          const degNorm =
            1 /
            Math.max(1, Math.min(sNode.degree || 1, tNode.degree || 1));
          return degNorm * settings.linkForce * (STIFF[l.relation] ?? 1);
        }),
    )
    .force(
      "charge",
      forceManyBody<SimNode>()
        .strength(-settings.repelForce * 300)
        .distanceMax(600),
    )
    .force("x", forceX(0).strength(settings.centerForce * 0.05))
    .force("y", forceY(0).strength(settings.centerForce * 0.05))
    // Soft gravity toward fixed per-space anchors — keeps territories coherent
    // without space hub nodes or `contains` edges.
    .force("space", forceSpaceCluster(0.05))
    .force(
      "collide",
      forceCollide<SimNode>().radius((d) => d.r + 2),
    )
    .velocityDecay(0.4)
    .alphaDecay(0.0228);

  return sim;
}

/** Attract nodes toward a stable anchor for their space (ring by sorted id). */
export function forceSpaceCluster(strength: number) {
  let nodes: SimNode[] = [];
  let anchors = new Map<string, { x: number; y: number }>();

  const rebuildAnchors = () => {
    const ids = Array.from(
      new Set(nodes.map((n) => n.spaceId).filter(Boolean)),
    ).sort();
    const next = new Map<string, { x: number; y: number }>();
    const n = Math.max(1, ids.length);
    ids.forEach((id, i) => {
      const a = (i / n) * Math.PI * 2;
      next.set(id, { x: Math.cos(a) * 280, y: Math.sin(a) * 280 });
    });
    anchors = next;
  };

  const force = (alpha: number) => {
    const k = strength * alpha;
    for (const n of nodes) {
      if (n.fx != null || !n.spaceId) continue;
      const hub = anchors.get(n.spaceId);
      if (!hub) continue;
      n.vx = (n.vx ?? 0) + (hub.x - n.x) * k;
      n.vy = (n.vy ?? 0) + (hub.y - n.y) * k;
    }
  };
  force.initialize = (n: SimNode[]) => {
    nodes = n;
    rebuildAnchors();
  };
  return force;
}

/**
 * Tick budget for a settle. Large graphs get fewer ticks because each tick is
 * O(n log n); {@link alphaDecayFor} makes the shorter budget still converge.
 */
export function settleTicks(nodeCount: number): number {
  if (nodeCount > 6000) return 30;
  if (nodeCount > 3000) return 40;
  if (nodeCount > 1500) return 55;
  if (nodeCount > 400) return 90;
  return 150;
}

/**
 * Cooling schedule that lands alpha on `alphaMin` exactly at the end of the
 * budget. d3's default decay is tuned for ~300 ticks, so a 40-tick settle used
 * to stop while the graph was still hot — the layout looked unfinished and
 * nodes stayed piled on top of each other. Fitting the schedule to the budget
 * is what makes a short settle converge.
 */
export function alphaDecayFor(ticks: number, alphaMin = 0.001): number {
  return 1 - Math.pow(alphaMin, 1 / Math.max(1, ticks));
}

/**
 * Barnes-Hut opening angle. Bigger = coarser approximation = fewer quadtree
 * nodes visited. Charge is the most expensive force by a wide margin, so large
 * graphs trade a little accuracy for roughly a 45% cheaper tick.
 */
export function thetaFor(nodeCount: number): number {
  return nodeCount > 1500 ? 1.4 : 0.9;
}

export type SettleOptions = {
  /** Total ticks to run. Defaults to {@link settleTicks}. */
  ticks?: number;
  /** Starting temperature. Warm restarts pass a small value. */
  alpha?: number;
};

export type SettleRunner = {
  readonly total: number;
  readonly completed: number;
  readonly done: boolean;
  /** Advance up to `n` ticks; returns ticks actually run. */
  advance(n: number): number;
};

/**
 * A settle split into resumable chunks so the caller controls when it yields —
 * to a worker's message loop, or to the browser between animation frames.
 *
 * Collide is the second-most expensive force and only matters near the end
 * (it resolves overlaps once the coarse shape has emerged), so it is attached
 * partway through rather than paid for on every tick.
 */
export function createSettleRunner(
  sim: Simulation<SimNode, SimLink>,
  nodeCount: number,
  opts: SettleOptions = {},
): SettleRunner {
  const total = Math.max(1, opts.ticks ?? settleTicks(nodeCount));
  const collideFrom = Math.floor(total * 0.5);
  const collide = sim.force("collide");

  sim.stop();
  sim.alpha(opts.alpha ?? 1);
  sim.alphaDecay(alphaDecayFor(total));
  const charge = sim.force("charge") as {
    theta?: (t: number) => unknown;
  } | null;
  charge?.theta?.(thetaFor(nodeCount));
  sim.force("collide", null);

  let completed = 0;

  return {
    total,
    get completed() {
      return completed;
    },
    get done() {
      return completed >= total;
    },
    advance(n: number): number {
      const upTo = Math.min(total, completed + Math.max(0, n));
      let ran = 0;
      while (completed < upTo) {
        if (completed === collideFrom && collide) sim.force("collide", collide);
        sim.tick();
        completed++;
        ran++;
      }
      if (completed >= total && collide) sim.force("collide", collide);
      return ran;
    },
  };
}

export function writePositions(nodes: SimNode[], positions: PositionMap): void {
  for (const n of nodes) {
    positions.set(n.id, {
      x: n.x,
      y: n.y,
      pinned: !!n.pinned,
    });
  }
}

/** FNV-1a over a string, seeded so two passes give independent hashes. */
function hashString(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable key for node/edge membership — ignores positions and selection chrome.
 *
 * Order-independent by construction (per-item hashes are summed), so it needs
 * neither a sort nor the multi-megabyte joined string the sort used to build:
 * at 3k nodes that was ~8ms and a large allocation on every data change.
 */
export function graphTopologyKey(
  data: Pick<GraphResponse, "nodes" | "edges">,
): string {
  let a = 0;
  let b = 0;
  for (const n of data.nodes) {
    a = (a + hashString(n.id, 0x811c9dc5)) >>> 0;
    b = (b + hashString(n.id, 0x9e3779b9)) >>> 0;
  }
  let c = 0;
  let d = 0;
  for (const e of data.edges) {
    const key = `${e.source}\u0000${e.target}\u0000${e.relation}`;
    c = (c + hashString(key, 0x811c9dc5)) >>> 0;
    d = (d + hashString(key, 0x9e3779b9)) >>> 0;
  }
  return `${data.nodes.length}.${a.toString(36)}.${b.toString(36)}|${data.edges.length}.${c.toString(36)}.${d.toString(36)}`;
}

