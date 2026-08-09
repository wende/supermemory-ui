import type { GraphNode } from "@/lib/types";
import type { ColorGroup, ColorToken } from "./types";

export { spaceDisplayName } from "@/lib/format";

/**
 * Stable palette rotation for space membership colours.
 * Keep this on the `s*` series only — status tokens (good/serious/critical)
 * must not rotate into space territories or the legend reads them as status.
 */
export const SPACE_COLOR_TOKENS: ColorToken[] = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
];

/** Stable token for the i-th space in sorted order (legend, blobs, groups). */
export function tokenForSpaceIndex(i: number): ColorToken {
  return SPACE_COLOR_TOKENS[i % SPACE_COLOR_TOKENS.length]!;
}

/** Collect distinct space ids from graph nodes (membership + hub nodes). */
export function spaceIdsInNodes(nodes: GraphNode[]): string[] {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "space") ids.add(n.id);
    else if (n.spaceId) ids.add(n.spaceId);
  }
  return Array.from(ids).sort();
}

/**
 * Token per space from a fixed corpus order. Pass the full-graph id list so
 * filtering the visible set does not reshuffle colours.
 */
export function buildSpaceTokenMap(spaceIds: string[]): Map<string, ColorToken> {
  const ids = [...spaceIds].sort();
  return new Map(ids.map((id, i) => [id, tokenForSpaceIndex(i)]));
}

/**
 * One colour group per distinct `spaceId` in `nodes`.
 * When `tokenBySpace` is provided (full-corpus map), tokens stay stable even
 * if `nodes` is a filtered subset.
 */
export function buildSpaceColorGroups(
  nodes: GraphNode[],
  spaceNames?: Map<string, string>,
  tokenBySpace?: Map<string, ColorToken>,
): ColorGroup[] {
  const ids = Array.from(
    new Set(nodes.map((n) => n.spaceId).filter(Boolean)),
  ).sort();

  return ids.map((id, i) => ({
    id: `space:${id}`,
    query: `space:${id}`,
    token: tokenBySpace?.get(id) ?? tokenForSpaceIndex(i),
    label: spaceNames?.get(id) ?? id,
  }));
}
