import type { GraphEdge, GraphNode } from "@/lib/types";
import type { NodePredicate } from "./types";

type Term =
  | { kind: "bare"; value: string; neg: boolean }
  | { kind: "quoted"; value: string; neg: boolean }
  | { kind: "op"; op: string; value: string; neg: boolean };

/**
 * Upper bound on the query text we will tokenize. `settings.query` is rehydrated
 * from localStorage, so a corrupted/oversized entry must not be able to make the
 * tokenizer walk an unbounded string on every keystroke.
 */
export const MAX_QUERY_LENGTH = 1024;

function tokenize(query: string): Term[] {
  const terms: Term[] = [];
  const re =
    /(-?)(?:"([^"]*)"|(\w+):([^\s"]+)|([^\s"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const neg = m[1] === "-";
    if (m[2] !== undefined) {
      terms.push({ kind: "quoted", value: m[2], neg });
    } else if (m[3] !== undefined) {
      terms.push({ kind: "op", op: m[3].toLowerCase(), value: m[4], neg });
    } else if (m[5] !== undefined) {
      terms.push({ kind: "bare", value: m[5], neg });
    }
  }
  return terms;
}

function hasRelation(
  node: GraphNode,
  edges: GraphEdge[],
  relation: string,
): boolean {
  const rel = relation.toLowerCase();
  return edges.some(
    (e) =>
      e.relation === rel && (e.source === node.id || e.target === node.id),
  );
}

function evalTerm(term: Term, node: GraphNode, edges: GraphEdge[]): boolean {
  let hit = false;
  if (term.kind === "bare" || term.kind === "quoted") {
    hit = node.label.toLowerCase().includes(term.value.toLowerCase());
  } else {
    const { op, value } = term;
    const v = value.toLowerCase();
    switch (op) {
      case "kind":
        hit = node.kind === v;
        break;
      case "space":
        hit = node.spaceId.toLowerCase() === v || node.spaceId.toLowerCase().includes(v);
        break;
      case "is":
        if (v === "forgotten") hit = !!node.forgotten;
        else if (v === "static" || v === "inference") {
          // Graph nodes don't carry these flags; match via label heuristics is avoided.
          // Consumers can pass enriched nodes; default false when absent.
          hit = !!(node as GraphNode & { isStatic?: boolean; isInference?: boolean })[
            v === "static" ? "isStatic" : "isInference"
          ];
        }
        break;
      case "rel":
        hit = hasRelation(node, edges, v);
        break;
      default:
        hit = false;
    }
  }
  return term.neg ? !hit : hit;
}

/** Parse a colour-group / filter query into a predicate (AND across terms). */
export function parseQuery(query: string): NodePredicate {
  const trimmed = query.slice(0, MAX_QUERY_LENGTH).trim();
  if (!trimmed) return () => true;
  const terms = tokenize(trimmed);
  if (!terms.length) return () => true;
  return (node, edges) => terms.every((t) => evalTerm(t, node, edges));
}

export function matchNode(
  query: string,
  node: GraphNode,
  edges: GraphEdge[],
): boolean {
  return parseQuery(query)(node, edges);
}

export type CompiledGroup<T> = { group: T; pred: NodePredicate };

/**
 * Parse each group query once. Resolving a group is per-node work, so parsing
 * inside the loop costs one tokenize per node per group.
 */
export function compileColorGroups<T extends { id: string; query: string }>(
  groups: T[],
): CompiledGroup<T>[] {
  const out: CompiledGroup<T>[] = [];
  for (const group of groups) {
    if (!group.query.trim()) continue;
    out.push({ group, pred: parseQuery(group.query) });
  }
  return out;
}

/** First matching group wins. */
export function resolveCompiledGroup<T>(
  compiled: CompiledGroup<T>[],
  node: GraphNode,
  edges: GraphEdge[],
): T | null {
  for (const c of compiled) {
    if (c.pred(node, edges)) return c.group;
  }
  return null;
}

/** First matching group wins. Prefer {@link compileColorGroups} in loops. */
export function resolveColorGroup<T extends { id: string; query: string }>(
  groups: T[],
  node: GraphNode,
  edges: GraphEdge[],
): T | null {
  return resolveCompiledGroup(compileColorGroups(groups), node, edges);
}
