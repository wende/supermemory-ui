import { ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { db } from "@/lib/store";
import type { Document } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (wantsRemote(req)) {
    const { data, ok: success } = await proxyJson<{
      documents?: Document[];
      totalCount?: number;
      count?: number;
    }>("/v3/documents/processing");
    if (!success) return ok({ documents: [], count: 0 });
    const documents = data.documents ?? [];
    return ok({
      documents,
      count: data.count ?? data.totalCount ?? documents.length,
    });
  }

  const documents = db()
    .documents.filter((d) => d.status !== "done" && d.status !== "failed")
    .map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      type: d.type,
      containerTags: d.containerTags,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  return ok({ documents, count: documents.length });
}
