import { afterEach, describe, expect, it } from "vitest";
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

interface ForgetResponse {
  dryRun: boolean;
  count: number;
  memories: MemoryEntry[];
  summaries?: string[];
  summary?: string;
  forgetBatchIds?: string[];
  forgetBatchId?: string | null;
}

const SPACE = "sm_forget_fixture";
const OTHER = "sm_forget_other";

/** Two memories about scheduling in one space, one in another. */
async function seedFixtures() {
  const { createMemory } = await import("@/lib/store");
  return {
    a: createMemory({
      memory: "The scheduler retries dispatch three times before parking the job.",
      containerTag: SPACE,
    }),
    b: createMemory({
      memory: "Dispatch parking is reported to the scheduler dashboard hourly.",
      containerTag: SPACE,
    }),
    elsewhere: createMemory({
      memory: "The scheduler owns replay windows in the other space.",
      containerTag: OTHER,
    }),
    unrelated: createMemory({
      memory: "Gardening rotas are published every spring without fail.",
      containerTag: SPACE,
    }),
  };
}

function forgetRequest(json: Record<string, unknown>) {
  return apiRequest("/v4/memories/forget-matching", { json });
}

afterEach(async () => {
  const { resetDb } = await import("@/lib/store");
  resetDb();
  restoreBackend();
});

describe("validation", () => {
  it("requires a prompt or an id list", async () => {
    stubMockBackend();
    const { POST } = await import("./route");

    for (const json of [{}, { prompt: "   " }, { ids: [] }, { ids: ["", null] }]) {
      const res = await callRoute(() => POST(forgetRequest(json)));
      expect(await readJson(res)).toMatchObject({
        status: 400,
        body: { error: "`prompt` or `ids` is required." },
      });
    }
  });

  it("accepts the live API's `query` as an alias for `prompt`", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ query: "scheduler", containerTag: SPACE, dryRun: true })),
    );
    const { status, body } = await readJson<ForgetResponse>(res);

    expect(status).toBe(200);
    expect(body.count).toBeGreaterThan(0);
  });
});

describe("mock mode — prompt matching", () => {
  it("previews matches without forgetting anything", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true })),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.dryRun).toBe(true);
    expect(body.count).toBe(2);
    expect(body.memories.map((m) => m.id).sort()).toEqual(
      [seeded.a.id, seeded.b.id].sort(),
    );
    expect(getMemory(seeded.a.id)!.isForgotten).toBe(false);
  });

  it("forgets the matches when dryRun is off", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ prompt: "scheduler", containerTag: SPACE })),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.dryRun).toBe(false);
    expect(body.count).toBe(2);
    expect(getMemory(seeded.a.id)!.isForgotten).toBe(true);
    expect(getMemory(seeded.b.id)!.isForgotten).toBe(true);
    expect(getMemory(seeded.unrelated.id)!.isForgotten).toBe(false);
    expect(getMemory(seeded.elsewhere.id)!.isForgotten).toBe(false);
  });

  it("records the prompt as the forget reason unless one is given", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    await callRoute(() =>
      POST(forgetRequest({ prompt: "scheduler", containerTag: SPACE })),
    );
    expect(getMemory(seeded.a.id)!.forgetReason).toBe(
      'Matched forget prompt: "scheduler"',
    );
  });

  it("uses an explicit reason when supplied", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    await callRoute(() =>
      POST(
        forgetRequest({
          prompt: "scheduler",
          containerTag: SPACE,
          reason: "  stale after RFC-014  ",
        }),
      ),
    );
    expect(getMemory(seeded.a.id)!.forgetReason).toBe("stale after RFC-014");
  });

  it("spans every space when no container tag is given", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    await callRoute(() => POST(forgetRequest({ prompt: "scheduler" })));

    expect(getMemory(seeded.elsewhere.id)!.isForgotten).toBe(true);
  });
});

describe("mock mode — explicit ids", () => {
  it("previews the ids without re-running the prompt", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ ids: [seeded.unrelated.id], dryRun: true })),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.count).toBe(1);
    expect(body.memories[0]!.id).toBe(seeded.unrelated.id);
    expect(getMemory(seeded.unrelated.id)!.isForgotten).toBe(false);
  });

  it("skips already-forgotten ids in a preview", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { forgetMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();
    forgetMemory(seeded.a.id);

    const res = await callRoute(() =>
      POST(forgetRequest({ ids: [seeded.a.id, seeded.b.id], dryRun: true })),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.memories.map((m) => m.id)).toEqual([seeded.b.id]);
  });

  it("ignores ids outside the requested space", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(
        forgetRequest({ ids: [seeded.a.id, seeded.elsewhere.id], containerTag: SPACE }),
      ),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.count).toBe(1);
    expect(getMemory(seeded.a.id)!.isForgotten).toBe(true);
    expect(getMemory(seeded.elsewhere.id)!.isForgotten).toBe(false);
  });

  it("forgets ids across spaces when no tag is given", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const { getMemory } = await import("@/lib/store");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ ids: [seeded.a.id, seeded.elsewhere.id] })),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.count).toBe(2);
    expect(getMemory(seeded.elsewhere.id)!.isForgotten).toBe(true);
  });

  it("drops unknown ids instead of failing the request", async () => {
    stubMockBackend();
    const { POST } = await import("./route");
    const seeded = await seedFixtures();

    const res = await callRoute(() =>
      POST(forgetRequest({ ids: [seeded.a.id, "mem_nope"] })),
    );
    expect((await readJson<ForgetResponse>(res)).body.count).toBe(1);
  });
});

