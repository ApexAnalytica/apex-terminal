// @vitest-environment node
//
// Tests for BES temporal monitoring (Phase 3 PR 2). Verifies the
// epoch-by-epoch χ★ + BES computation against hand-computable
// fixtures.
//
// Test strategy:
//   - Build a small synthetic graph by hand (so we can reason about
//     which edges should be in χ★ at each epoch)
//   - Build a TrainingTrace with a known curriculum
//   - Assert exact χ★ membership at specific epochs
//   - Verify the source-kind forwarding (synthetic in → synthetic out)
//
// Uses minimal CausalNode / CausalEdge shapes via the same makeNode /
// makeEdge fixtures the chi-star tests use, plus a tiny IDS-shaped
// graph fixture defined inline.

import { describe, it, expect } from "vitest";
import {
  computeBESTemporal,
  summariseEdge,
  rankEdgesByMaxBES,
} from "../bes-temporal";
import {
  buildSyntheticTrainingTrace,
  sequentialCurriculum,
} from "../training-trace-synthetic";
import type { CausalGraph } from "@/lib/types";
import type { TaskRef, TrainingTrace } from "../training-trace-types";
import { makeNode, makeEdge } from "../../__tests__/fixtures/graph-fixtures";

// ─── Fixture builders ─────────────────────────────────────────────────

const ATTACK_TASKS: TaskRef[] = [
  { id: "task_ddos", label: "DDoS", scope: "attack-class" },
  { id: "task_mitm", label: "MITM", scope: "attack-class" },
  { id: "task_heartbleed", label: "Heartbleed", scope: "attack-class" },
];

/**
 * Tiny IDS-shaped graph: one "GAT" substrate node + 3 attack-class
 * task nodes + one "dataset" substrate node. Edges connect each
 * attack class through the GAT to the dataset.
 *
 *           gat
 *          /   \
 *      task_ddos task_mitm task_heartbleed
 *          \   |   /
 *          dataset
 *
 * The substrate nodes (gat, dataset) are always active. The task
 * nodes come and go as the curriculum advances, so the live
 * sub-graph at each epoch differs.
 */
function buildIDSGraph(): CausalGraph {
  const nodes = [
    makeNode({ id: "gat" }),
    makeNode({ id: "dataset" }),
    makeNode({ id: "task_ddos" }),
    makeNode({ id: "task_mitm" }),
    makeNode({ id: "task_heartbleed" }),
  ];
  const edges = [
    makeEdge({ id: "e_gat_ddos", source: "gat", target: "task_ddos" }),
    makeEdge({ id: "e_gat_mitm", source: "gat", target: "task_mitm" }),
    makeEdge({ id: "e_gat_heart", source: "gat", target: "task_heartbleed" }),
    makeEdge({ id: "e_ddos_data", source: "task_ddos", target: "dataset" }),
    makeEdge({ id: "e_mitm_data", source: "task_mitm", target: "dataset" }),
    makeEdge({ id: "e_heart_data", source: "task_heartbleed", target: "dataset" }),
    makeEdge({ id: "e_gat_data", source: "gat", target: "dataset" }),
  ];
  return {
    nodes,
    edges,
    metadata: {
      density: 0,
      constraintType: "",
      verificationStatus: "UNVERIFIED",
      totalNodes: nodes.length,
      totalEdges: edges.length,
      inconsistentEdges: 0,
      restrictedNodes: 0,
    },
  };
}

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

describe("computeBESTemporal — shape contracts", () => {
  it("returns one entry per edge in the source graph", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    expect(result.edges).toHaveLength(7);
    const ids = new Set(result.edges.map((e) => e.edgeId));
    expect(ids.size).toBe(7);
  });

  it("each edge series has length matching trace.epochs", () => {
    const trace = defaultTrace();
    const result = computeBESTemporal(trace, buildIDSGraph());
    expect(result.epochIndices).toHaveLength(trace.epochs.length);
    for (const e of result.edges) {
      expect(e.bes).toHaveLength(trace.epochs.length);
      expect(e.tier).toHaveLength(trace.epochs.length);
    }
  });

  it("perEpoch arrays have matching length", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    const len = result.epochIndices.length;
    expect(result.perEpoch.chiStarSize).toHaveLength(len);
    expect(result.perEpoch.bridgeCount).toHaveLength(len);
    expect(result.perEpoch.activeNodeCount).toHaveLength(len);
    expect(result.perEpoch.activeEdgeCount).toHaveLength(len);
  });

  it("epochIndices is monotone strictly increasing", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    for (let i = 1; i < result.epochIndices.length; i++) {
      expect(result.epochIndices[i]).toBeGreaterThan(result.epochIndices[i - 1]);
    }
  });
});

