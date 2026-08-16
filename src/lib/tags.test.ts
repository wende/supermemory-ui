import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  restoreBackend,
  stubRemoteBackend,
  type ProxiedCall,
  type RemoteHandler,
} from "@/test/route-harness";

type Tags = typeof import("./tags");

/** Page N of a documents listing, as the live API returns it. */
function page(
  containerTags: (string[] | undefined)[],
  totalPages: number,
): Response {
  return jsonResponse({
    memories: containerTags.map((t, i) => ({ id: `doc_${i}`, containerTags: t })),
    pagination: { totalPages },
  });
}

function tagList(...containerTags: string[]): Response {
  return jsonResponse(
    containerTags.map((containerTag) => ({
      id: `space_${containerTag}`,
      name: containerTag,
      containerTag,
      description: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      documentCount: 0,
      memoryCount: 0,
      lastActivityAt: null,
    })),
  );
}

async function loadTags(handler: RemoteHandler): Promise<{
  tags: Tags;
  calls: ProxiedCall[];
}> {
  const calls = stubRemoteBackend(handler);
  return { tags: await import("./tags"), calls };
}

afterEach(() => restoreBackend());

describe("resolveTags", () => {
  it("uses the native aggregate tag list and sorts it", async () => {
    const { tags, calls } = await loadTags(() =>
      tagList("sm_b", "sm_a", "sm_c"),
    );

    expect(await tags.resolveTags()).toEqual(["sm_a", "sm_b", "sm_c"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://engine.example.com/v3/container-tags/list",
    });
  });

  it("falls back to paging documents for an older engine", async () => {
    const { tags, calls } = await loadTags((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse({ error: "not found" }, 404);
      }
      const { page: p } = call.body as { page: number };
      return page([[`sm_page_${p}`]], 3);
    });

    expect(await tags.resolveTags()).toEqual([
      "sm_page_1",
      "sm_page_2",
      "sm_page_3",
    ]);
    expect(calls).toHaveLength(4);
    expect(calls[1]!.body).toEqual({ page: 1, limit: 100 });
    expect(calls[1]!.method).toBe("POST");
  });

  it("stops at fifty pages even if the API keeps claiming more", async () => {
    const { tags, calls } = await loadTags((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse({ error: "not found" }, 404);
      }
      const { page: p } = call.body as { page: number };
      return page([[`sm_page_${p}`]], 9999);
    });

    await tags.resolveTags();
    expect(calls).toHaveLength(51);
  });

  it("stops paging as soon as a request fails", async () => {
    const { tags, calls } = await loadTags((call) => {
      if (call.url.endsWith("/v3/container-tags/list")) {
        return jsonResponse({ error: "not found" }, 404);
      }
      const { page: p } = call.body as { page: number };
      if (p === 2) return jsonResponse({ error: "boom" }, 500);
      return page([["sm_first"]], 5);
    });

    expect(await tags.resolveTags()).toEqual(["sm_first"]);
    expect(calls).toHaveLength(3);
  });

  it("ignores documents with missing or empty tags", async () => {
    const { tags } = await loadTags(() => tagList("", "sm_real"));

    expect(await tags.resolveTags()).toEqual(["sm_real"]);
  });

  it("falls back to the default tag when the corpus is empty", async () => {
    const { tags } = await loadTags(() => tagList());

    expect(await tags.resolveTags()).toEqual(["sm_project_default"]);
  });

  it("serves the cached answer for thirty seconds, then refetches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));
    try {
      const { tags, calls } = await loadTags(() => tagList("sm_a"));

      await tags.resolveTags();
      await tags.resolveTags();
      expect(calls).toHaveLength(1);

      vi.advanceTimersByTime(29_000);
      await tags.resolveTags();
      expect(calls).toHaveLength(1);

      vi.advanceTimersByTime(2_000);
      await tags.resolveTags();
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares an in-flight aggregate request between concurrent callers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { tags, calls } = await loadTags(async () => {
      await gate;
      return tagList("sm_a");
    });

    const first = tags.resolveTagSummaries();
    const second = tags.resolveTagSummaries();
    const third = tags.resolveTags();
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    release();
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      [expect.objectContaining({ containerTag: "sm_a" })],
      [expect.objectContaining({ containerTag: "sm_a" })],
      ["sm_a"],
    ]);
    expect(calls).toHaveLength(1);
  });

  it("bypasses the cache when forced, and after an explicit clear", async () => {
    const { tags, calls } = await loadTags(() => tagList("sm_a"));

    await tags.resolveTags();
    await tags.resolveTags(true);
    expect(calls).toHaveLength(2);

    tags.clearTagCache();
    await tags.resolveTags();
    expect(calls).toHaveLength(3);
  });
});

describe("pickTag", () => {
  it("prefers the caller's tag without hitting the network", async () => {
    const { tags, calls } = await loadTags(() => tagList("sm_discovered"));

    expect(await tags.pickTag("  sm_explicit  ")).toBe("sm_explicit");
    expect(calls).toHaveLength(0);
  });

  it("falls back to the first discovered tag", async () => {
    const { tags } = await loadTags(() => tagList("sm_zulu", "sm_alpha"));

    expect(await tags.pickTag()).toBe("sm_alpha");
    expect(await tags.pickTag(null)).toBe("sm_alpha");
    expect(await tags.pickTag("   ")).toBe("sm_alpha");
  });

  it("falls back to the default tag when nothing is discoverable", async () => {
    const { tags } = await loadTags(() => tagList());

    expect(await tags.pickTag()).toBe("sm_project_default");
  });
});
