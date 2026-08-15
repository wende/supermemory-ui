import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { addDocument } from "@/lib/store";
import type { Document } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AddBody {
  content?: string;
  title?: string;
  containerTags?: string[];
  type?: Document["type"];
  metadata?: Document["metadata"];
  url?: string;
  customId?: string;
}

export async function POST(req: Request) {
  const b = await body<AddBody>(req);
  if (!b.content?.trim() && !b.url?.trim())
    return fail(400, "Either `content` or `url` is required.", "invalid_request");

  if (wantsRemote(req)) {
    const metadata: Record<string, unknown> = { ...(b.metadata ?? {}) };
    if (b.title) metadata.title = b.title;
    if (b.type) metadata.type = b.type;
    if (b.url) metadata.url = b.url;

    const payload: Record<string, unknown> = {
      content: b.content?.trim() || `Fetched from ${b.url}`,
      containerTags: b.containerTags,
      containerTag: b.containerTags?.[0],
      customId: b.customId,
      metadata,
    };

    const { status, data, ok: success } = await proxyJson<{
      id: string;
      status: string;
      title?: string;
    }>("/v3/documents", { method: "POST", json: payload });

    if (!success) {
      return fail(
        status,
        remoteErrorMessage(data, "Add document failed"),
      );
    }
    clearTagCache();
    return ok(
      {
        id: data.id,
        status: data.status,
        title: data.title ?? b.title ?? null,
      },
      { status: 201 },
    );
  }

  await delay(160);
  const doc = addDocument({
    content: b.content?.trim() || `Fetched from ${b.url}`,
    title: b.title,
    containerTags: b.containerTags,
    type: b.type,
    metadata: b.metadata,
    url: b.url,
    customId: b.customId,
  });
  return ok({ id: doc.id, status: doc.status, title: doc.title }, { status: 201 });
}
