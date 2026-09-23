// @vitest-environment node
//
// Tests for the Phase 3 substrate: TrainingTrace types, validator,
// and synthetic generator. Anchors the math contract that downstream
// estimators (BES temporal monitoring, FR, Ω-Forgetting Pressure)
// will read from.
//
// Hand-computable assertions where possible — the synthetic generator
// is deterministic given a seed + curriculum, so we can pin exact
// values and catch any future change to the dynamics math loudly.

import { describe, it, expect } from "vitest";
import {
  buildSyntheticTrainingTrace,
  DEFAULT_TASK_DYNAMICS,
  sequentialCurriculum,
  type BuildSyntheticTraceOptions,
} from "../training-trace-synthetic";
import {
  validateTrainingTrace,
  TrainingTraceValidationError,
  DEFAULT_TRACE_LIMITS,
} from "../training-trace-validator";
import type { TaskRef, TrainingTrace } from "../training-trace-types";

// ─── Fixtures ────────────────────────────────────────────────────────

const ATTACK_TASKS: TaskRef[] = [
  { id: "ais_attack_ddos", label: "DDoS", scope: "attack-class" },
  { id: "ais_attack_mitm", label: "MITM", scope: "attack-class" },
  { id: "ais_attack_heartbleed", label: "Heartbleed", scope: "attack-class" },
];

function defaultOpts(
  overrides: Partial<BuildSyntheticTraceOptions> = {},
): BuildSyntheticTraceOptions {
  return {
    id: "test-trace",
    label: "Test Trace",
    tasks: ATTACK_TASKS,
    curriculum: sequentialCurriculum(
      ATTACK_TASKS.map((t) => t.id),
      5,
    ),
    seed: 42,
    noiseAmplitude: 0, // disable noise for hand-computable assertions
    ...overrides,
  };
}

// ─── buildSyntheticTrainingTrace ─────────────────────────────────────

describe("buildSyntheticTrainingTrace — shape", () => {
  it("produces a trace marked source.kind = 'synthetic'", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    expect(trace.source.kind).toBe("synthetic");
    expect(trace.source.adapter).toBe("synthetic");
  });

  it("total epoch count = max(curriculum window endEpoch)", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    expect(trace.epochs).toHaveLength(15); // 3 tasks × 5 epochs each
    expect(trace.epochs[0].index).toBe(0);
    expect(trace.epochs[14].index).toBe(14);
  });

  it("epoch indices are strictly increasing", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    for (let i = 1; i < trace.epochs.length; i++) {
      expect(trace.epochs[i].index).toBeGreaterThan(trace.epochs[i - 1].index);
    }
  });

  it("every epoch carries an accuracy entry for every task", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    for (const ep of trace.epochs) {
      expect(ep.accuracy).toHaveLength(ATTACK_TASKS.length);
      const ids = new Set(ep.accuracy.map((a) => a.taskId));
      for (const t of ATTACK_TASKS) {
        expect(ids.has(t.id)).toBe(true);
      }
    }
  });

  it("activeTaskIds match the curriculum at each epoch", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    // Sequential curriculum: epoch e in window [i*5, (i+1)*5) for task i
    expect(trace.epochs[0].activeTaskIds).toEqual(["ais_attack_ddos"]);
    expect(trace.epochs[4].activeTaskIds).toEqual(["ais_attack_ddos"]);
    expect(trace.epochs[5].activeTaskIds).toEqual(["ais_attack_mitm"]);
    expect(trace.epochs[9].activeTaskIds).toEqual(["ais_attack_mitm"]);
    expect(trace.epochs[10].activeTaskIds).toEqual(["ais_attack_heartbleed"]);
    expect(trace.epochs[14].activeTaskIds).toEqual(["ais_attack_heartbleed"]);
  });
});

