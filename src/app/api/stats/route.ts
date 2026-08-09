import { ok } from "@/lib/http";
import { liveStats } from "@/lib/live";
import { wantsRemote } from "@/lib/remote";
import { spacesWithCounts, stats } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Dashboard rollup. Not part of the documented API — assembled locally. */
export async function GET(req: Request) {
  if (wantsRemote(req)) {
    const rollup = await liveStats();
    return ok({
      documents: rollup.documents,
      memories: rollup.memories,
      forgotten: rollup.forgotten,
      inferences: rollup.inferences,
      staticFacts: rollup.staticFacts,
      versioned: rollup.versioned,
      relations: rollup.relations,
      chunks: rollup.chunks,
      processing: rollup.processing,
      failed: rollup.failed,
      byStatus: rollup.byStatus,
      byType: rollup.byType,
      activity: rollup.activity,
      latencies: rollup.latencies,
      vectorBytes: rollup.vectorBytes,
      server: rollup.server,
      spaces: rollup.spacesList,
    });
  }
  return ok({ ...stats(), spaces: spacesWithCounts() });
}