describe("remote mode", () => {
  it("sends a query for a prompt and ids for an explicit set", async () => {
    const calls = stubRemoteBackend(() =>
      jsonResponse({ dryRun: true, count: 0, candidates: [] }),
    );
    const { POST } = await import("./route");

    await POST(
      forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true }),
    );
    expect(calls[0]!.body).toMatchObject({ containerTag: SPACE, query: "scheduler" });
    expect(calls[0]!.body).not.toHaveProperty("ids");

    await POST(forgetRequest({ ids: ["mem_1"], containerTag: SPACE, dryRun: true }));
    expect(calls[1]!.body).toMatchObject({ ids: ["mem_1"] });
    expect(calls[1]!.body).not.toHaveProperty("query");
  });

  it("reads candidates on a dry run and forgotten entries on an apply", async () => {
    stubRemoteBackend((call) => {
      const dryRun = (call.body as { dryRun: boolean }).dryRun;
      return jsonResponse({
        dryRun,
        count: 1,
        candidates: [{ id: "mem_candidate", memory: "candidate", score: 0.7 }],
        forgotten: [{ id: "mem_forgotten", memory: "forgotten" }],
      });
    });
    const { POST } = await import("./route");

    const preview = await readJson<ForgetResponse>(
      await POST(
        forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true }),
      ),
    );
    expect(preview.body.memories.map((m) => m.id)).toEqual(["mem_candidate"]);
    expect(preview.body.memories[0]!.metadata).toEqual({ score: 0.7 });

    const applied = await readJson<ForgetResponse>(
      await POST(forgetRequest({ prompt: "scheduler", containerTag: SPACE })),
    );
    expect(applied.body.memories.map((m) => m.id)).toEqual(["mem_forgotten"]);
  });

  it("fans out across discovered tags and de-duplicates the merge", async () => {
    const calls = stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse([
          { id: "space_one", containerTag: "sm_one" },
          { id: "space_two", containerTag: "sm_two" },
        ]);
      }
      const tag = (call.body as { containerTag: string }).containerTag;
      return jsonResponse({
        dryRun: true,
        count: 2,
        summary: `summary for ${tag}`,
        forgetBatchId: `batch_${tag}`,
        candidates: [
          { id: "mem_shared", memory: "seen by both tags" },
          { id: `mem_${tag}`, memory: tag },
        ],
      });
    });
    const { POST } = await import("./route");

    const res = await POST(forgetRequest({ prompt: "scheduler", dryRun: true }));
    const { body } = await readJson<ForgetResponse>(res);

    const forgetCalls = calls.filter((c) => c.url.endsWith("/forget-matching"));
    expect(forgetCalls).toHaveLength(2);

    expect(body.count).toBe(3);
    expect(body.memories.map((m) => m.id)).toEqual([
      "mem_shared",
      "mem_sm_one",
      "mem_sm_two",
    ]);
    expect(body.summaries).toEqual([
      "summary for sm_one",
      "summary for sm_two",
    ]);
    expect(body.summary).toBe("summary for sm_one");
    expect(body.forgetBatchId).toBe("batch_sm_one");
  });

  it("stamps each merged memory with the tag it came from", async () => {
    stubRemoteBackend((call) => {
      const tag = (call.body as { containerTag: string }).containerTag;
      return jsonResponse({
        dryRun: true,
        count: 1,
        candidates: [{ id: `mem_${tag}`, memory: tag }],
      });
    });
    const { POST } = await import("./route");

    const res = await POST(
      forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true }),
    );
    const { body } = await readJson<ForgetResponse>(res);

    expect(body.memories[0]!.spaceId).toBe(SPACE);
  });

  it("succeeds when at least one tag answers", async () => {
    stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse([
          { id: "space_one", containerTag: "sm_one" },
          { id: "space_two", containerTag: "sm_two" },
        ]);
      }
      const tag = (call.body as { containerTag: string }).containerTag;
      return tag === "sm_one"
        ? jsonResponse({ error: "unknown tag" }, 404)
        : jsonResponse({
            dryRun: true,
            count: 1,
            candidates: [{ id: "mem_two", memory: "two" }],
          });
    });
    const { POST } = await import("./route");

    const res = await POST(forgetRequest({ prompt: "scheduler", dryRun: true }));
    const { status, body } = await readJson<ForgetResponse>(res);

    expect(status).toBe(200);
    expect(body.memories.map((m) => m.id)).toEqual(["mem_two"]);
  });

  it("reports the upstream error when every tag fails", async () => {
    stubRemoteBackend(() => jsonResponse({ message: "forget disabled" }, 403));
    const { POST } = await import("./route");

    const res = await POST(
      forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true }),
    );

    expect(await readJson(res)).toMatchObject({
      status: 403,
      body: { error: "forget disabled" },
    });
  });

  it("turns a transport failure into a 502", async () => {
    stubRemoteBackend(() => {
      throw new Error("socket hang up");
    });
    const { POST } = await import("./route");

    const res = await POST(
      forgetRequest({ prompt: "scheduler", containerTag: SPACE, dryRun: true }),
    );

    expect(await readJson(res)).toMatchObject({
      status: 502,
      body: { error: "socket hang up" },
    });
  });
});
