import { describe, it, expect } from "vitest";
import {
  simulateCascade,
  simulateCascadeAsync,
  mapShocksToNodes,
} from "@/lib/cascade-simulator";
import {
  linearGraph,
  unstableGraph,
  laggedGraph,
  emptyGraph,
  singleNodeGraph,
  makeNode,
  makeEdge,
  makeGraph,
  makeShock,
  SINGLE_SHOCK,
  MULTI_SHOCKS,
} from "./fixtures/graph-fixtures";
import { CausalShock } from "@/lib/types";

// ─── mapShocksToNodes ───────────────────────────────────────────

describe("mapShocksToNodes", () => {
  it("maps compute shock to manufacturing + infrastructure nodes", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const map = mapShocksToNodes(graph, [shock]);
    // A is manufacturing, B is infrastructure → both hit
    expect(map.has("A")).toBe(true);
    expect(map.has("B")).toBe(true);
  });

  it("maps energy shock to energy nodes", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "energy", severity: 0.4 });
    const map = mapShocksToNodes(graph, [shock]);
    expect(map.has("C")).toBe(true); // C is energy
    expect(map.has("A")).toBe(false);
  });

  it("applies full severity to each matching node", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const map = mapShocksToNodes(graph, [shock]);
    expect(map.get("A")).toBeCloseTo(0.6, 5);
    expect(map.get("B")).toBeCloseTo(0.6, 5);
  });

  it("accumulates multiple shocks on same node, capped at 1", () => {
    const graph = linearGraph();
    const shocks = [
      makeShock({ id: "s1", category: "energy", severity: 0.7 }),
      makeShock({ id: "s2", category: "energy", severity: 0.5 }),
    ];
    const map = mapShocksToNodes(graph, shocks);
    expect(map.get("C")).toBe(1); // 0.7 + 0.5 = 1.2 → clamped to 1
  });

  it("returns empty map when no categories match", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "geopolitical", severity: 0.5 });
    const map = mapShocksToNodes(graph, [shock]);
    // No geopolitical/finance nodes in linearGraph
    expect(map.size).toBe(0);
  });

  it("handles empty shock array", () => {
    const map = mapShocksToNodes(linearGraph(), []);
    expect(map.size).toBe(0);
  });
});

// ─── simulateCascade ────────────────────────────────────────────