describe("buildSyntheticTrainingTrace — dynamics", () => {
  it("accuracy rises while task is active", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    // DDoS is active epochs 0-4. Its accuracy should rise across that range.
    const ddosAccs = trace.epochs
      .slice(0, 5)
      .map((ep) => ep.accuracy.find((a) => a.taskId === "ais_attack_ddos")!.value);
    for (let i = 1; i < ddosAccs.length; i++) {
      expect(ddosAccs[i]).toBeGreaterThan(ddosAccs[i - 1]);
    }
    // Last epoch under active training: closer to plateau (0.95) than baseline (0.05).
    expect(ddosAccs[4]).toBeGreaterThan(0.5);
  });

  it("accuracy decays after training shifts away", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    // After epoch 5, DDoS is no longer active. Accuracy should decay.
    const ddosAccs = trace.epochs
      .map((ep) => ep.accuracy.find((a) => a.taskId === "ais_attack_ddos")!.value);
    expect(ddosAccs[5]).toBeLessThan(ddosAccs[4]);
    expect(ddosAccs[14]).toBeLessThan(ddosAccs[5]);
  });

  it("higher forgettingRate → faster decay (Heartbleed archetype)", () => {
    // Standard Heartbleed: high forgettingRate. Compare its decay to a
    // calmer task by training both at epochs 0-4, then training a
    // separate filler task at epochs 5-14 so the trace runs 15 epochs
    // but stable/fragile decay freely the whole time.
    const tasks: TaskRef[] = [
      { id: "stable", label: "Stable", scope: "attack-class" },
      { id: "fragile", label: "Fragile (Heartbleed-like)", scope: "attack-class" },
      { id: "filler", label: "Filler", scope: "attack-class" },
    ];
    const trace = buildSyntheticTrainingTrace({
      id: "decay-comparison",
      label: "Decay comparison",
      tasks,
      curriculum: [
        { taskId: "stable", startEpoch: 0, endEpoch: 5 },
        { taskId: "fragile", startEpoch: 0, endEpoch: 5 },
        // Filler keeps the trace running so stable/fragile decay freely
        // across epochs 5-14 (10 idle epochs).
        { taskId: "filler", startEpoch: 5, endEpoch: 15 },
      ],
      taskDynamics: {
        stable: { forgettingRate: 0.02 },
        fragile: { forgettingRate: 0.30 }, // Heartbleed archetype
      },
      seed: 7,
      noiseAmplitude: 0,
    });
    expect(trace.epochs).toHaveLength(15);
    const stableAt14 = trace.epochs[14].accuracy.find((a) => a.taskId === "stable")!.value;
    const fragileAt14 = trace.epochs[14].accuracy.find((a) => a.taskId === "fragile")!.value;
    // After 10 idle epochs, the high-forgettingRate task has dropped much more.
    expect(fragileAt14).toBeLessThan(stableAt14);
    // Sanity: stable should still be above baseline; fragile should be near baseline.
    expect(stableAt14).toBeGreaterThan(DEFAULT_TASK_DYNAMICS.baseline + 0.4);
    expect(fragileAt14).toBeLessThan(0.3);
  });

  it("accuracy never escapes [0, 1]", () => {
    const trace = buildSyntheticTrainingTrace(
      defaultOpts({ noiseAmplitude: 0.5 }), // heavy noise to stress clamping
    );
    for (const ep of trace.epochs) {
      for (const a of ep.accuracy) {
        expect(a.value).toBeGreaterThanOrEqual(0);
        expect(a.value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("buildSyntheticTrainingTrace — determinism", () => {
  it("same seed + curriculum → bit-identical trace", () => {
    const a = buildSyntheticTrainingTrace(defaultOpts({ seed: 123 }));
    const b = buildSyntheticTrainingTrace(defaultOpts({ seed: 123 }));
    // Strip builtAt (timestamp); everything else should match exactly.
    expect(JSON.stringify({ ...a, source: { ...a.source, builtAt: "" } }))
      .toBe(JSON.stringify({ ...b, source: { ...b.source, builtAt: "" } }));
  });

  it("different seeds → different traces but identical shape", () => {
    // noiseAmplitude must be > 0 for the seed to actually affect
    // accuracy values; defaultOpts disables noise for hand-computable
    // tests, so override it here.
    const a = buildSyntheticTrainingTrace(defaultOpts({ seed: 1, noiseAmplitude: 0.02 }));
    const b = buildSyntheticTrainingTrace(defaultOpts({ seed: 2, noiseAmplitude: 0.02 }));
    expect(a.epochs).toHaveLength(b.epochs.length);
    // Accuracy values should differ (noise differs) — sample one epoch.
    expect(a.epochs[3].accuracy[0].value).not.toBe(b.epochs[3].accuracy[0].value);
  });

  it("sourceHash stable across seed when curriculum + dynamics + noise + seed match", () => {
    const a = buildSyntheticTrainingTrace(defaultOpts({ seed: 999 }));
    const b = buildSyntheticTrainingTrace(defaultOpts({ seed: 999 }));
    expect(a.source.sourceHash).toBe(b.source.sourceHash);
  });

  it("sourceHash differs when seed differs", () => {
    const a = buildSyntheticTrainingTrace(defaultOpts({ seed: 1 }));
    const b = buildSyntheticTrainingTrace(defaultOpts({ seed: 2 }));
    expect(a.source.sourceHash).not.toBe(b.source.sourceHash);
  });
});

describe("buildSyntheticTrainingTrace — validation", () => {
  it("throws on empty tasks", () => {
    expect(() =>
      buildSyntheticTrainingTrace(
        defaultOpts({ tasks: [], curriculum: [{ taskId: "x", startEpoch: 0, endEpoch: 1 }] }),
      ),
    ).toThrow(/tasks must not be empty/);
  });

  it("throws on empty curriculum", () => {
    expect(() =>
      buildSyntheticTrainingTrace(defaultOpts({ curriculum: [] })),
    ).toThrow(/curriculum must not be empty/);
  });

  it("throws when curriculum references unknown task", () => {
    expect(() =>
      buildSyntheticTrainingTrace(
        defaultOpts({
          curriculum: [{ taskId: "unknown-task", startEpoch: 0, endEpoch: 5 }],
        }),
      ),
    ).toThrow(/unknown task: unknown-task/);
  });

  it("throws on inverted curriculum window", () => {
    expect(() =>
      buildSyntheticTrainingTrace(
        defaultOpts({
          curriculum: [{ taskId: "ais_attack_ddos", startEpoch: 5, endEpoch: 3 }],
        }),
      ),
    ).toThrow(/invalid curriculum window/);
  });

  it("throws on non-integer epoch boundaries", () => {
    expect(() =>
      buildSyntheticTrainingTrace(
        defaultOpts({
          curriculum: [{ taskId: "ais_attack_ddos", startEpoch: 0, endEpoch: 5.5 }],
        }),
      ),
    ).toThrow(/integer epochs/);
  });
});

// ─── validateTrainingTrace ───────────────────────────────────────────

describe("validateTrainingTrace — accepts well-formed traces", () => {
  it("accepts a synthetic trace round-trip", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    const serialised = JSON.parse(JSON.stringify(trace));
    expect(() => validateTrainingTrace(serialised)).not.toThrow();
  });

  it("returns the refined trace shape", () => {
    const trace = buildSyntheticTrainingTrace(defaultOpts());
    const validated = validateTrainingTrace(JSON.parse(JSON.stringify(trace)));
    expect(validated.id).toBe(trace.id);
    expect(validated.epochs).toHaveLength(trace.epochs.length);
    expect(validated.source.kind).toBe("synthetic");
  });
});

describe("validateTrainingTrace — rejects malformed traces", () => {
  function baseTrace(): TrainingTrace {
    return buildSyntheticTrainingTrace(defaultOpts());
  }

  it("rejects non-object body", () => {
    expect(() => validateTrainingTrace(null)).toThrow(/body is not an object/);
    expect(() => validateTrainingTrace("string")).toThrow(/body is not an object/);
  });

  it("rejects missing top-level field", () => {
    const t = JSON.parse(JSON.stringify(baseTrace())) as Partial<TrainingTrace>;
    delete (t as Record<string, unknown>).epochs;
    expect(() => validateTrainingTrace(t)).toThrow(/missing required field "epochs"/);
  });

  it("rejects invalid source.kind", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.source.kind = "fake-kind";
    expect(() => validateTrainingTrace(t)).toThrow(/source.kind must be one of/);
  });

  it("rejects accuracy value outside [0, 1]", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.epochs[0].accuracy[0].value = 1.5;
    expect(() => validateTrainingTrace(t)).toThrow(/must be in \[0, 1\]/);
  });

  it("rejects accuracy entry referencing unknown task", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.epochs[0].accuracy[0].taskId = "unknown-task";
    expect(() => validateTrainingTrace(t)).toThrow(/references unknown task/);
  });

  it("rejects activeTaskIds referencing unknown task", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.epochs[0].activeTaskIds = ["unknown-task"];
    expect(() => validateTrainingTrace(t)).toThrow(/references unknown task/);
  });

  it("rejects epoch indices that aren't strictly increasing", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.epochs[1].index = t.epochs[0].index;
    expect(() => validateTrainingTrace(t)).toThrow(/must be strictly increasing/);
  });

  it("rejects duplicate taskId in accuracy entries", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.epochs[0].accuracy[1].taskId = t.epochs[0].accuracy[0].taskId;
    expect(() => validateTrainingTrace(t)).toThrow(/duplicate taskId/);
  });

  it("rejects duplicate task ids", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.tasks[1].id = t.tasks[0].id;
    expect(() => validateTrainingTrace(t)).toThrow(/duplicate/);
  });

  it("rejects invalid accessTier", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    t.metadata.accessTier = "fake-tier";
    expect(() => validateTrainingTrace(t)).toThrow(/accessTier must be one of/);
  });

  it("rejects trace exceeding maxTasks limit", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    expect(() =>
      validateTrainingTrace(t, { ...DEFAULT_TRACE_LIMITS, maxTasks: 1 }),
    ).toThrow(/maxTasks/);
  });

  it("rejects trace exceeding maxEpochs limit", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    expect(() =>
      validateTrainingTrace(t, { ...DEFAULT_TRACE_LIMITS, maxEpochs: 5 }),
    ).toThrow(/maxEpochs/);
  });

  it("custom limits accept synthetic traces", () => {
    const t = JSON.parse(JSON.stringify(baseTrace()));
    expect(() =>
      validateTrainingTrace(t, { maxTasks: 64, maxEpochs: 100, maxAccuracyPoints: 10_000 }),
    ).not.toThrow();
  });
});

describe("validation — error class", () => {
  it("throws TrainingTraceValidationError specifically", () => {
    try {
      validateTrainingTrace({});
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TrainingTraceValidationError);
    }
  });
});

// ─── sequentialCurriculum helper ─────────────────────────────────────

describe("sequentialCurriculum", () => {
  it("produces non-overlapping windows of fixed length", () => {
    const windows = sequentialCurriculum(["a", "b", "c"], 10);
    expect(windows).toEqual([
      { taskId: "a", startEpoch: 0, endEpoch: 10 },
      { taskId: "b", startEpoch: 10, endEpoch: 20 },
      { taskId: "c", startEpoch: 20, endEpoch: 30 },
    ]);
  });
});
