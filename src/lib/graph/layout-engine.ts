import type { GraphEdge } from "@/lib/types";
import {
  createSettleRunner,
  createSimulation,
  settleTicks,
  type SettleRunner,
} from "./layout";
import type { GraphSettings, SimLink, SimNode } from "./types";

/**
 * Layout input, reduced to what the forces actually read: charge and collide
 * need `r`, link strength needs `degree`, the space cluster needs `spaceId`,
 * and pinned nodes need `fx`/`fy`. Keeping it to plain data means the job owns
 * its own node objects and hands results back as index-aligned arrays, so the
 * canvas can keep painting the previous positions while a settle is running.
 */
export type LayoutNodeInput = {
  id: string;
  x: number;
  y: number;
  r: number;
  degree: number;
  spaceId: string;
  fx?: number | null;
  fy?: number | null;
};

export type LayoutLinkInput = {
  source: string;
  target: string;
  relation: GraphEdge["relation"];
};

export type LayoutForceSettings = Pick<
  GraphSettings,
  "centerForce" | "repelForce" | "linkForce" | "linkDistance"
>;

export type LayoutRequest = {
  /** Correlates responses with the request that produced them. */
  runId: number;
  nodes: LayoutNodeInput[];
  links: LayoutLinkInput[];
  settings: LayoutForceSettings;
  /** Override the tick budget; warm restarts use a short one. */
  ticks?: number;
  /** Starting temperature. Warm restarts pass a small value. */
  alpha?: number;
};

export type LayoutProgress = {
  runId: number;
  completed: number;
  total: number;
  /** Index-aligned with `LayoutRequest.nodes`. */
  x: Float32Array;
  y: Float32Array;
  done: boolean;
};

/**
 * A settle in progress. Ticks are pulled by the caller, which owns the yield
 * policy — so the same job can be drained in one go for a small graph or
 * spread across animation frames for a large one.
 */
export type LayoutJob = {
  readonly runId: number;
  readonly total: number;
  readonly done: boolean;
  /**
   * Tick until `budgetMs` is spent, then snapshot. Always runs at least one
   * tick, so a graph whose single tick overruns the budget still progresses.
   */
  runFor(budgetMs: number): LayoutProgress | null;
};

/**
 * Reusable position buffers for one job's snapshots. A settle emits ~30
 * slices on a large graph; allocating a fresh pair of Float32Arrays each time
 * only to discard the previous one churns hundreds of KB per build for no
 * reason, since each snapshot is consumed synchronously by the caller before
 * the next tick runs.
 */
function createSnapshotBuffers(size: number) {
  let x = new Float32Array(size);
  let y = new Float32Array(size);
  return {
    take(runId: number, nodes: SimNode[], runner: SettleRunner): LayoutProgress {
      if (x.length !== nodes.length) {
        x = new Float32Array(nodes.length);
        y = new Float32Array(nodes.length);
      }
      for (let i = 0; i < nodes.length; i++) {
        x[i] = nodes[i]!.x;
        y[i] = nodes[i]!.y;
      }
      return {
        runId,
        completed: runner.completed,
        total: runner.total,
        x,
        y,
        done: runner.done,
      };
    },
  };
}

/**
 * Build a resumable settle for a layout request. Pure — no DOM, no timers — so
 * the scheduling policy lives entirely with the caller and the physics stay
 * directly unit-testable.
 */
export function createLayoutJob(req: LayoutRequest): LayoutJob {
  const nodes: SimNode[] = req.nodes.map(
    (n) =>
      ({
        ...n,
        vx: 0,
        vy: 0,
        // Layout never reads these, but SimNode is the shape the forces type against.
        kind: "memory",
        label: "",
      }) as unknown as SimNode,
  );
  // d3-force throws on a link whose endpoint is not in the node set, which
  // would take out the whole graph. Dangling edges are dropped instead — a
  // filtered view or a partial response should cost an edge, not the canvas.
  const present = new Set(req.nodes.map((n) => n.id));
  const links: SimLink[] = [];
  for (const l of req.links) {
    if (!present.has(l.source) || !present.has(l.target)) continue;
    links.push({
      source: l.source,
      target: l.target,
      relation: l.relation,
      strength: 1,
    });
  }

  const sim = createSimulation(nodes, links, req.settings);
  const runner = createSettleRunner(sim, nodes.length, {
    ticks: req.ticks,
    alpha: req.alpha,
  });
  const buffers = createSnapshotBuffers(nodes.length);

  return {
    runId: req.runId,
    total: runner.total,
    get done() {
      return runner.done;
    },
    runFor(budgetMs: number) {
      if (runner.done) return null;
      const started = now();
      do {
        runner.advance(1);
      } while (!runner.done && now() - started < budgetMs);
      return buffers.take(req.runId, nodes, runner);
    },
  };
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Tick budget for a warm restart — the graph is already laid out and only needs
 * to relax into new force settings, so it costs a fraction of a cold settle.
 */
export function warmTicks(nodeCount: number): number {
  return Math.max(8, Math.round(settleTicks(nodeCount) * 0.35));
}
