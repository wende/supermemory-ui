import { ok } from "@/lib/http";
import { liveHealth } from "@/lib/live";
import { remoteConfigured, wantsRemote } from "@/lib/remote";
import { stats } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Health + instance metadata, as the local binary reports it. */
export async function GET(req: Request) {
  if (wantsRemote(req)) {
    const health = await liveHealth();
    return ok({ ...health, remoteConfigured: true });
  }
  const s = stats();
  return ok({
    status: "ok",
    backend: "mock" as const,
    remoteConfigured: remoteConfigured(),
    ...s.server,
    counts: {
      documents: s.documents,
      memories: s.memories,
      forgotten: s.forgotten,
      chunks: s.chunks,
      spaces: s.spaces,
    },
  });
}
