"use client";

/**
 * RouteHost — keeps every visited tab mounted.
 *
 * The App Router unmounts a page segment as soon as you navigate away, so each
 * tab switch used to rebuild the page from scratch: new component tree, new
 * effects, new requests, and a skeleton while they landed. The host renders the
 * tabs itself instead, one frame per route, and hides the inactive ones with
 * `display: none`. React state, DOM state and scroll position all survive, so
 * coming back to a tab shows exactly what you left.
 *
 * Three things make the first visit fast too:
 *
 *   - route chunks are imported while the browser is idle, so no tab switch
 *     waits on a network round trip for its JavaScript,
 *   - `router.prefetch` warms the App Router's own cache for the stub segment.
 *
 * Hidden frames are marked not-visible via `PageVisibleProvider`, which is what
 * stops eleven mounted pages from polling at once: `useQuery` only fetches for
 * on-screen subtrees, and revalidates stale data the moment a tab is shown.
 */

import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { Skeleton } from "@/components/ui";
import { PageVisibleProvider } from "@/lib/query";
import { HOSTED_ROUTES, matchRoute } from "@/routes/registry";

const LAZY_PAGES = new Map<string, ComponentType>(
  HOSTED_ROUTES.map((route) => [route.path, lazy(route.load)]),
);

function onIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    window.setTimeout(run, 200);
  }
}

export function RouteHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activePath = useMemo(() => matchRoute(pathname), [pathname]);

  const [mounted, setMounted] = useState<string[]>(() =>
    activePath ? [activePath] : [],
  );

  useEffect(() => {
    if (!activePath) return;
    setMounted((paths) =>
      paths.includes(activePath) ? paths : [...paths, activePath],
    );
  }, [activePath]);

  // Preload one route per idle slot rather than all of them at once, so the
  // tab the user is actually looking at keeps the main thread and the network.
  useEffect(() => {
    let cancelled = false;
    const queue = HOSTED_ROUTES.slice();

    const step = () => {
      if (cancelled) return;
      const route = queue.shift();
      if (!route) return;
      router.prefetch(route.path);
      route
        .load()
        .catch(() => {
          // A chunk that fails to preload is re-requested on navigation.
        })
        .finally(() => {
          if (!cancelled) onIdle(step);
        });
    };

    onIdle(step);
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      {mounted.map((path) => (
        <RouteFrame key={path} path={path} active={path === activePath} />
      ))}
      {/* Anything the host does not own (a 404, say) still renders normally. */}
      {activePath ? null : children}
    </>
  );
}

function RouteFrame({ path, active }: { path: string; active: boolean }) {
  const Page = LAZY_PAGES.get(path);
  if (!Page) return null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={active ? undefined : { display: "none" }}
    >
      <PageVisibleProvider visible={active}>
        <Suspense fallback={<RouteSkeleton />}>
          <RouteScope path={path} active={active}>
            <Page />
          </RouteScope>
        </Suspense>
      </PageVisibleProvider>
    </div>
  );
}

function RouteSkeleton() {
  return (
    <div className="p-8">
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-tab search params                                               */
/* ------------------------------------------------------------------ */

interface RouteScopeValue {
  path: string;
  active: boolean;
  params: ReadonlyURLSearchParams;
}

const RouteScopeContext = createContext<RouteScopeValue | null>(null);

function RouteScope({
  path,
  active,
  children,
}: {
  path: string;
  active: boolean;
  children: ReactNode;
}) {
  const live = useSearchParams();

  // The URL describes the tab on screen. A hidden tab keeps the params it was
  // last shown with instead of reading someone else's query string.
  const [frozen, setFrozen] = useState(live);
  if (active && frozen !== live) setFrozen(live);

  const value = useMemo(
    () => ({ path, active, params: active ? live : frozen }),
    [path, active, live, frozen],
  );

  return (
    <RouteScopeContext.Provider value={value}>
      {children}
    </RouteScopeContext.Provider>
  );
}

/**
 * `useSearchParams` for a hosted tab: live while the tab is on screen, frozen
 * at its last value while it is hidden. Outside the host it is just
 * `useSearchParams`.
 */
export function useRouteParams(): ReadonlyURLSearchParams {
  const scope = useContext(RouteScopeContext);
  const live = useSearchParams();
  return scope ? scope.params : live;
}
