import { describe, it, expect } from "vitest";
import {
  bocpd,
  detectChangepointsFromMap,
  lgamma,
  logsumexp,
} from "@/lib/estimators/bocpd";
import ref from "./fixtures/bocpd_reference.json";

// The fixture was produced by research/estimators/bocpd.py on a seeded
// 3-regime signal (N(0,1) → N(5,1) → N(-2,1), n=40 each, hazard=0.01).
// The TS port must match to ~1e-5 on scalar summaries and reproduce the
// same MAP run-length trajectory exactly.

describe("bocpd numerical helpers", () => {
  it("lgamma matches known values", () => {
    expect(lgamma(1)).toBeCloseTo(0, 12);
    expect(lgamma(2)).toBeCloseTo(0, 12);
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(lgamma(10)).toBeCloseTo(Math.log(362880), 8);
    expect(lgamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 12);
  });

  it("logsumexp matches naive log-sum-exp", () => {
    const a = [-1, 0, 1, 2];
    const naive = Math.log(a.reduce((s, v) => s + Math.exp(v), 0));
    expect(logsumexp(a)).toBeCloseTo(naive, 12);
  });

  it("logsumexp handles all -Infinity", () => {
    expect(logsumexp([-Infinity, -Infinity])).toBe(-Infinity);
  });
});

describe("bocpd parity with Python reference", () => {
  const result = bocpd(ref.x, { hazard: ref.hazard, cpWindow: ref.cp_window });

  it("matches predictive_mean on first 5 steps", () => {
    for (let i = 0; i < 5; i++) {
      expect(result.predictiveMean[i]).toBeCloseTo(
        ref.predictive_mean_first_5[i],
        5,
      );
    }
  });

  it("matches predictive_mean on last 5 steps", () => {
    const T = result.predictiveMean.length;
    for (let i = 0; i < 5; i++) {
      expect(result.predictiveMean[T - 5 + i]).toBeCloseTo(
        ref.predictive_mean_last_5[i],
        5,
      );
    }
  });

  it("matches log_evidence sum", () => {
    const sum = result.logEvidence.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(ref.log_evidence_sum, 4);
  });

  it("matches MAP run-length on first and last 5 steps", () => {
    expect(result.mapRunLength.slice(0, 5)).toEqual(ref.map_run_length_first_5);
    const T = result.mapRunLength.length;
    expect(result.mapRunLength.slice(T - 5)).toEqual(ref.map_run_length_last_5);
  });

  it("matches peak new_run_prob", () => {
    let maxVal = -Infinity;
    let argmax = 0;
    for (let i = 0; i < result.newRunProb.length; i++) {
      if (result.newRunProb[i] > maxVal) {
        maxVal = result.newRunProb[i];
        argmax = i;
      }
    }
    expect(maxVal).toBeCloseTo(ref.new_run_prob_max, 6);
    // Argmax is a float-tie near 1.0 across the earliest steps (every
    // run-length in the first cp_window slots starts at mass 1.0), so
    // exact index depends on normalization residuals. Just check it
    // lands in the early warm-up window like the reference does.
    expect(argmax).toBeLessThan(ref.cp_window);
  });

  it("row probabilities sum to 1 at every step", () => {
    for (let t = 0; t < result.runLengthPosterior.length; t++) {
      const s = result.runLengthPosterior[t].reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 6);
    }
  });

  it("recovers both change-points with detectChangepointsFromMap", () => {
    const cps = detectChangepointsFromMap(result.mapRunLength);
    expect(cps).toEqual(ref.cps);
  });
});
