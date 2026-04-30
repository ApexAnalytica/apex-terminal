import { describe, it, expect } from "vitest";
import {
  CohortValidationError,
  DEFAULT_LIMITS,
  validateCohort,
} from "../cohort-validator";
import type { Cohort } from "../cohort-types";

function valid(): Cohort {
  return {
    id: "test",
    label: "test cohort",
    source: {
      adapter: "test",
      adapterVersion: "0",
      ingestedAt: "2026-04-29T00:00:00Z",
      containsPHI: false,
    },
    variables: [
      { id: "x", label: "X", kind: "continuous" },
      { id: "y", label: "Y", kind: "continuous" },
    ],
    subjects: [
      {
        id: "s1",
        measurements: [
          { variableId: "x", t: 0, value: 1 },
          { variableId: "y", t: 0, value: 2 },
        ],
      },
    ],
    timeAxis: { zeroConvention: "session-start", displayUnit: "seconds" },
    metadata: { description: "test", accessTier: "public" },
  };
}

describe("validateCohort", () => {
  it("accepts a valid cohort", () => {
    expect(() => validateCohort(valid())).not.toThrow();
  });

  it("rejects non-objects", () => {
    expect(() => validateCohort(null)).toThrow(CohortValidationError);
    expect(() => validateCohort("string")).toThrow(CohortValidationError);
    expect(() => validateCohort(42)).toThrow(CohortValidationError);
  });

  it("rejects when source.containsPHI is anything other than literal false", () => {
    for (const bad of [true, "false", 0, null, undefined]) {
      const c = valid();
      (c.source as unknown as { containsPHI: unknown }).containsPHI = bad;
      expect(() => validateCohort(c)).toThrow(/containsPHI/);
    }
  });

  it("rejects when a measurement references an unknown variable", () => {
    const c = valid();
    c.subjects[0].measurements.push({
      variableId: "not_in_variables_list",
      t: 0,
      value: 1,
    });
    expect(() => validateCohort(c)).toThrow(/unknown variable/);
  });

  it("rejects duplicate variable ids", () => {
    const c = valid();
    c.variables.push({ id: "x", label: "X dup", kind: "continuous" });
    expect(() => validateCohort(c)).toThrow(/duplicate variable/);
  });

  it("rejects duplicate subject ids", () => {
    const c = valid();
    c.subjects.push({
      id: "s1",
      measurements: [{ variableId: "x", t: 1, value: 9 }],
    });
    expect(() => validateCohort(c)).toThrow(/duplicate subject/);
  });

  it("rejects cohorts that exceed the measurement cap", () => {
    const c = valid();
    expect(() =>
      validateCohort(c, { ...DEFAULT_LIMITS, maxMeasurements: 1 }),
    ).toThrow(/exceeds limit/);
  });

  it("rejects measurements with non-finite t", () => {
    const c = valid();
    c.subjects[0].measurements[0].t = NaN;
    expect(() => validateCohort(c)).toThrow(/non-finite/);
  });

  it("rejects empty variables array", () => {
    const c = valid();
    c.variables = [];
    expect(() => validateCohort(c)).toThrow(/non-empty/);
  });

  it("rejects missing required top-level fields", () => {
    for (const key of ["id", "label", "source", "variables", "subjects"]) {
      const c = valid() as unknown as Record<string, unknown>;
      delete c[key];
      expect(() => validateCohort(c)).toThrow(new RegExp(key));
    }
  });
});
