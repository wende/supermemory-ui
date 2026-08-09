import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  clampSettings,
  flushSettings,
  loadSettings,
  saveSettings,
} from "./settings";

function makeStorage() {
  const store = new Map<string, string>();
  return {
    writes: 0,
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(this: { writes: number }, key: string, value: string) {
      this.writes++;
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

describe("clampSettings", () => {
  it("clamps out-of-range numbers and rejects unknown group tokens", () => {
    const s = clampSettings({
      ...DEFAULT_SETTINGS,
      nodeSize: 42,
      centerForce: -3,
      localDepth: 99,
      colorGroups: [
        { id: "ok", query: "kind:memory", token: "s3" },
        // @ts-expect-error — exercising untrusted localStorage input
        { id: "bad", query: "kind:memory", token: "javascript:alert(1)" },
      ],
    });
    expect(s.nodeSize).toBe(1);
    expect(s.centerForce).toBe(0);
    expect(s.localDepth).toBe(5);
    expect(s.colorGroups.map((g) => g.id)).toEqual(["ok"]);
  });

  it("defaults space territories on, kind colours, and space links off", () => {
    const s = clampSettings({
      version: 1,
      query: "",
      showDocuments: true,
      showForgotten: false,
      space: "",
      textFade: 0.35,
      nodeSize: 0.5,
      linkThickness: 0.5,
      centerForce: 0.5,
      repelForce: 0.5,
      linkForce: 0.5,
      linkDistance: 0.5,
      localGraph: false,
      localDepth: 1,
      localIncoming: true,
      localOutgoing: true,
      neighborLinks: true,
      colorGroups: [],
    });
    expect(s.colorBySpace).toBe(false);
    expect(s.showSpaceBlobs).toBe(true);
    expect(s.showContainsEdges).toBe(false);
  });

  it("migrates v1 space-fill back to kind colours", () => {
    const s = clampSettings({
      ...DEFAULT_SETTINGS,
      version: 1,
      colorBySpace: true,
      colorGroups: [],
    });
    expect(s.version).toBe(2);
    expect(s.colorBySpace).toBe(false);
  });
});

describe("saveSettings", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    flushSettings();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("coalesces a burst of writes into one, keeping the last value", () => {
    for (let i = 0; i <= 10; i++) {
      saveSettings({ ...DEFAULT_SETTINGS, nodeSize: i / 10 });
    }
    expect(storage.writes).toBe(0);

    vi.runAllTimers();
    expect(storage.writes).toBe(1);
    expect(loadSettings().nodeSize).toBe(1);
  });

  it("flushes a pending write on demand", () => {
    saveSettings({ ...DEFAULT_SETTINGS, repelForce: 0.25 });
    flushSettings();
    expect(storage.writes).toBe(1);
    expect(loadSettings().repelForce).toBe(0.25);
  });

  it("falls back to defaults when stored JSON is unusable", () => {
    storage.setItem(SETTINGS_KEY, "{not json");
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, colorGroups: [] });
  });
});
