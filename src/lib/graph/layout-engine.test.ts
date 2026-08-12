import { describe, expect, it } from "vitest";
import { quadtree } from "d3-quadtree";
import { createLayoutJob, warmTicks, type LayoutRequest } from "./layout-engine";
import {
  alphaDecayFor,
  createSettleRunner,
  createSimulation,
  graphTopologyKey,
  settleTicks,
  thetaFor,
} from "./layout";
import type { GraphEdge, GraphNode } from "@/lib/types";
import type { SimNode } from "./types";

function synth(n: number, spaces = 6) {
  const nodes: LayoutRequest["nodes"] = [];
  for (let i = 0; i < spaces; i++) {
    nodes.push({ id: `sp_${i}`, x: 0, y: 0, r: 12, degree: 8, spaceId: `sp_${i}` });
  }
  for (let i = 0; i < n; i++) {
    // Seed on a ring so the sim starts from something non-degenerate.
    const a = (i / n) * Math.PI * 2;
    nodes.push({
      id: `m_${i}`,
      x: Math.cos(a) * 250,
      y: Math.sin(a) * 250,
      r: 5,
      degree: 3,
      spaceId: `sp_${i % spaces}`,
    });
  }
  const links: LayoutRequest["links"] = [];
  const rel: GraphEdge["relation"][] = ["extends", "derives", "updates", "sources"];
  for (let i = 0; i < n; i++) {
    for (let k = 1; k <= 2; k++) {
      const j = (i * 7 + k * 13) % n;
      if (j !== i) {
        links.push({ source: `m_${i}`, target: `m_${j}`, relation: rel[(i + k) % 4]! });
      }
    }
  }
  return { nodes, links };
}

const SETTINGS = {
  centerForce: 0.5,
  repelForce: 0.5,
  linkForce: 0.5,
  linkDistance: 0.5,
};

const request = (n: number, over: Partial<LayoutRequest> = {}): LayoutRequest => ({
  runId: 1,
  ...synth(n),
  settings: SETTINGS,
  ...over,
});

/** Count node pairs closer than the sum of their radii. */
function overlaps(nodes: { x: number; y: number; r: number }[]): number {
  const tree = quadtree<(typeof nodes)[number]>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(nodes);
  let hits = 0;
  for (const n of nodes) {
    const rr = n.r * 2;
    tree.visit((q, x1, y1, x2, y2) => {
      if (!q.length) {
        let leaf: typeof q | null = q;
        do {
          const m = leaf.data;
          if (m && m !== n && Math.hypot(m.x - n.x, m.y - n.y) < n.r + m.r) hits++;
          leaf = leaf.next ?? null;
        } while (leaf);
        return false;
      }
      return x1 > n.x + rr || x2 < n.x - rr || y1 > n.y + rr || y2 < n.y - rr;
    });
  }
  return hits / 2;
}

describe("settle schedule", () => {
  it("shrinks the tick budget as the graph grows", () => {
    expect(settleTicks(100)).toBeGreaterThan(settleTicks(2000));
    expect(settleTicks(2000)).toBeGreaterThan(settleTicks(7000));
  });

  it("cools to alphaMin over exactly the budget", () => {
    for (const ticks of [10, 40, 150]) {
      const decay = alphaDecayFor(ticks);
      let alpha = 1;
      for (let i = 0; i < ticks; i++) alpha += (0 - alpha) * decay;
      expect(alpha).toBeCloseTo(0.001, 4);
    }
  });

  it("coarsens the Barnes-Hut angle only for large graphs", () => {
    expect(thetaFor(100)).toBeLessThan(thetaFor(5000));
  });
});

describe("createSettleRunner", () => {
  const build = (count: number) => {
    const { nodes } = synth(count, 2);
    const sim = createSimulation(nodes as unknown as SimNode[], [], SETTINGS);
    return { sim, nodes };
  };

  it("runs exactly the requested number of ticks across chunks", () => {
    const { sim } = build(50);
    const runner = createSettleRunner(sim, 50, { ticks: 20 });
    expect(runner.total).toBe(20);
    expect(runner.advance(7)).toBe(7);
    expect(runner.advance(7)).toBe(7);
    expect(runner.advance(99)).toBe(6);
    expect(runner.completed).toBe(20);
    expect(runner.done).toBe(true);
    expect(runner.advance(5)).toBe(0);
  });

  it("chunking does not change the result", () => {
    const a = build(60);
    createSettleRunner(a.sim, 60, { ticks: 24 }).advance(24);
    const b = build(60);
    const runner = createSettleRunner(b.sim, 60, { ticks: 24 });
    for (let i = 0; i < 8; i++) runner.advance(3);

    for (let i = 0; i < a.nodes.length; i++) {
      expect(b.nodes[i]!.x).toBeCloseTo(a.nodes[i]!.x, 6);
      expect(b.nodes[i]!.y).toBeCloseTo(a.nodes[i]!.y, 6);
    }
  });

  it("re-attaches collide by the end so overlaps are resolved", () => {
    const { sim, nodes } = build(300);
    const runner = createSettleRunner(sim, 300, { ticks: 60 });
    runner.advance(60);
    expect(sim.force("collide")).toBeTruthy();
    expect(overlaps(nodes as unknown as { x: number; y: number; r: number }[])).toBe(0);
  });
});

