import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadGraphCalcHistory,
  saveGraphCalcHistory,
  type GraphCalcHistory,
} from "@/lib/calc-history-persistence";

// ─── calc-history-persistence tests ───────────────────────────────────
//
// localStorage round-trip + defensive validation. A jsdom-style
// localStorage mock is installed per-test so we exercise the real
// read/write path.

const STORAGE_KEY = "manifold:graph-calc-history";

function installLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { localStorage: mock });
  return { store, mock };
}

describe("calc-history-persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a valid history", () => {
    installLocalStorage();
    const history: GraphCalcHistory = {
      "mean-omega": [
        { value: 5.1, observedAt: "2025-01-01T00:00:00.000Z" },
        { value: 5.4, observedAt: "2025-01-02T00:00:00.000Z" },
      ],
    };
    saveGraphCalcHistory(history);
    expect(loadGraphCalcHistory()).toEqual(history);
  });

  it("returns {} when nothing is persisted", () => {
    installLocalStorage();
    expect(loadGraphCalcHistory()).toEqual({});
  });

  it("returns {} when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(loadGraphCalcHistory()).toEqual({});
  });

  it("saveGraphCalcHistory is a no-op under SSR (no throw)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => saveGraphCalcHistory({ a: [] })).not.toThrow();
  });

  it("drops corrupted JSON gracefully", () => {
    const { store } = installLocalStorage();
    store.set(STORAGE_KEY, "{not valid json");
    expect(loadGraphCalcHistory()).toEqual({});
  });

  it("drops entries with non-numeric / non-finite values", () => {
    const { store } = installLocalStorage();
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        good: [{ value: 3, observedAt: "2025-01-01T00:00:00.000Z" }],
        bad: [
          { value: "nope", observedAt: "2025-01-01T00:00:00.000Z" },
          { value: null, observedAt: "2025-01-01T00:00:00.000Z" },
          { observedAt: "2025-01-01T00:00:00.000Z" },
        ],
      }),
    );
    const loaded = loadGraphCalcHistory();
    expect(loaded.good).toHaveLength(1);
    // bad entries all filtered → empty array → key dropped entirely
    expect(loaded.bad).toBeUndefined();
  });

  it("caps each calc's history at 60 entries on load", () => {
    const { store } = installLocalStorage();
    const entries = Array.from({ length: 100 }, (_, i) => ({
      value: i,
      observedAt: `2025-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
    }));
    store.set(STORAGE_KEY, JSON.stringify({ "mean-omega": entries }));
    const loaded = loadGraphCalcHistory();
    expect(loaded["mean-omega"]).toHaveLength(60);
    // Keeps the most recent 60 (tail).
    expect(loaded["mean-omega"][0].value).toBe(40);
    expect(loaded["mean-omega"][59].value).toBe(99);
  });

  it("ignores non-array values for a calc id", () => {
    const { store } = installLocalStorage();
    store.set(
      STORAGE_KEY,
      JSON.stringify({ weird: "not-an-array", ok: [{ value: 1, observedAt: "x" }] }),
    );
    const loaded = loadGraphCalcHistory();
    expect(loaded.weird).toBeUndefined();
    expect(loaded.ok).toHaveLength(1);
  });
});
