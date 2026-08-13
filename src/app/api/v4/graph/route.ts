import { delay, ok } from "@/lib/http";
import { liveGraph, type CorpusProgress } from "@/lib/live";
import { wantsRemote } from "@/lib/remote";
import { graph, listMemories } from "@/lib/store";
import type { GraphResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type GraphOpts = {
  containerTags?: string[];
  includeDocuments: boolean;
  includeForgotten: boolean;
};

type StreamEvent =
  | { type: "progress"; loaded: number; total: number }
  | { type: "result"; data: GraphResponse }
  | { type: "error"; error: string };

/**
 * The memory graph. The hosted product exposes this through the MCP
 * `memory-graph` tool; here it is assembled from memory relations,
 * source documents and space membership.
 *
 * Pass `?stream=1` for NDJSON: progress events as the corpus is paged,
 * then a final `result` line with the assembled graph. Without it the
 * response is the plain JSON body (used by curl / explorers).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tags = url.searchParams.get("containerTags");
  const opts: GraphOpts = {
    containerTags: tags ? tags.split(",").filter(Boolean) : undefined,
    includeDocuments: url.searchParams.get("documents") !== "false",
    includeForgotten: url.searchParams.get("forgotten") === "true",
  };
  const stream = url.searchParams.get("stream") === "1";

  if (!stream) {
    if (wantsRemote(req)) {
      return ok(await liveGraph(opts));
    }
    await delay(120);
    return ok(graph(opts));
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A client that navigates away mid-stream closes the readable side,
      // and `enqueue` throws on a controller past that point. That's not an
      // error worth surfacing — just stop writing.
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client gone; nothing to report to.
        }
      };
      try {
        if (wantsRemote(req)) {
          const data = await liveGraph(opts, (p: CorpusProgress) =>
            send({ type: "progress", loaded: p.loaded, total: p.total }),
          );
          send({ type: "result", data });
        } else {
          await streamMockGraph(opts, send);
        }
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed/errored by the client side.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Mock corpus is in-process, but we still page `listMemories` so the
 * progress meter moves through real loaded/total counts instead of a
 * spinner. The final assemble is the same sync, in-memory `graph()` used by
 * the non-streaming path — unlike the live path there is no document fetch
 * or network round trip after the last memory page, so there is no second
 * phase worth reporting: the meter reaching 100% and the `result` line
 * arrive in the same tick.
 */
async function streamMockGraph(
  opts: GraphOpts,
  send: (event: StreamEvent) => void,
) {
  const pageSize = 25;
  // Scope paging to the requested spaces, same as the live path — otherwise
  // the meter reports progress against the whole corpus for a request that
  // only wants one space.
  const first = listMemories({
    containerTags: opts.containerTags,
    includeForgotten: opts.includeForgotten,
    page: 1,
    limit: pageSize,
  });
  let loaded = 0;
  let total = first.pagination.totalItems;
  let totalPages = first.pagination.totalPages;

  send({ type: "progress", loaded: 0, total });

  await delay(60);
  loaded += first.memoryEntries.length;
  send({ type: "progress", loaded, total });

  // Unlike the live path, paging here is an in-memory slice, not a network
  // call — there's no cost to cap and no reason the reported total should
  // ever outrun what actually gets loaded, so the loop runs to totalPages.
  let page = 2;
  while (page <= totalPages) {
    await delay(30);
    const { memoryEntries, pagination } = listMemories({
      containerTags: opts.containerTags,
      includeForgotten: opts.includeForgotten,
      page,
      limit: pageSize,
    });
    total = pagination.totalItems;
    totalPages = pagination.totalPages;
    loaded += memoryEntries.length;
    send({ type: "progress", loaded, total });
    page += 1;
  }

  send({ type: "result", data: graph(opts) });
}
