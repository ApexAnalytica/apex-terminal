import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadAxiomInteractionHistory,
  saveAxiomInteractionHistory,
  type AxiomInteractionHistory,
} from "@/lib/axiom-interaction-persistence";

const STORAGE_KEY = "manifold:axiom-interaction-history";

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

describe("axiom-interaction-persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a valid history", () => {
    installLocalStorage();
    const history: AxiomInteractionHistory = {
      "A-04": { lastClickedAt: "2026-05-30T00:00:00.000Z", clickCount: 3 },
      "R-01": { lastClickedAt: "2026-05-28T00:00:00.000Z", clickCount: 1 },
    };
    saveAxiomInteractionHistory(history);
    expect(loadAxiomInteractionHistory()).toEqual(history);
  });

  it("returns {} when nothing is persisted", () => {
    installLocalStorage();
    expect(loadAxiomInteractionHistory()).toEqual({});
  });

  it("returns {} under SSR", () => {
    vi.stubGlobal("window", undefined);
    expect(loadAxiomInteractionHistory()).toEqual({});
    expect(() => saveAxiomInteractionHistory({ a: { lastClickedAt: "x", clickCount: 1 } })).not.toThrow();
  });

  it("drops corrupted JSON", () => {
    const { store } = installLocalStorage();
    store.set(STORAGE_KEY, "{not-json");
    expect(loadAxiomInteractionHistory()).toEqual({});
  });

  it("drops records with malformed fields", () => {
    const { store } = installLocalStorage();
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        good: { lastClickedAt: "2026-05-30T00:00:00.000Z", clickCount: 2 },
        badType: { lastClickedAt: 42, clickCount: 1 },
        negCount: { lastClickedAt: "2026-05-30T00:00:00.000Z", clickCount: -1 },
        missing: { lastClickedAt: "2026-05-30T00:00:00.000Z" },
      }),
    );
    const loaded = loadAxiomInteractionHistory();
    expect(Object.keys(loaded)).toEqual(["good"]);
  });

  it("caps total entries at 200 on save (keeps most recent)", () => {
    const { store } = installLocalStorage();
    const big: AxiomInteractionHistory = {};
    for (let i = 0; i < 300; i++) {
      const day = String(i % 30 + 1).padStart(2, "0");
      big[`axiom-${i}`] = {
        lastClickedAt: `2026-05-${day}T00:00:00.000Z`,
        clickCount: 1,
      };
    }
    saveAxiomInteractionHistory(big);
    const stored = JSON.parse(store.get(STORAGE_KEY)!);
    expect(Object.keys(stored)).toHaveLength(200);
  });
});
