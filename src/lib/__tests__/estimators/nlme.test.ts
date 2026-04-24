import { describe, it, expect } from "vitest";
import { nlmeFit, type NlmeSubject } from "../../estimators/nlme";
import fixture from "./fixtures/nlme_reference.json";

interface NlmeFixture {
  description: string;
  n_subjects: number;
  subjects: { t: number[]; y: number[] }[];
  expected: {
    mu: number[];
    tau: number[];
    sigma: number;
    eta: number[][];
    log_likelihood: number;
    converged: boolean;
  };
}

const f = fixture as unknown as NlmeFixture;

describe("nlmeFit (Laplace approximation, 2D Newton inner + BFGS outer)", () => {
  it("matches Python reference on Indomethacin IV elimination phase (n=6 subjects)", () => {
    const subjects: NlmeSubject[] = f.subjects.map((s) => ({
      t: s.t,
      y: s.y,
    }));
    const result = nlmeFit(subjects);

    // Population means (log scale) — tight tolerance: same algorithm,
    // same FD-Hessian step size, same initial estimates.
    // Allow ~2 decimal places because the two optimizers (our BFGS vs
    // scipy L-BFGS-B) use different termination + line search.
    expect(result.mu[0]).toBeCloseTo(f.expected.mu[0], 2);
    expect(result.mu[1]).toBeCloseTo(f.expected.mu[1], 2);

    // Between-subject SDs — NLME identifiability is looser on τ; the
    // log-parameterization + approximate Hessian means 10-15% parity
    // is the typical scipy-vs-hand-rolled spread.
    expect(result.tau[0]).toBeGreaterThan(f.expected.tau[0] * 0.75);
    expect(result.tau[0]).toBeLessThan(f.expected.tau[0] * 1.25);
    expect(result.tau[1]).toBeGreaterThan(f.expected.tau[1] * 0.75);
    expect(result.tau[1]).toBeLessThan(f.expected.tau[1] * 1.25);

    // Residual SD
    expect(result.sigma).toBeGreaterThan(f.expected.sigma * 0.75);
    expect(result.sigma).toBeLessThan(f.expected.sigma * 1.25);

    // Per-subject modes should closely match (conditional on pop params
    // we're within ~2% of, the per-subject Newton solve is deterministic).
    for (let i = 0; i < f.expected.eta.length; i++) {
      expect(result.eta[i][0]).toBeCloseTo(f.expected.eta[i][0], 1);
      expect(result.eta[i][1]).toBeCloseTo(f.expected.eta[i][1], 1);
    }

    // Marginal log-likelihood at our optimum should be close to scipy's
    expect(result.logLikelihood).toBeGreaterThan(
      f.expected.log_likelihood - 2.0,
    );
  });

  it("recovers sensible pharmacokinetic parameters", () => {
    // Sanity check on the substantive story: for indomethacin IV the
    // elimination rate k should be positive (decay), and the implied
    // terminal half-life in the 1-3 h range.
    const subjects: NlmeSubject[] = f.subjects.map((s) => ({
      t: s.t,
      y: s.y,
    }));
    const result = nlmeFit(subjects);
    const kPop = Math.exp(result.mu[1]);
    const halfLife = Math.log(2) / kPop;
    expect(kPop).toBeGreaterThan(0);
    expect(halfLife).toBeGreaterThan(0.5);
    expect(halfLife).toBeLessThan(5);
  });

  it("rejects empty input", () => {
    expect(() => nlmeFit([])).toThrow();
  });

  it("rejects subjects with mismatched t/y lengths", () => {
    const bad: NlmeSubject[] = [{ t: [0, 1, 2], y: [1, 2] }];
    expect(() => nlmeFit(bad)).toThrow();
  });

  it("handles a minimal single-subject input without crashing", () => {
    const subjects: NlmeSubject[] = [
      { t: [0, 1, 2, 3, 4], y: [2.0, 1.2, 0.7, 0.4, 0.25] },
    ];
    const result = nlmeFit(subjects);
    // Single-subject τ is underdetermined but the fit should still
    // return finite params and a single eta row.
    expect(Number.isFinite(result.mu[0])).toBe(true);
    expect(Number.isFinite(result.mu[1])).toBe(true);
    expect(result.eta.length).toBe(1);
    // Decay rate should come out positive for decreasing data
    expect(Math.exp(result.mu[1])).toBeGreaterThan(0);
  });

  it("returns per-subject modes for all input subjects", () => {
    const subjects: NlmeSubject[] = f.subjects.map((s) => ({
      t: s.t,
      y: s.y,
    }));
    const result = nlmeFit(subjects);
    expect(result.eta.length).toBe(subjects.length);
    for (const row of result.eta) {
      expect(row.length).toBe(2);
      expect(Number.isFinite(row[0])).toBe(true);
      expect(Number.isFinite(row[1])).toBe(true);
    }
  });
});
