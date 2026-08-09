"use client";

/**
 * A tiny stale-while-revalidate cache for the `/api/*` client.
 *
 * The console keeps every visited tab mounted (see `RouteHost`), so pages no
 * longer refetch simply because they were remounted. What they need instead is
 * a shared store that:
 *
 *   - hands back the last known answer synchronously, so a tab switch paints
 *     immediately instead of flashing a skeleton,
 *   - refreshes that answer in the background when it is older than
 *     `staleTime`, when a hidden tab is shown again, or when the browser tab
 *     regains focus,
 *   - de-duplicates identical in-flight requests (seven pages ask for
 *     `api.spaces()`; one request answers all of them),
 *   - lets a mutation invalidate whole families of keys at once.
 *
 * Fetches only run for *visible* subtrees. A hidden tab holds on to its data
 * and revalidates the moment it is shown, which is what keeps eleven mounted
 * pages from polling the backend in parallel.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** How long a cached answer is served without a background refresh. */
export const DEFAULT_STALE_TIME = 15_000;

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  /** Epoch ms of the last success; `0` while the key has never resolved. */
  updatedAt: number;
  isFetching: boolean;
}

interface Entry {
  state: QueryState<unknown>;
  /** Latest fetcher seen for this key, so `invalidateQueries` can re-run it. */
  fetcher?: () => Promise<unknown>;
  inflight?: Promise<unknown>;
  /** Bumped by invalidation; a settled fetch from an older generation is refetched. */
  generation: number;
  listeners: Set<() => void>;
}

const EMPTY: QueryState<never> = {
  data: undefined,
  error: null,
  updatedAt: 0,
  isFetching: false,
};

const cache = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { state: EMPTY, generation: 0, listeners: new Set() };
    cache.set(key, entry);
  }
  return entry;
}

function publish(entry: Entry, patch: Partial<QueryState<unknown>>): void {
  entry.state = { ...entry.state, ...patch };
  for (const listener of entry.listeners) listener();
}

/**
 * Resolve `key`, fetching only when the cached value is missing, stale, or
 * `force`d. Concurrent callers share one request. Rejections are recorded on
 * the entry rather than thrown — background refreshes have no caller to catch
 * them.
 */
export function fetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { staleTime?: number; force?: boolean } = {},
): Promise<T | undefined> {
  const entry = entryFor(key);
  entry.fetcher = fetcher as () => Promise<unknown>;

  if (entry.inflight) return entry.inflight as Promise<T | undefined>;

  const staleTime = options.staleTime ?? DEFAULT_STALE_TIME;
  const fresh =
    entry.state.updatedAt > 0 && Date.now() - entry.state.updatedAt < staleTime;
  if (!options.force && fresh) {
    return Promise.resolve(entry.state.data as T);
  }

  const generation = entry.generation;
  const run = async (): Promise<T | undefined> => {
    try {
      const data = await fetcher();
      if (generation !== entry.generation) return undefined;
      publish(entry, {
        data,
        error: null,
        updatedAt: Date.now(),
        isFetching: false,
      });
      return data;
    } catch (error) {
      if (generation !== entry.generation) return undefined;
      publish(entry, { error, isFetching: false });
      return undefined;
    } finally {
      entry.inflight = undefined;
      // Invalidated mid-flight: the answer we just got predates the change.
      if (generation !== entry.generation && entry.fetcher) {
        void fetchQuery(key, entry.fetcher, { force: true });
      }
    }
  };

  publish(entry, { isFetching: true });
  const promise = run();
  entry.inflight = promise;
  return promise;
}

/** Read a cached value without triggering a fetch. */
export function readQuery<T>(key: string): T | undefined {
  return cache.get(key)?.state.data as T | undefined;
}

/**
 * Mark every key starting with `prefix` as stale. Visible subscribers refetch
 * straight away (their effect watches `generation`); hidden ones refetch when
 * their tab is shown again.
 */
export function invalidateQueries(prefix: string): void {
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    entry.generation += 1;
    publish(entry, { updatedAt: 0 });
  }
}

