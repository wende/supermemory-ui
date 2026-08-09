"use client";

/**
 * The console's shared query definitions.
 *
 * Every page reads its data through these helpers rather than calling `api.*`
 * from an effect, so a value fetched by one tab is already on screen when
 * another tab asks for it. Keeping the keys in one place is also what makes
 * invalidation after a mutation tractable: `invalidateCorpus()` marks every
 * derived view stale, and each tab picks the refresh up when it is next shown.
 */

import { api, type Stats } from "./api";
import { spaceDisplayName } from "./format";
import { fetchQuery, invalidateQueries, queryKey, useQuery, type UseQueryOptions } from "./query";
import type {
  ContainerTag,
  Document,
  DocumentListResponse,
  GraphResponse,
  MemoryListResponse,
  MergeStatus,
  OrgSettings,
  ProfileResponse,
  ServerInfo,
} from "./types";

/** Key scopes. Prefixes double as invalidation groups. */
export const KEY = {
  spaces: "spaces",
  stats: "stats",
  health: "health",
  settings: "settings",
  processing: "documents:processing",
  documents: "documents:list",
  memories: "memories:list",
  profile: "profile",
  graph: "graph",
} as const;

/**
 * Mark everything derived from the document + memory corpus as stale. Call it
 * after any ingest, edit, forget, merge or delete.
 */
export function invalidateCorpus(): void {
  for (const scope of [
    KEY.spaces,
    KEY.stats,
    KEY.health,
    KEY.processing,
    KEY.documents,
    KEY.memories,
    KEY.profile,
    KEY.graph,
  ]) {
    invalidateQueries(scope);
  }
}

/* ------------------------------------------------------------------ */
/* Unparameterised queries                                             */
/* ------------------------------------------------------------------ */

type SpacesResponse = { containerTags: ContainerTag[]; merges: MergeStatus[] };
type HealthResponse = ServerInfo & {
  status: string;
  backend?: "mock" | "remote";
  remoteConfigured?: boolean;
};

const fetchSpaces = async (): Promise<SpacesResponse> => {
  const data = await api.spaces();
  return {
    ...data,
    containerTags: data.containerTags.map((s) => ({
      ...s,
      name: spaceDisplayName(s.name, s.containerTag),
    })),
  };
};
const fetchStats = () => api.stats();
const fetchHealth = () => api.health();
const fetchSettings = () => api.settings();
const fetchProcessing = () => api.processing();

const NO_SPACES: ContainerTag[] = [];
const NO_DOCUMENTS: Document[] = [];

/** Container tags, shared by every page with a space picker. */
export function useSpaces(options?: UseQueryOptions) {
  const query = useQuery<SpacesResponse>(KEY.spaces, fetchSpaces, options);
  return {
    ...query,
    spaces: query.data?.containerTags ?? NO_SPACES,
    merges: query.data?.merges ?? [],
  };
}

export function useStats(options?: UseQueryOptions) {
  return useQuery<Stats>(KEY.stats, fetchStats, options);
}

export function useHealth(options?: UseQueryOptions) {
  return useQuery<HealthResponse>(KEY.health, fetchHealth, options);
}

export function useSettings(options?: UseQueryOptions) {
  return useQuery<OrgSettings>(KEY.settings, fetchSettings, options);
}

/** Documents still moving through the ingest pipeline. */
export function useProcessing(options?: UseQueryOptions) {
  const query = useQuery<{ documents: Document[]; count: number }>(
    KEY.processing,
    fetchProcessing,
    options,
  );
  return { ...query, documents: query.data?.documents ?? NO_DOCUMENTS };
}

/* ------------------------------------------------------------------ */
/* Parameterised queries                                               */
/* ------------------------------------------------------------------ */

type MemoryListInput = Parameters<typeof api.listMemories>[0];
type DocumentListInput = Parameters<typeof api.listDocuments>[0];
type ProfileInput = Parameters<typeof api.profile>[0];
type GraphInput = Parameters<typeof api.graph>[0];

export function useMemoryList(input: MemoryListInput, options?: UseQueryOptions) {
  return useQuery<MemoryListResponse>(
    queryKey(KEY.memories, input),
    () => api.listMemories(input),
    options,
  );
}

export function useDocumentList(input: DocumentListInput, options?: UseQueryOptions) {
  return useQuery<DocumentListResponse>(
    queryKey(KEY.documents, input),
    () => api.listDocuments(input),
    options,
  );
}

export function useProfile(input: ProfileInput, options?: UseQueryOptions) {
  return useQuery<ProfileResponse>(
    queryKey(KEY.profile, input),
    () => api.profile(input),
    options,
  );
}

export function useGraph(input: GraphInput, options?: UseQueryOptions) {
  return useQuery<GraphResponse>(
    queryKey(KEY.graph, input),
    () => api.graph(input),
    options,
  );
}

/* ------------------------------------------------------------------ */
/* Prefetch                                                            */
/* ------------------------------------------------------------------ */

/**
 * Warmers used by `RouteHost` to fill the cache while the browser is idle, so
 * the first visit to a tab paints from cache instead of from a spinner. Each
 * route module exports a `warm()` built out of these.
 */
export const prefetch = {
  spaces: () => fetchQuery(KEY.spaces, fetchSpaces),
  stats: () => fetchQuery(KEY.stats, fetchStats),
  health: () => fetchQuery(KEY.health, fetchHealth),
  settings: () => fetchQuery(KEY.settings, fetchSettings),
  processing: () => fetchQuery(KEY.processing, fetchProcessing),
  memories: (input: MemoryListInput) =>
    fetchQuery(queryKey(KEY.memories, input), () => api.listMemories(input)),
  documents: (input: DocumentListInput) =>
    fetchQuery(queryKey(KEY.documents, input), () => api.listDocuments(input)),
  profile: (input: ProfileInput) =>
    fetchQuery(queryKey(KEY.profile, input), () => api.profile(input)),
  graph: (input: GraphInput) =>
    fetchQuery(queryKey(KEY.graph, input), () => api.graph(input)),
};
