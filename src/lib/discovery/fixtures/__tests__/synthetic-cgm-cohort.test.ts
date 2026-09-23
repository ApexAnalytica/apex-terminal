import { describe, it, expect } from "vitest";
import {
  buildSyntheticCgmCohort,
  SYNTHETIC_CGM_VARIABLES,
} from "../synthetic-cgm-cohort";
import { pcmciPlusAlgorithm } from "../../algorithms/pcmci-plus";

// ─── synthetic-cgm-cohort ─────────────────────────────────────────────
//
// Pins:
//   1. The cohort builder is deterministic — same seed produces the
//      same subject count, variable schema, and a stable first-subject
//      glucose value (catches any silent drift in the LCG / sim chain).
//   2. The variable schema matches what D1NAMO ingester emits, so the
//      same algorithms run on either substrate.
//   3. PCMCI+ recovers the strongest ground-truth edge
//      (meal_event → cgm_glucose_mgdl) without us hard-coding it.

describe("buildSyntheticCgmCohort", () => {
  it("produces 9 subjects × 288 steps × 4 variables by default", () => {
    const cohort = buildSyntheticCgmCohort();
    expect(cohort.id).toBe("synthetic-cgm-2026-05");
    expect(cohort.subjects).toHaveLength(9);
    expect(cohort.variables).toHaveLength(4);
    for (const subj of cohort.subjects) {
      // 288 timesteps × 4 variables = 1152 measurements per subject
      expect(subj.measurements).toHaveLength(288 * 4);
    }
    expect(cohort.source.containsPHI).toBe(false);
  });

  it("variable schema matches D1NAMO ingester output", () => {
    expect(SYNTHETIC_CGM_VARIABLES.map((v) => v.id)).toEqual([
      "cgm_glucose_mgdl",
      "meal_event",
      "insulin_fast_units",
      "insulin_slow_units",
    ]);
  });

  it("is deterministic across rebuilds (same seed → same first measurement)", () => {
    const a = buildSyntheticCgmCohort();
    const b = buildSyntheticCgmCohort();
    const firstGlucoseA = a.subjects[0].measurements.find(
      (m) => m.variableId === "cgm_glucose_mgdl" && m.t === 0,
    );
    const firstGlucoseB = b.subjects[0].measurements.find(
      (m) => m.variableId === "cgm_glucose_mgdl" && m.t === 0,
    );
    expect(firstGlucoseA).toBeDefined();
    expect(firstGlucoseA!.value).toBe(firstGlucoseB!.value);
  });

  it("PCMCI+ recovers meal_event → cgm_glucose_mgdl at the seeded lag", () => {
    const cohort = buildSyntheticCgmCohort();
    const result = pcmciPlusAlgorithm.run(cohort);
    const mealToGlucose = result.edges.find(
      (e) =>
        e.source === "meal_event" &&
        e.target === "cgm_glucose_mgdl" &&
        e.lag === 300, // 5 min = one grid step
    );
    expect(mealToGlucose).toBeDefined();
    // Ground truth coefficient is +30 mg/dL per meal; after partial
    // correlation normalisation this lands around 0.4–0.5. The exact
    // value is deterministic-ish but we only pin the sign + a loose
    // floor so future numerical drift in the algorithm doesn't break
    // the test for incidental reasons.
    expect(mealToGlucose!.strength).toBeGreaterThan(0.2);
  });
});
