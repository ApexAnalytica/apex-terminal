import { describe, it, expect } from "vitest";
import { partialCorrelation } from "../algorithms/_partial-correlation";

// Deterministic noise.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) / 0xffffff) * 2 - 1;
  };
}

describe("partialCorrelation", () => {
  it("recovers ~Pearson r when conditioning set is empty", () => {
    const rand = lcg(7);
    const x = Array.from({ length: 200 }, () => rand());
    const y = x.map((v) => 0.7 * v + 0.5 * rand());
    const r = partialCorrelation(x, y, []);
    expect(r).not.toBeNull();
    expect(r!.r).toBeGreaterThan(0.6);
    expect(r!.p).toBeLessThan(1e-10);
  });

  it("collapses a confounded edge when conditioning on the common cause", () => {
    // Z is a common cause of both X and Y. Without conditioning,
    // X and Y look correlated; conditional on Z, they should not.
    const rand = lcg(11);
    const N = 400;
    const z = Array.from({ length: N }, () => rand());
    const x = z.map((v) => 0.9 * v + 0.3 * rand());
    const y = z.map((v) => 0.9 * v + 0.3 * rand());
    const Z = z.map((v) => [v]);

    const unconditional = partialCorrelation(x, y, []);
    const conditional = partialCorrelation(x, y, Z);

    expect(unconditional).not.toBeNull();
    expect(conditional).not.toBeNull();
    expect(Math.abs(unconditional!.r)).toBeGreaterThan(0.5);
    // Conditional partial correlation should drop sharply.
    expect(Math.abs(conditional!.r)).toBeLessThan(0.2);
    expect(conditional!.p).toBeGreaterThan(unconditional!.p);
  });

  it("preserves a direct edge under irrelevant conditioning", () => {
    // X → Y, Z is independent of both. Conditioning on Z should NOT
    // collapse the X-Y relationship.
    const rand = lcg(13);
    const N = 300;
    const x = Array.from({ length: N }, () => rand());
    const y = x.map((v) => 0.8 * v + 0.4 * rand());
    const z = Array.from({ length: N }, () => rand()); // independent
    const Z = z.map((v) => [v]);

    const conditional = partialCorrelation(x, y, Z);
    expect(conditional).not.toBeNull();
    expect(Math.abs(conditional!.r)).toBeGreaterThan(0.5);
    expect(conditional!.p).toBeLessThan(1e-10);
  });

  it("returns null on rank-deficient conditioning set", () => {
    const rand = lcg(17);
    const N = 50;
    const x = Array.from({ length: N }, () => rand());
    const y = x.map((v) => 0.5 * v + 0.5 * rand());
    // Two identical conditioning columns → rank deficient.
    const same = Array.from({ length: N }, () => 1.0);
    const Z = same.map((v) => [v, v]);
    const result = partialCorrelation(x, y, Z);
    expect(result).toBeNull();
  });

  it("drops NaN-pair rows and reports the effective n", () => {
    const N = 100;
    const x = Array.from({ length: N }, (_, i) => (i % 5 === 0 ? NaN : i));
    const y = Array.from({ length: N }, (_, i) => i + 0.1);
    const result = partialCorrelation(x, y, []);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(80); // 100 − 20 NaN positions
  });
});
