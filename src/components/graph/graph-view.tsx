"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRouteParams } from "@/components/route-host";
import {
  GraphCanvas,
  type HoverInfo,
  type LayoutStatus,
} from "@/components/graph/graph-canvas";
import { GraphDetail } from "@/components/graph/graph-detail";
import { GraphProgress } from "@/components/graph/graph-progress";
import { GraphLegend } from "@/components/graph/graph-legend";
import { GraphToolbar, GraphCustomizeButton } from "@/components/graph/graph-settings-panel";
import { Skeleton } from "@/components/ui";
import { PageTitle } from "@/components/shell";
import { PageTransition } from "@/components/blocks/page-transition";
import { egoSubgraph } from "@/lib/graph/ego";
import {
  compileColorGroups,
  parseQuery,
  resolveCompiledGroup,
} from "@/lib/graph/query";
import { NODE_COLOR } from "@/lib/graph/palette";
import {
  clampSettings,
  DEFAULT_SETTINGS,
  flushSettings,
  loadSettings,
  saveSettings,
} from "@/lib/graph/settings";
import { buildSpaceColorGroups, buildSpaceTokenMap, spaceDisplayName, spaceIdsInNodes, tokenForSpaceIndex } from "@/lib/graph/space-colors";
import type { ColorToken, GraphSettings, SimNode } from "@/lib/graph/types";
import { useGraph, useMemoryList, useSpaces } from "@/lib/queries";
import { usePageVisible } from "@/lib/query";
import type { GraphNode, MemoryEntry } from "@/lib/types";

/** Every memory, indexed for node enrichment and the detail panel. */
export const GRAPH_MEMORIES = { includeForgotten: true, limit: 500 } as const;

/**
 * Below this the settle finishes in well under a second, so the progress meter
 * would appear and vanish before it could be read.
 */
const LAYOUT_PROGRESS_MIN_NODES = 400;

function spaceNameMap(
  spaces: { containerTag: string; name: string }[],
  nodes?: GraphNode[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of spaces) {
    names.set(s.containerTag, spaceDisplayName(s.name, s.containerTag));
  }
  if (nodes) {
    for (const n of nodes) {
      if (n.kind === "space" && !names.has(n.id)) {
        names.set(n.id, spaceDisplayName(n.label, n.id));
      }
    }
  }
  return names;
}

