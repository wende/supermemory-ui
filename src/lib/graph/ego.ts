import type { GraphEdge, GraphNode, GraphResponse } from "@/lib/types";

export interface EgoOptions {
  incoming: boolean;
  outgoing: boolean;
  neighborLinks: boolean;
}

/**
 * Local (ego) subgraph via directed BFS from focusId.
 * Direction follows edge source→target: sources document→memory,
 * memory relations source→target.
 */
export function egoSubgraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  focusId: string,
  depth: number,
  opts: EgoOptions,
): GraphResponse {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(focusId)) {
    return { nodes: [], edges: [] };
  }

  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!outAdj.has(e.source)) outAdj.set(e.source, []);
    outAdj.get(e.source)!.push(e.target);
    if (!inAdj.has(e.target)) inAdj.set(e.target, []);
    inAdj.get(e.target)!.push(e.source);
  }

  const level = new Map<string, number>();
  level.set(focusId, 0);
  const queue = [focusId];
  let head = 0;
  const maxDepth = Math.max(0, Math.min(5, Math.floor(depth)));

  while (head < queue.length) {
    const id = queue[head++];
    const d = level.get(id)!;
    if (d >= maxDepth) continue;

    const next: string[] = [];
    if (opts.outgoing) next.push(...(outAdj.get(id) ?? []));
    if (opts.incoming) next.push(...(inAdj.get(id) ?? []));

    for (const n of next) {
      if (!byId.has(n)) continue;
      if (level.has(n)) continue;
      level.set(n, d + 1);
      queue.push(n);
    }
  }

  const included = new Set(level.keys());
  const outNodes = nodes.filter((n) => included.has(n.id));

  let outEdges: GraphEdge[];
  if (opts.neighborLinks) {
    outEdges = edges.filter(
      (e) => included.has(e.source) && included.has(e.target),
    );
  } else {
    outEdges = edges.filter((e) => {
      if (!included.has(e.source) || !included.has(e.target)) return false;
      const ls = level.get(e.source)!;
      const lt = level.get(e.target)!;
      return Math.abs(ls - lt) === 1;
    });
  }

  return { nodes: outNodes, edges: outEdges };
}
