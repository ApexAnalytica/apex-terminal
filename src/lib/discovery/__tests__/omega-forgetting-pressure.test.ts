// @vitest-environment node
//
// Tests for Ω-Forgetting Pressure (Phase 3 PR 4). Verifies the
// exposure-weighted reduction over FR values, NaN handling for
// degenerate tasks, normalization semantics, and the time-varying
// series shape.
//
// Test strategy:
//   - Hand-build minimal FRResult objects so the expected pressure
//     values are computable from a one-line formula.
//   - Use the AI Safety demo trace as an end-to-end fixture to verify
//     the Heartbleed archetype dominates the contributions list under
//     the canonical exposure.

import { describe, it, expect } from "vitest";
import {
  computeOmegaForgettingPressure,
  peakPressure,
  topContributors,
} from "../omega-forgetting-pressure";
import type { FRResult, FRTaskResult } from "../fr-estimator";
import { computeFR } from "../fr-estimator";
import {
  buildAISafetyDemoTrace,
  AI_SAFETY_DEMO_EXPOSURE,
} from "../ai-safety-demo-trace";

// ─── Fixture builders ─────────────────────────────────────────────────

function makeFRTask(
  overrides: Partial<FRTaskResult> & { taskId: string },
): FRTaskResult {
  return {
    taskId: overrides.taskId,
    peakAccuracy: overrides.peakAccuracy ?? 0.9,
    peakEpoch: overrides.peakEpoch ?? 1,
    finalAccuracy: overrides.finalAccuracy ?? 0.45,
    lastTrainedEpoch: overrides.lastTrainedEpoch ?? 1,
    frOverTime: overrides.frOverTime ?? [0, 0, 0.2, 0.45],
    normalizedFROverTime: overrides.normalizedFROverTime ?? [0, 0, 0.2222, 0.5],
    absoluteForgetting: overrides.absoluteForgetting ?? 0.45,
    normalizedFR: overrides.normalizedFR ?? 0.5,
    decayRate: overrides.decayRate ?? NaN,
  };
}

function makeFRResult(tasks: FRTaskResult[]): FRResult {
  return {
    tasks,
    sourceKind: "synthetic",
    traceId: "test-trace",
  };
}

// ─── Shape / contract tests ───────────────────────────────────────────

describe("computeOmegaForgettingPressure — shape contracts", () => {
  it("returns one contribution per non-degenerate task", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.2 }),
      makeFRTask({ taskId: "C", normalizedFR: 0.0 }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    expect(result.contributions).toHaveLength(3);
    const ids = new Set(result.contributions.map((c) => c.taskId));
    expect(ids).toEqual(new Set(["A", "B", "C"]));
  });

  it("contributions are sorted descending by contribution", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.1 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.8 }),
      makeFRTask({ taskId: "C", normalizedFR: 0.4 }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    for (let i = 1; i < result.contributions.length; i++) {
      expect(result.contributions[i].contribution).toBeLessThanOrEqual(
        result.contributions[i - 1].contribution,
      );
    }
    expect(result.contributions[0].taskId).toBe("B");
  });

  it("pressureOverTime length matches the FR series length", () => {
    const fr = makeFRResult([
      makeFRTask({
        taskId: "A",
        normalizedFROverTime: [0, 0.1, 0.2, 0.3, 0.4],
      }),
      makeFRTask({
        taskId: "B",
        normalizedFROverTime: [0, 0, 0.1, 0.2, 0.5],
      }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    expect(result.pressureOverTime).toHaveLength(5);
  });

  it("forwards sourceKind and traceId verbatim", () => {
    const fr: FRResult = {
      tasks: [makeFRTask({ taskId: "A" })],
      sourceKind: "synthetic",
      traceId: "abc-123",
    };
    const result = computeOmegaForgettingPressure(fr);
    expect(result.sourceKind).toBe("synthetic");
    expect(result.traceId).toBe("abc-123");
  });
});

// ─── Default-exposure math ────────────────────────────────────────────

describe("computeOmegaForgettingPressure — default uniform exposure", () => {
  it("uniform default → arithmetic mean of normalizedFR values", () => {
    // 3 tasks, all defined → uniform weights 1/3 each → pressure =
    // average of normalizedFR.
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.6 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.3 }),
      makeFRTask({ taskId: "C", normalizedFR: 0.0 }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    expect(result.pressure).toBeCloseTo((0.6 + 0.3 + 0.0) / 3, 12);
    expect(result.totalExposure).toBeCloseTo(1, 12);
    for (const c of result.contributions) {
      expect(c.exposure).toBeCloseTo(1 / 3, 12);
    }
  });
});

