import type { ColorGroup, GraphSettings } from "./types";

export const SETTINGS_KEY = "supermemory-graph-settings";
export const SETTINGS_VERSION = 2 as const;

export const DEFAULT_SETTINGS: GraphSettings = {
  version: SETTINGS_VERSION,
  query: "",
  showDocuments: true,
  showForgotten: false,
  space: "",
  colorBySpace: false,
  showSpaceBlobs: true,
  showContainsEdges: false,
  textFade: 0.35,
  nodeSize: 0.5,
  linkThickness: 0.5,
  centerForce: 0.5,
  repelForce: 0.5,
  linkForce: 0.5,
  linkDistance: 0.5,
  localGraph: false,
  localDepth: 1,
  localIncoming: true,
  localOutgoing: true,
  neighborLinks: true,
  colorGroups: [],
};

function clamp01(n: number, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeGroup(g: unknown): ColorGroup | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const token = o.token;
  const allowed = new Set([
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "good",
    "serious",
    "critical",
  ]);
  if (typeof o.id !== "string" || typeof o.query !== "string") return null;
  if (typeof token !== "string" || !allowed.has(token)) return null;
  return {
    id: o.id,
    query: o.query,
    token: token as ColorGroup["token"],
    label: typeof o.label === "string" ? o.label : undefined,
  };
}

export function clampSettings(raw: Partial<GraphSettings> | null | undefined): GraphSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, colorGroups: [] };

  const groups = Array.isArray(raw.colorGroups)
    ? raw.colorGroups.map(sanitizeGroup).filter((g): g is ColorGroup => !!g)
    : [];

  const fromVersion =
    typeof (raw as { version?: unknown }).version === "number"
      ? (raw as { version: number }).version
      : 0;
  // v1 briefly defaulted to colouring nodes by space; territories replaced that.
  // Reset so kind colours (memory/document/space) come back unless the user
  // already saved a custom colour-group list.
  const migratingFromSpaceFill = fromVersion < 2 && groups.length === 0;

  return {
    version: SETTINGS_VERSION,
    query: typeof raw.query === "string" ? raw.query : d.query,
    showDocuments: typeof raw.showDocuments === "boolean" ? raw.showDocuments : d.showDocuments,
    showForgotten:
      typeof raw.showForgotten === "boolean" ? raw.showForgotten : d.showForgotten,
    space: typeof raw.space === "string" ? raw.space : d.space,
    colorBySpace: migratingFromSpaceFill
      ? false
      : typeof raw.colorBySpace === "boolean"
        ? raw.colorBySpace
        : d.colorBySpace,
    showSpaceBlobs:
      typeof raw.showSpaceBlobs === "boolean" ? raw.showSpaceBlobs : d.showSpaceBlobs,
    showContainsEdges:
      typeof raw.showContainsEdges === "boolean"
        ? raw.showContainsEdges
        : d.showContainsEdges,
    textFade: clamp01(raw.textFade as number, d.textFade),
    nodeSize: clamp01(raw.nodeSize as number, d.nodeSize),
    linkThickness: clamp01(raw.linkThickness as number, d.linkThickness),
    centerForce: clamp01(raw.centerForce as number, d.centerForce),
    repelForce: clamp01(raw.repelForce as number, d.repelForce),
    linkForce: clamp01(raw.linkForce as number, d.linkForce),
    linkDistance: clamp01(raw.linkDistance as number, d.linkDistance),
    localGraph: typeof raw.localGraph === "boolean" ? raw.localGraph : d.localGraph,
    localDepth: clampInt(raw.localDepth as number, 1, 5, d.localDepth),
    localIncoming:
      typeof raw.localIncoming === "boolean" ? raw.localIncoming : d.localIncoming,
    localOutgoing:
      typeof raw.localOutgoing === "boolean" ? raw.localOutgoing : d.localOutgoing,
    neighborLinks:
      typeof raw.neighborLinks === "boolean" ? raw.neighborLinks : d.neighborLinks,
    colorGroups: groups,
  };
}

export function loadSettings(): GraphSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS, colorGroups: [] };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, colorGroups: [] };
    return clampSettings(JSON.parse(raw) as Partial<GraphSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS, colorGroups: [] };
  }
}

/** Write immediately. Prefer {@link saveSettings} from UI code. */
export function saveSettingsNow(settings: GraphSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(clampSettings(settings)),
    );
  } catch (err) {
    // Quota exceeded or private-mode storage. Non-fatal — settings simply do
    // not persist — but silent failure makes it undiagnosable, so log once.
    if (!warnedOnWriteFailure) {
      warnedOnWriteFailure = true;
      console.warn("[graph] could not persist settings", err);
    }
  }
}

let warnedOnWriteFailure = false;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let pendingSettings: GraphSettings | null = null;

export const SAVE_DEBOUNCE_MS = 250;

/**
 * Coalesce writes. Slider drags fire change events at frame rate; serializing
 * and hitting localStorage synchronously on each one blocks the drag.
 */
export function saveSettings(settings: GraphSettings): void {
  if (typeof window === "undefined") return;
  pendingSettings = settings;
  if (pendingWrite !== null) return;
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    const next = pendingSettings;
    pendingSettings = null;
    if (next) saveSettingsNow(next);
  }, SAVE_DEBOUNCE_MS);
}

/** Flush any coalesced write — call before the page can go away. */
export function flushSettings(): void {
  if (pendingWrite === null) return;
  clearTimeout(pendingWrite);
  pendingWrite = null;
  const next = pendingSettings;
  pendingSettings = null;
  if (next) saveSettingsNow(next);
}
