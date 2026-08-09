import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMemory,
  listInferred,
  resetDb,
  reviewInferred,
} from "./store";

const SPACE = "sm_personal";

function firstInferredId(): string {
  const { memories } = listInferred(SPACE);
  expect(memories.length).toBeGreaterThan(0);
  return memories[0]!.id;
}

describe("reviewInferred", () => {
  beforeEach(() => resetDb());
  afterEach(() => resetDb());

  it("lists only unreviewed inferences for the space", () => {
    const before = listInferred(SPACE);
    const id = firstInferredId();
    expect(reviewInferred(SPACE, id, "approve")).toMatchObject({
      reviewStatus: "approved",
      isInference: false,
    });
    const after = listInferred(SPACE);
    expect(after.memories.map((m) => m.id)).not.toContain(id);
    expect(after.total).toBe(before.total - 1);
  });

  it("approve clears isInference and stamps reviewStatus", () => {
    const id = firstInferredId();
    const result = reviewInferred(SPACE, id, "approve");
    expect(result).toEqual({
      id,
      isInference: false,
      isForgotten: false,
      reviewStatus: "approved",
    });
    const m = getMemory(id)!;
    expect(m.isInference).toBe(false);
    expect(m.metadata?.reviewStatus).toBe("approved");
  });

  it("decline soft-forgets and removes from the queue", () => {
    const id = firstInferredId();
    expect(reviewInferred(SPACE, id, "decline")).toMatchObject({
      isForgotten: true,
      reviewStatus: "declined",
    });
    expect(getMemory(id)?.isForgotten).toBe(true);
    expect(listInferred(SPACE).memories.map((m) => m.id)).not.toContain(id);
  });

  it("undo restores an approved memory to the queue", () => {
    const id = firstInferredId();
    reviewInferred(SPACE, id, "approve");
    expect(reviewInferred(SPACE, id, "undo")).toMatchObject({
      isInference: true,
      reviewStatus: null,
    });
    expect(listInferred(SPACE).memories.map((m) => m.id)).toContain(id);
  });

  it("rejects approve on an already-reviewed memory", () => {
    const id = firstInferredId();
    reviewInferred(SPACE, id, "approve");
    expect(reviewInferred(SPACE, id, "approve")).toEqual({ error: "conflict" });
  });

  it("rejects review for the wrong space", () => {
    const id = firstInferredId();
    expect(reviewInferred("other_space", id, "approve")).toEqual({
      error: "not_found",
    });
  });
});
