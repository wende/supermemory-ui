import { body, fail, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { pickTag } from "@/lib/tags";
import { db } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (wantsRemote(req)) {
    const b = await body<{ containerTag?: string }>(req);
    const tag = await pickTag(b.containerTag);
    const { status, data, ok: success } = await proxyJson<{
      buckets: { key: string; description?: string; facts?: string[]; count?: number }[];
    }>("/v4/profile/buckets", {
      method: "POST",
      json: { containerTag: tag },
    });
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Profile buckets failed",
      );
    }
    return ok(data);
  }

  const d = db();
  return ok({
    buckets: d.settings.profileBuckets.map((b) => ({
      ...b,
      facts: d.profile.buckets[b.key] ?? [],
      count: (d.profile.buckets[b.key] ?? []).length,
    })),
  });
}
