// @vitest-environment node
//
// Tests for the JSON training-trace adapter (Phase 3 PR 5). Verifies:
//   - Source.kind is FORCED to "live" regardless of payload claim
//   - Adapter id / version are stamped
//   - id / label overrides are honored
//   - Validation errors surface from the underlying validator
//   - Round-trip with the synthetic generator (after stripping source)
//     produces a valid live trace

import { describe, it, expect } from "vitest";
import {
  loadTrainingTraceFromJSON,
  JSON_ADAPTER_ID,
  JSON_ADAPTER_VERSION,
} from "../training-trace-json-adapter";
import { TrainingTraceValidationError } from "../training-trace-validator";
import { buildSyntheticTrainingTrace } from "../training-trace-synthetic";
import type { TaskRef } from "../training-trace-types";

const TASKS: TaskRef[] = [
  { id: "task_a", label: "A", scope: "attack-class" },
  { id: "task_b", label: "B", scope: "attack-class" },
];

interface TestPayload {
  id?: string;
  label?: string;
  source: {
    adapter: string;
    adapterVersion: string;
    kind: string;
    builtAt: string;
    sourceHash?: string;
  };
  tasks: TaskRef[];
  epochs: unknown[];
  metadata: { description: string; accessTier: string };
}

function validPayload(): TestPayload {
  return {
    id: "live-trace-1",
    label: "Live trace 1",
    source: {
      adapter: "customer-script",
      adapterVersion: "1.2.3",
      kind: "synthetic", // ← will be IGNORED by the adapter
      builtAt: "2025-01-01T00:00:00Z",
    },
    tasks: TASKS,
    epochs: [
      {
        index: 0,
        activeTaskIds: ["task_a"],
        accuracy: [
          { taskId: "task_a", value: 0.5 },
          { taskId: "task_b", value: 0.05 },
        ],
      },
      {
        index: 1,
        activeTaskIds: ["task_a"],
        accuracy: [
          { taskId: "task_a", value: 0.7 },
          { taskId: "task_b", value: 0.04 },
        ],
      },
    ],
    metadata: { description: "test", accessTier: "internal-only" },
  };
}

// ─── Source stamping ─────────────────────────────────────────────────

