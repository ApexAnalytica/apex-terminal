// @vitest-environment node
//
// Unit tests for the relevance-reference lookup helper. The reference
// JSON exists as a build artefact and is generated offline by
// `scripts/build-fred-relevance-reference.ts` against real FRED data.
// These tests use a small synthetic-but-shape-correct fixture to exercise
// the lookup math, NOT to make any claim about real-world calibration.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  lookupRelevanceReference,
  loadRelevanceReference,
  _resetRelevanceReferenceCache,
  type RelevanceReference,
} from "../pareto-relevance-reference";

// ─── Fixtures ────────────────────────────────────────────────────

function makeReference(
  overrides: Partial<RelevanceReference> = {},
): RelevanceReference {
  const bins = [
    { binLow: 0.0, binHigh: 0.1, count: 100, eventCount: 5, eventRate: 0.05 },
    { binLow: 0.1, binHigh: 0.2, count: 80, eventCount: 8, eventRate: 0.10 },
    { binLow: 0.2, binHigh: 0.3, count: 60, eventCount: 9, eventRate: 0.15 },
    { binLow: 0.3, binHigh: 0.4, count: 50, eventCount: 10, eventRate: 0.20 },
    { binLow: 0.4, binHigh: 0.5, count: 40, eventCount: 10, eventRate: 0.25 },
    { binLow: 0.5, binHigh: 0.6, count: 30, eventCount: 9, eventRate: 0.30 },
    { binLow: 0.6, binHigh: 0.7, count: 25, eventCount: 9, eventRate: 0.36 },
    { binLow: 0.7, binHigh: 0.8, count: 20, eventCount: 8, eventRate: 0.40 },
    { binLow: 0.8, binHigh: 0.9, count: 10, eventCount: 5, eventRate: 0.50 },
    { binLow: 0.9, binHigh: 1.0, count: 5, eventCount: 3, eventRate: 0.60 },
  ];
  const totalWindows = bins.reduce((s, b) => s + b.count, 0);
  const totalEvents = bins.reduce((s, b) => s + b.eventCount, 0);
  return {
    referenceId: "test-fixture",
    substrateId: "TEST",
    eventLabel: "test event in next k steps",
    windowSize: 60,
    lookahead: 24,
    totalWindows,
    totalEvents,
    baseRate: totalEvents / totalWindows,
    bins,
    buildMeta: {
      builderVersion: "test",
      builtAt: "2026-01-01T00:00:00Z",
      source: "synthetic test fixture",
      cohortFrom: "2010-01-01",
      cohortTo: "2025-12-31",
    },
    ...overrides,
  };
}

// ─── lookupRelevanceReference ───────────────────────────────────

