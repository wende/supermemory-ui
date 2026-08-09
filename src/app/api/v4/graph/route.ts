import { delay, ok } from "@/lib/http";
import { liveGraph } from "@/lib/live";
import { wantsRemote } from "@/lib/remote";
import { graph } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The memory graph. The hosted product exposes this through the MCP
 * `memory-graph` tool; here it is assembled from memory relations,
 * source documents and space membership.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tags = url.searchParams.get("containerTags");
  const opts = {
    containerTags: tags ? tags.split(",").filter(Boolean) : undefined,
    includeDocuments: url.searchParams.get("documents") !== "false",
    includeForgotten: url.searchParams.get("forgotten") === "true",
  };

  if (wantsRemote(req)) {
    return ok(await liveGraph(opts));
  }

  await delay(120);
  return ok(graph(opts));
}
