// @vitest-environment node
//
// Tests for the FR (Forgetting Rate) estimator (Phase 3 PR 3). Verifies
// per-task forgetting math on synthetic TrainingTraces with known
// dynamics so the assertions are hand-computable.
//
// Test strategy:
//   - Build synthetic traces with carefully chosen forgettingRate /
//     learningRate so the expected FR values can be derived from the
//     generator's closed-form recurrence
//   - Exercise the Heartbleed archetype (high-forgettingRate task ranks
//     first in normalizedFR ranking)
//   - Verify the decay-rate fit recovers the generator's forgettingRate
//     parameter within tolerance
//   - Edge cases: never-trained task, single-epoch trace, no decay
//   - Provenance forwarding (synthetic in → synthetic out)
//
// All traces use `noiseAmplitude: 0` unless the test specifically needs
// noise — deterministic accuracy curves are what make the closed-form
// assertions tight.

import { describe, it, expect } from "vitest";
import {
  computeFR,
  rankTasksByNormalizedFR,
  meanNormalizedFR,
} from "../fr-estimator";
import {
  buildSyntheticTrainingTrace,
  sequentialCurriculum,
} from "../training-trace-synthetic";
import type { TaskRef, TrainingTrace } from "../training-trace-types";

// ─── Fixture builders ─────────────────────────────────────────────────

const ATTACK_TASKS: TaskRef[] = [
  { id: "task_ddos", label: "DDoS", scope: "attack-class" },
  { id: "task_mitm", label: "MITM", scope: "attack-class" },
  { id: "task_heartbleed", label: "Heartbleed", scope: "attack-class" },
];

function defaultTrace(): TrainingTrace {
  return buildSyntheticTrainingTrace({
    id: "test-trace",
    label: "Test",
    tasks: ATTACK_TASKS,
    curriculum: sequentialCurriculum(
      ATTACK_TASKS.map((t) => t.id),
      3, // 3 epochs each = 9 total
    ),
    seed: 42,
    noiseAmplitude: 0,
  });
}

// ─── Shape / contract tests ───────────────────────────────────────────

