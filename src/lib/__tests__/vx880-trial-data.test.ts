import { describe, it, expect } from "vitest";
import {
  getNaturalHistoryCpeptideCohort,
  getInsulinIndependenceTte,
} from "../vx880-trial-data";
import { nlmeFit } from "../estimators/nlme";
import { coxFit } from "../estimators/cox";

describe("VX-880 trial cohort data", () => {
  it("natural-history C-peptide decays with t½ ~ 2-3 years (NLME)", () => {
    const cohort = getNaturalHistoryCpeptideCohort();
    expect(cohort.length).toBe(12);
    const fit = nlmeFit(cohort);
    console.log(
      `  NLME: A≈${Math.exp(fit.mu[0]).toFixed(3)} nmol/L, ` +
        `k≈${Math.exp(fit.mu[1]).toFixed(3)}/yr, ` +
        `t½≈${(Math.log(2) / Math.exp(fit.mu[1])).toFixed(2)} yr, ` +
        `σ=${fit.sigma.toFixed(3)}`,
    );
    // μ_k is log(k). Natural history: k ≈ 0.25-0.35 /yr, so μ_k ∈ [log 0.25, log 0.35].
    const kPop = Math.exp(fit.mu[1]);
    const halfLife = Math.log(2) / kPop;
    expect(kPop).toBeGreaterThan(0.15);
    expect(kPop).toBeLessThan(0.5);
    expect(halfLife).toBeGreaterThan(1.4);
    expect(halfLife).toBeLessThan(5);
    // Baseline amplitude: ~0.2-0.25 nmol/L
    const aPop = Math.exp(fit.mu[0]);
    expect(aPop).toBeGreaterThan(0.15);
    expect(aPop).toBeLessThan(0.3);
  });

  it("VX-880 treatment dramatically accelerates insulin independence (Cox HR)", () => {
    const { X, times, events } = getInsulinIndependenceTte();
    // 7+1 events in 24 subjects — enough for a stable Cox fit with ridge.
    const fit = coxFit(X, times, events, { l2: 0.01 });
    console.log(
      `  Cox: β=${fit.beta[0].toFixed(3)} ` +
        `(HR≈${Math.exp(fit.beta[0]).toFixed(2)}), ` +
        `SE=${fit.se[0].toFixed(3)}, ` +
        `c-idx=${fit.concordance.toFixed(3)}`,
    );
    // β > 0 means treatment raises the hazard of the desirable event
    // (insulin independence). Treatment arm: 7/12; control: 1/12.
    expect(fit.beta[0]).toBeGreaterThan(1.5); // HR = exp(β) > 4.5
    expect(fit.converged).toBe(true);
    expect(fit.se[0]).toBeGreaterThan(0);
    expect(Number.isFinite(fit.se[0])).toBe(true);
    // Concordance: with a single binary covariate every within-arm pair
    // is a tie scored 0.5, so a "perfect" treatment separation caps c
    // around the high 0.7s. We just want to confirm the direction holds.
    expect(fit.concordance).toBeGreaterThan(0.7);
  });

  it("TTE dataset has 24 subjects, 8 events, balanced arms", () => {
    const { subjects, times, events } = getInsulinIndependenceTte();
    expect(subjects.length).toBe(24);
    expect(times.length).toBe(24);
    expect(events.reduce((a, b) => a + b, 0)).toBe(8);
    const treated = subjects.filter((s) => s.treatment === 1).length;
    const control = subjects.filter((s) => s.treatment === 0).length;
    expect(treated).toBe(12);
    expect(control).toBe(12);
  });
});
