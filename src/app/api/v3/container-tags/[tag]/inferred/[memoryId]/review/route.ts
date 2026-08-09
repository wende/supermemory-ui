import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { reviewInferred, type ReviewAction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ tag: string; memoryId: string }> };

const ACTIONS = new Set<ReviewAction>(["approve", "decline", "undo"]);

/** POST /v3/container-tags/:tag/inferred/:memoryId/review */
export async function POST(req: Request, { params }: Ctx) {
  const { tag, memoryId } = await params;
  const b = await body<{ action?: string }>(req);
  const action = b.action as ReviewAction | undefined;
  if (!action || !ACTIONS.has(action)) {
    return fail(400, '`action` must be "approve", "decline", or "undo".');
  }

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{
      id: string;
      isInference: boolean;
      isForgotten?: boolean;
      reviewStatus: "approved" | "declined" | null;
    }>(
      `/v3/container-tags/${encodeURIComponent(tag)}/inferred/${encodeURIComponent(memoryId)}/review`,
      { method: "POST", json: { action } },
    );
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Review failed",
        status === 409 ? "conflict" : status === 404 ? "not_found" : "error",
      );
    }
    return ok({
      id: data.id ?? memoryId,
      isInference: data.isInference,
      isForgotten: data.isForgotten ?? action === "decline",
      reviewStatus: data.reviewStatus ?? null,
    });
  }

  await delay(90);
  const result = reviewInferred(tag, memoryId, action);
  if ("error" in result) {
    return fail(
      result.error === "not_found" ? 404 : 409,
      result.error === "not_found"
        ? `No memory "${memoryId}" in space "${tag}".`
        : "Memory is not reviewable for this action.",
      result.error,
    );
  }
  return ok(result);
}
