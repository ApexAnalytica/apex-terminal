import { describe, it, expect } from "vitest";
import {
  buildNpodSyntheticCohort,
  NPOD_VARIABLES,
  STRATA,
  STRATUM_LABELS,
  type NpodStratum,
} from "../npod-synthetic-cohort";
import { validateCohort, DEFAULT_LIMITS } from "../../cohort-validator";

describe("buildNpodSyntheticCohort", () => {
  it("produces a Cohort that passes the validator (in-process limits)", () => {
    const cohort = buildNpodSyntheticCohort();
    // Default 4×30 = 120 subjects exceeds the API-wire cap of 100. The
    // fixture is consumed in-process by the Tissue Cohort view, not
    // POSTed, so we validate against fixture-appropriate limits.
    expect(() =>
      validateCohort(cohort, {
        ...DEFAULT_LIMITS,
        maxSubjects: 200,
        maxMeasurements: 200_000,
      }),
    ).not.toThrow();
  });

  it("under the smaller-cohort default it passes the wire-side validator", () => {
    // Confirms the fixture is wire-compatible when scoped down.
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 25 });
    expect(() => validateCohort(cohort)).not.toThrow();
  });

  it("source.containsPHI is hard-typed false", () => {
    const cohort = buildNpodSyntheticCohort();
    const isFalse: false = cohort.source.containsPHI;
    expect(isFalse).toBe(false);
  });

  it("emits 4 strata × N donors with correct counts", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 25 });
    expect(cohort.subjects).toHaveLength(4 * 25);
    const byStratum: Record<string, number> = {};
    for (const s of cohort.subjects) {
      const stratum = String(s.demographics?.stratum ?? "");
      byStratum[stratum] = (byStratum[stratum] ?? 0) + 1;
    }
    for (const stratum of STRATA) {
      expect(byStratum[stratum]).toBe(25);
    }
  });

  it("scRNA cluster proportions sum to ~1 per donor", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 5 });
    const scrnaIds = NPOD_VARIABLES.filter((v) => v.id.startsWith("scrna_")).map(
      (v) => v.id,
    );
    expect(scrnaIds.length).toBe(5);
    for (const subj of cohort.subjects) {
      let sum = 0;
      for (const m of subj.measurements) {
        if (scrnaIds.includes(m.variableId) && typeof m.value === "number") {
          sum += m.value;
        }
      }
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it("β-cell mass drops monotonically across strata in mean", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 50 });
    const meansByStratum: Record<string, number> = {};
    for (const stratum of STRATA) {
      const values: number[] = [];
      for (const subj of cohort.subjects) {
        if (subj.demographics?.stratum !== stratum) continue;
        const m = subj.measurements.find(
          (mm) => mm.variableId === "histo_beta_cell_mass_pct",
        );
        if (m && typeof m.value === "number") values.push(m.value);
      }
      meansByStratum[stratum] =
        values.reduce((a, b) => a + b, 0) / values.length;
    }
    // Disease progression: HC > AAB+ > NEW_ONSET > LONG_DURATION.
    expect(meansByStratum.HC).toBeGreaterThan(meansByStratum["AAB+"]);
    expect(meansByStratum["AAB+"]).toBeGreaterThan(meansByStratum.NEW_ONSET);
    expect(meansByStratum.NEW_ONSET).toBeGreaterThan(
      meansByStratum.LONG_DURATION,
    );
  });

  it("immune-infiltrate proportion peaks at NEW_ONSET", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 50 });
    const meanImmune = (stratum: NpodStratum) => {
      const values: number[] = [];
      for (const subj of cohort.subjects) {
        if (subj.demographics?.stratum !== stratum) continue;
        const m = subj.measurements.find((mm) => mm.variableId === "scrna_immune_pct");
        if (m && typeof m.value === "number") values.push(m.value);
      }
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    const newOnset = meanImmune("NEW_ONSET");
    // Strict peak at new-onset.
    expect(newOnset).toBeGreaterThan(meanImmune("HC"));
    expect(newOnset).toBeGreaterThan(meanImmune("AAB+"));
    expect(newOnset).toBeGreaterThan(meanImmune("LONG_DURATION"));
  });

  it("HC donors have zero T1D duration and zero autoantibody count", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 20 });
    for (const subj of cohort.subjects) {
      if (subj.demographics?.stratum !== "HC") continue;
      const dur = subj.measurements.find(
        (m) => m.variableId === "clin_t1d_duration_years",
      );
      const aab = subj.measurements.find(
        (m) => m.variableId === "clin_autoantibody_count",
      );
      expect(dur?.value).toBe(0);
      expect(aab?.value).toBe(0);
    }
  });

  it("LONG_DURATION donors have ≥10 years of T1D duration", () => {
    const cohort = buildNpodSyntheticCohort({ donorsPerStratum: 30 });
    for (const subj of cohort.subjects) {
      if (subj.demographics?.stratum !== "LONG_DURATION") continue;
      const dur = subj.measurements.find(
        (m) => m.variableId === "clin_t1d_duration_years",
      );
      expect(typeof dur?.value).toBe("number");
      expect(dur?.value as number).toBeGreaterThanOrEqual(10);
    }
  });

  it("is deterministic on seed", () => {
    const a = buildNpodSyntheticCohort({ seed: 42, donorsPerStratum: 5 });
    const b = buildNpodSyntheticCohort({ seed: 42, donorsPerStratum: 5 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different cohorts under different seeds", () => {
    const a = buildNpodSyntheticCohort({ seed: 1, donorsPerStratum: 5 });
    const b = buildNpodSyntheticCohort({ seed: 2, donorsPerStratum: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("STRATUM_LABELS covers every stratum in STRATA", () => {
    for (const s of STRATA) expect(STRATUM_LABELS[s]).toBeDefined();
  });
});
