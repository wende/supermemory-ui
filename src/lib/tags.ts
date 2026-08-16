/** Discover container tags without crawling the document corpus. */

import { proxyJson } from "./remote";
import type { Document, DocumentListResponse } from "./types";

const CACHE_TTL_MS = 30_000;

export interface LiveContainerTagSummary {
  id: string;
  name: string;
  containerTag: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  memoryCount: number;
  lastActivityAt: string | null;
}

let cached: { summaries: LiveContainerTagSummary[]; at: number } | null = null;
let pending: Promise<LiveContainerTagSummary[]> | null = null;

export function clearTagCache() {
  cached = null;
  pending = null;
}

/**
 * Current engines expose aggregate space metadata directly. Keep the older
 * document crawl only as a compatibility fallback for instances predating
 * `/v3/container-tags/list`.
 */
export async function resolveTagSummaries(
  force = false,
): Promise<LiveContainerTagSummary[]> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.summaries;
  }

  if (!force && pending) return pending;

  const request = loadTagSummaries();
  pending = request;
  try {
    const summaries = await request;
    cached = { summaries, at: Date.now() };
    return summaries;
  } finally {
    if (pending === request) pending = null;
  }
}

async function loadTagSummaries(): Promise<LiveContainerTagSummary[]> {
  const listed = await proxyJson<LiveContainerTagSummary[]>(
    "/v3/container-tags/list",
  );
  if (listed.ok && Array.isArray(listed.data)) {
    const summaries = listed.data
      .filter((space) => space.containerTag?.trim())
      .sort((a, b) => a.containerTag.localeCompare(b.containerTag));
    return summaries;
  }

  // Compatibility with older local binaries. This path intentionally does
  // not compute counts; callers that need aggregates should use a current
  // engine rather than rebuilding the whole corpus in the console.
  const tags = new Set<string>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 50) {
    const { ok, data } = await proxyJson<DocumentListResponse>(
      "/v3/documents/list",
      {
        method: "POST",
        json: { page, limit: 100 },
      },
    );
    if (!ok || !data?.memories) break;
    for (const doc of data.memories as Document[]) {
      for (const t of doc.containerTags ?? []) {
        if (t) tags.add(t);
      }
    }
    totalPages = data.pagination?.totalPages ?? 1;
    page += 1;
  }

  // Fallback so required-tag endpoints still get something to send.
  if (tags.size === 0) tags.add("sm_project_default");

  const now = new Date().toISOString();
  const summaries = Array.from(tags)
    .sort()
    .map((containerTag) => ({
      id: containerTag,
      name: containerTag,
      containerTag,
      description: null,
      createdAt: now,
      updatedAt: now,
      documentCount: 0,
      memoryCount: 0,
      lastActivityAt: null,
    }));
  return summaries;
}

export async function resolveTags(force = false): Promise<string[]> {
  const tags = (await resolveTagSummaries(force)).map((space) => space.containerTag);
  return tags.length ? tags : ["sm_project_default"];
}

export async function resolveSpaceIdTags(): Promise<Map<string, string>> {
  return new Map(
    (await resolveTagSummaries()).map((space) => [space.id, space.containerTag]),
  );
}

/** Prefer the caller's tag, else first discovered tag. */
export async function pickTag(preferred?: string | null): Promise<string> {
  if (preferred?.trim()) return preferred.trim();
  const tags = await resolveTags();
  return tags[0]!;
}
