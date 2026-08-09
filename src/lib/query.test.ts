import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQuery, invalidateQueries, readQuery } from "./query";

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchQuery / invalidateQueries", () => {
  it("serves a fresh cached value without refetching", async () => {
    const key = `fresh-${Math.random()}`;
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return "ok";
    };

    await fetchQuery(key, fetcher);
    await fetchQuery(key, fetcher);
    expect(calls).toBe(1);
    expect(readQuery(key)).toBe("ok");
  });

  it("refetches after invalidation even when already stale", async () => {
    const key = `stale-${Math.random()}`;
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      if (calls === 1) return "first";
      if (calls === 2) throw new Error("boom");
      return "recovered";
    };

    await fetchQuery(key, fetcher);
    expect(readQuery(key)).toBe("first");

    // Fail a forced refresh so updatedAt stays 0 (the post-invalidation error path).
    invalidateQueries(key);
    await fetchQuery(key, fetcher, { force: true });
    expect(readQuery(key)).toBe("first");

    // A second invalidation must still allow a successful refetch — the same
    // generation bump that useQuery watches when updatedAt is already 0.
    invalidateQueries(key);
    await fetchQuery(key, fetcher, { force: true });
    expect(calls).toBe(3);
    expect(readQuery(key)).toBe("recovered");
  });
});
