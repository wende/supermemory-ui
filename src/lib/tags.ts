/**
 * Discover container tags in use on a live instance.
 * The documented API has no list endpoint — we page /v3/documents/list
 * and union containerTags. Bogus tags return empty lists on other
 * endpoints, so over-supplying is safe.
 */

import { proxyJson } from "./remote";
import type { Document, DocumentListResponse } from "./types";

const CACHE_TTL_MS = 30_000;

let cached: { tags: string[]; at: number } | null = null;

export function clearTagCache() {
  cached = null;
}

export async function resolveTags(force = false): Promise<string[]> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.tags;
  }

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

  const list = Array.from(tags).sort();
  cached = { tags: list, at: Date.now() };
  return list;
}

/** Prefer the caller's tag, else first discovered tag. */
export async function pickTag(preferred?: string | null): Promise<string> {
  if (preferred?.trim()) return preferred.trim();
  const tags = await resolveTags();
  return tags[0]!;
}
