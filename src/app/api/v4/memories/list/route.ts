import { body, delay, ok } from "@/lib/http";
import { normalizeMemoryEntry } from "@/lib/live";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { resolveTagSummaries } from "@/lib/tags";
import { listMemories } from "@/lib/store";
import type { MemoryEntry, MemoryListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<Parameters<typeof listMemories>[0]>(req);

  if (wantsRemote(req)) {
    const summaries = await resolveTagSummaries();
    const tags =
      b.containerTags?.length
        ? b.containerTags
        : summaries.map((space) => space.containerTag);
    const tagBySpaceId = new Map(
      summaries.map((space) => [space.id, space.containerTag]),
    );
    // When filtering by document, pull a wider page — the live API has no
    // documentId param, so we filter client-side after the fetch.
    const fetchLimit = b.documentId
      ? Math.max(b.limit ?? 100, 500)
      : (b.limit ?? 100);
    const { data, ok: success } = await proxyJson<MemoryListResponse>(
      "/v4/memories/list",
      {
        method: "POST",
        json: {
          containerTags: tags,
          limit: fetchLimit,
          page: b.documentId ? 1 : (b.page ?? 1),
          sort: b.sort,
          order: b.order,
        },
      },
    );
    const byId = new Map<string, MemoryEntry>();
    if (success) {
      for (const memory of data.memoryEntries ?? []) {
        const tag = tagBySpaceId.get(memory.spaceId);
        const normalized = normalizeMemoryEntry(memory, tag);
        byId.set(normalized.id, normalized);
      }
    }
    // Client-side filters the live API may not support.
    let entries = Array.from(byId.values());
    if (!b.includeForgotten) entries = entries.filter((m) => !m.isForgotten);
    if (b.documentId)
      entries = entries.filter((m) => m.documentIds.includes(b.documentId!));
    if (b.onlyStatic) entries = entries.filter((m) => m.isStatic);
    if (b.onlyInference) entries = entries.filter((m) => m.isInference);
    if (b.onlyVersioned) entries = entries.filter((m) => m.version > 1);
    if (b.q) {
      const q = b.q.toLowerCase();
      entries = entries.filter((m) => m.memory.toLowerCase().includes(q));
    }
    const limit = b.limit ?? 25;
    const page = b.page ?? 1;
    const total = b.documentId
      ? entries.length
      : (data.pagination?.totalItems ?? entries.length);
    const slice = b.documentId
      ? entries.slice((page - 1) * limit, page * limit)
      : entries;
    return ok({
      memoryEntries: slice,
      pagination: {
        currentPage: page,
        limit,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  }

  await delay(70);
  return ok(listMemories(b));
}
