import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { resolveTags } from "@/lib/tags";
import { search } from "@/lib/store";
import type { SearchRequest, SearchResponse, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<SearchRequest>(req);
  if (!b.q?.trim()) return fail(400, "`q` is required.");

  if (wantsRemote(req)) {
    const { containerTags, ...rest } = b;
    // Live API requires a singular containerTag — omitting it returns
    // total:0 even for exact matches. Fan out across tags when the UI
    // asks for "All spaces".
    const tags = containerTags?.length
      ? containerTags
      : await resolveTags();

    const responses = await Promise.all(
      tags.map((tag) =>
        proxyJson<SearchResponse>("/v4/search", {
          method: "POST",
          json: { ...rest, q: b.q.trim(), containerTag: tag },
        }),
      ),
    );

    const byId = new Map<string, SearchResult>();
    let timing = 0;
    let anyOk = false;
    let lastError: { status: number; error?: string } | null = null;

    for (const { status, data, ok: success } of responses) {
      if (!success) {
        lastError = {
          status,
          error: (data as { error?: string } | undefined)?.error,
        };
        continue;
      }
      anyOk = true;
      timing = Math.max(timing, data?.timing ?? 0);
      for (const r of data?.results ?? []) {
        const prev = byId.get(r.id);
        if (!prev || (r.similarity ?? 0) > (prev.similarity ?? 0)) {
          byId.set(r.id, r);
        }
      }
    }

    if (!anyOk) {
      return fail(
        lastError?.status ?? 502,
        lastError?.error ?? "Search failed",
      );
    }

    const limit = b.limit ?? 10;
    const results = Array.from(byId.values())
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, limit);

    return ok({ results, timing, total: results.length } satisfies SearchResponse);
  }

  await delay(b.rerank ? 180 : 60);
  return ok(search({ ...b, q: b.q.trim() }));
}
