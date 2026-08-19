import { fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { deleteDocument, getDocument } from "@/lib/store";
import type { Document } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function normalizeDoc(d: Document): Document {
  return {
    ...d,
    containerTags: d.containerTags ?? [],
    title:
      d.title ??
      (d.metadata?.title as string | undefined) ??
      d.customId ??
      d.id,
  };
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<Document>(
      `/v3/documents/${encodeURIComponent(id)}`,
    );
    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, `No document with id or customId "${id}".`),
        "not_found",
      );
    }
    return ok(normalizeDoc(data));
  }

  const doc = getDocument(id);
  if (!doc) return fail(404, `No document with id or customId "${id}".`, "not_found");
  return ok(doc);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{ deleted?: boolean }>(
      `/v3/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, `No document "${id}".`),
        "not_found",
      );
    }
    clearTagCache();
    return ok({ id, deleted: true });
  }

  if (!deleteDocument(id)) return fail(404, `No document "${id}".`, "not_found");
  return ok({ id, deleted: true });
}
