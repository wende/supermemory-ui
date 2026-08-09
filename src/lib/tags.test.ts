import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonResponse,
  restoreBackend,
  stubRemoteBackend,
  type ProxiedCall,
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

async function loadTags(handler: (call: ProxiedCall) => Response): Promise<{
  tags: Tags;
  calls: ProxiedCall[];
}> {
  const calls = stubRemoteBackend(handler);
  return { tags: await import("./tags"), calls };
}

afterEach(() => restoreBackend());

describe("resolveTags", () => {
  it("unions container tags across documents and sorts them", async () => {
    const { tags } = await loadTags(() =>
      page([["sm_b", "sm_a"], ["sm_a"], ["sm_c"]], 1),
    );

    expect(await tags.resolveTags()).toEqual(["sm_a", "sm_b", "sm_c"]);
  });

  it("pages until the last page and posts the documented body", async () => {
    const { tags, calls } = await loadTags((call) => {
      const { page: p } = call.body as { page: number };
      return page([[`sm_page_${p}`]], 3);
    });

    expect(await tags.resolveTags()).toEqual([
      "sm_page_1",
      "sm_page_2",
      "sm_page_3",
    ]);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.body).toEqual({ page: 1, limit: 100 });
    expect(calls[0]!.method).toBe("POST");
  });

  it("stops at fifty pages even if the API keeps claiming more", async () => {
    const { tags, calls } = await loadTags((call) => {
      const { page: p } = call.body as { page: number };
      return page([[`sm_page_${p}`]], 9999);
    });

    await tags.resolveTags();
    expect(calls).toHaveLength(50);
  });

  it("stops paging as soon as a request fails", async () => {
    const { tags, calls } = await loadTags((call) => {
      const { page: p } = call.body as { page: number };
      if (p === 2) return jsonResponse({ error: "boom" }, 500);
      return page([["sm_first"]], 5);
    });

    expect(await tags.resolveTags()).toEqual(["sm_first"]);
    expect(calls).toHaveLength(2);
  });

  it("ignores documents with missing or empty tags", async () => {
    const { tags } = await loadTags(() =>
      page([undefined, [], ["", "sm_real"]], 1),
    );

    expect(await tags.resolveTags()).toEqual(["sm_real"]);
  });

  it("falls back to the default tag when the corpus is empty", async () => {
    const { tags } = await loadTags(() => page([], 1));

    expect(await tags.resolveTags()).toEqual(["sm_project_default"]);
  });

  it("serves the cached answer for thirty seconds, then refetches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));
    try {
      const { tags, calls } = await loadTags(() => page([["sm_a"]], 1));

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

  it("bypasses the cache when forced, and after an explicit clear", async () => {
    const { tags, calls } = await loadTags(() => page([["sm_a"]], 1));

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
    const { tags, calls } = await loadTags(() => page([["sm_discovered"]], 1));

    expect(await tags.pickTag("  sm_explicit  ")).toBe("sm_explicit");
    expect(calls).toHaveLength(0);
  });

  it("falls back to the first discovered tag", async () => {
    const { tags } = await loadTags(() => page([["sm_zulu", "sm_alpha"]], 1));

    expect(await tags.pickTag()).toBe("sm_alpha");
    expect(await tags.pickTag(null)).toBe("sm_alpha");
    expect(await tags.pickTag("   ")).toBe("sm_alpha");
  });

  it("falls back to the default tag when nothing is discoverable", async () => {
    const { tags } = await loadTags(() => page([], 1));

    expect(await tags.pickTag()).toBe("sm_project_default");
  });
});