/** Stable cache key for a request shaped by an options object. */
export function queryKey(scope: string, input?: unknown): string {
  if (input === undefined) return scope;
  return `${scope}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/* ------------------------------------------------------------------ */
/* Visibility                                                          */
/* ------------------------------------------------------------------ */

const PageVisibleContext = createContext(true);

/** Marks a subtree as on-screen. `RouteHost` wraps each tab in one of these. */
export function PageVisibleProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <PageVisibleContext.Provider value={visible}>
      {children}
    </PageVisibleContext.Provider>
  );
}

/** `false` inside a tab that is mounted but hidden. Defaults to `true`. */
export function usePageVisible(): boolean {
  return useContext(PageVisibleContext);
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface UseQueryOptions {
  /** Skip the request entirely (e.g. a filter the user has not filled in). */
  enabled?: boolean;
  staleTime?: number;
  /** Poll while visible. Pass `false` to stop — the timer is torn down. */
  refetchInterval?: number | false;
  /** Keep showing the previous key's data while the new key loads. */
  keepPreviousData?: boolean;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  /** No data to show yet. */
  isLoading: boolean;
  /** A request is in flight, including a background refresh over stale data. */
  isFetching: boolean;
  updatedAt: number;
  refetch: () => Promise<T | undefined>;
}

/**
 * Subscribe to `key`, fetching through the shared cache.
 *
 * Pass `null` as the key to hold the hook in a disabled state (its rules-of-
 * hooks position stays fixed while the request does not run).
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseQueryOptions = {},
): QueryResult<T> {
  const {
    enabled = true,
    staleTime = DEFAULT_STALE_TIME,
    refetchInterval = false,
    keepPreviousData = false,
  } = options;

  const visible = usePageVisible();
  const active = enabled && key !== null;

  // The fetcher is usually a fresh closure each render; keep the latest one
  // without making it a dependency of the effects below.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const load = useCallback(
    (opts: { force?: boolean } = {}) =>
      key
        ? fetchQuery<T>(key, () => fetcherRef.current(), { staleTime, ...opts })
        : Promise.resolve(undefined),
    [key, staleTime],
  );

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!key) return () => {};
      const entry = entryFor(key);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(
    () => (key ? (cache.get(key)?.state ?? EMPTY) : EMPTY),
    [key],
  );
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY as QueryState<T>,
  ) as QueryState<T>;

  // Invalidation bumps `generation` even when `updatedAt` is already 0 (failed
  // refetch, never loaded). Reading it here — after the store notified us —
  // lets the fetch effect re-run on every invalidate, not only the first.
  const generation = key ? (cache.get(key)?.generation ?? 0) : 0;

  // Carry the last resolved value across key changes so switching a filter
  // dims the old list instead of replacing it with a skeleton.
  const previous = useRef<T | undefined>(undefined);
  if (state.data !== undefined) previous.current = state.data;
  const data =
    state.data !== undefined
      ? state.data
      : keepPreviousData
        ? previous.current
        : undefined;

  // Registering the fetcher even while hidden lets `invalidateQueries` refetch
  // a key whose only subscribers are off-screen tabs.
  useEffect(() => {
    if (key && active) entryFor(key).fetcher = () => fetcherRef.current();
  }, [key, active]);

  // Fetch on mount, on key change, when the tab is shown, and whenever the
  // entry is invalidated (`updatedAt` drops to 0 and/or `generation` bumps).
  useEffect(() => {
    if (!active || !visible) return;
    void load();
  }, [active, visible, load, state.updatedAt, generation]);

  useEffect(() => {
    if (!active || !visible || !refetchInterval) return;
    const timer = setInterval(() => void load({ force: true }), refetchInterval);
    return () => clearInterval(timer);
  }, [active, visible, refetchInterval, load]);

  useEffect(() => {
    if (!active || !visible) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [active, visible, load]);

  return {
    data,
    error: state.error,
    isLoading: active && data === undefined && state.error == null,
    isFetching: state.isFetching,
    updatedAt: state.updatedAt,
    refetch: useCallback(() => load({ force: true }), [load]),
  };
}
