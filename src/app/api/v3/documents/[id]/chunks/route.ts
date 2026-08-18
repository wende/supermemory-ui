import { fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { getChunks, getDocument } from "@/lib/store";
import type { DocumentChunk } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{
      documentId?: string;
      chunks?: DocumentChunk[];
      total?: number;
      count?: number;
    }>(`/v3/documents/${encodeURIComponent(id)}/chunks`);
    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, `No document "${id}".`),
        "not_found",
      );
    }
    const chunks = (data.chunks ?? []).map((c, i) => ({
      id: c.id ?? `chunk_${i}`,
      documentId: c.documentId ?? data.documentId ?? id,
      content: c.content ?? "",
      position: c.position ?? i,
      score: c.score,
      tokens: c.tokens,
      type: c.type,
      createdAt: c.createdAt,
    }));
    return ok({
      documentId: data.documentId ?? id,
      chunks,
      count: data.count ?? data.total ?? chunks.length,
    });
  }

  const doc = getDocument(id);
  if (!doc) return fail(404, `No document "${id}".`, "not_found");
  const chunks = getChunks(id);
  return ok({ documentId: doc.id, chunks, count: chunks.length });
}