export function GraphView() {
  const params = useRouteParams();
  const router = useRouter();
  const pathname = usePathname();
  const visible = usePageVisible();

  const [settings, setSettings] = useState<GraphSettings>(() => ({
    ...DEFAULT_SETTINGS,
    colorGroups: [],
  }));
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [layout, setLayout] = useState<LayoutStatus | null>(null);
  const hydratedUrl = useRef(false);
  const skipNextSave = useRef(true);

  const { spaces } = useSpaces();

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Hydrate local-graph URL params once
  useEffect(() => {
    if (hydratedUrl.current) return;
    hydratedUrl.current = true;
    // `focus` is applied separately, once graph data has arrived.
    const local = params.get("local") === "1";
    const depth = Number(params.get("depth") ?? "1");
    setSettings((s) =>
      clampSettings({
        ...s,
        localGraph: local || s.localGraph,
        localDepth: Number.isFinite(depth) ? depth : s.localDepth,
      }),
    );
  }, [params]);

  // Space is filtered client-side so switching is instant and colour tokens
  // stay anchored to the full corpus (see spaceTokens below).
  const graphInput = useMemo(
    () => ({
      documents: settings.showDocuments,
      forgotten: settings.showForgotten,
    }),
    [settings.showDocuments, settings.showForgotten],
  );
  const { data: raw, isLoading: loading } = useGraph(graphInput, {
    keepPreviousData: true,
  });

  const { data: memoryList } = useMemoryList(GRAPH_MEMORIES, {
    keepPreviousData: true,
  });
  const memoriesById = useMemo(() => {
    const map = new Map<string, MemoryEntry>();
    for (const m of memoryList?.memoryEntries ?? []) map.set(m.id, m);
    return map;
  }, [memoryList]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveSettings(settings);
  }, [settings]);

  // Persistence is debounced; make sure the last edit survives leaving the tab.
  useEffect(() => {
    const onHide = () => flushSettings();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushSettings();
    };
  }, [visible]);

  // Sync URL for local graph
  useEffect(() => {
    // The URL belongs to whichever tab is on screen — a hidden graph must not
    // rewrite it.
    if (!visible) return;
    // Until the graph has loaded there is no selection to describe, and writing
    // here would race the focus-from-URL effect below by clearing `?focus=`.
    if (!raw) return;
    const next = new URLSearchParams(params.toString());
    if (selected) next.set("focus", selected.id);
    else next.delete("focus");

    if (settings.localGraph && selected) {
      next.set("local", "1");
      next.set("depth", String(settings.localDepth));
    } else {
      next.delete("local");
      next.delete("depth");
    }

    const qs = next.toString();
    const current = params.toString();
    if (qs !== current) {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [
    visible,
    raw,
    selected,
    settings.localGraph,
    settings.localDepth,
    params,
    pathname,
    router,
  ]);

  // Focus from URL when data loads
  useEffect(() => {
    const focus = params.get("focus");
    if (!focus || !raw) return;
    const n = raw.nodes.find((x) => x.id === focus);
    if (n) setSelected(n);
  }, [raw, params]);

  // Nodes carry a couple of flags that only the memory list knows about.
  const enriched = useMemo(() => {
    if (!raw) return null;
    const nodes: GraphNode[] = raw.nodes.map((n) => {
      if (n.kind !== "memory") return n;
      const m = memoriesById.get(n.id);
      if (!m) return n;
      return {
        ...n,
        isStatic: m.isStatic,
        isInference: m.isInference,
      } as GraphNode & { isStatic?: boolean; isInference?: boolean };
    });
    return { nodes, edges: raw.edges };
  }, [raw, memoriesById]);

  // Selection changes membership only while local-graph or a filter query is
  // active; outside those modes it is purely presentational, so it is excluded
  // from the memo input rather than from the dependency list.
  const membershipFocusId =
    settings.localGraph || settings.query.trim()
      ? (selected?.id ?? null)
      : null;

  const displayData = useMemo(() => {
    if (!enriched) return null;
    let { nodes, edges } = enriched;

    if (settings.space) {
      const tag = settings.space;
      const keep = new Set(
        nodes
          .filter((n) =>
            n.kind === "space" ? n.id === tag : n.spaceId === tag,
          )
          .map((n) => n.id),
      );
      nodes = nodes.filter((n) => keep.has(n.id));
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    }

    if (settings.localGraph && membershipFocusId) {
      const ego = egoSubgraph(
        nodes,
        edges,
        membershipFocusId,
        settings.localDepth,
        {
          incoming: settings.localIncoming,
          outgoing: settings.localOutgoing,
          neighborLinks: settings.neighborLinks,
        },
      );
      nodes = ego.nodes;
      edges = ego.edges;
    }

    if (settings.query.trim()) {
      const pred = parseQuery(settings.query);
      const keep = new Set(
        nodes.filter((n) => pred(n, edges)).map((n) => n.id),
      );
      if (membershipFocusId) keep.add(membershipFocusId);
      nodes = nodes.filter((n) => keep.has(n.id));
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    }

    return { nodes, edges };
  }, [
    enriched,
    membershipFocusId,
    settings.space,
    settings.localGraph,
    settings.localDepth,
    settings.localIncoming,
    settings.localOutgoing,
    settings.neighborLinks,
    settings.query,
  ]);

  /** Full-corpus palette — query / space filters must not reshuffle tokens. */
  const spaceTokens = useMemo(() => {
    if (!enriched) return new Map<string, ColorToken>();
    const ids = new Set(spaceIdsInNodes(enriched.nodes));
    for (const s of spaces) ids.add(s.containerTag);
    return buildSpaceTokenMap(Array.from(ids));
  }, [enriched, spaces]);

  const counts = useMemo(() => {
    const c = { memory: 0, document: 0, space: 0 };
    if (!displayData) return c;
    for (const n of displayData.nodes) c[n.kind]++;
    return c;
  }, [displayData]);

  /** Manual groups win; otherwise colour-by-space generates one group per tag. */
  const effectiveColorGroups = useMemo(() => {
    if (settings.colorGroups.length > 0) return settings.colorGroups;
    if (!settings.colorBySpace || !displayData) return [];
    const names = spaceNameMap(spaces, displayData.nodes);
    return buildSpaceColorGroups(displayData.nodes, names, spaceTokens);
  }, [
    settings.colorGroups,
    settings.colorBySpace,
    displayData,
    spaces,
    spaceTokens,
  ]);

  const compiledGroups = useMemo(
    () => compileColorGroups(effectiveColorGroups),
    [effectiveColorGroups],
  );

  const groupCounts = useMemo(() => {
    const out: Record<string, number> = {};
    if (!displayData) return out;
    for (const g of effectiveColorGroups) out[g.id] = 0;
    for (const n of displayData.nodes) {
      const g = resolveCompiledGroup(compiledGroups, n, displayData.edges);
      if (g) out[g.id] = (out[g.id] ?? 0) + 1;
    }
    return out;
  }, [displayData, effectiveColorGroups, compiledGroups]);

  const canvasSettings = useMemo(
    () => ({ ...settings, colorGroups: effectiveColorGroups }),
    [settings, effectiveColorGroups],
  );

  const spaceLegend = useMemo(() => {
    if (!settings.showSpaceBlobs || !displayData || effectiveColorGroups.length)
      return undefined;
    const names = spaceNameMap(spaces, displayData.nodes);
    const counts = new Map<string, number>();
    for (const n of displayData.nodes) {
      const sid = n.kind === "space" ? n.id : n.spaceId;
      if (!sid) continue;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
    const ids = Array.from(counts.keys()).sort();
    return ids.map((id) => ({
      id,
      label: names.get(id) ?? id,
      token: spaceTokens.get(id) ?? tokenForSpaceIndex(0),
      count: counts.get(id) ?? 0,
    }));
  }, [
    settings.showSpaceBlobs,
    displayData,
    effectiveColorGroups.length,
    spaces,
    spaceTokens,
  ]);

  const selectedGroup = selected
    ? resolveCompiledGroup(compiledGroups, selected, displayData?.edges ?? [])
    : null;

  const detail =
    selected?.kind === "memory" ? (memoriesById.get(selected.id) ?? null) : null;

  const patchSettings = (next: GraphSettings) => setSettings(clampSettings(next));

  const handleSelect = (node: SimNode | null) => {
    if (!node) {
      setSelected(null);
      setSettings((s) =>
        s.localGraph ? clampSettings({ ...s, localGraph: false }) : s,
      );
      return;
    }
    setSelected(node);
  };

  const enterLocal = () => {
    if (!selected) return;
    setSettings((s) => clampSettings({ ...s, localGraph: true }));
  };

  const exitLocal = () => {
    setSettings((s) => clampSettings({ ...s, localGraph: false }));
  };

  const localActive = settings.localGraph && !!selected;
  const fitRef = useRef<(() => void) | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex min-w-0 max-w-3xl flex-[1_1_20rem] flex-col items-start gap-1 sm:flex-row sm:items-start sm:gap-4">
            <PageTitle
              label="Recall"
              title="Memory graph"
              description="Space territories; memories and documents by kind."
            />
            {/* The hover readout sits beside the title on desktop and under it
                on a phone, where there is no room for two columns. */}
            <div className="flex min-h-0 w-full min-w-0 flex-col justify-center sm:min-h-[5.75rem] sm:w-auto sm:flex-1">
              {hover ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: hover.groupToken
                          ? `var(--${hover.groupToken})`
                          : hover.forgotten
                            ? "var(--muted-foreground)"
                            : NODE_COLOR[hover.kind],
                      }}
                    />
                    <span className="label shrink-0">
                      {hover.groupLabel
                        ? hover.groupLabel
                        : hover.forgotten
                          ? "forgotten memory"
                          : hover.kind}
                    </span>
                    <span className="tnum shrink-0 text-[11px] text-brand-black/40">
                      · {hover.degree}{" "}
                      {hover.degree === 1 ? "connection" : "connections"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-4 text-[13px] leading-snug break-words text-brand-black/65">
                    {hover.label}
                  </p>
                </>
              ) : displayData ? (
                <span className="text-xs text-brand-black/40 tnum">
                  {displayData.nodes.length} nodes ·{" "}
                  {
                    displayData.edges.filter(
                      (e) =>
                        settings.showContainsEdges || e.relation !== "contains",
                    ).length
                  }{" "}
                  edges
                </span>
              ) : null}
            </div>
          </div>
          <GraphToolbar
            // Takes the full row until there is desktop width to spare — as a
            // shrink-0 nowrap row its chips ran off the right edge on a phone
            // and again at the tablet breakpoint.
            className="w-full min-w-0 lg:w-auto lg:shrink-0"
            settings={settings}
            onChange={patchSettings}
            spaces={spaces}
            localActive={localActive}
            onExitLocal={exitLocal}
          />
        </div>
      </div>

      <PageTransition className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {loading && !displayData ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton className="size-64 rounded-full" />
            </div>
          ) : displayData ? (
            <GraphCanvas
              data={displayData}
              settings={canvasSettings}
              spaceTokens={spaceTokens}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
              onHoverChange={setHover}
              onLayoutStatus={setLayout}
              fitRef={fitRef}
            />
          ) : null}

          {/* Only worth a meter when the wait is perceptible; small graphs
              settle in a frame or two and a flashing bar is just noise. */}
          {loading && !displayData ? (
            <GraphProgress phase="fetching" />
          ) : layout?.active && layout.nodes > LAYOUT_PROGRESS_MIN_NODES ? (
            <GraphProgress
              phase="layout"
              completed={layout.completed}
              total={layout.total}
              nodes={layout.nodes}
            />
          ) : null}

          {selected && (
            <GraphDetail
              selected={selected}
              detail={detail}
              colorGroup={selectedGroup}
              localActive={localActive}
              onEnterLocal={enterLocal}
              onClose={() => handleSelect(null)}
            />
          )}
        </div>

        <GraphLegend
          counts={counts}
          showForgotten={settings.showForgotten}
          colorGroups={effectiveColorGroups}
          groupCounts={groupCounts}
          groupHeading={
            settings.colorGroups.length > 0
              ? "Groups"
              : settings.colorBySpace
                ? "Spaces"
                : "Nodes"
          }
          showContainsEdges={settings.showContainsEdges}
          spaces={spaceLegend}
          trailing={
            <div className="flex items-center gap-1.5">
              <GraphCustomizeButton
                settings={settings}
                onChange={patchSettings}
                localActive={localActive}
              />
              <button
                type="button"
                onClick={() => fitRef.current?.()}
                className="focus-ring rounded-lg border border-brand-black/[0.06] bg-card px-2.5 py-1 text-[11px] text-brand-black/70 transition-colors hover:bg-brand-black/[0.04] hover:text-brand-black"
              >
                Fit view
              </button>
            </div>
          }
        />
      </PageTransition>
    </div>
  );
}
