import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadGraphCalcHistory,
  saveGraphCalcHistory,
  loadNodeCalcHistory,
  saveNodeCalcHistory,
  type GraphCalcHistory,
  type NodeCalcHistory,
} from "@/lib/calc-history-persistence";
import type { LiveDataPoint } from "@/lib/types";

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

// ─── Node-scoped calc-history persistence ─────────────────────────────
//
// Mirrors the graph-wide round-trip + defensive-validation suite, but
// entries are calc-kind LiveDataPoints keyed by nodeId. The persisted
// point carries its trajectory on the embedded `history` array, so the
// round-trip must preserve that field too.

const NODE_STORAGE_KEY = "manifold:node-calc-history";

function calcPoint(
  kind: string,
  value: number,
  observedAt: string,
  history?: { value: number; observedAt: string }[],
): LiveDataPoint {
  return {
    kind,
    value,
    capacity: 1,
    unit: "",
    observedAt,
    source: "calc",
    ...(history ? { history } : {}),
  };
}

describe("calc-history-persistence — node-scoped", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a node calc history with embedded trajectory", () => {
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
    installLocalStorage();
    const history: NodeCalcHistory = {
      "node-a": [
        calcPoint("calc:supply-hhi", 0.42, "2025-01-02T00:00:00.000Z", [
          { value: 0.31, observedAt: "2025-01-01T00:00:00.000Z" },
        ]),
      ],
    };
    saveNodeCalcHistory(history);
    const loaded = loadNodeCalcHistory();
    expect(loaded).toEqual(history);
    expect(loaded["node-a"][0].history).toHaveLength(1);
  });

  it("drops entries whose kind doesn't start with 'calc:'", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: () => undefined,
        clear: () => store.clear(),
      },
    });
    store.set(
      NODE_STORAGE_KEY,
      JSON.stringify({
        "node-a": [
          calcPoint("calc:hhi", 0.4, "2025-01-01T00:00:00.000Z"),
          // Non-calc kinds (e.g. a feed signal) must NOT leak in.
          {
            kind: "throughput",
            value: 1.2,
            capacity: 2,
            unit: "mb/d",
            observedAt: "2025-01-01T00:00:00.000Z",
            source: "EIA",
          },
        ],
      }),
    );
    const loaded = loadNodeCalcHistory();
    expect(loaded["node-a"]).toHaveLength(1);
    expect(loaded["node-a"][0].kind).toBe("calc:hhi");
  });

  it("returns {} on corrupted JSON / missing localStorage", () => {
    vi.stubGlobal("window", undefined);
    expect(loadNodeCalcHistory()).toEqual({});
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "{not-json",
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => store.clear(),
      },
    });
    expect(loadNodeCalcHistory()).toEqual({});
  });

  it("saveNodeCalcHistory is a no-op under SSR (no throw)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => saveNodeCalcHistory({ a: [] })).not.toThrow();
  });

  it("drops a nodeId whose entries are all invalid", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: () => undefined,
        clear: () => store.clear(),
      },
    });
    store.set(
      NODE_STORAGE_KEY,
      JSON.stringify({
        "node-a": [{ kind: "calc:x", value: "nope", observedAt: "x" }],
        "node-b": [calcPoint("calc:y", 1, "2025-01-01T00:00:00.000Z")],
      }),
    );
    const loaded = loadNodeCalcHistory();
    expect(loaded["node-a"]).toBeUndefined();
    expect(loaded["node-b"]).toHaveLength(1);
  });
});
