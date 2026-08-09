import { describe, expect, it } from "vitest";
import { egoSubgraph } from "./ego";
import type { GraphEdge, GraphNode } from "@/lib/types";

const nodes: GraphNode[] = [
  { id: "a", kind: "memory", label: "A", weight: 1, spaceId: "s" },
  { id: "b", kind: "memory", label: "B", weight: 1, spaceId: "s" },
  { id: "c", kind: "memory", label: "C", weight: 1, spaceId: "s" },
  { id: "d", kind: "memory", label: "D", weight: 1, spaceId: "s" },
  { id: "space", kind: "space", label: "S", weight: 1, spaceId: "s" },
  { id: "doc", kind: "document", label: "Doc", weight: 1, spaceId: "s" },
];

// space → a, doc → a, a → b, b → c, c → d (and a cycle c → a)
const edges: GraphEdge[] = [
  { source: "space", target: "a", relation: "contains" },
  { source: "doc", target: "a", relation: "sources" },
  { source: "a", target: "b", relation: "extends" },
  { source: "b", target: "c", relation: "derives" },
  { source: "c", target: "d", relation: "updates" },
  { source: "c", target: "a", relation: "extends" },
];

describe("egoSubgraph", () => {
  it("returns empty for unknown focus", () => {
    const g = egoSubgraph(nodes, edges, "missing", 2, {
      incoming: true,
      outgoing: true,
      neighborLinks: true,
    });
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("depth 1 outgoing includes immediate targets", () => {
    const g = egoSubgraph(nodes, edges, "a", 1, {
      incoming: false,
      outgoing: true,
      neighborLinks: true,
    });
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(ids).toEqual(new Set(["a", "b"]));
  });

  it("depth 1 incoming includes parents", () => {
    const g = egoSubgraph(nodes, edges, "a", 1, {
      incoming: true,
      outgoing: false,
      neighborLinks: true,
    });
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(ids.has("space")).toBe(true);
    expect(ids.has("doc")).toBe(true);
    expect(ids.has("c")).toBe(true); // cycle edge c→a
    expect(ids.has("b")).toBe(false);
  });

  it("widens with depth", () => {
    const d1 = egoSubgraph(nodes, edges, "a", 1, {
      incoming: false,
      outgoing: true,
      neighborLinks: true,
    });
    const d2 = egoSubgraph(nodes, edges, "a", 2, {
      incoming: false,
      outgoing: true,
      neighborLinks: true,
    });
    const d3 = egoSubgraph(nodes, edges, "a", 3, {
      incoming: false,
      outgoing: true,
      neighborLinks: true,
    });
    expect(d1.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(new Set(d2.nodes.map((n) => n.id))).toEqual(new Set(["a", "b", "c"]));
    expect(new Set(d3.nodes.map((n) => n.id))).toEqual(
      new Set(["a", "b", "c", "d"]),
    );
  });

  it("handles cycles without infinite loops", () => {
    const g = egoSubgraph(nodes, edges, "a", 5, {
      incoming: true,
      outgoing: true,
      neighborLinks: true,
    });
    expect(g.nodes.length).toBeLessThanOrEqual(nodes.length);
    expect(g.nodes.some((n) => n.id === "a")).toBe(true);
  });

  it("neighborLinks off keeps only tree-level edges", () => {
    const withAll = egoSubgraph(nodes, edges, "a", 2, {
      incoming: false,
      outgoing: true,
      neighborLinks: true,
    });
    const treeOnly = egoSubgraph(nodes, edges, "a", 2, {
      incoming: false,
      outgoing: true,
      neighborLinks: false,
    });
    // Cycle edge c→a connects level 2 to level 0 — excluded when neighborLinks off
    expect(
      treeOnly.edges.some((e) => e.source === "c" && e.target === "a"),
    ).toBe(false);
    expect(
      withAll.edges.some((e) => e.source === "c" && e.target === "a"),
    ).toBe(true);
  });
});
