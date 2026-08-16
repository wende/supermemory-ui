import { ok } from "@/lib/http";
import { liveSpaces } from "@/lib/live";
import { wantsRemote } from "@/lib/remote";
import { db, spacesWithCounts } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Convenience shape for the browser. Current engines expose aggregate space
 * counts through `/v3/container-tags/list`; settings are fetched separately
 * only when an operator opens a space.
 */
export async function GET(req: Request) {
  if (wantsRemote(req)) {
    return ok(await liveSpaces());
  }
  return ok({ containerTags: spacesWithCounts(), merges: db().merges });
}