describe("lookupRelevanceReference", () => {
  it("returns the event rate of the bin containing F", () => {
    const ref = makeReference();
    const r = lookupRelevanceReference(ref, 0.45);
    expect(r.eventRate).toBeCloseTo(0.25, 6);
    expect(r.n).toBe(40);
    expect(r.referenceId).toBe("test-fixture");
  });

  it("clamps F < 0 into the first bin", () => {
    const ref = makeReference();
    const r = lookupRelevanceReference(ref, -5);
    expect(r.eventRate).toBeCloseTo(0.05, 6);
    expect(r.n).toBe(100);
  });

  it("clamps F > 1 into the last bin", () => {
    const ref = makeReference();
    const r = lookupRelevanceReference(ref, 5);
    expect(r.eventRate).toBeCloseTo(0.60, 6);
    expect(r.n).toBe(5);
  });

  it("handles F = exactly a bin boundary by picking the upper bin", () => {
    const ref = makeReference();
    // F = 0.3 — falls into [0.3, 0.4) per the half-open contract.
    const r = lookupRelevanceReference(ref, 0.3);
    expect(r.eventRate).toBeCloseTo(0.20, 6);
  });

  it("handles F = exactly 1.0 by picking the last bin (closed at top)", () => {
    const ref = makeReference();
    const r = lookupRelevanceReference(ref, 1.0);
    expect(r.eventRate).toBeCloseTo(0.60, 6);
  });

  it("percentile is monotone non-decreasing in F", () => {
    const ref = makeReference();
    let prev = -Infinity;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const r = lookupRelevanceReference(ref, Math.min(1, f));
      expect(r.percentile).toBeGreaterThanOrEqual(prev);
      prev = r.percentile;
    }
  });

  it("returns NaN eventRate for an empty bin (count=0) without throwing", () => {
    const ref = makeReference({
      bins: [
        { binLow: 0.0, binHigh: 0.5, count: 0, eventCount: 0, eventRate: Number.NaN },
        { binLow: 0.5, binHigh: 1.0, count: 100, eventCount: 30, eventRate: 0.3 },
      ],
      totalWindows: 100,
      totalEvents: 30,
      baseRate: 0.3,
    });
    const r = lookupRelevanceReference(ref, 0.2);
    expect(Number.isNaN(r.eventRate)).toBe(true);
    expect(r.n).toBe(0);
  });

  it("does not throw on a malformed F (NaN, Infinity)", () => {
    const ref = makeReference();
    expect(() => lookupRelevanceReference(ref, NaN)).not.toThrow();
    expect(() => lookupRelevanceReference(ref, Infinity)).not.toThrow();
    const r = lookupRelevanceReference(ref, NaN);
    // NaN falls to F=0 after clamp; first bin.
    expect(r.eventRate).toBeCloseTo(0.05, 6);
  });

  it("baseRate and eventLabel pass through for UI disclosure", () => {
    const ref = makeReference();
    const r = lookupRelevanceReference(ref, 0.5);
    expect(r.baseRate).toBeCloseTo(ref.baseRate, 9);
    expect(r.eventLabel).toBe(ref.eventLabel);
  });
});

// ─── loadRelevanceReference ─────────────────────────────────────

describe("loadRelevanceReference", () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    _resetRelevanceReferenceCache();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
    vi.restoreAllMocks();
  });

  it("returns null on 404 without throwing", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 404 })) as unknown as typeof fetch;
    const r = await loadRelevanceReference("does-not-exist");
    expect(r).toBeNull();
  });

  it("returns null when fetch is unavailable (SSR / test env)", async () => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    const r = await loadRelevanceReference("nope");
    expect(r).toBeNull();
  });

  it("returns the parsed reference on 200", async () => {
    const fixture = makeReference();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as unknown as typeof fetch;
    const r = await loadRelevanceReference("test-fixture");
    expect(r?.referenceId).toBe("test-fixture");
    expect(r?.bins).toHaveLength(10);
  });

  it("caches successful loads (second call doesn't refetch)", async () => {
    const fixture = makeReference();
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await loadRelevanceReference("test-fixture");
    await loadRelevanceReference("test-fixture");
    await loadRelevanceReference("test-fixture");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON (validates shape; never throws)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async () =>
      new Response('{"referenceId":"oops","bins":"not-an-array"}', { status: 200 })) as unknown as typeof fetch;
    const r = await loadRelevanceReference("malformed");
    expect(r).toBeNull();
    consoleSpy.mockRestore();
  });

  it("never throws on network rejection (fetch throws)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const r = await loadRelevanceReference("unreachable");
    expect(r).toBeNull();
    consoleSpy.mockRestore();
  });

  it("coalesces concurrent loads of the same id into a single fetch", async () => {
    const fixture = makeReference();
    let resolveFetch: (v: Response) => void = () => {};
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const p1 = loadRelevanceReference("test-fixture");
    const p2 = loadRelevanceReference("test-fixture");
    const p3 = loadRelevanceReference("test-fixture");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveFetch(new Response(JSON.stringify(fixture), { status: 200 }));
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1?.referenceId).toBe("test-fixture");
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });
});
