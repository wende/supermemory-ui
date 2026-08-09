import { body, delay, ok } from "@/lib/http";
import { passthrough, proxy, wantsRemote } from "@/lib/remote";
import { db, updateSettings } from "@/lib/store";
import type { OrgSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (wantsRemote(req)) {
    const res = await proxy("/v3/settings");
    const text = await res.text();
    let data: OrgSettings & Record<string, unknown>;
    try {
      data = text ? JSON.parse(text) : ({} as OrgSettings);
    } catch {
      return passthrough(res);
    }
    // Live settings omit workspacePrompt; tolerate missing fields.
    return ok({
      shouldLLMFilter: data.shouldLLMFilter ?? null,
      filterPrompt: data.filterPrompt ?? null,
      chunkSize: data.chunkSize ?? null,
      includeItems: data.includeItems ?? [],
      excludeItems: data.excludeItems ?? [],
      workspacePrompt: data.workspacePrompt ?? null,
      profileBuckets: data.profileBuckets ?? [],
    } satisfies OrgSettings);
  }
  return ok(db().settings);
}

export async function PATCH(req: Request) {
  const patch = await body<Partial<OrgSettings>>(req);

  if (wantsRemote(req)) {
    const res = await proxy("/v3/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return passthrough(res);
  }

  await delay(150);
  return ok({
    orgId: "org_local_7f3a",
    orgSlug: "local",
    updated: updateSettings(patch),
  });
}
