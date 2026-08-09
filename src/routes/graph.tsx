"use client";

import { GRAPH_MEMORIES, GraphView } from "@/components/graph/graph-view";
import { DEFAULT_SETTINGS } from "@/lib/graph/settings";
import { prefetch } from "@/lib/queries";

export function warm(): void {
  void prefetch.spaces();
  // The first draw always uses the defaults; stored settings, if any, are
  // applied after mount and fetch their own combination.
  // Full corpus — space filter is applied client-side for instant switching.
  void prefetch.graph({
    documents: DEFAULT_SETTINGS.showDocuments,
    forgotten: DEFAULT_SETTINGS.showForgotten,
  });
  void prefetch.memories({ ...GRAPH_MEMORIES });
}

export default GraphView;
