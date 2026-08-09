import { body, delay, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { listDocuments } from "@/lib/store";
import type { DocumentListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<Parameters<typeof listDocuments>[0]>(req);

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<DocumentListResponse>(
      "/v3/documents/list",
      { method: "POST", json: b },
    );
    if (!success) {
      return ok({
        memories: [],
        pagination: {
          currentPage: b.page ?? 1,
          limit: b.limit ?? 25,
          totalItems: 0,
          totalPages: 0,
        },
      });
    }
    // Live docs can omit containerTags (null/undefined) — normalize for the UI.
    return ok({
      ...data,
      memories: (data.memories ?? []).map((d) => ({
        ...d,
        containerTags: d.containerTags ?? [],
        title: d.title ?? (d.metadata?.title as string | undefined) ?? d.customId ?? d.id,
      })),
    }, { status });
  }

  await delay(70);
  return ok(listDocuments(b));
}
