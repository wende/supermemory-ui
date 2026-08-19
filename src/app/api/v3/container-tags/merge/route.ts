import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { db, mergeSpaces } from "@/lib/store";
import type { MergeStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ source?: string; target?: string }>(req);
  if (!b.source || !b.target) return fail(400, "`source` and `target` are required.");
  if (b.source === b.target) return fail(400, "Cannot merge a tag into itself.");

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{
      success?: boolean;
      status?: string;
      mergeId?: string;
      targetTag?: string;
      sourceTags?: string[];
    }>("/v3/container-tags/merge", {
      method: "POST",
      json: {
        containerTags: [b.source],
        targetContainerTag: b.target,
      },
    });
    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, "Merge failed"),
      );
    }
    clearTagCache();
    const mapped: MergeStatus = {
      mergeId: data.mergeId ?? "unknown",
      status: (data.status as MergeStatus["status"]) ?? "queued",
      source: b.source,
      target: data.targetTag ?? b.target,
      movedDocuments: 0,
      movedMemories: 0,
      createdAt: new Date().toISOString(),
    };
    return ok(mapped, { status: 202 });
  }

  const tags = db().spaces.map((s) => s.containerTag);
  if (!tags.includes(b.source)) return fail(404, `No container tag "${b.source}".`);
  if (!tags.includes(b.target)) return fail(404, `No container tag "${b.target}".`);

  await delay(420);
  return ok(mergeSpaces(b.source, b.target), { status: 202 });
}
