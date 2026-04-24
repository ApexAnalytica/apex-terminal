import { describe, it, expect } from "vitest";
import { coxFit } from "../../estimators/cox";
import fixture from "./fixtures/cox_reference.json";

interface CoxFixture {
  description: string;
  n: number;
  d: number;
  X: number[][];
  times: number[];
  events: number[];
  l2: number;
  expected: {
    beta: number[];
    se: number[];
    log_partial_likelihood: number;
    concordance: number;
    iters: number;
    converged: boolean;
  };
}

const f = fixture as unknown as CoxFixture;

describe("coxFit (Breslow ties, Newton-Raphson)", () => {
  it("matches Python reference on synthetic fixture (n=200, d=3)", () => {
    const result = coxFit(f.X, f.times, f.events, { l2: f.l2 });

    // Coefficients — agreement to 6 decimal places (same algorithm, same ties)
    for (let k = 0; k < f.d; k++) {
      expect(result.beta[k]).toBeCloseTo(f.expected.beta[k], 6);
      expect(result.se[k]).toBeCloseTo(f.expected.se[k], 5);
    }

    // Scalar outputs
    expect(result.logPartialLikelihood).toBeCloseTo(
      f.expected.log_partial_likelihood,
      4,
    );
    expect(result.concordance).toBeCloseTo(f.expected.concordance, 6);
    expect(result.converged).toBe(f.expected.converged);
  });

  it("rejects mismatched input lengths", () => {
    expect(() => coxFit([[1, 2]], [1, 2], [1])).toThrow();
    expect(() => coxFit([[1, 2]], [1], [1, 0])).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => coxFit([], [], [])).toThrow();
  });

  it("handles a zero-event (fully censored) dataset gracefully", () => {
    // With no events the partial log-likelihood is 0 and β stays at 0
    const X = [[1], [0.5], [-1], [2]];
    const times = [1, 2, 3, 4];
    const events = [0, 0, 0, 0];
    const result = coxFit(X, times, events);
    expect(result.beta[0]).toBeCloseTo(0, 8);
    // Concordance is undefined (no admissible pairs) → NaN
    expect(Number.isNaN(result.concordance)).toBe(true);
  });

  it("recovers the sign of a strong single-covariate effect", () => {
    // Deterministic mini-dataset: higher X → earlier event
    const X = [[2], [1], [0], [-1], [-2], [-3]];
    const times = [1, 2, 3, 4, 5, 6];
    const events = [1, 1, 1, 1, 1, 1];
    const result = coxFit(X, times, events);
    // Higher covariate = higher hazard = positive β
    expect(result.beta[0]).toBeGreaterThan(0);
    expect(result.converged).toBe(true);
    expect(result.concordance).toBeGreaterThanOrEqual(0.95);
  });

  it("returns well-formed standard errors (non-negative, finite)", () => {
    const result = coxFit(f.X, f.times, f.events, { l2: f.l2 });
    for (const s of result.se) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});
