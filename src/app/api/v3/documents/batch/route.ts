import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { addDocument } from "@/lib/store";
import type { Document } from "@/lib/types";

export const dynamic = "force-dynamic";

interface BatchBody {
  documents?: {
    content: string;
    title?: string;
    containerTags?: string[];
    type?: Document["type"];
  }[];
}

export async function POST(req: Request) {
  const b = await body<BatchBody>(req);
  if (!b.documents?.length) return fail(400, "`documents` must be a non-empty array.");

  if (wantsRemote(req)) {
    const documents = b.documents.map((d) => ({
      content: d.content,
      containerTags: d.containerTags,
      metadata: {
        ...(d.title ? { title: d.title } : {}),
        ...(d.type ? { type: d.type } : {}),
      },
    }));
    const { status, data, ok: success } = await proxyJson<{
      accepted?: number;
      rejected?: number;
      documents?: { id: string; status: string; title?: string }[];
    }>("/v3/documents/batch", { method: "POST", json: { documents } });
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Batch add failed",
      );
    }
    clearTagCache();
    return ok(
      {
        accepted: data.accepted ?? documents.length,
        rejected: data.rejected ?? 0,
        documents: data.documents ?? [],
      },
      { status: 201 },
    );
  }

  await delay(220);
  const created = b.documents
    .filter((d) => d.content?.trim())
    .map((d) => addDocument(d));
  return ok(
    {
      accepted: created.length,
      rejected: b.documents.length - created.length,
      documents: created.map((d) => ({ id: d.id, status: d.status, title: d.title })),
    },
    { status: 201 },
  );
}
