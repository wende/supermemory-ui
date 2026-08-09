import type { ColorToken } from "./types";

export type Pt = { x: number; y: number };

/** Andrew's monotone chain. Returns CCW hull; duplicate-safe. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 1) return points.slice();
  const pts = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Push each hull vertex away from the centroid by `pad`. */
export function inflateHull(hull: Pt[], pad: number): Pt[] {
  if (hull.length === 0 || pad === 0) return hull.slice();
  if (hull.length === 1) {
    const c = hull[0]!;
    const steps = 12;
    const out: Pt[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      out.push({ x: c.x + Math.cos(a) * pad, y: c.y + Math.sin(a) * pad });
    }
    return out;
  }

  let cx = 0;
  let cy = 0;
  for (const p of hull) {
    cx += p.x;
    cy += p.y;
  }
  cx /= hull.length;
  cy /= hull.length;

  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}

/**
 * Rounded blob path: quadratic curves through edge midpoints so the hull
 * reads as a soft territory rather than a polygon.
 * `pad` is the same radius used by `inflateHull` — small hulls draw with it
 * directly so the visible shape matches the inflated territory.
 */
export function traceSmoothHull(
  ctx: Pick<
    CanvasRenderingContext2D,
    "beginPath" | "moveTo" | "quadraticCurveTo" | "closePath" | "arc" | "ellipse"
  >,
  hull: Pt[],
  pad = 36,
): void {
  if (hull.length === 0) return;
  if (hull.length === 1) {
    const p = hull[0]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pad, 0, Math.PI * 2);
    return;
  }
  if (hull.length === 2) {
    const [a, b] = hull as [Pt, Pt];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const rx = Math.hypot(b.x - a.x, b.y - a.y) / 2 + pad;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.ellipse(mx, my, rx, pad, angle, 0, Math.PI * 2);
    return;
  }

  // n≥3 only — n=1/2 returned above; inflateHull preserves length for n≥3.
  const inflated = pad === 0 ? hull : inflateHull(hull, pad);
  const n = inflated.length;
  if (n < 3) return;
  ctx.beginPath();
  const firstMidX = (inflated[0]!.x + inflated[1]!.x) / 2;
  const firstMidY = (inflated[0]!.y + inflated[1]!.y) / 2;
  ctx.moveTo(firstMidX, firstMidY);
  for (let i = 1; i < n; i++) {
    const cur = inflated[i]!;
    const next = inflated[(i + 1) % n]!;
    ctx.quadraticCurveTo(
      cur.x,
      cur.y,
      (cur.x + next.x) / 2,
      (cur.y + next.y) / 2,
    );
  }
  const last = inflated[0]!;
  ctx.quadraticCurveTo(last.x, last.y, firstMidX, firstMidY);
  ctx.closePath();
}

export type SpaceBlob = {
  spaceId: string;
  token: ColorToken;
  label: string;
  hull: Pt[];
  pad: number;
};

/**
 * Build one padded hull per space from member node positions.
 * Space hub nodes are included so lonely spaces still get a territory.
 * Hulls are stored un-inflated; `traceSmoothHull(blob.hull, blob.pad)` applies pad.
 */
export function buildSpaceBlobs(
  nodes: Array<{ x: number; y: number; r: number; spaceId: string; kind: string; id: string; label: string }>,
  tokenForSpace: (spaceId: string) => ColorToken,
  pad = 36,
): SpaceBlob[] {
  const bySpace = new Map<string, { pts: Pt[]; label: string }>();

  for (const n of nodes) {
    const sid = n.kind === "space" ? n.id : n.spaceId;
    if (!sid) continue;
    let bucket = bySpace.get(sid);
    if (!bucket) {
      bucket = {
        pts: [],
        label: n.kind === "space" ? n.label : sid,
      };
      bySpace.set(sid, bucket);
    }
    if (n.kind === "space") bucket.label = n.label;
    // Sample the node as a small ring so large hubs inflate the blob naturally.
    const rr = Math.max(n.r, 4);
    bucket.pts.push({ x: n.x, y: n.y });
    bucket.pts.push({ x: n.x + rr, y: n.y });
    bucket.pts.push({ x: n.x - rr, y: n.y });
    bucket.pts.push({ x: n.x, y: n.y + rr });
    bucket.pts.push({ x: n.x, y: n.y - rr });
  }

  const out: SpaceBlob[] = [];
  for (const [spaceId, { pts, label }] of bySpace) {
    // Store the raw hull; `traceSmoothHull` applies `pad` so n=1/2/≥3 agree.
    const hull = convexHull(pts);
    if (hull.length === 0) continue;
    out.push({
      spaceId,
      token: tokenForSpace(spaceId),
      label,
      hull,
      pad,
    });
  }
  // Stable paint order: larger territories first so small ones sit on top.
  out.sort((a, b) => b.hull.length - a.hull.length);
  return out;
}

/** Parse canvas-ready colors into an rgba string with a new alpha. */
export function withAlpha(color: string, alpha: number): string {
  const raw = color.trim();

  // Comma rgb/rgba: rgb(10, 20, 30) / rgba(10, 20, 30, 0.5)
  const comma = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i,
  );
  if (comma) {
    return `rgba(${comma[1]}, ${comma[2]}, ${comma[3]}, ${alpha})`;
  }

  // Modern space-separated: rgb(10 20 30 / 0.5) or rgb(10 20 30)
  const space = raw.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.%]+)?\s*\)$/i,
  );
  if (space) {
    return `rgba(${space[1]}, ${space[2]}, ${space[3]}, ${alpha})`;
  }

  // Hex #rgb / #rrggbb / #rrggbbaa
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) {
    let h = raw.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    } else if (h.length === 8) {
      h = h.slice(0, 6);
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Unresolved var()/color-mix() — caller should resolve via resolveCssColor first.
  return raw;
}
