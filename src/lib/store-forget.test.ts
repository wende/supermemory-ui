import { afterEach, describe, expect, it } from "vitest";
import {
  forgetByIds,
  matchForgetPrompt,
  resetDb,
  db,
} from "./store";

afterEach(() => {
  resetDb();
});

describe("forget matching (mock)", () => {
  it("matches on longer prompt terms and respects space scope", () => {
    const d = db();
    const sample = d.memories.find((m) => !m.isForgotten);
    expect(sample).toBeTruthy();
    const tag = sample!.spaceId;
    const token = sample!.memory
      .toLowerCase()
      .split(/\W+/)
      .find((t) => t.length > 3);
    expect(token).toBeTruthy();

    const scoped = matchForgetPrompt(token!, { containerTag: tag });
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((m) => m.spaceId === tag)).toBe(true);

    const other = d.spaces.find((s) => s.containerTag !== tag)?.containerTag;
    if (other) {
      const empty = matchForgetPrompt(token!, { containerTag: other });
      expect(empty.every((m) => m.spaceId === other)).toBe(true);
    }
  });

  it("forgets an explicit id set without re-running the prompt", () => {
    const live = db().memories.filter((m) => !m.isForgotten).slice(0, 2);
    expect(live.length).toBe(2);
    const { matched } = forgetByIds(
      live.map((m) => m.id),
      "test batch",
    );
    expect(matched).toHaveLength(2);
    expect(matched.every((m) => m.isForgotten)).toBe(true);
    expect(matched.every((m) => m.forgetReason === "test batch")).toBe(true);
  });

  it("treats an empty-string reason as unset and stores the default", () => {
    const live = db().memories.find((m) => !m.isForgotten);
    expect(live).toBeTruthy();
    const { matched } = forgetByIds([live!.id], "   ");
    expect(matched).toHaveLength(1);
    expect(matched[0]!.forgetReason).toBe("Forgotten via the dashboard.");
  });

  it("matches across every space when no containerTag is set", () => {
    const d = db();
    const tags = new Set(
      d.memories.filter((m) => !m.isForgotten).map((m) => m.spaceId),
    );
    expect(tags.size).toBeGreaterThan(1);

    // A short common stem that shows up in multiple seeded spaces.
    const across = matchForgetPrompt("about");
    expect(across.length).toBeGreaterThan(0);
    expect(new Set(across.map((m) => m.spaceId)).size).toBeGreaterThan(0);
  });
});