// ─── Custom exposure ─────────────────────────────────────────────────

describe("computeOmegaForgettingPressure — custom exposure", () => {
  it("weighted sum honors the override", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.8 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.2 }),
    ]);
    // Raw weights 3:1 → normalized 0.75:0.25
    const result = computeOmegaForgettingPressure(fr, {
      exposure: { A: 3, B: 1 },
    });
    expect(result.pressure).toBeCloseTo(0.75 * 0.8 + 0.25 * 0.2, 10);
    const a = result.contributions.find((c) => c.taskId === "A")!;
    const b = result.contributions.find((c) => c.taskId === "B")!;
    expect(a.exposure).toBeCloseTo(0.75, 10);
    expect(b.exposure).toBeCloseTo(0.25, 10);
  });

  it("missing exposure entries default to weight 1", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.5 }),
    ]);
    // No exposure passed → both default to 1 → normalized 0.5:0.5
    const result = computeOmegaForgettingPressure(fr, { exposure: {} });
    expect(result.pressure).toBeCloseTo(0.5, 10);
  });

  it("zero exposure on a task drops its contribution", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.8 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.2 }),
    ]);
    // B's exposure is 0 → all weight goes to A → pressure = 0.8
    const result = computeOmegaForgettingPressure(fr, {
      exposure: { A: 1, B: 0 },
    });
    expect(result.pressure).toBeCloseTo(0.8, 10);
  });

  it("negative / NaN exposures are clamped to 0", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "C", normalizedFR: 0.5 }),
    ]);
    const result = computeOmegaForgettingPressure(fr, {
      exposure: { A: 1, B: -5, C: NaN },
    });
    // B / C zeroed → only A contributes → pressure = 0.5
    expect(result.pressure).toBeCloseTo(0.5, 10);
  });

  it("normalizeWeights: false preserves the raw scale", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.5 }),
    ]);
    const result = computeOmegaForgettingPressure(fr, {
      exposure: { A: 2, B: 2 },
      normalizeWeights: false,
    });
    // Σ 2·0.5 + 2·0.5 = 2
    expect(result.pressure).toBeCloseTo(2, 10);
    expect(result.totalExposure).toBeCloseTo(4, 10);
  });
});

// ─── NaN / degenerate handling ───────────────────────────────────────

describe("computeOmegaForgettingPressure — degenerate tasks", () => {
  it("drops tasks with NaN normalizedFR from the sum", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.5 }),
      makeFRTask({ taskId: "B", normalizedFR: NaN }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    // B drops; A gets all the weight after normalization → pressure = 0.5
    expect(result.pressure).toBeCloseTo(0.5, 10);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].taskId).toBe("A");
    expect(result.degenerateTaskCount).toBe(1);
  });

  it("returns NaN pressure when every task is degenerate", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: NaN }),
      makeFRTask({ taskId: "B", normalizedFR: NaN }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    expect(Number.isNaN(result.pressure)).toBe(true);
    expect(result.contributions).toHaveLength(0);
    expect(result.degenerateTaskCount).toBe(2);
  });

  it("clamps out-of-range normalizedFR to [0, 1]", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 1.7 }), // clamps to 1
      makeFRTask({ taskId: "B", normalizedFR: -0.3 }), // clamps to 0
    ]);
    const result = computeOmegaForgettingPressure(fr);
    expect(result.pressure).toBeCloseTo(0.5, 10);
  });
});

// ─── Time-varying series ─────────────────────────────────────────────