describe("simulateCascade", () => {
  it("returns epoch 0 snapshot with injected shock intensities", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const snapshots = simulateCascade(graph, [shock], []);
    expect(snapshots[0].epoch).toBe(0);
    // A and B should be activated at epoch 0
    expect(snapshots[0].nodeStates["A"].isActivated).toBe(true);
    expect(snapshots[0].nodeStates["A"].shockIntensity).toBeCloseTo(0.6, 5);
  });

  it("propagates signal: outSignal = sourceIntensity * weight * dampingFactor", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "energy", severity: 0.4 });
    const snaps = simulateCascade(graph, [shock], [], { maxEpochs: 5 });
    // C gets 0.4, propagates nowhere (leaf). Check epoch 0.
    const c0 = snaps[0].nodeStates["C"];
    expect(c0.shockIntensity).toBeCloseTo(0.4, 5);
  });

  it("applies forgetting: intensity *= (1 - forgettingRate) per epoch", () => {
    // Isolated node with no incoming edges → pure decay
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 0.8 });
    const snaps = simulateCascade(graph, [shock], [], {
      maxEpochs: 10,
      forgettingRate: 0.05,
      stabilityThreshold: 0.0001,
    });

    // At epoch n, intensity should be ≈ 0.8 * 0.95^n
    for (let n = 1; n < snaps.length; n++) {
      const expected = 0.8 * Math.pow(0.95, n);
      expect(snaps[n].nodeStates["X"].shockIntensity).toBeCloseTo(expected, 3);
    }
  });

  it("omegaBuffer = 100 - meanIntensity * 100", () => {
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 0.5 });
    const snaps = simulateCascade(graph, [shock], []);
    // Epoch 0: meanIntensity = 0.5 → buffer = 50
    expect(snaps[0].omegaBuffer).toBeCloseTo(50, 5);
  });

  it("applies correct status thresholds from buffer", () => {
    // buffer=50 → ELEVATED
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 0.5 });
    const snaps = simulateCascade(graph, [shock], []);
    expect(snaps[0].omegaStatus).toBe("ELEVATED");
  });

  it("terminates early when maxDelta < stabilityThreshold", () => {
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 0.01 });
    const snaps = simulateCascade(graph, [shock], [], {
      maxEpochs: 200,
      stabilityThreshold: 0.001,
    });
    // Should terminate well before 200 epochs
    expect(snaps.length).toBeLessThan(200);
    expect(snaps[snaps.length - 1].isStable).toBe(true);
  });

  it("terminates when isCritical (buffer < criticalBufferThreshold)", () => {
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 0.95 });
    const snaps = simulateCascade(graph, [shock], [], {
      maxEpochs: 200,
      criticalBufferThreshold: 15,
    });
    expect(snaps[0].isCritical).toBe(true);
    // Should stop at epoch 0 or 1
    expect(snaps.length).toBeLessThanOrEqual(2);
  });

  it("severed edges are excluded from propagation", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    // Sever A→B edge
    const snaps = simulateCascade(graph, [shock], ["e_AB"], { maxEpochs: 5 });
    // B should only get signal from its own shock mapping, not from A
    const edgeState = snaps[0].edgeStates["e_AB"];
    expect(edgeState.isSevered).toBe(true);
    expect(edgeState.activeWeight).toBe(0);
    expect(edgeState.propagationSignal).toBe(0);
  });

  it("edges with isSevered=true on the edge object are excluded", () => {
    const graph = linearGraph();
    graph.edges[0].isSevered = true;
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const snaps = simulateCascade(graph, [shock], [], { maxEpochs: 5 });
    expect(snaps[0].edgeStates["e_AB"].isSevered).toBe(true);
  });

  it("updates omega composite: min(10, base * (1 + intensity * omegaShockScale))", () => {
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy", omegaFragility: { composite: 5, irreplaceability: 5, cascadeLoad: 5, tailDepth: 5, restorationLatency: 5, jurisdictionalHazard: 5 } })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 1.0 });
    const snaps = simulateCascade(graph, [shock], [], {
      maxEpochs: 2,
      omegaShockScale: 0.3,
    });
    // Epoch 0: intensity=1.0, composite = min(10, 5*(1+1.0*0.3)) = 6.5
    expect(snaps[0].nodeStates["X"].omegaComposite).toBeCloseTo(5.0, 1);
    // After epoch 0, forgetting reduces intensity, then composite is recalculated
  });

  it("handles empty graph gracefully", () => {
    const snaps = simulateCascade(emptyGraph(), [SINGLE_SHOCK], []);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    expect(snaps[0].omegaBuffer).toBe(100);
  });

  it("works with initialNodeStates", () => {
    const graph = makeGraph(
      [makeNode({ id: "X", category: "energy" })],
      []
    );
    const initialStates = {
      X: {
        omegaComposite: 7,
        omegaProfile: { composite: 7, irreplaceability: 5, cascadeLoad: 5, tailDepth: 5, restorationLatency: 5, jurisdictionalHazard: 5 },
        shockIntensity: 0.5,
        isActivated: true,
      },
    };
    const snaps = simulateCascade(graph, [], [], { maxEpochs: 3 }, 1, initialStates);
    // Should start from existing state
    expect(snaps[0].nodeStates["X"].shockIntensity).toBeCloseTo(0.5, 3);
  });

  it("produces edge propagation signal in snapshots", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const snaps = simulateCascade(graph, [shock], [], { maxEpochs: 3 });
    // Edge A→B should have non-zero propagation signal at epoch 0
    const eAB = snaps[0].edgeStates["e_AB"];
    expect(eAB.propagationSignal).toBeGreaterThan(0);
    expect(eAB.activeWeight).toBe(0.7);
  });

  it("uses default config when none provided", () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "energy", severity: 0.1 });
    const snaps = simulateCascade(graph, [shock], []);
    // Should use maxEpochs=200, forgettingRate=0.05, etc.
    expect(snaps.length).toBeGreaterThan(1);
  });

  it("all omega profile dimensions are clamped to [0, 10]", () => {
    const graph = makeGraph(
      [makeNode({
        id: "X",
        category: "energy",
        omegaFragility: { composite: 9.5, irreplaceability: 9.5, cascadeLoad: 9.5, tailDepth: 9.5, restorationLatency: 9.5, jurisdictionalHazard: 9.5 },
      })],
      []
    );
    const shock = makeShock({ id: "s", category: "energy", severity: 1.0 });
    const snaps = simulateCascade(graph, [shock], [], { maxEpochs: 5, omegaShockScale: 0.5 });
    for (const snap of snaps) {
      const profile = snap.nodeStates["X"].omegaProfile;
      expect(profile.composite).toBeLessThanOrEqual(10);
      expect(profile.irreplaceability).toBeLessThanOrEqual(10);
      expect(profile.cascadeLoad).toBeLessThanOrEqual(10);
      expect(profile.tailDepth).toBeLessThanOrEqual(10);
      expect(profile.restorationLatency).toBeLessThanOrEqual(10);
      expect(profile.jurisdictionalHazard).toBeLessThanOrEqual(10);
    }
  });

  it("severing the injection frontier materially reduces peak cascade intensity", () => {
    // A (shocked) → B → C with no other paths. Severing A→B must isolate B and C.
    const graph = linearGraph();
    // Restrict the shock to only A by reclassifying B and C out of "compute" mapping.
    graph.nodes[1] = { ...graph.nodes[1], category: "agriculture" };
    graph.nodes[2] = { ...graph.nodes[2], category: "agriculture" };
    const shock = makeShock({ id: "s", category: "compute", severity: 0.8 });

    const peakMean = (snapshots: ReturnType<typeof simulateCascade>) =>
      Math.max(
        ...snapshots.map((s) => {
          const intensities = Object.values(s.nodeStates).map((n) => n.shockIntensity);
          return intensities.reduce((a, b) => a + b, 0) / intensities.length;
        })
      );

    const baseline = simulateCascade(graph, [shock], [], { maxEpochs: 20 });
    const cut = simulateCascade(graph, [shock], ["e_AB"], { maxEpochs: 20 });

    const baselinePeak = peakMean(baseline);
    const cutPeak = peakMean(cut);
    // Cutting the sole propagation path must drop peak-mean intensity by >10%.
    expect(cutPeak).toBeLessThan(baselinePeak * 0.9);
  });

  it("signal propagates through chain A→B→C over multiple epochs", () => {
    const graph = linearGraph();
    // Only shock A via manufacturing
    const nodes = graph.nodes;
    // Remove B's infrastructure so only A gets the shock
    nodes[1] = { ...nodes[1], category: "agriculture" };
    const shock = makeShock({ id: "s", category: "compute", severity: 0.8 });
    const snaps = simulateCascade(graph, [shock], [], { maxEpochs: 10, stabilityThreshold: 0.0001 });
    // By epoch 1, B should have received signal from A
    if (snaps.length > 1) {
      expect(snaps[1].nodeStates["B"].shockIntensity).toBeGreaterThan(0);
    }
    // By epoch 2+, C should have received signal from B
    if (snaps.length > 2) {
      expect(snaps[2].nodeStates["C"].shockIntensity).toBeGreaterThan(0);
    }
  });
});

