import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, passthrough, proxy, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { deleteSpace, spacesWithCounts, updateSpace } from "@/lib/store";
import type { ContainerTag } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ tag: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { tag } = await params;

  if (wantsRemote(req)) {
    const res = await proxy(`/v3/container-tags/${encodeURIComponent(tag)}`);
    return passthrough(res);
  }

  const space = spacesWithCounts().find((s) => s.containerTag === tag);
  return space ? ok(space) : fail(404, `No container tag "${tag}".`, "not_found");
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { tag } = await params;
  const patch = await body<
    Partial<ContainerTag["settings"]> & { description?: string }
  >(req);

  if (wantsRemote(req)) {
    const res = await proxy(`/v3/container-tags/${encodeURIComponent(tag)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    clearTagCache();
    return passthrough(res);
  }

  await delay(140);
  const updated = updateSpace(tag, patch);
  return updated ? ok(updated) : fail(404, `No container tag "${tag}".`, "not_found");
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { tag } = await params;

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{ deleted?: boolean }>(
      `/v3/container-tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" },
    );
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? `No container tag "${tag}".`,
        "not_found",
      );
    }
    clearTagCache();
    return ok({ containerTag: tag, deleted: true });
  }

  await delay(260);
  return deleteSpace(tag)
    ? ok({ containerTag: tag, deleted: true })
    : fail(404, `No container tag "${tag}".`, "not_found");
}
