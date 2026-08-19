import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  callRoute,
  jsonResponse,
  readJson,
  restoreBackend,
  stubMockBackend,
  stubRemoteBackend,
} from "@/test/route-harness";
import type { MemoryEntry } from "@/lib/types";

type Route = typeof import("./route");

async function loadRoute(): Promise<Route> {
  return import("./route");
}

/** The mock store is module-level; reset it through a freshly loaded copy. */
async function resetStore() {
  const { resetDb } = await import("@/lib/store");
  resetDb();
}

beforeEach(() => {
  stubMockBackend();
});

afterEach(async () => {
  await resetStore();
  restoreBackend();
});

describe("POST /api/v4/memories (mock)", () => {
  it("rejects a missing or blank memory with 400", async () => {
    const { POST } = await loadRoute();

    for (const json of [{}, { memory: "" }, { memory: "   " }]) {
      const res = await callRoute(() => POST(apiRequest("/v4/memories", { json })));
      const { status, body } = await readJson<{ error: string }>(res);
      expect(status).toBe(400);
      expect(body.error).toBe("`memory` is required.");
    }
  });

  it("creates a version-1 memory and answers 201", async () => {
    const { POST } = await loadRoute();

    const res = await callRoute(() =>
      POST(
        apiRequest("/v4/memories", {
          json: { memory: "  Ships on Thursdays.  ", containerTag: "sm_research" },
        }),
      ),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(201);
    expect(body).toMatchObject({
      memory: "Ships on Thursdays.",
      version: 1,
      isLatest: true,
      isForgotten: false,
      spaceId: "sm_research",
    });

    const { getMemory } = await import("@/lib/store");
    expect(getMemory(body.id)?.memory).toBe("Ships on Thursdays.");
  });

  it("tolerates a malformed JSON body by treating it as empty", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://console.local/api/v4/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    const res = await callRoute(() => POST(req));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v4/memories (mock)", () => {
  it("requires an id", async () => {
    const { PATCH } = await loadRoute();
    const res = await callRoute(() =>
      PATCH(apiRequest("/v4/memories", { method: "PATCH", json: { memory: "x" } })),
    );
    const { status, body } = await readJson<{ error: string }>(res);
    expect(status).toBe(400);
    expect(body.error).toBe("`id` is required.");
  });

  it("requires memory text unless restoring", async () => {
    const { PATCH } = await loadRoute();
    const res = await callRoute(() =>
      PATCH(
        apiRequest("/v4/memories", { method: "PATCH", json: { id: "mem_1" } }),
      ),
    );
    expect(await readJson<{ error: string }>(res)).toMatchObject({
      status: 400,
      body: { error: "`memory` is required." },
    });
  });

  it("writes a new version rather than overwriting", async () => {
    const { POST, PATCH } = await loadRoute();
    const created = await readJson<MemoryEntry>(
      await callRoute(() =>
        POST(apiRequest("/v4/memories", { json: { memory: "Retries capped at 3." } })),
      ),
    );

    const res = await callRoute(() =>
      PATCH(
        apiRequest("/v4/memories", {
          method: "PATCH",
          json: { id: created.body.id, memory: "  Retries capped at 5.  " },
        }),
      ),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(200);
    expect(body.version).toBe(2);
    expect(body.memory).toBe("Retries capped at 5.");
    expect(body.history.find((h) => h.version === 1)?.memory).toBe(
      "Retries capped at 3.",
    );
  });

  it("restores a forgotten memory without needing memory text", async () => {
    const { POST, DELETE, PATCH } = await loadRoute();
    const created = await readJson<MemoryEntry>(
      await callRoute(() =>
        POST(apiRequest("/v4/memories", { json: { memory: "Still true." } })),
      ),
    );
    await callRoute(() =>
      DELETE(
        apiRequest("/v4/memories", {
          method: "DELETE",
          json: { id: created.body.id },
        }),
      ),
    );

    const res = await callRoute(() =>
      PATCH(
        apiRequest("/v4/memories", {
          method: "PATCH",
          json: { id: created.body.id, restore: true },
        }),
      ),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(200);
    expect(body.isForgotten).toBe(false);
    expect(body.forgetReason).toBeNull();
  });

  it("404s with a not_found code for an unknown id", async () => {
    const { PATCH } = await loadRoute();

    const edit = await callRoute(() =>
      PATCH(
        apiRequest("/v4/memories", {
          method: "PATCH",
          json: { id: "mem_nope", memory: "x" },
        }),
      ),
    );
    expect(await readJson(edit)).toMatchObject({
      status: 404,
      body: { code: "not_found" },
    });

    const restore = await callRoute(() =>
      PATCH(
        apiRequest("/v4/memories", {
          method: "PATCH",
          json: { id: "mem_nope", restore: true },
        }),
      ),
    );
    expect(restore.status).toBe(404);
  });
});

describe("DELETE /api/v4/memories (mock)", () => {
  it("requires an id", async () => {
    const { DELETE } = await loadRoute();
    const res = await callRoute(() =>
      DELETE(apiRequest("/v4/memories", { method: "DELETE", json: {} })),
    );
    expect(res.status).toBe(400);
  });

  it("forgets softly, keeping the entry and its reason", async () => {
    const { POST, DELETE } = await loadRoute();
    const created = await readJson<MemoryEntry>(
      await callRoute(() =>
        POST(apiRequest("/v4/memories", { json: { memory: "Deprecated." } })),
      ),
    );

    const res = await callRoute(() =>
      DELETE(
        apiRequest("/v4/memories", {
          method: "DELETE",
          json: { id: created.body.id, reason: "  superseded by RFC-014  " },
        }),
      ),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(200);
    expect(body.isForgotten).toBe(true);
    expect(body.forgetReason).toBe("superseded by RFC-014");

    const { getMemory } = await import("@/lib/store");
    expect(getMemory(created.body.id)).toBeDefined();
  });

  it("404s for an unknown id", async () => {
    const { DELETE } = await loadRoute();
    const res = await callRoute(() =>
      DELETE(
        apiRequest("/v4/memories", { method: "DELETE", json: { id: "mem_nope" } }),
      ),
    );
    expect(await readJson(res)).toMatchObject({
      status: 404,
      body: { code: "not_found" },
    });
  });
});

describe("remote mode", () => {
  it("POSTs the live payload shape and passes the entry back", async () => {
    const calls = stubRemoteBackend(() =>
      jsonResponse({
        memories: [{ id: "mem_live", memory: "From the engine.", version: 1 }],
      }),
    );
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories", {
        json: { memory: "From the engine.", containerTag: "sm_research" },
      }),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(201);
    expect(body).toMatchObject({ id: "mem_live", spaceId: "sm_research" });
    expect(calls[0]!.url).toBe("https://engine.example.com/v4/memories");
    expect(calls[0]!.body).toEqual({
      containerTag: "sm_research",
      memories: [
        { content: "From the engine.", isStatic: true, metadata: null },
      ],
    });
  });

  it("synthesises an entry when the engine returns only a documentId", async () => {
    stubRemoteBackend(() => jsonResponse({ documentId: "doc_live" }));
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories", {
        json: { memory: "Only a doc id.", containerTag: "sm_research" },
      }),
    );
    const { status, body } = await readJson<MemoryEntry>(res);

    expect(status).toBe(201);
    expect(body).toMatchObject({
      id: "doc_live",
      memory: "Only a doc id.",
      spaceId: "sm_research",
      orgId: "remote",
      documentIds: ["doc_live"],
    });
  });

  it("forwards the upstream status and message on failure", async () => {
    stubRemoteBackend(() => jsonResponse({ error: "container tag unknown" }, 422));
    const { POST } = await loadRoute();

    const res = await POST(
      apiRequest("/v4/memories", {
        json: { memory: "x", containerTag: "sm_research" },
      }),
    );
    expect(await readJson(res)).toMatchObject({
      status: 422,
      body: { error: "container tag unknown" },
    });
  });

  it("turns a transport failure on DELETE into a 502", async () => {
    stubRemoteBackend(() => {
      throw new TypeError("connect ECONNREFUSED");
    });
    const { DELETE } = await loadRoute();

    const res = await DELETE(
      apiRequest("/v4/memories", {
        method: "DELETE",
        json: { id: "mem_live", containerTag: "sm_research" },
      }),
    );
    expect(await readJson(res)).toMatchObject({
      status: 502,
      body: { error: "connect ECONNREFUSED" },
    });
  });

  it("sends restore as a flag and an edit as memory text", async () => {
    const calls = stubRemoteBackend(() => jsonResponse({ id: "mem_live" }));
    const { PATCH } = await loadRoute();

    await PATCH(
      apiRequest("/v4/memories", {
        method: "PATCH",
        json: { id: "mem_live", restore: true },
      }),
    );
    expect(calls[0]!.body).toEqual({ id: "mem_live", restore: true });

    await PATCH(
      apiRequest("/v4/memories", {
        method: "PATCH",
        json: { id: "mem_live", memory: "  edited  " },
      }),
    );
    expect(calls[1]!.body).toEqual({ id: "mem_live", memory: "edited" });
  });

  it("stays on the mock when the request opts out via cookie", async () => {
    stubRemoteBackend(() => jsonResponse({ memories: [] }));
    const { POST } = await loadRoute();

    const res = await callRoute(() =>
      POST(
        apiRequest("/v4/memories", {
          json: { memory: "Local only." },
          headers: { cookie: "sm_backend=mock" },
        }),
      ),
    );
    const { body } = await readJson<MemoryEntry>(res);

    expect(body.orgId).toBe("org_local_7f3a");
  });
});