describe("computeOmegaForgettingPressure — pressureOverTime", () => {
  it("each epoch is the weighted sum of per-task FR-over-time values", () => {
    const fr = makeFRResult([
      makeFRTask({
        taskId: "A",
        normalizedFROverTime: [0, 0.2, 0.4],
      }),
      makeFRTask({
        taskId: "B",
        normalizedFROverTime: [0, 0.1, 0.3],
      }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    // Uniform weights 0.5 / 0.5
    expect(result.pressureOverTime[0]).toBeCloseTo(0, 10);
    expect(result.pressureOverTime[1]).toBeCloseTo(0.5 * 0.2 + 0.5 * 0.1, 10);
    expect(result.pressureOverTime[2]).toBeCloseTo(0.5 * 0.4 + 0.5 * 0.3, 10);
  });

  it("epochs where every task is degenerate yield NaN", () => {
    // All degenerate → no live tasks → series is empty → result series
    // has length 0.
    const fr = makeFRResult([
      makeFRTask({
        taskId: "A",
        normalizedFR: NaN,
        normalizedFROverTime: [0, 0.2],
      }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    // A is degenerate at the summary level → live map is empty → every
    // epoch's `anyAtEpoch` is false → all NaN.
    for (const v of result.pressureOverTime) {
      expect(Number.isNaN(v)).toBe(true);
    }
  });
});

// ─── Argument validation ─────────────────────────────────────────────

describe("computeOmegaForgettingPressure — argument validation", () => {
  it("throws when the FRResult has zero tasks", () => {
    const fr: FRResult = {
      tasks: [],
      sourceKind: "synthetic",
      traceId: "empty",
    };
    expect(() => computeOmegaForgettingPressure(fr)).toThrow(/zero tasks/);
  });
});

// ─── Convenience helpers ─────────────────────────────────────────────

describe("peakPressure", () => {
  it("returns the maximum value + its epoch index", () => {
    const fr = makeFRResult([
      makeFRTask({
        taskId: "A",
        normalizedFROverTime: [0, 0.3, 0.1, 0.5, 0.2],
      }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    const peak = peakPressure(result);
    expect(peak.value).toBeCloseTo(0.5, 10);
    expect(peak.epochIndex).toBe(3);
  });

  it("returns NaN / -1 when the series is empty or all-NaN", () => {
    const fr = makeFRResult([
      makeFRTask({
        taskId: "A",
        normalizedFR: NaN,
        normalizedFROverTime: [0, 0.2],
      }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    const peak = peakPressure(result);
    expect(Number.isNaN(peak.value)).toBe(true);
    expect(peak.epochIndex).toBe(-1);
  });
});

describe("topContributors", () => {
  it("returns the first N contributions (already sorted)", () => {
    const fr = makeFRResult([
      makeFRTask({ taskId: "A", normalizedFR: 0.2 }),
      makeFRTask({ taskId: "B", normalizedFR: 0.9 }),
      makeFRTask({ taskId: "C", normalizedFR: 0.5 }),
    ]);
    const result = computeOmegaForgettingPressure(fr);
    const top2 = topContributors(result, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].taskId).toBe("B");
    expect(top2[1].taskId).toBe("C");
  });

  it("returns [] when N ≤ 0", () => {
    const fr = makeFRResult([makeFRTask({ taskId: "A" })]);
    const result = computeOmegaForgettingPressure(fr);
    expect(topContributors(result, 0)).toEqual([]);
    expect(topContributors(result, -1)).toEqual([]);
  });
});

// ─── End-to-end on the AI Safety demo trace ──────────────────────────

describe("computeOmegaForgettingPressure — AI Safety demo trace", () => {
  it("Heartbleed dominates contributions under the canonical exposure", () => {
    const trace = buildAISafetyDemoTrace();
    const fr = computeFR(trace);
    const result = computeOmegaForgettingPressure(fr, {
      exposure: AI_SAFETY_DEMO_EXPOSURE,
    });
    // Heartbleed has 4x the forgettingRate of DDoS and a long off-task
    // tail before the trace ends, so its `contribution` should be the
    // largest entry in the sorted list even though its exposure (0.20)
    // is the smallest.
    expect(result.contributions[0].taskId).toBe("task_heartbleed");
    expect(result.sourceKind).toBe("synthetic");
    expect(result.traceId).toBe("ai-safety-demo-ids");
    // Pressure ∈ [0, 1]
    expect(result.pressure).toBeGreaterThanOrEqual(0);
    expect(result.pressure).toBeLessThanOrEqual(1);
  });

  it("pressureOverTime is non-decreasing across the off-task tail", () => {
    const trace = buildAISafetyDemoTrace();
    const fr = computeFR(trace);
    const result = computeOmegaForgettingPressure(fr, {
      exposure: AI_SAFETY_DEMO_EXPOSURE,
    });
    // After epoch 9 the curriculum revisits DDoS only — MITM and
    // Heartbleed are off-task and decaying. Pressure should rise
    // (modulo noise) over that window. Compare endpoints since noise
    // can cause local non-monotonicity.
    const last = result.pressureOverTime[result.pressureOverTime.length - 1];
    const atRevisitStart = result.pressureOverTime[9];
    expect(last).toBeGreaterThanOrEqual(atRevisitStart);
  });
});
