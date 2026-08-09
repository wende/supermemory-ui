import type { GraphNode } from "@/lib/types";

export const NODE_COLOR: Record<GraphNode["kind"], string> = {
  document: "var(--s2)",
  space: "var(--s2)",
  memory: "var(--s3)",
};

export type ThemePalette = {
  document: string;
  space: string;
  memory: string;
  forgotten: string;
  card: string;
  foreground: string;
  ink70: string;
  labelStroke: string;
  edgeContains: string;
  edgeSources: string;
  edgeExtends: string;
  edgeDerives: string;
  edgeUpdates: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  good: string;
  serious: string;
  critical: string;
};

export function resolveCssColor(el: Element, value: string, fallback: string): string {
  if (!value) return fallback;
  // Hex / rgb / named colors paint fine on canvas; color-mix / vars need resolving.
  if (/^#|^rgb|^hsl|^oklch|^[a-z]+$/i.test(value.trim())) return value.trim();
  const probe = document.createElement("span");
  probe.style.color = value;
  el.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  el.removeChild(probe);
  return resolved || fallback;
}

export function readPalette(el: Element): ThemePalette {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  const ink = get("--brand-black", "#111111");
  const fg = get("--foreground", "#111111");
  const bg = get("--background", "#0b0b0c");
  const s1 = get("--s1", "#2b6fa8");
  const s2 = get("--s2", "#ff5500");
  const s3 = get("--s3", "#1fa0b5");
  const s4 = get("--s4", "#6e7c8a");
  const s5 = get("--s5", "#e23a8c");
  return {
    document: s2,
    space: s2,
    memory: s3,
    forgotten: get("--muted-foreground", "#5c5b57"),
    card: get("--card", "#141416"),
    foreground: fg,
    ink70: resolveCssColor(
      el,
      `color-mix(in oklab, ${ink} 70%, transparent)`,
      "rgba(17,17,17,0.7)",
    ),
    labelStroke: resolveCssColor(
      el,
      `color-mix(in oklab, ${bg} 92%, transparent)`,
      "rgba(11,11,12,0.92)",
    ),
    edgeContains: resolveCssColor(
      el,
      `color-mix(in oklab, ${ink} 7%, transparent)`,
      "rgba(17,17,17,0.07)",
    ),
    edgeSources: resolveCssColor(
      el,
      `color-mix(in oklab, ${s1} 16%, transparent)`,
      "rgba(43,111,168,0.16)",
    ),
    // Quiet mauve — same visual weight class as derives, not a highlight colour.
    edgeExtends: resolveCssColor(
      el,
      `color-mix(in oklab, ${ink} 42%, ${s5} 12%)`,
      "rgba(70, 55, 62, 0.55)",
    ),
    edgeDerives: resolveCssColor(
      el,
      `color-mix(in oklab, ${ink} 48%, transparent)`,
      "rgba(17,17,17,0.48)",
    ),
    edgeUpdates: resolveCssColor(
      el,
      `color-mix(in oklab, ${ink} 34%, transparent)`,
      "rgba(17,17,17,0.34)",
    ),
    s1,
    s2,
    s3,
    s4,
    s5,
    good: get("--good", "#1f8a5b"),
    serious: get("--serious", "#c96a42"),
    critical: get("--critical", "#e01820"),
  };
}

export function tokenCssVar(
  token: "s1" | "s2" | "s3" | "s4" | "s5" | "good" | "serious" | "critical",
): string {
  return `var(--${token})`;
}