describe("createLayoutJob", () => {
  it("streams index-aligned snapshots and terminates", () => {
    const req = request(200, { ticks: 20 });
    const job = createLayoutJob(req);
    expect(job.total).toBe(20);

    const seen: number[] = [];
    let last: ReturnType<typeof job.runFor> = null;
    for (let guard = 0; guard < 100 && !job.done; guard++) {
      last = job.runFor(0);
      if (!last) break;
      seen.push(last.completed);
      expect(last.x.length).toBe(req.nodes.length);
      expect(last.y.length).toBe(req.nodes.length);
      expect(last.runId).toBe(req.runId);
    }

    expect(job.done).toBe(true);
    expect(last!.done).toBe(true);
    expect(last!.completed).toBe(20);
    // Monotonic and more than one snapshot, or there is no progress to show.
    expect(seen.length).toBeGreaterThan(1);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(job.runFor(0)).toBeNull();
  });

  it("produces a laid-out graph, not the seed positions", () => {
    const req = request(300);
    const before = req.nodes.map((n) => ({ x: n.x, y: n.y }));
    const job = createLayoutJob(req);
    let last = job.runFor(0);
    while (!job.done) last = job.runFor(0) ?? last;

    let moved = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.hypot(last!.x[i]! - before[i]!.x, last!.y[i]! - before[i]!.y) > 1) {
        moved++;
      }
    }
    expect(moved).toBeGreaterThan(before.length * 0.9);
    expect(Number.isFinite(last!.x[0])).toBe(true);
  });

  it("holds pinned nodes at their fixed position", () => {
    const req = request(120);
    req.nodes[10] = { ...req.nodes[10]!, fx: 77, fy: -33, x: 77, y: -33 };
    const job = createLayoutJob(req);
    let last = job.runFor(0);
    while (!job.done) last = job.runFor(0) ?? last;

    expect(last!.x[10]).toBeCloseTo(77, 3);
    expect(last!.y[10]).toBeCloseTo(-33, 3);
  });

  it("warm restarts cost a fraction of a cold settle", () => {
    expect(warmTicks(3000)).toBeLessThan(settleTicks(3000));
    expect(warmTicks(3000)).toBeGreaterThanOrEqual(8);
  });
});

describe("graphTopologyKey", () => {
  const node = (id: string): GraphNode =>
    ({ id, kind: "memory", label: id, spaceId: "s1" }) as GraphNode;
  const edge = (s: string, t: string): GraphEdge =>
    ({ source: s, target: t, relation: "extends" }) as GraphEdge;

  it("is stable and order-independent", () => {
    const a = { nodes: [node("a"), node("b")], edges: [edge("a", "b"), edge("b", "a")] };
    const b = { nodes: [node("b"), node("a")], edges: [edge("b", "a"), edge("a", "b")] };
    expect(graphTopologyKey(a)).toBe(graphTopologyKey(b));
  });

  it("changes when membership changes", () => {
    const base = { nodes: [node("a"), node("b")], edges: [edge("a", "b")] };
    expect(graphTopologyKey(base)).not.toBe(
      graphTopologyKey({ ...base, nodes: [node("a"), node("c")] }),
    );
    expect(graphTopologyKey(base)).not.toBe(
      graphTopologyKey({ ...base, edges: [edge("b", "a")] }),
    );
    expect(graphTopologyKey(base)).not.toBe(
      graphTopologyKey({ ...base, edges: [] }),
    );
  });

  it("distinguishes a swapped id from a duplicate", () => {
    const dup = { nodes: [node("a"), node("a")], edges: [] };
    const two = { nodes: [node("a"), node("b")], edges: [] };
    expect(graphTopologyKey(dup)).not.toBe(graphTopologyKey(two));
  });
});