// ─── Provenance forwarding ────────────────────────────────────────────

describe("computeBESTemporal — provenance", () => {
  it("forwards source.kind from the trace verbatim", () => {
    const trace = defaultTrace();
    expect(trace.source.kind).toBe("synthetic");
    const result = computeBESTemporal(trace, buildIDSGraph());
    expect(result.sourceKind).toBe("synthetic");
  });

  it("forwards the trace id", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    expect(result.traceId).toBe("test-trace");
  });
});

// ─── Per-epoch masking logic ──────────────────────────────────────────

describe("computeBESTemporal — per-epoch masking", () => {
  it("only the active task node is part of the live subgraph", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    // Epochs 0-2: only task_ddos active. Substrate (gat, dataset)
    // always active. So 3 active nodes per epoch in [0, 3).
    expect(result.perEpoch.activeNodeCount[0]).toBe(3); // gat + dataset + task_ddos
    expect(result.perEpoch.activeNodeCount[1]).toBe(3);
    expect(result.perEpoch.activeNodeCount[2]).toBe(3);
    // Epochs 3-5: task_mitm active. Still 3.
    expect(result.perEpoch.activeNodeCount[3]).toBe(3);
    // Epochs 6-8: task_heartbleed active. Still 3.
    expect(result.perEpoch.activeNodeCount[6]).toBe(3);
  });

  it("edges not touching the active task get NaN BES", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    // Epoch 0: DDoS active. Edges connecting MITM or Heartbleed should
    // have NaN BES this epoch (they're masked out).
    const mitm = result.edges.find((e) => e.edgeId === "e_gat_mitm")!;
    expect(Number.isNaN(mitm.bes[0])).toBe(true);
    expect(mitm.tier[0]).toBeNull();
    // The DDoS edges should be present and have real BES values.
    const ddos = result.edges.find((e) => e.edgeId === "e_gat_ddos")!;
    expect(Number.isNaN(ddos.bes[0])).toBe(false);
  });

  it("active edges shift as the curriculum advances", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    // Epoch 0: DDoS active → e_gat_ddos has BES; e_gat_mitm NaN
    // Epoch 4 (in MITM window): e_gat_mitm has BES; e_gat_ddos NaN
    const ddos = result.edges.find((e) => e.edgeId === "e_gat_ddos")!;
    const mitm = result.edges.find((e) => e.edgeId === "e_gat_mitm")!;
    expect(Number.isNaN(ddos.bes[0])).toBe(false);
    expect(Number.isNaN(mitm.bes[0])).toBe(true);
    expect(Number.isNaN(ddos.bes[4])).toBe(true);
    expect(Number.isNaN(mitm.bes[4])).toBe(false);
  });

  it("substrate-to-substrate edges stay active across all epochs", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    // e_gat_data connects gat ↔ dataset, both substrate nodes →
    // active every epoch.
    const gatData = result.edges.find((e) => e.edgeId === "e_gat_data")!;
    for (let i = 0; i < gatData.bes.length; i++) {
      expect(Number.isNaN(gatData.bes[i])).toBe(false);
    }
  });
});

// ─── χ★ tier evolution ────────────────────────────────────────────────

describe("computeBESTemporal — χ★ membership", () => {
  it("chi-star size > 0 when at least one task is active", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    for (let i = 0; i < result.epochIndices.length; i++) {
      expect(result.perEpoch.chiStarSize[i]).toBeGreaterThan(0);
    }
  });

  it("zero-edges epoch produces empty chi-star + NaN BES for all edges", () => {
    // Construct a curriculum where epoch 5 has no active task. The
    // sequentialCurriculum builds with no gaps; we override.
    const trace = buildSyntheticTrainingTrace({
      id: "gap-trace",
      label: "Gap",
      tasks: ATTACK_TASKS,
      curriculum: [
        { taskId: "task_ddos", startEpoch: 0, endEpoch: 3 },
        // Gap epochs 3-5 — no task active
        { taskId: "task_mitm", startEpoch: 5, endEpoch: 8 },
      ],
      noiseAmplitude: 0,
    });
    // Need to build a graph WITHOUT the gat-dataset substrate edge,
    // so when all task nodes are inactive there are zero edges in
    // the active subgraph and chi-star can't run.
    const graph = buildIDSGraph();
    graph.edges = graph.edges.filter((e) => e.id !== "e_gat_data");
    graph.metadata = { ...graph.metadata, totalEdges: graph.edges.length };

    const result = computeBESTemporal(trace, graph);
    // Epoch 3 has no active task and no substrate-to-substrate edges
    // (we just removed them) → active edges should be zero.
    expect(result.perEpoch.activeEdgeCount[3]).toBe(0);
    expect(result.perEpoch.chiStarSize[3]).toBe(0);
    for (const e of result.edges) {
      expect(Number.isNaN(e.bes[3])).toBe(true);
      expect(e.tier[3]).toBeNull();
    }
  });
});

