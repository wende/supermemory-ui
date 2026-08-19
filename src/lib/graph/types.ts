import type { GraphEdge, GraphNode } from "@/lib/types";

export type ColorToken =
  | "s1"
  | "s2"
  | "s3"
  | "s4"
  | "s5"
  | "good"
  | "serious"
  | "critical";

export interface ColorGroup {
  id: string;
  query: string;
  token: ColorToken;
  /** Optional display name; defaults to query. */
  label?: string;
}

export interface GraphSettings {
  /** Bumped when defaults migrate; currently 2. */
  version: number;
  query: string;
  showDocuments: boolean;
  showForgotten: boolean;
  space: string;
  /** Fill nodes by space membership instead of kind (ignored when colorGroups is set). */
  colorBySpace: boolean;
  /** Soft territory behind each space's nodes. */
  showSpaceBlobs: boolean;
  /** Draw space→memory `contains` edges ("in space"). Off by default — noisy hubs. */
  showContainsEdges: boolean;
  textFade: number;
  nodeSize: number;
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  localGraph: boolean;
  localDepth: number;
  localIncoming: boolean;
  localOutgoing: boolean;
  neighborLinks: boolean;
  colorGroups: ColorGroup[];
}

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  degree: number;
  fx?: number | null;
  fy?: number | null;
  pinned?: boolean;
  /** Resolved fill token / kind for colour groups. */
  groupId?: string | null;
  groupToken?: ColorToken | null;
  index?: number;
}

export interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  relation: GraphEdge["relation"];
  strength?: number;
  index?: number;
}

export type PositionMap = Map<string, { x: number; y: number; pinned?: boolean }>;

export type NodePredicate = (node: GraphNode, edges: GraphEdge[]) => boolean;
