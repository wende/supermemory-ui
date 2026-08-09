import { describe, expect, it } from "vitest";
import {
  buildSpaceColorGroups,
  buildSpaceTokenMap,
  SPACE_COLOR_TOKENS,
  spaceDisplayName,
  spaceIdsInNodes,
  tokenForSpaceIndex,
} from "./space-colors";
import type { GraphNode } from "@/lib/types";

function node(partial: Partial<GraphNode> & Pick<GraphNode, "id" | "spaceId">): GraphNode {
  return {
    kind: "memory",
    label: partial.id,
    weight: 1,
    ...partial,
  };
}

describe("tokenForSpaceIndex", () => {
  it("rotates through SPACE_COLOR_TOKENS", () => {
    expect(tokenForSpaceIndex(0)).toBe("s1");
    expect(tokenForSpaceIndex(4)).toBe("s5");
    expect(tokenForSpaceIndex(5)).toBe("s1");
  });
});

describe("spaceDisplayName", () => {
  it("strips auto-ingest Space prefix", () => {
    expect(spaceDisplayName("Space hermes", "hermes")).toBe("hermes");
  });

  it("keeps intentional custom names", () => {
    expect(spaceDisplayName("Space Station", "station")).toBe("Space Station");
    expect(spaceDisplayName("Research", "sm_research")).toBe("Research");
  });
});

describe("buildSpaceTokenMap", () => {
  it("assigns tokens from full-corpus order, not visible subset", () => {
    const full = buildSpaceTokenMap(["alpha", "beta", "zeta"]);
    expect(full.get("zeta")).toBe(tokenForSpaceIndex(2));
    // Filtered view still looks up the same token for zeta
    expect(full.get("zeta")).toBe(buildSpaceTokenMap(["zeta", "alpha", "beta"]).get("zeta"));
  });
});

describe("buildSpaceColorGroups", () => {
  it("rotates only through the s* series (never status tokens)", () => {
    expect(SPACE_COLOR_TOKENS).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(SPACE_COLOR_TOKENS).not.toContain("good");
    expect(SPACE_COLOR_TOKENS).not.toContain("serious");
    expect(SPACE_COLOR_TOKENS).not.toContain("critical");
  });

  it("assigns a stable token per space, sorted by id", () => {
    const groups = buildSpaceColorGroups([
      node({ id: "m1", spaceId: "zeta" }),
      node({ id: "m2", spaceId: "alpha" }),
      node({ id: "m3", spaceId: "zeta" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["alpha", "zeta"]);
    expect(groups[0]?.token).toBe(tokenForSpaceIndex(0));
    expect(groups[1]?.token).toBe(tokenForSpaceIndex(1));
    expect(groups[0]?.query).toBe("space:alpha");
  });

  it("prefers display names when provided", () => {
    const groups = buildSpaceColorGroups(
      [node({ id: "m1", spaceId: "sm_hermes" })],
      new Map([["sm_hermes", "hermes"]]),
    );
    expect(groups[0]?.label).toBe("hermes");
  });

  it("keeps full-corpus tokens when the visible set shrinks", () => {
    const corpus = buildSpaceTokenMap(
      spaceIdsInNodes([
        node({ id: "m1", spaceId: "alpha" }),
        node({ id: "m2", spaceId: "zeta" }),
      ]),
    );
    const filtered = buildSpaceColorGroups(
      [node({ id: "m2", spaceId: "zeta" })],
      undefined,
      corpus,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.token).toBe(tokenForSpaceIndex(1));
  });
});
