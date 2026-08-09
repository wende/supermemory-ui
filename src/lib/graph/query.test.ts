import { describe, expect, it } from "vitest";
import {
  compileColorGroups,
  matchNode,
  MAX_QUERY_LENGTH,
  parseQuery,
  resolveColorGroup,
  resolveCompiledGroup,
} from "./query";
import type { GraphEdge, GraphNode } from "@/lib/types";

const nodes: GraphNode[] = [
  {
    id: "m1",
    kind: "memory",
    label: "Hybrid search ranking",
    weight: 2,
    spaceId: "product",
  },
  {
    id: "m2",
    kind: "memory",
    label: "Old note",
    weight: 1,
    spaceId: "ops",
    forgotten: true,
  },
  {
    id: "d1",
    kind: "document",
    label: "RFC hybrid search",
    weight: 3,
    spaceId: "product",
  },
  {
    id: "s1",
    kind: "space",
    label: "Product",
    weight: 5,
    spaceId: "product",
  },
];

const edges: GraphEdge[] = [
  { source: "s1", target: "m1", relation: "contains" },
  { source: "d1", target: "m1", relation: "sources" },
  { source: "m1", target: "m2", relation: "extends" },
];

const enriched = {
  ...nodes[0],
  isStatic: true,
  isInference: false,
} as GraphNode & { isStatic: boolean; isInference: boolean };

describe("parseQuery / matchNode", () => {
  it("matches bare terms case-insensitively", () => {
    expect(matchNode("hybrid", nodes[0], edges)).toBe(true);
    expect(matchNode("hybrid", nodes[1], edges)).toBe(false);
  });

  it("matches quoted phrases", () => {
    expect(matchNode('"hybrid search"', nodes[0], edges)).toBe(true);
    expect(matchNode('"hybrid ranking"', nodes[0], edges)).toBe(false);
  });

  it("supports kind: operator", () => {
    expect(matchNode("kind:memory", nodes[0], edges)).toBe(true);
    expect(matchNode("kind:document", nodes[0], edges)).toBe(false);
    expect(matchNode("kind:document", nodes[2], edges)).toBe(true);
  });

  it("supports space: operator", () => {
    expect(matchNode("space:product", nodes[0], edges)).toBe(true);
    expect(matchNode("space:ops", nodes[0], edges)).toBe(false);
  });

  it("supports is:forgotten", () => {
    expect(matchNode("is:forgotten", nodes[1], edges)).toBe(true);
    expect(matchNode("is:forgotten", nodes[0], edges)).toBe(false);
  });

  it("supports is:static on enriched nodes", () => {
    expect(matchNode("is:static", enriched, edges)).toBe(true);
    expect(matchNode("is:inference", enriched, edges)).toBe(false);
  });

  it("supports rel: operator", () => {
    expect(matchNode("rel:extends", nodes[0], edges)).toBe(true);
    expect(matchNode("rel:extends", nodes[2], edges)).toBe(false);
    expect(matchNode("rel:sources", nodes[0], edges)).toBe(true);
  });

  it("supports negation", () => {
    expect(matchNode("-kind:memory", nodes[0], edges)).toBe(false);
    expect(matchNode("-kind:memory", nodes[2], edges)).toBe(true);
    expect(matchNode("-forgotten", nodes[1], edges)).toBe(true); // bare "forgotten" not in label
    expect(matchNode("-is:forgotten", nodes[1], edges)).toBe(false);
  });

  it("ANDs terms together", () => {
    const pred = parseQuery("kind:memory space:product");
    expect(pred(nodes[0], edges)).toBe(true);
    expect(pred(nodes[1], edges)).toBe(false);
  });

  it("first matching colour group wins", () => {
    const groups = [
      { id: "g1", query: "kind:memory", token: "s3" as const },
      { id: "g2", query: "is:forgotten", token: "critical" as const },
    ];
    expect(resolveColorGroup(groups, nodes[0], edges)?.id).toBe("g1");
    expect(resolveColorGroup(groups, nodes[1], edges)?.id).toBe("g1"); // memory matches first
    const forgottenFirst = [
      { id: "g2", query: "is:forgotten", token: "critical" as const },
      { id: "g1", query: "kind:memory", token: "s3" as const },
    ];
    expect(resolveColorGroup(forgottenFirst, nodes[1], edges)?.id).toBe("g2");
  });

  it("caps how much query text is tokenized", () => {
    const long = "x".repeat(MAX_QUERY_LENGTH * 4);
    // Beyond the cap the query is truncated, not evaluated in full.
    expect(parseQuery(long)(nodes[0], edges)).toBe(false);
    expect(
      parseQuery(`hybrid ${" ".repeat(MAX_QUERY_LENGTH)}nomatch`)(
        nodes[0],
        edges,
      ),
    ).toBe(true);
  });
});

describe("compileColorGroups", () => {
  const groups = [
    { id: "blank", query: "   ", token: "s1" as const },
    { id: "g1", query: "kind:memory", token: "s3" as const },
    { id: "g2", query: "kind:document", token: "s1" as const },
  ];

  it("drops empty queries and preserves order", () => {
    const compiled = compileColorGroups(groups);
    expect(compiled.map((c) => c.group.id)).toEqual(["g1", "g2"]);
  });

  it("resolves the same group as the uncompiled helper", () => {
    const compiled = compileColorGroups(groups);
    for (const node of nodes) {
      expect(resolveCompiledGroup(compiled, node, edges)?.id).toBe(
        resolveColorGroup(groups, node, edges)?.id,
      );
    }
  });
});