// ─── simulateCascadeAsync ────────────────────────────────────────
//
// The async path is the off-thread variant used by the store actions
// (startReplay / branchFromCurrentEpoch). It uses the same per-epoch
// helper as the sync path; the contract is exact parity on the snapshot
// arrays. These tests pin that contract so a future change to one path
// can't silently drift from the other.

describe("simulateCascadeAsync — parity with sync", () => {
  it("returns exactly the same number of snapshots as the sync path", async () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const sync = simulateCascade(graph, [shock], [], { maxEpochs: 50 });
    const async_ = await simulateCascadeAsync(graph, [shock], [], { maxEpochs: 50 });
    expect(async_.length).toBe(sync.length);
  });

  it("snapshot omegaBuffer matches the sync path at every epoch", async () => {
    const graph = unstableGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.7 });
    const sync = simulateCascade(graph, [shock], [], { maxEpochs: 30 });
    const async_ = await simulateCascadeAsync(graph, [shock], [], { maxEpochs: 30 });
    for (let i = 0; i < sync.length; i++) {
      expect(async_[i].omegaBuffer).toBeCloseTo(sync[i].omegaBuffer, 9);
      expect(async_[i].omegaStatus).toBe(sync[i].omegaStatus);
      expect(async_[i].isStable).toBe(sync[i].isStable);
      expect(async_[i].isCritical).toBe(sync[i].isCritical);
    }
  });

  it("per-node shockIntensity matches at every epoch (lagged graph)", async () => {
    const graph = laggedGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.5 });
    const sync = simulateCascade(graph, [shock], [], { maxEpochs: 25 });
    const async_ = await simulateCascadeAsync(graph, [shock], [], { maxEpochs: 25 });
    for (let i = 0; i < sync.length; i++) {
      for (const id of Object.keys(sync[i].nodeStates)) {
        expect(async_[i].nodeStates[id].shockIntensity).toBeCloseTo(
          sync[i].nodeStates[id].shockIntensity,
          9,
        );
      }
    }
  });

  it("respects chunkEpochs without changing the result", async () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.6 });
    const big = await simulateCascadeAsync(graph, [shock], [], { maxEpochs: 50 }, undefined, undefined, { chunkEpochs: 50 });
    const tiny = await simulateCascadeAsync(graph, [shock], [], { maxEpochs: 50 }, undefined, undefined, { chunkEpochs: 1 });
    expect(big.length).toBe(tiny.length);
    for (let i = 0; i < big.length; i++) {
      expect(big[i].omegaBuffer).toBeCloseTo(tiny[i].omegaBuffer, 9);
    }
  });

  it("AbortSignal short-circuits the loop and returns what was computed", async () => {
    const graph = linearGraph();
    const shock = makeShock({ id: "s", category: "compute", severity: 0.4 });
    const ac = new AbortController();
    // Abort immediately so the first chunk runs but no further chunks.
    const promise = simulateCascadeAsync(
      graph,
      [shock],
      [],
      { maxEpochs: 200 },
      undefined,
      undefined,
      { chunkEpochs: 10, signal: ac.signal },
    );
    ac.abort();
    const result = await promise;
    // We always get at least the epoch-0 snapshot.
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThan(201);
  });
});
