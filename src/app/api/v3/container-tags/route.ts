import { ok } from "@/lib/http";
import { liveSpaces } from "@/lib/live";
import { wantsRemote } from "@/lib/remote";
import { db, spacesWithCounts } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Convenience listing. The documented API reaches container tags one at
 * a time (GET /v3/container-tags/{tag}); the local dashboard needs the
 * whole set to render the space switcher. In remote mode we derive it
 * from documents + per-tag settings.
 */
export async function GET(req: Request) {
  if (wantsRemote(req)) {
    return ok(await liveSpaces());
  }
  return ok({ containerTags: spacesWithCounts(), merges: db().merges });
}
