/**
 * The tabs `RouteHost` keeps mounted.
 *
 * Each entry points at a module under `src/routes/`. The matching file in
 * `src/app/` is a stub that renders nothing — moving the implementation out of
 * the route segment is what lets a tab survive navigation instead of being torn
 * down and rebuilt every time the user comes back to it.
 *
 * A module may export `warm()` to pull its first screen of data into the query
 * cache while the browser is idle; the host calls it after preloading the
 * chunk.
 */

import type { ComponentType } from "react";

export interface HostedRouteModule {
  default: ComponentType;
  warm?: () => void;
}

export interface HostedRoute {
  /** Pathname prefix, matched the same way the sidebar marks a tab active. */
  path: string;
  load: () => Promise<HostedRouteModule>;
}

/** Ordered by how likely a tab is to be opened — the host preloads in order. */
export const HOSTED_ROUTES: HostedRoute[] = [
  { path: "/memories", load: () => import("@/routes/memories") },
  { path: "/timeline", load: () => import("@/routes/timeline") },
  { path: "/graph", load: () => import("@/routes/graph") },
  { path: "/documents", load: () => import("@/routes/documents") },
  { path: "/add", load: () => import("@/routes/add") },
  { path: "/spaces", load: () => import("@/routes/spaces") },
  { path: "/profile", load: () => import("@/routes/profile") },
  { path: "/forget", load: () => import("@/routes/forget") },
  { path: "/settings", load: () => import("@/routes/settings") },
  { path: "/api", load: () => import("@/routes/api-explorer") },
  { path: "/", load: () => import("@/routes/dashboard") },
];

/** `/` matches exactly; everything else matches by prefix. */
export function matchRoute(pathname: string): string | null {
  for (const route of HOSTED_ROUTES) {
    if (route.path === "/") continue;
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      return route.path;
    }
  }
  return pathname === "/" ? "/" : null;
}
