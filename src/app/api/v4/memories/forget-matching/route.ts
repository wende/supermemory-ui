import { body, delay, fail, ok } from "@/lib/http";
import { mapForgetMemories } from "@/lib/live";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { resolveTags } from "@/lib/tags";
import {
  db,
  forgetByIds,
  forgetMatching,
  matchForgetPrompt,
} from "@/lib/store";
import type { MemoryEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

type ForgetLiveResult = {
  dryRun: boolean;
  count: number;
  forgetBatchId?: string | null;
  summary?: string;
  candidates?: { id?: string; memory?: string; score?: number }[];
  forgotten?: { id?: string; memory?: string; score?: number }[];
};

const PREVIEW_CAP = 100;
/** Bound in-flight live forget-matching calls when fanning out across spaces. */
const LIVE_FANOUT_CONCURRENCY = 5;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function liveForgetMatching(input: {
  tag: string;
  prompt: string;
  ids: string[];
  dryRun: boolean;
  reason?: string;
}): Promise<{ status: number; data: ForgetLiveResult; ok: boolean }> {
  const payload: Record<string, unknown> = {
    containerTag: input.tag,
    dryRun: input.dryRun,
    reason: input.reason,
  };
  if (input.ids.length) payload.ids = input.ids;
  else payload.query = input.prompt;

  return proxyJson<ForgetLiveResult>("/v4/memories/forget-matching", {
    method: "POST",
    json: payload,
  });
}

/** Live API is per-space — fan out and merge when no tag is specified. */
async function liveForgetAcrossTags(input: {
  tags: string[];
  prompt: string;
  ids: string[];
  dryRun: boolean;
  reason?: string;
}) {
  const byId = new Map<string, MemoryEntry>();
  const summaries: string[] = [];
  const forgetBatchIds: string[] = [];
  let lastStatus = 200;
  let anyOk = false;
  let lastError: unknown;

  const results = await mapPool(input.tags, LIVE_FANOUT_CONCURRENCY, async (tag) => {
    const res = await liveForgetMatching({ ...input, tag });
    return { tag, ...res };
  });

  for (const { tag, status, data, ok: success } of results) {
    lastStatus = status;
    if (!success) {
      lastError = data;
      continue;
    }
    anyOk = true;
    const items = (data.dryRun ?? input.dryRun) ? data.candidates : data.forgotten;
    for (const entry of mapForgetMemories(items, tag)) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
    if (data.summary) summaries.push(data.summary);
    if (data.forgetBatchId) forgetBatchIds.push(data.forgetBatchId);
  }

  if (!anyOk) {
    return {
      ok: false as const,
      status: lastStatus || 502,
      error: remoteErrorMessage(
        lastError,
        "Failed to forget matching memories",
      ),
    };
  }

  const memories = Array.from(byId.values()).slice(0, PREVIEW_CAP);
  return {
    ok: true as const,
    dryRun: input.dryRun,
    count: memories.length,
    memories,
    summaries,
    forgetBatchIds,
  };
}

export async function POST(req: Request) {
  const b = await body<{
    prompt?: string;
    query?: string;
    ids?: string[];
    reason?: string;
    dryRun?: boolean;
    containerTag?: string;
  }>(req);

  const ids = Array.isArray(b.ids)
    ? b.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  // Accept either the console's `prompt` or the live API's `query`.
  const prompt = (b.prompt ?? b.query)?.trim() ?? "";
  if (!prompt && !ids.length) {
    return fail(400, "`prompt` or `ids` is required.");
  }

  const dryRun = b.dryRun ?? false;
  const tag = b.containerTag?.trim() || undefined;
  const reason = b.reason?.trim() || undefined;

  if (wantsRemote(req)) {
    try {
      const tags = tag ? [tag] : await resolveTags();
      const merged = await liveForgetAcrossTags({
        tags,
        prompt,
        ids,
        dryRun,
        reason,
      });
      if (!merged.ok) return fail(merged.status, merged.error);
      return ok({
        dryRun: merged.dryRun,
        count: merged.count,
        memories: merged.memories,
        summaries: merged.summaries,
        forgetBatchIds: merged.forgetBatchIds,
        // Single-tag convenience aliases (first entry when present).
        summary: merged.summaries[0],
        forgetBatchId: merged.forgetBatchIds[0] ?? null,
      });
    } catch (e) {
      return fail(
        502,
        e instanceof Error ? e.message : "Failed to forget matching memories",
      );
    }
  }

  await delay(400);

  if (ids.length) {
    if (dryRun) {
      const byId = new Map(db().memories.map((m) => [m.id, m]));
      const matched = ids
        .map((id) => byId.get(id))
        .filter((m): m is NonNullable<typeof m> => {
          if (!m || m.isForgotten) return false;
          if (tag && m.spaceId !== tag) return false;
          return true;
        });
      return ok({ dryRun: true, count: matched.length, memories: matched });
    }
    if (tag) {
      const allowed = new Set(
        db()
          .memories.filter((m) => m.spaceId === tag)
          .map((m) => m.id),
      );
      const { matched } = forgetByIds(
        ids.filter((id) => allowed.has(id)),
        reason,
      );
      return ok({ dryRun: false, count: matched.length, memories: matched });
    }
    const { matched } = forgetByIds(ids, reason);
    return ok({ dryRun: false, count: matched.length, memories: matched });
  }

  if (dryRun) {
    const matched = matchForgetPrompt(prompt, {
      containerTag: tag,
      limit: PREVIEW_CAP,
    });
    return ok({ dryRun: true, count: matched.length, memories: matched });
  }

  const { matched } = forgetMatching(prompt, reason, { containerTag: tag });
  return ok({ dryRun: false, count: matched.length, memories: matched });
}
