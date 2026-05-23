// @vitest-environment node
//
// Tests for the CSV training-trace adapter (Phase 3 PR 5). Verifies:
//   - Standard pytorch-lightning / keras CSVLogger shapes parse cleanly
//   - Source.kind is FORCED to "live"
//   - Missing columns / out-of-range values / non-monotone epochs fail
//     with precise error pointers
//   - Optional active_tasks column round-trips correctly
//   - End-to-end FR / Ω-FP computation works on a CSV-loaded trace

import { describe, it, expect } from "vitest";
import {
  loadTrainingTraceFromCSV,
  CSV_ADAPTER_ID,
} from "../training-trace-csv-adapter";
import { TrainingTraceValidationError } from "../training-trace-validator";
import { computeFR } from "../fr-estimator";
import { computeOmegaForgettingPressure } from "../omega-forgetting-pressure";
import type { TaskRef } from "../training-trace-types";

const TASKS: TaskRef[] = [
  { id: "task_ddos", label: "DDoS", scope: "attack-class" },
  { id: "task_mitm", label: "MITM", scope: "attack-class" },
];

function basicCSV() {
  return [
    "epoch,acc_task_ddos,acc_task_mitm,active_tasks",
    "0,0.40,0.05,task_ddos",
    "1,0.70,0.05,task_ddos",
    "2,0.85,0.05,task_ddos",
    "3,0.78,0.30,task_mitm",
    "4,0.71,0.55,task_mitm",
  ].join("\n");
}

// ─── Happy path ──────────────────────────────────────────────────────

describe("loadTrainingTraceFromCSV — happy path", () => {
  it("parses a standard CSVLogger-shaped log", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "csv-trace-1",
      label: "CSV trace 1",
      tasks: TASKS,
    });
    expect(trace.id).toBe("csv-trace-1");
    expect(trace.label).toBe("CSV trace 1");
    expect(trace.epochs).toHaveLength(5);
    expect(trace.tasks).toEqual(TASKS);
  });

  it("stamps source.kind = 'live' and the adapter id", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.source.kind).toBe("live");
    expect(trace.source.adapter).toBe(CSV_ADAPTER_ID);
  });

  it("rounds per-epoch accuracy to the expected values", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.epochs[0].accuracy).toEqual([
      { taskId: "task_ddos", value: 0.4 },
      { taskId: "task_mitm", value: 0.05 },
    ]);
    expect(trace.epochs[2].accuracy[0].value).toBe(0.85);
  });

  it("parses pipe-delimited active_tasks", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm,active_tasks",
      "0,0.4,0.1,task_ddos|task_mitm",
      "1,0.7,0.3,task_ddos",
    ].join("\n");
    const trace = loadTrainingTraceFromCSV(csv, {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.epochs[0].activeTaskIds).toEqual(["task_ddos", "task_mitm"]);
    expect(trace.epochs[1].activeTaskIds).toEqual(["task_ddos"]);
  });

  it("treats missing active_tasks column as empty activeTaskIds", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm",
      "0,0.4,0.05",
      "1,0.7,0.05",
    ].join("\n");
    const trace = loadTrainingTraceFromCSV(csv, {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.epochs[0].activeTaskIds).toEqual([]);
    expect(trace.epochs[1].activeTaskIds).toEqual([]);
  });

  it("supports the 'step' fallback when epoch column is missing", () => {
    const csv = [
      "step,acc_task_ddos,acc_task_mitm",
      "0,0.4,0.05",
      "1,0.7,0.05",
    ].join("\n");
    const trace = loadTrainingTraceFromCSV(csv, {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.epochs[0].index).toBe(0);
    expect(trace.epochs[1].index).toBe(1);
  });

  it("honors accuracyColumnFor override for non-standard column naming", () => {
    const csv = [
      "epoch,task_ddos_val_acc,task_mitm_val_acc",
      "0,0.4,0.05",
      "1,0.7,0.05",
    ].join("\n");
    const trace = loadTrainingTraceFromCSV(csv, {
      id: "x",
      label: "x",
      tasks: TASKS,
      accuracyColumnFor: (id) => `${id}_val_acc`,
    });
    expect(trace.epochs[0].accuracy[0].value).toBe(0.4);
  });

  it("skips '#'-prefixed comment lines", () => {
    const csv = [
      "# This is a customer-side comment",
      "epoch,acc_task_ddos,acc_task_mitm",
      "# another comment",
      "0,0.4,0.05",
      "1,0.7,0.05",
    ].join("\n");
    const trace = loadTrainingTraceFromCSV(csv, {
      id: "x",
      label: "x",
      tasks: TASKS,
    });
    expect(trace.epochs).toHaveLength(2);
  });

  it("honors sourceHash and ingestedAt overrides", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "x",
      label: "x",
      tasks: TASKS,
      sourceHash: "abc",
      ingestedAt: "2026-05-22T12:00:00.000Z",
    });
    expect(trace.source.sourceHash).toBe("abc");
    expect(trace.source.builtAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("forwards description and accessTier", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "x",
      label: "x",
      tasks: TASKS,
      description: "Customer log v2",
      accessTier: "dua-restricted",
    });
    expect(trace.metadata.description).toBe("Customer log v2");
    expect(trace.metadata.accessTier).toBe("dua-restricted");
  });
});

