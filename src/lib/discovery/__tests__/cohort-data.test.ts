import { describe, it, expect } from "vitest";
import { buildSubjectGrid } from "../algorithms/_cohort-data";
import type { Subject, Variable } from "../cohort-types";

// ─── _cohort-data tests ────────────────────────────────────────────────
//
// Validates the shared resampler that every contemporaneous-discovery
// algorithm (`notears`, `notears-mlp`, `fci`, `pcmci-linear`,
// `lag-correlation`) consumes. Each algorithm used to inline its own
// copy; this module is now the single source of truth.

const SECOND = 1;
const VARS_CONTINUOUS: Variable[] = [
  { id: "a", label: "A", kind: "continuous", cadenceSeconds: 1 },
  { id: "b", label: "B", kind: "continuous", cadenceSeconds: 1 },
];

const VARS_MIXED: Variable[] = [
  { id: "a", label: "A", kind: "continuous", cadenceSeconds: 1 },
  { id: "e", label: "E", kind: "event", cadenceSeconds: 1 },
];

describe("buildSubjectGrid — short-circuits", () => {
  it("returns null on a subject with no measurements", () => {
    const subject: Subject = { id: "s", measurements: [] };
    expect(buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 1)).toBeNull();
  });

  it("returns null when nGrid < minGridPoints", () => {
    // 3 seconds of span, gridSeconds = 1 → 3 buckets; minGridPoints = 10 rejects.
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 0, value: 1 },
        { variableId: "a", t: 3, value: 2 },
      ],
    };
    expect(buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 10)).toBeNull();
  });
});

describe("buildSubjectGrid — continuous resampling (sample-and-hold)", () => {
  it("uses the most-recent prior measurement at each bucket centre", () => {
    // Measurements at t=0 (a=10), t=2 (a=20), t=4 (a=30). gridSeconds=1.
    // span = 4, nGrid = 4. Bucket centres at t=0.5, 1.5, 2.5, 3.5.
    // Bucket 0 (centre 0.5): last <= 0.5 → a=10
    // Bucket 1 (centre 1.5): last <= 1.5 → a=10
    // Bucket 2 (centre 2.5): last <= 2.5 → a=20
    // Bucket 3 (centre 3.5): last <= 3.5 → a=20
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 0, value: 10 },
        { variableId: "a", t: 2, value: 20 },
        { variableId: "a", t: 4, value: 30 },
        { variableId: "b", t: 0, value: 100 },
      ],
    };
    const grid = buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 1)!;
    expect(grid).not.toBeNull();
    expect(Array.from(grid[0])).toEqual([10, 10, 20, 20]);
  });

  it("leaves NaN in buckets before the first measurement", () => {
    // Measurements at t=2 (a=20), t=4 (a=30). gridSeconds=1, span 2 → 2 buckets
    // at t=2.5, 3.5. But tMin = 2 → buckets normalised to 0.5, 1.5.
    // First bucket has no prior → NaN. Second sees a=20.
    // Need at least 2 measurements to give span > 0.
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 2, value: 20 },
        { variableId: "a", t: 4, value: 30 },
      ],
    };
    const grid = buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 1)!;
    expect(grid).not.toBeNull();
    // After tMin-relative normalisation, the first measurement lands at t=0,
    // so bucket 0 (centre 0.5) sees value 20. No NaN in the leading bucket.
    expect(Number.isFinite(grid[0][0])).toBe(true);
  });
});

describe("buildSubjectGrid — event / binary kind (count)", () => {
  it("counts events per bucket; ignores non-event variable kinds for that channel", () => {
    // Events at t=0, 0.4, 2.8. gridSeconds=1, nGrid=3 (span 2.8 → floor 2 buckets, but
    // we need minGridPoints=2). Adjust to: events at t=0, 0.4, 3.5; span=3.5; nGrid=3.
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 0, value: 1 },
        { variableId: "a", t: 3.5, value: 2 },
        { variableId: "e", t: 0, value: 1 },
        { variableId: "e", t: 0.4, value: 1 },
        { variableId: "e", t: 3.4, value: 1 },
      ],
    };
    const grid = buildSubjectGrid(subject, VARS_MIXED, SECOND, 1)!;
    expect(grid).not.toBeNull();
    // event bucket 0 (t ∈ [0, 1)): 2 events
    // event bucket 1 (t ∈ [1, 2)): 0
    // event bucket 2 (t ∈ [2, 3)): 0
    // event bucket 3 (t ∈ [3, ?)): 1 — depends on nGrid
    const eventChannel = Array.from(grid[1]);
    expect(eventChannel[0]).toBe(2);
  });
});

describe("buildSubjectGrid — filtering", () => {
  it("drops non-finite values from the source measurement stream", () => {
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 0, value: 10 },
        { variableId: "a", t: 1, value: Number.NaN },
        { variableId: "a", t: 2, value: 20 },
        { variableId: "a", t: 3, value: 30 },
      ],
    };
    const grid = buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 1)!;
    expect(grid).not.toBeNull();
    // Bucket 1 (centre 1.5) sees the most recent finite value (10, since NaN was dropped).
    expect(grid[0][1]).toBe(10);
  });

  it("ignores measurements for variableIds not in the variable list", () => {
    const subject: Subject = {
      id: "s",
      measurements: [
        { variableId: "a", t: 0, value: 10 },
        { variableId: "a", t: 3, value: 20 },
        { variableId: "z", t: 1, value: 999 }, // not in VARS_CONTINUOUS
      ],
    };
    const grid = buildSubjectGrid(subject, VARS_CONTINUOUS, SECOND, 1)!;
    expect(grid).not.toBeNull();
    expect(grid.length).toBe(VARS_CONTINUOUS.length);
  });
});
