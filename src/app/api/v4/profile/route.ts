import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { pickTag } from "@/lib/tags";
import { db, search } from "@/lib/store";
import type { ProfileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{
    q?: string;
    containerTag?: string;
    include?: ("static" | "dynamic" | "buckets")[];
    buckets?: string[];
  }>(req);

  if (wantsRemote(req)) {
    const tag = await pickTag(b.containerTag);
    const { status, data, ok: success } = await proxyJson<ProfileResponse>(
      "/v4/profile",
      {
        method: "POST",
        json: {
          containerTag: tag,
          q: b.q,
          include: b.include,
          buckets: b.buckets,
        },
      },
    );
    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, "Profile failed"),
      );
    }
    // Tolerate omitted buckets.
    return ok({
      ...data,
      profile: {
        static: data.profile?.static ?? [],
        dynamic: data.profile?.dynamic ?? [],
        buckets: data.profile?.buckets ?? {},
      },
    });
  }

  await delay(110);
  const p = db().profile;
  const include = b.include?.length ? b.include : ["static", "dynamic", "buckets"];

  const buckets = include.includes("buckets")
    ? Object.fromEntries(
        Object.entries(p.buckets).filter(
          ([k]) => !b.buckets?.length || b.buckets.includes(k),
        ),
      )
    : {};

  return ok({
    profile: {
      static: include.includes("static") ? p.static : [],
      dynamic: include.includes("dynamic") ? p.dynamic : [],
      buckets,
    },
    searchResults: b.q?.trim()
      ? search({
          q: b.q.trim(),
          containerTags: b.containerTag ? [b.containerTag] : undefined,
          limit: 5,
        })
      : undefined,
  });
}
