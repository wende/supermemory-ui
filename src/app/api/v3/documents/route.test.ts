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

interface AddResponse {
  id: string;
  status: string;
  title: string | null;
}

function addRequest(json: Record<string, unknown>) {
  return apiRequest("/v3/documents", { json });
}

afterEach(async () => {
  const { resetDb } = await import("@/lib/store");
  resetDb();
  restoreBackend();
});

describe("mock mode", () => {
  it("requires either content or a url", async () => {
    stubMockBackend();
    const { POST } = await import("./route");

    for (const json of [{}, { content: "   " }, { url: "  " }]) {
      const res = await callRoute(() => POST(addRequest(json)));
      expect(await readJson(res)).toMatchObject({
        status: 400,
        body: {
          error: "Either `content` or `url` is required.",
          code: "invalid_request",
        },
      });
    }
  });

  it("queues the document and answers 201", async () => {
    stubMockBackend();
    const { POST } = await import("./route");

    const res = await callRoute(() =>
      POST(
        addRequest({
          content: "  A claim worth remembering for longer than a sprint.  ",
          title: "RFC-014",
          containerTags: ["sm_research"],
          type: "pdf",
        }),
      ),
    );
    const { status, body } = await readJson<AddResponse>(res);

    expect(status).toBe(201);
    expect(body).toMatchObject({ status: "queued", title: "RFC-014" });

    const { getDocument } = await import("@/lib/store");
    const stored = getDocument(body.id)!;
    expect(stored.containerTags).toEqual(["sm_research"]);
    expect(stored.type).toBe("pdf");
    expect(stored.content).toBe("A claim worth remembering for longer than a sprint.");
  });

  it("stands in a placeholder body for a url-only submission", async () => {
    stubMockBackend();
    const { POST } = await import("./route");

    const res = await callRoute(() =>
      POST(addRequest({ url: "https://example.com/post" })),
    );
    const { body } = await readJson<AddResponse>(res);

    const { getDocument } = await import("@/lib/store");
    expect(getDocument(body.id)!.content).toBe(
      "Fetched from https://example.com/post",
    );
    expect(getDocument(body.id)!.type).toBe("webpage");
  });
});

describe("remote mode", () => {
  it("folds title, type and url into the live metadata payload", async () => {
    const calls = stubRemoteBackend(() =>
      jsonResponse({ id: "doc_live", status: "queued", title: "RFC-014" }, 201),
    );
    const { POST } = await import("./route");

    await POST(
      addRequest({
        content: "body text",
        title: "RFC-014",
        type: "pdf",
        url: "https://example.com/rfc",
        containerTags: ["sm_research", "sm_personal"],
        customId: "rfc-014",
        metadata: { author: "ops" },
      }),
    );

    expect(calls[0]!.body).toEqual({
      content: "body text",
      containerTags: ["sm_research", "sm_personal"],
      containerTag: "sm_research",
      customId: "rfc-014",
      metadata: {
        author: "ops",
        title: "RFC-014",
        type: "pdf",
        url: "https://example.com/rfc",
      },
    });
  });

  it("returns the live id and status as a 201", async () => {
    stubRemoteBackend(() =>
      jsonResponse({ id: "doc_live", status: "extracting" }, 200),
    );
    const { POST } = await import("./route");

    const res = await POST(addRequest({ content: "body text", title: "Fallback" }));
    const { status, body } = await readJson<AddResponse>(res);

    expect(status).toBe(201);
    expect(body).toEqual({ id: "doc_live", status: "extracting", title: "Fallback" });
  });

  it("forwards an upstream failure with its status", async () => {
    stubRemoteBackend(() => jsonResponse({ error: "payload too large" }, 413));
    const { POST } = await import("./route");

    const res = await POST(addRequest({ content: "body text" }));

    expect(await readJson(res)).toMatchObject({
      status: 413,
      body: { error: "payload too large" },
    });
  });

  it("invalidates the discovered-tag cache after a successful write", async () => {
    let listCalls = 0;
    stubRemoteBackend((call) => {
      if (call.url.endsWith("/v3/documents/list")) {
        listCalls += 1;
        return jsonResponse({
          memories: [{ containerTags: ["sm_discovered"] }],
          pagination: { totalPages: 1 },
        });
      }
      return jsonResponse({ id: "doc_live", status: "queued" }, 201);
    });
    const { POST } = await import("./route");
    const { resolveTags } = await import("@/lib/tags");

    await resolveTags();
    expect(listCalls).toBe(1);

    // Without the write the 30s cache would answer this for free.
    await resolveTags();
    expect(listCalls).toBe(1);

    await POST(addRequest({ content: "body text" }));
    await resolveTags();
    expect(listCalls).toBe(2);
  });
});