// ─── Error paths ─────────────────────────────────────────────────────

describe("loadTrainingTraceFromCSV — error paths", () => {
  it("rejects empty CSV", () => {
    expect(() =>
      loadTrainingTraceFromCSV("", {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/at least a header row/);
  });

  it("rejects when accuracy column missing", () => {
    const csv = [
      "epoch,acc_task_ddos", // no task_mitm column
      "0,0.4",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/missing accuracy column "acc_task_mitm"/);
  });

  it("rejects when epoch column missing entirely", () => {
    const csv = [
      "acc_task_ddos,acc_task_mitm",
      "0.4,0.05",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/missing epoch column/);
  });

  it("rejects non-integer epoch", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm",
      "0.5,0.4,0.05",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/epoch column must be an integer/);
  });

  it("rejects non-monotone epochs", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm",
      "0,0.4,0.05",
      "0,0.5,0.05", // duplicate
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/not strictly greater than previous epoch/);
  });

  it("rejects accuracy outside [0, 1]", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm",
      "0,1.5,0.05",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/outside \[0, 1\]/);
  });

  it("rejects active_tasks referencing an unknown task", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm,active_tasks",
      "0,0.4,0.05,task_phantom",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/unknown task "task_phantom"/);
  });

  it("rejects empty tasks option", () => {
    expect(() =>
      loadTrainingTraceFromCSV(basicCSV(), {
        id: "x",
        label: "x",
        tasks: [],
      }),
    ).toThrow(TrainingTraceValidationError);
  });

  it("rejects non-finite accuracy cell", () => {
    const csv = [
      "epoch,acc_task_ddos,acc_task_mitm",
      "0,NaN,0.05",
    ].join("\n");
    expect(() =>
      loadTrainingTraceFromCSV(csv, {
        id: "x",
        label: "x",
        tasks: TASKS,
      }),
    ).toThrow(/not a finite number/);
  });
});

// ─── End-to-end with downstream estimators ──────────────────────────

describe("loadTrainingTraceFromCSV — downstream wiring", () => {
  it("CSV-loaded trace flows through computeFR and Ω-FP", () => {
    const trace = loadTrainingTraceFromCSV(basicCSV(), {
      id: "e2e",
      label: "E2E",
      tasks: TASKS,
    });
    const fr = computeFR(trace);
    expect(fr.sourceKind).toBe("live");
    expect(fr.tasks).toHaveLength(2);

    const ofp = computeOmegaForgettingPressure(fr);
    expect(ofp.sourceKind).toBe("live");
    expect(Number.isFinite(ofp.pressure)).toBe(true);
    // task_ddos peaked at 0.85 (epoch 2) then dropped to 0.71 (epoch 4)
    // — the normalizedFR should be positive.
    const ddos = fr.tasks.find((t) => t.taskId === "task_ddos")!;
    expect(ddos.peakAccuracy).toBe(0.85);
    expect(ddos.finalAccuracy).toBe(0.71);
    expect(ddos.normalizedFR).toBeGreaterThan(0);
  });
});