// ─── summariseEdge / rankEdgesByMaxBES ────────────────────────────────

describe("summariseEdge", () => {
  it("max BES ignores NaN epochs", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    const ddos = result.edges.find((e) => e.edgeId === "e_gat_ddos")!;
    const stats = summariseEdge(ddos);
    expect(stats.maxBes).toBeGreaterThan(0);
    expect(stats.maxBes).toBeLessThanOrEqual(1);
    expect(Number.isNaN(stats.maxBes)).toBe(false);
  });

  it("counts chiStar and bridge epochs separately", () => {
    const result = computeBESTemporal(defaultTrace(), buildIDSGraph());
    for (const series of result.edges) {
      const stats = summariseEdge(series);
      expect(stats.chiStarEpochs).toBeGreaterThanOrEqual(stats.bridgeEpochs);
      expect(stats.chiStarEpochs).toBeLessThanOrEqual(stats.totalEpochs);
    }
  });

  it("mean BES is NaN if the edge was never active", () => {
    // Build a trace covering DDoS and MITM, then pass an explicit
    // taskNodeIds set that includes task_heartbleed — so heartbleed
    // is treated as a task node, but the curriculum never activates
    // it. Result: heartbleed-touching edges are masked every epoch
    // and their BES series is all-NaN.
    const trace = buildSyntheticTrainingTrace({
      id: "no-heart",
      label: "No Heartbleed",
      tasks: ATTACK_TASKS.filter((t) => t.id !== "task_heartbleed"),
      curriculum: sequentialCurriculum(["task_ddos", "task_mitm"], 3),
      noiseAmplitude: 0,
    });
    const result = computeBESTemporal(trace, buildIDSGraph(), {
      taskNodeIds: new Set(["task_ddos", "task_mitm", "task_heartbleed"]),
    });
    const heart = result.edges.find((e) => e.edgeId === "e_gat_heart")!;
    const stats = summariseEdge(heart);
    expect(Number.isNaN(stats.meanBes)).toBe(true);
  });
});

describe("rankEdgesByMaxBES", () => {
  it("returns edges sorted descending by maxBes", () => {
    const ranked = rankEdgesByMaxBES(
      computeBESTemporal(defaultTrace(), buildIDSGraph()),
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].maxBes).toBeLessThanOrEqual(ranked[i - 1].maxBes);
    }
  });
});

// ─── Argument validation ──────────────────────────────────────────────

describe("computeBESTemporal — argument validation", () => {
  it("rejects empty trace", () => {
    const trace = defaultTrace();
    // forge a trace with empty epochs (validator would catch this in
    // a real ingest; we test the computeBESTemporal guard directly)
    const forged = { ...trace, epochs: [] };
    expect(() => computeBESTemporal(forged, buildIDSGraph())).toThrow(/zero epochs/);
  });

  it("rejects empty graph", () => {
    const empty: CausalGraph = {
      nodes: [],
      edges: [],
      metadata: {
        density: 0,
        constraintType: "",
        verificationStatus: "UNVERIFIED",
        totalNodes: 0,
        totalEdges: 0,
        inconsistentEdges: 0,
        restrictedNodes: 0,
      },
    };
    expect(() => computeBESTemporal(defaultTrace(), empty)).toThrow(/zero nodes/);
  });

  it("throws when no task ids intersect the graph", () => {
    // Trace tasks have ids "task_ddos", "task_mitm", "task_heartbleed"
    // but the graph has nodes "x", "y" → no intersection.
    const trace = defaultTrace();
    const orphanGraph: CausalGraph = {
      nodes: [makeNode({ id: "x" }), makeNode({ id: "y" })],
      edges: [makeEdge({ id: "e_xy", source: "x", target: "y" })],
      metadata: {
        density: 0,
        constraintType: "",
        verificationStatus: "UNVERIFIED",
        totalNodes: 2,
        totalEdges: 1,
        inconsistentEdges: 0,
        restrictedNodes: 0,
      },
    };
    expect(() => computeBESTemporal(trace, orphanGraph)).toThrow(
      /no task ids from the trace appear/,
    );
  });

  it("accepts an explicit taskNodeIds override", () => {
    const trace = defaultTrace();
    const graph = buildIDSGraph();
    // Override to mark BOTH gat and task_ddos as task nodes (silly
    // example but verifies the override path). Should not throw.
    const result = computeBESTemporal(trace, graph, {
      taskNodeIds: new Set(["task_ddos", "task_mitm", "task_heartbleed", "gat"]),
    });
    expect(result.edges).toHaveLength(7);
  });
});