describe("loadTrainingTraceFromJSON — source stamping", () => {
  it("forces source.kind to 'live' even when the payload claims 'synthetic'", () => {
    const result = loadTrainingTraceFromJSON(validPayload());
    expect(result.source.kind).toBe("live");
  });

  it("stamps the adapter id and version", () => {
    const result = loadTrainingTraceFromJSON(validPayload());
    expect(result.source.adapter).toBe(JSON_ADAPTER_ID);
    expect(result.source.adapterVersion).toBe(JSON_ADAPTER_VERSION);
  });

  it("stamps builtAt with the current time by default", () => {
    const before = new Date().toISOString();
    const result = loadTrainingTraceFromJSON(validPayload());
    const after = new Date().toISOString();
    expect(result.source.builtAt >= before).toBe(true);
    expect(result.source.builtAt <= after).toBe(true);
  });

  it("honors ingestedAt override", () => {
    const result = loadTrainingTraceFromJSON(validPayload(), {
      ingestedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.source.builtAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("forwards sourceHash override", () => {
    const result = loadTrainingTraceFromJSON(validPayload(), {
      sourceHash: "abc123",
    });
    expect(result.source.sourceHash).toBe("abc123");
  });

  it("forwards sourceHash from payload when option not provided", () => {
    const payload = validPayload();
    payload.source.sourceHash = "from-payload";
    const result = loadTrainingTraceFromJSON(payload);
    expect(result.source.sourceHash).toBe("from-payload");
  });

  it("option sourceHash overrides payload sourceHash", () => {
    const payload = validPayload();
    payload.source.sourceHash = "from-payload";
    const result = loadTrainingTraceFromJSON(payload, {
      sourceHash: "from-option",
    });
    expect(result.source.sourceHash).toBe("from-option");
  });
});

// ─── Overrides ───────────────────────────────────────────────────────

describe("loadTrainingTraceFromJSON — overrides", () => {
  it("honors idOverride", () => {
    const result = loadTrainingTraceFromJSON(validPayload(), {
      idOverride: "new-id",
    });
    expect(result.id).toBe("new-id");
  });

  it("honors labelOverride", () => {
    const result = loadTrainingTraceFromJSON(validPayload(), {
      labelOverride: "New Label",
    });
    expect(result.label).toBe("New Label");
  });
});

// ─── Input forms ─────────────────────────────────────────────────────

describe("loadTrainingTraceFromJSON — input forms", () => {
  it("accepts a JSON string", () => {
    const result = loadTrainingTraceFromJSON(JSON.stringify(validPayload()));
    expect(result.id).toBe("live-trace-1");
  });

  it("accepts a pre-parsed object", () => {
    const result = loadTrainingTraceFromJSON(validPayload());
    expect(result.id).toBe("live-trace-1");
  });

  it("throws SyntaxError on malformed JSON string", () => {
    expect(() => loadTrainingTraceFromJSON("{not valid")).toThrow(SyntaxError);
  });

  it("throws on null / primitive inputs", () => {
    expect(() => loadTrainingTraceFromJSON("null")).toThrow(
      TrainingTraceValidationError,
    );
    expect(() => loadTrainingTraceFromJSON(42 as unknown as object)).toThrow(
      TrainingTraceValidationError,
    );
  });
});

// ─── Validation propagation ──────────────────────────────────────────

describe("loadTrainingTraceFromJSON — validation", () => {
  it("propagates TrainingTraceValidationError from underlying validator", () => {
    const bad = validPayload();
    // @ts-expect-error — intentional schema break
    delete bad.tasks;
    expect(() => loadTrainingTraceFromJSON(bad)).toThrow(
      TrainingTraceValidationError,
    );
  });

  it("rejects payloads missing id / label entirely", () => {
    const payload = validPayload();
    delete payload.id;
    expect(() => loadTrainingTraceFromJSON(payload)).toThrow(
      TrainingTraceValidationError,
    );
  });

  it("idOverride lets a payload without an id pass validation", () => {
    const payload = validPayload() as Partial<ReturnType<typeof validPayload>>;
    delete payload.id;
    const result = loadTrainingTraceFromJSON(payload, {
      idOverride: "filled-in-id",
    });
    expect(result.id).toBe("filled-in-id");
  });
});

// ─── Roundtrip with synthetic generator ──────────────────────────────

describe("loadTrainingTraceFromJSON — synthetic roundtrip", () => {
  it("can re-ingest a serialised synthetic trace as a live trace", () => {
    // Customer scenario: a team built a small simulator that emits the
    // canonical TrainingTrace shape. They post it to our endpoint. The
    // JSON adapter doesn't trust the source.kind on the wire — it
    // stamps "live" because the platform's only path to "synthetic"
    // is via the in-process builder.
    const synthetic = buildSyntheticTrainingTrace({
      id: "synth-source",
      label: "Synth source",
      tasks: TASKS,
      curriculum: [
        { taskId: "task_a", startEpoch: 0, endEpoch: 2 },
        { taskId: "task_b", startEpoch: 2, endEpoch: 4 },
      ],
      noiseAmplitude: 0,
    });
    expect(synthetic.source.kind).toBe("synthetic");
    const wire = JSON.stringify(synthetic);
    const reingested = loadTrainingTraceFromJSON(wire);
    expect(reingested.source.kind).toBe("live");
    expect(reingested.source.adapter).toBe(JSON_ADAPTER_ID);
    expect(reingested.epochs).toHaveLength(synthetic.epochs.length);
    expect(reingested.tasks).toEqual(synthetic.tasks);
  });
});
