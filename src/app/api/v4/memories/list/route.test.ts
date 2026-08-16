import { afterEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  jsonResponse,
  readJson,
  restoreBackend,
  stubRemoteBackend,
} from "@/test/route-harness";
import type { MemoryListResponse } from "@/lib/types";

afterEach(() => restoreBackend());

describe("POST /api/v4/memories/list", () => {
  it("uses one paginated multi-tag request and maps opaque space ids", async () => {
    const calls = stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse([
          { id: "space_one", containerTag: "sm_one" },
          { id: "space_two", containerTag: "sm_two" },
        ]);
      }
      if (call.url.endsWith("/v4/memories/list")) {
        return jsonResponse({
          memoryEntries: [
            {
              id: "mem_1",
              memory: "A recent memory",
              version: 1,
              isLatest: true,
              isForgotten: false,
              isStatic: false,
              isInference: false,
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
              spaceId: "space_two",
              orgId: "org_1",
              sourceCount: 0,
              parentMemoryId: null,
              rootMemoryId: "mem_1",
              forgetAfter: null,
              forgetReason: null,
              metadata: null,
              memoryRelations: null,
              temporalContext: null,
              history: [],
              documentIds: [],
            },
          ],
          pagination: {
            currentPage: 1,
            limit: 8,
            totalItems: 985,
            totalPages: 124,
          },
        });
      }
      return jsonResponse({ error: "unexpected request" }, 500);
    });
    const { POST } = await import("./route");

    const response = await POST(
      apiRequest("/v4/memories/list", {
        json: { page: 1, limit: 8, sort: "createdAt", order: "desc" },
      }),
    );
    const { body } = await readJson<MemoryListResponse>(response);

    expect(body.memoryEntries).toHaveLength(1);
    expect(body.memoryEntries[0]!.spaceId).toBe("sm_two");
    expect(body.pagination.totalItems).toBe(985);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      method: "POST",
      body: {
        containerTags: ["sm_one", "sm_two"],
        page: 1,
        limit: 8,
        sort: "createdAt",
        order: "desc",
      },
    });
  });
});
