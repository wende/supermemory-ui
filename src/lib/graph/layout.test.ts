import { describe, expect, it } from "vitest";
import {
  buildSimNodes,
  isAdditiveChange,
  seedPositions,
} from "./layout";
import type { GraphResponse } from "@/lib/types";
import type { PositionMap } from "./types";

const sample: GraphResponse = {
  nodes: [
    { id: "s1", kind: "space", label: "S1", weight: 3, spaceId: "s1" },
    { id: "m1", kind: "memory", label: "M1", weight: 1, spaceId: "s1" },
    { id: "m2", kind: "memory", label: "M2", weight: 1, spaceId: "s1" },
  ],
  edges: [
    { source: "s1", target: "m1", relation: "contains" },
    { source: "s1", target: "m2", relation: "contains" },
  ],
};

describe("layout helpers", () => {
  it("seedPositions is deterministic for a given node set", () => {
    const a = seedPositions(sample.nodes);
    const b = seedPositions(sample.nodes);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get("s1")).toBeDefined();
    expect(a.get("m1")!.x).not.toBe(a.get("s1")!.x);
  });

  it("preserves positions across data changes for existing nodes", () => {
    const positions: PositionMap = new Map();
    const first = buildSimNodes(sample, { nodeSize: 0.5 }, positions);
    for (const n of first) positions.set(n.id, { x: n.x, y: n.y });
    // Move m1
    positions.set("m1", { x: 42, y: -7 });

    const expanded: GraphResponse = {
      nodes: [
        ...sample.nodes,
        { id: "m3", kind: "memory", label: "M3", weight: 1, spaceId: "s1" },
      ],
      edges: [
        ...sample.edges,
        { source: "s1", target: "m3", relation: "contains" },
      ],
    };
    const second = buildSimNodes(expanded, { nodeSize: 0.5 }, positions);
    const m1 = second.find((n) => n.id === "m1")!;
    expect(m1.x).toBe(42);
    expect(m1.y).toBe(-7);
    expect(second.find((n) => n.id === "m3")).toBeDefined();
  });

  it("detects additive vs structural changes", () => {
    const prev = new Set(["a", "b"]);
    expect(isAdditiveChange(prev, new Set(["a", "b", "c"]))).toBe(true);
    expect(isAdditiveChange(prev, new Set(["a", "b"]))).toBe(true);
    expect(isAdditiveChange(prev, new Set(["a"]))).toBe(false);
    expect(isAdditiveChange(prev, new Set(["a", "c"]))).toBe(false);
    expect(isAdditiveChange(new Set(), new Set(["a"]))).toBe(false);
  });

  it("seeds only new nodes when positions map is partial", () => {
    const positions: PositionMap = new Map([["s1", { x: 10, y: 20 }]]);
    const nodes = buildSimNodes(sample, { nodeSize: 0.5 }, positions);
    expect(nodes.find((n) => n.id === "s1")!.x).toBe(10);
    expect(nodes.find((n) => n.id === "m1")!.x).not.toBe(10);
  });
});