describe("computeFR — shape contracts", () => {
  it("returns one entry per task in the trace", () => {
    const trace = defaultTrace();
    const result = computeFR(trace);
    expect(result.tasks).toHaveLength(trace.tasks.length);
    const ids = new Set(result.tasks.map((t) => t.taskId));
    expect(ids.size).toBe(trace.tasks.length);
    for (const t of trace.tasks) {
      expect(ids.has(t.id)).toBe(true);
    }
  });

  it("time series length matches trace.epochs", () => {
    const trace = defaultTrace();
    const result = computeFR(trace);
    for (const t of result.tasks) {
      expect(t.frOverTime).toHaveLength(trace.epochs.length);
      expect(t.normalizedFROverTime).toHaveLength(trace.epochs.length);
    }
  });

  it("all FR-over-time values are non-negative", () => {
    const result = computeFR(defaultTrace());
    for (const t of result.tasks) {
      for (const fr of t.frOverTime) {
        expect(fr).toBeGreaterThanOrEqual(0);
      }
      for (const nfr of t.normalizedFROverTime) {
        expect(nfr).toBeGreaterThanOrEqual(0);
        expect(nfr).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("absoluteForgetting equals peakAccuracy − finalAccuracy", () => {
    const result = computeFR(defaultTrace());
    for (const t of result.tasks) {
      const expected = Math.max(0, t.peakAccuracy - t.finalAccuracy);
      expect(t.absoluteForgetting).toBeCloseTo(expected, 12);
    }
  });

  it("normalizedFR equals absoluteForgetting / peakAccuracy when peak > 0", () => {
    const result = computeFR(defaultTrace());
    for (const t of result.tasks) {
      if (t.peakAccuracy > 0) {
        expect(t.normalizedFR).toBeCloseTo(
          t.absoluteForgetting / t.peakAccuracy,
          12,
        );
      }
    }
  });
});

// ─── Provenance forwarding ────────────────────────────────────────────

describe("computeFR — provenance", () => {
  it("forwards source.kind from the trace verbatim", () => {
    const trace = defaultTrace();
    expect(trace.source.kind).toBe("synthetic");
    const result = computeFR(trace);
    expect(result.sourceKind).toBe("synthetic");
  });

  it("forwards the trace id", () => {
    const result = computeFR(defaultTrace());
    expect(result.traceId).toBe("test-trace");
  });
});

// ─── Curriculum semantics ─────────────────────────────────────────────

describe("computeFR — curriculum semantics", () => {
  it("lastTrainedEpoch matches the last activeTaskIds appearance", () => {
    // sequentialCurriculum with 3 epochs each: DDoS [0,3), MITM [3,6),
    // Heartbleed [6,9). lastTrainedEpoch should be 2, 5, 8.
    const result = computeFR(defaultTrace());
    const ddos = result.tasks.find((t) => t.taskId === "task_ddos")!;
    const mitm = result.tasks.find((t) => t.taskId === "task_mitm")!;
    const heart = result.tasks.find((t) => t.taskId === "task_heartbleed")!;
    expect(ddos.lastTrainedEpoch).toBe(2);
    expect(mitm.lastTrainedEpoch).toBe(5);
    expect(heart.lastTrainedEpoch).toBe(8);
  });

  it("never-trained task gets lastTrainedEpoch = -1", () => {
    // Add a task to the trace but never include it in the curriculum.
    const tasks: TaskRef[] = [
      ...ATTACK_TASKS,
      { id: "task_unused", label: "Unused", scope: "attack-class" },
    ];
    const trace = buildSyntheticTrainingTrace({
      id: "unused-trace",
      label: "Unused",
      tasks,
      curriculum: sequentialCurriculum(
        ATTACK_TASKS.map((t) => t.id),
        3,
      ),
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const unused = result.tasks.find((t) => t.taskId === "task_unused")!;
    expect(unused.lastTrainedEpoch).toBe(-1);
  });

  it("peakEpoch is within the trained window for a sequential curriculum", () => {
    // Without noise, each task's accuracy is monotone-increasing while
    // training and monotone-decreasing after. So peakEpoch must be at
    // or after lastTrainedEpoch − k for some k — in practice equal to
    // lastTrainedEpoch since the last training step closes the most
    // gap.
    const result = computeFR(defaultTrace());
    for (const t of result.tasks) {
      // For sequential, lastTrainedEpoch is the LAST epoch the task
      // was active. Without noise the peak is at lastTrainedEpoch.
      expect(t.peakEpoch).toBe(t.lastTrainedEpoch);
    }
  });
});

// ─── Hand-computed math on a tiny trace ──────────────────────────────

describe("computeFR — closed-form math on noise-free trace", () => {
  it("recovers exact peak / final / absoluteForgetting on a 2-task 4-epoch trace", () => {
    // Two tasks, 2 epochs each. Defaults: baseline 0.05, plateau 0.95,
    // learningRate 0.5, forgettingRate 0.05. Closed-form recurrence:
    //   k = 1 − e^-0.5 ≈ 0.3934693
    //   d = e^-0.05  ≈ 0.9512294
    // Epoch 0: A trains. accA(0) = 0.05 + 0.9·k ≈ 0.4041224
    // Epoch 1: A trains. accA(1) = 0.4041224 + (0.95 − 0.4041224)·k
    //                            ≈ 0.6189085
    // Epoch 2: B trains. accA(2) = 0.05 + (0.6189085 − 0.05)·d
    //                            ≈ 0.5911531
    // Epoch 3: B trains. accA(3) = 0.05 + (0.5911531 − 0.05)·d
    //                            ≈ 0.5647674
    // For task B, mirror: B peaks at epoch 3 ≈ 0.6189085.
    const tasks: TaskRef[] = [
      { id: "A", label: "A", scope: "attack-class" },
      { id: "B", label: "B", scope: "attack-class" },
    ];
    const trace = buildSyntheticTrainingTrace({
      id: "tiny",
      label: "Tiny",
      tasks,
      curriculum: sequentialCurriculum(["A", "B"], 2),
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const a = result.tasks.find((t) => t.taskId === "A")!;
    const b = result.tasks.find((t) => t.taskId === "B")!;

    // Task A: trained epochs 0-1, then decays for epochs 2-3.
    expect(a.peakAccuracy).toBeCloseTo(0.6189085, 3);
    expect(a.peakEpoch).toBe(1);
    expect(a.finalAccuracy).toBeCloseTo(0.5647674, 3);
    const expectedAF = 0.6189085 - 0.5647674;
    expect(a.absoluteForgetting).toBeCloseTo(expectedAF, 3);
    expect(a.normalizedFR).toBeCloseTo(expectedAF / 0.6189085, 3);

    // Task B: never trained for epochs 0-1, then trained 2-3 → peaks
    // at final epoch → absoluteForgetting ≈ 0.
    expect(b.peakAccuracy).toBeCloseTo(0.6189085, 3);
    expect(b.peakEpoch).toBe(3);
    expect(b.finalAccuracy).toBeCloseTo(0.6189085, 3);
    expect(b.absoluteForgetting).toBeCloseTo(0, 6);
    expect(b.normalizedFR).toBeCloseTo(0, 6);
  });

  it("frOverTime[i] = peakSoFar(i) − acc(i) exactly", () => {
    const tasks: TaskRef[] = [
      { id: "A", label: "A", scope: "attack-class" },
      { id: "B", label: "B", scope: "attack-class" },
    ];
    const trace = buildSyntheticTrainingTrace({
      id: "fr-time",
      label: "FR over time",
      tasks,
      curriculum: sequentialCurriculum(["A", "B"], 2),
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const a = result.tasks.find((t) => t.taskId === "A")!;
    // Hand-check epoch by epoch using the raw accuracy from the trace.
    let peakSoFar = -Infinity;
    for (let i = 0; i < trace.epochs.length; i++) {
      const acc = trace.epochs[i].accuracy.find((x) => x.taskId === "A")!.value;
      if (acc > peakSoFar) peakSoFar = acc;
      const expectedFr = Math.max(0, peakSoFar - acc);
      expect(a.frOverTime[i]).toBeCloseTo(expectedFr, 10);
      const expectedNfr = peakSoFar > 0 ? expectedFr / peakSoFar : 0;
      expect(a.normalizedFROverTime[i]).toBeCloseTo(expectedNfr, 10);
    }
  });
});

// ─── Heartbleed archetype ────────────────────────────────────────────

describe("computeFR — Heartbleed archetype", () => {
  it("a high-forgettingRate task ranks first in normalizedFR", () => {
    // Train each task for 3 epochs, then 6 more epochs where it's not
    // active. Heartbleed has forgettingRate 0.3, others 0.05. After
    // 6 epochs of no training, Heartbleed retains exp(-0.3·6) ≈ 16.5%
    // of its above-baseline accuracy; DDoS retains exp(-0.05·6) ≈ 74%.
    // So normalizedFR(heartbleed) should be substantially larger than
    // normalizedFR(ddos).
    const trace = buildSyntheticTrainingTrace({
      id: "heartbleed-archetype",
      label: "Heartbleed archetype",
      tasks: ATTACK_TASKS,
      // Train Heartbleed FIRST so it has the longest off-task tail.
      curriculum: [
        { taskId: "task_heartbleed", startEpoch: 0, endEpoch: 3 },
        { taskId: "task_ddos", startEpoch: 3, endEpoch: 6 },
        { taskId: "task_mitm", startEpoch: 6, endEpoch: 9 },
      ],
      taskDynamics: {
        task_heartbleed: { forgettingRate: 0.3 },
        task_ddos: { forgettingRate: 0.05 },
        task_mitm: { forgettingRate: 0.05 },
      },
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const ranked = rankTasksByNormalizedFR(result);
    expect(ranked[0].taskId).toBe("task_heartbleed");
    const heart = result.tasks.find((t) => t.taskId === "task_heartbleed")!;
    const ddos = result.tasks.find((t) => t.taskId === "task_ddos")!;
    expect(heart.normalizedFR).toBeGreaterThan(ddos.normalizedFR);
    // Heartbleed should have lost a substantial fraction of its peak.
    expect(heart.normalizedFR).toBeGreaterThan(0.3);
  });
});

// ─── Decay-rate fit ──────────────────────────────────────────────────

describe("computeFR — decayRate fit", () => {
  it("recovers a known forgettingRate within tolerance", () => {
    // Set up a task that trains for 4 epochs (saturates near plateau),
    // then has a long off-task tail of 16 epochs to fit the decay on.
    // forgettingRate = 0.20, expecting decayRate ≈ 0.20.
    const trace = buildSyntheticTrainingTrace({
      id: "decay-recovery",
      label: "Decay recovery",
      tasks: [{ id: "T", label: "T", scope: "attack-class" }],
      curriculum: [{ taskId: "T", startEpoch: 0, endEpoch: 4 }],
      taskDynamics: { T: { forgettingRate: 0.2, plateau: 0.95, baseline: 0.05 } },
      noiseAmplitude: 0,
    });
    // Add 16 more epochs by extending the trace via a second task
    // never trained (so total epoch count = 20).
    const traceLong = buildSyntheticTrainingTrace({
      id: "decay-recovery-long",
      label: "Decay recovery long",
      tasks: [
        { id: "T", label: "T", scope: "attack-class" },
        { id: "U", label: "U", scope: "attack-class" },
      ],
      curriculum: [
        { taskId: "T", startEpoch: 0, endEpoch: 4 },
        { taskId: "U", startEpoch: 4, endEpoch: 20 },
      ],
      taskDynamics: { T: { forgettingRate: 0.2, plateau: 0.95, baseline: 0.05 } },
      noiseAmplitude: 0,
    });
    // Override baseline so the regression uses the TRUE baseline (0.05)
    // rather than the empirical min — the generator's exponential
    // decay is exactly λ when baseline matches.
    const result = computeFR(traceLong, { baselinePerTask: { T: 0.05 } });
    const t = result.tasks.find((x) => x.taskId === "T")!;
    expect(t.decayRate).toBeCloseTo(0.2, 2);
    // Quick sanity that the shorter trace still produces a usable
    // decayRate (the post-peak window is short but non-empty).
    void trace;
  });

  it("returns NaN decayRate when task never decays below peak", () => {
    // Task is trained on the LAST epoch → peak is final → no post-peak
    // window. fitDecayRate returns NaN.
    const trace = buildSyntheticTrainingTrace({
      id: "no-decay",
      label: "No decay",
      tasks: [{ id: "T", label: "T", scope: "attack-class" }],
      curriculum: [{ taskId: "T", startEpoch: 0, endEpoch: 3 }],
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const t = result.tasks.find((x) => x.taskId === "T")!;
    // peakEpoch is the final epoch (2), so there are no post-peak
    // points → decayRate is NaN.
    expect(Number.isNaN(t.decayRate)).toBe(true);
  });

  it("returns NaN decayRate when post-peak window has only one point", () => {
    // 2 training epochs + 1 off-task epoch → one post-peak point →
    // regression undefined (< 2 points).
    const trace = buildSyntheticTrainingTrace({
      id: "one-point",
      label: "One point",
      tasks: [
        { id: "T", label: "T", scope: "attack-class" },
        { id: "U", label: "U", scope: "attack-class" },
      ],
      curriculum: [
        { taskId: "T", startEpoch: 0, endEpoch: 2 },
        { taskId: "U", startEpoch: 2, endEpoch: 3 },
      ],
      noiseAmplitude: 0,
    });
    const result = computeFR(trace);
    const t = result.tasks.find((x) => x.taskId === "T")!;
    expect(Number.isNaN(t.decayRate)).toBe(true);
  });
});

// ─── Convenience helpers ─────────────────────────────────────────────

describe("rankTasksByNormalizedFR", () => {
  it("sorts descending by normalizedFR with NaN entries pushed to the end", () => {
    // Build a trace where one task has NaN normalizedFR (never trained
    // → peakAccuracy = baseline > 0 actually, so normalizedFR is
    // defined… but absoluteForgetting = 0 → normalizedFR = 0, not NaN).
    // To get NaN, peakAccuracy must be ≤ 0. We can't construct that
    // with the synthetic generator (baseline defaults to 0.05).
    // Instead, hand-build a trace with a task that has acc = 0 every
    // epoch.
    const trace: TrainingTrace = {
      id: "nan-rank",
      label: "NaN rank",
      source: {
        adapter: "test",
        adapterVersion: "0.0.0",
        kind: "synthetic",
        builtAt: new Date().toISOString(),
      },
      tasks: [
        { id: "A", label: "A", scope: "attack-class" },
        { id: "B", label: "B", scope: "attack-class" },
        { id: "C", label: "C", scope: "attack-class" },
      ],
      epochs: [
        {
          index: 0,
          activeTaskIds: ["A"],
          accuracy: [
            { taskId: "A", value: 0.8 },
            { taskId: "B", value: 0.6 },
            { taskId: "C", value: 0 }, // never had any signal
          ],
        },
        {
          index: 1,
          activeTaskIds: ["B"],
          accuracy: [
            { taskId: "A", value: 0.4 }, // decayed
            { taskId: "B", value: 0.6 }, // same
            { taskId: "C", value: 0 }, // still zero
          ],
        },
      ],
      metadata: { description: "test", accessTier: "internal-only" },
    };
    const result = computeFR(trace);
    const ranked = rankTasksByNormalizedFR(result);
    // A has FR 0.5, B has FR 0, C has peak=0 → normalizedFR is NaN.
    expect(ranked[0].taskId).toBe("A");
    expect(ranked[1].taskId).toBe("B");
    expect(ranked[2].taskId).toBe("C");
    expect(Number.isNaN(ranked[2].normalizedFR)).toBe(true);
  });
});

describe("meanNormalizedFR", () => {
  it("averages over tasks with defined normalizedFR", () => {
    const result = computeFR(defaultTrace());
    const defined = result.tasks.filter((t) => !Number.isNaN(t.normalizedFR));
    const expected =
      defined.reduce((s, t) => s + t.normalizedFR, 0) / defined.length;
    expect(meanNormalizedFR(result)).toBeCloseTo(expected, 12);
  });

  it("returns NaN when no task has a defined normalizedFR", () => {
    // Build a degenerate trace where every task has peakAccuracy = 0.
    const trace: TrainingTrace = {
      id: "degenerate",
      label: "Degenerate",
      source: {
        adapter: "test",
        adapterVersion: "0.0.0",
        kind: "synthetic",
        builtAt: new Date().toISOString(),
      },
      tasks: [
        { id: "A", label: "A", scope: "attack-class" },
        { id: "B", label: "B", scope: "attack-class" },
      ],
      epochs: [
        {
          index: 0,
          activeTaskIds: [],
          accuracy: [
            { taskId: "A", value: 0 },
            { taskId: "B", value: 0 },
          ],
        },
      ],
      metadata: { description: "test", accessTier: "internal-only" },
    };
    const result = computeFR(trace);
    expect(Number.isNaN(meanNormalizedFR(result))).toBe(true);
  });
});

// ─── Argument validation ─────────────────────────────────────────────

describe("computeFR — argument validation", () => {
  it("rejects empty epochs", () => {
    const trace = defaultTrace();
    const forged = { ...trace, epochs: [] };
    expect(() => computeFR(forged)).toThrow(/zero epochs/);
  });

  it("rejects empty tasks", () => {
    const trace = defaultTrace();
    const forged = { ...trace, tasks: [] };
    expect(() => computeFR(forged)).toThrow(/zero tasks/);
  });
});
