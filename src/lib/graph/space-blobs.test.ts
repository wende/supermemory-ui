import { describe, expect, it, vi } from "vitest";
import {
  buildSpaceBlobs,
  convexHull,
  inflateHull,
  traceSmoothHull,
  withAlpha,
} from "./space-blobs";

describe("convexHull", () => {
  it("returns a square's corners for interior points", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull).toHaveLength(4);
  });

  it("handles a single point", () => {
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe("inflateHull", () => {
  it("expands vertices away from the centroid", () => {
    const hull = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inflated = inflateHull(hull, 5);
    // Corner (0,0) should move further from center (5,5).
    expect(inflated[0]!.x).toBeLessThan(0);
    expect(inflated[0]!.y).toBeLessThan(0);
  });

  it("expands a single point into a 12-vertex ring at pad radius", () => {
    const pad = 36;
    const ring = inflateHull([{ x: 10, y: 20 }], pad);
    expect(ring).toHaveLength(12);
    for (const p of ring) {
      expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(pad, 10);
    }
  });
});

describe("traceSmoothHull", () => {
  function stubCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
    };
  }

  it("draws n=1 as an arc with the given pad", () => {
    const ctx = stubCtx();
    traceSmoothHull(ctx, [{ x: 5, y: 7 }], 36);
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.arc).toHaveBeenCalledWith(5, 7, 36, 0, Math.PI * 2);
    expect(ctx.ellipse).not.toHaveBeenCalled();
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it("draws n=2 as an ellipse sized with pad", () => {
    const ctx = stubCtx();
    const a = { x: 0, y: 0 };
    const b = { x: 40, y: 0 };
    const pad = 36;
    traceSmoothHull(ctx, [a, b], pad);
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.ellipse).toHaveBeenCalledWith(
      20,
      0,
      20 + pad,
      pad,
      0,
      0,
      Math.PI * 2,
    );
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("draws n≥3 with inflated midpoints and quadratic curves", () => {
    const ctx = stubCtx();
    const hull = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    traceSmoothHull(ctx, hull, 10);
    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledOnce();
    expect(ctx.quadraticCurveTo.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(ctx.closePath).toHaveBeenCalledOnce();
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.ellipse).not.toHaveBeenCalled();
  });
});

describe("buildSpaceBlobs", () => {
  it("groups nodes by space and assigns tokens", () => {
    const blobs = buildSpaceBlobs(
      [
        { id: "s1", kind: "space", spaceId: "s1", label: "Alpha", x: 0, y: 0, r: 12 },
        { id: "m1", kind: "memory", spaceId: "s1", label: "m", x: 40, y: 10, r: 4 },
        { id: "m2", kind: "memory", spaceId: "s2", label: "m", x: 200, y: 0, r: 4 },
        { id: "s2", kind: "space", spaceId: "s2", label: "Beta", x: 180, y: 0, r: 12 },
      ],
      (id) => (id === "s1" ? "s1" : "s2"),
      10,
    );
    expect(blobs).toHaveLength(2);
    expect(blobs.map((b) => b.label).sort()).toEqual(["Alpha", "Beta"]);
  });
});

describe("withAlpha", () => {
  it("rewrites rgb colors", () => {
    expect(withAlpha("rgb(10, 20, 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
  });

  it("rewrites modern space-separated rgb", () => {
    expect(withAlpha("rgb(10 20 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
    expect(withAlpha("rgb(10 20 30 / 50%)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
  });

  it("rewrites hex colors", () => {
    expect(withAlpha("#112233", 0.5)).toBe("rgba(17, 34, 51, 0.5)");
    expect(withAlpha("#123", 1)).toBe("rgba(17, 34, 51, 1)");
  });
});
