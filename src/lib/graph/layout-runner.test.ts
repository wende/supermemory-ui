import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutRunner } from "./layout-runner";
import type { LayoutProgress, LayoutRequest } from "./layout-engine";

/**
 * Manual frame clock. The runner spreads a settle across animation frames, so
 * the tests drive those frames themselves rather than waiting on a real one.
 */
let pending: Map<number, FrameRequestCallback>;
let nextHandle: number;

const flushFrames = (max = 500): number => {
  let ran = 0;
  while (pending.size && ran < max) {
    const [handle, cb] = pending.entries().next().value as [
      number,
      FrameRequestCallback,
    ];
    pending.delete(handle);
    cb(performance.now());
    ran++;
  }
  return ran;
};

beforeEach(() => {
  pending = new Map();
  nextHandle = 1;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    pending.set(handle, cb);
    return handle;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => {
    pending.delete(handle);
  }) as typeof globalThis.cancelAnimationFrame;
});

afterEach(() => {
  pending.clear();
});

function req(
  over: Partial<LayoutRequest> = {},
  count = 400,
): Omit<LayoutRequest, "runId"> {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    x: Math.cos(i) * 200,
    y: Math.sin(i) * 200,
    r: 5,
    degree: 2,
    spaceId: `s${i % 4}`,
  }));
  const links = nodes.map((n, i) => ({
    source: n.id,
    target: `n${(i + 7) % nodes.length}`,
    relation: "extends" as const,
  }));
  return {
    nodes,
    links,
    settings: {
      centerForce: 0.5,
      repelForce: 0.5,
      linkForce: 0.5,
      linkDistance: 0.5,
    },
    ticks: 30,
    ...over,
  };
}

describe("LayoutRunner", () => {
  it("reports progress and finishes exactly once", () => {
    const runner = new LayoutRunner();
    const seen: LayoutProgress[] = [];
    runner.run(req(), { onProgress: (p) => seen.push(p) });
    flushFrames();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((p) => p.done)).toHaveLength(1);
    expect(seen.at(-1)!.done).toBe(true);
    expect(seen.at(-1)!.completed).toBe(30);
    expect(runner.running).toBe(false);
  });

  it("progress is monotonic and never exceeds the total", () => {
    const runner = new LayoutRunner();
    const seen: LayoutProgress[] = [];
    runner.run(req(), { onProgress: (p) => seen.push(p) });
    flushFrames();

    let last = -1;
    for (const p of seen) {
      expect(p.completed).toBeGreaterThan(last);
      expect(p.completed).toBeLessThanOrEqual(p.total);
      last = p.completed;
    }
  });

  it("a new run supersedes the old one, and the old stops reporting", () => {
    const runner = new LayoutRunner();
    const first: LayoutProgress[] = [];
    const second: LayoutProgress[] = [];

    runner.run(req({ ticks: 200 }), { onProgress: (p) => first.push(p) });
    const afterOpening = first.length;
    runner.run(req({ ticks: 30 }), { onProgress: (p) => second.push(p) });
    flushFrames();

    // The superseded run contributed nothing beyond its inline opening slice.
    expect(first.length).toBe(afterOpening);
    expect(first.some((p) => p.done)).toBe(false);
    expect(second.at(-1)!.done).toBe(true);
  });

  it("cancel stops the run and leaves no scheduled frames", () => {
    const runner = new LayoutRunner();
    const seen: LayoutProgress[] = [];
    runner.run(req({ ticks: 400 }), { onProgress: (p) => seen.push(p) });
    const before = seen.length;

    runner.cancel();
    flushFrames();

    expect(seen.length).toBe(before);
    expect(seen.some((p) => p.done)).toBe(false);
    expect(runner.running).toBe(false);
    expect(pending.size).toBe(0);
  });

  it("small settles finish inline, without needing a frame", () => {
    const runner = new LayoutRunner();
    const seen: LayoutProgress[] = [];
    runner.run(req({ ticks: 2 }, 20), { onProgress: (p) => seen.push(p) });

    expect(seen.at(-1)!.done).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("drops links whose endpoints are missing instead of throwing", () => {
    const runner = new LayoutRunner();
    const base = req({ ticks: 4 }, 20);
    const seen: LayoutProgress[] = [];
    runner.run(
      {
        ...base,
        links: [
          ...base.links,
          { source: "n0", target: "ghost", relation: "extends" },
          { source: "ghost", target: "n1", relation: "derives" },
        ],
      },
      { onProgress: (p) => seen.push(p) },
    );
    flushFrames();

    expect(seen.at(-1)!.done).toBe(true);
    expect(seen.at(-1)!.x.length).toBe(base.nodes.length);
  });

  it("survives an empty graph", () => {
    const runner = new LayoutRunner();
    const seen: LayoutProgress[] = [];
    runner.run({ ...req(), nodes: [], links: [], ticks: 5 }, {
      onProgress: (p) => seen.push(p),
    });
    flushFrames();
    expect(seen.at(-1)?.done).toBe(true);
  });
});
