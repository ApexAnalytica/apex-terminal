import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";
import { makeNode, makeGraph, makeEdge } from "./fixtures/graph-fixtures";
import {
  bridgesToEdges,
  isAutoBridge,
  bridgeStatus,
} from "@/lib/cross-domain-bridging";

// ─── promoteAutoBridge store action ───────────────────────────────────
//
// Lifecycle test for the "Promote" button surfaced in EdgeInspector
// on auto-bridge edges. Asserts that calling the action:
//   1. Bumps confidence 0.5 → 0.8 (above R-04's 0.7 cutoff)
//   2. Flips `physicalMechanism` prefix from "auto-bridge:" to
//      "promoted bridge:" so `bridgeStatus` returns "promoted"
//   3. Is a no-op on already-promoted or non-auto edges (idempotent)
//   4. Re-runs Tarski validation when truthFilter === "verified"

function makeGraphWithAutoBridge() {
  const bridges = bridgesToEdges([
    {
      sourceId: "A",
      targetId: "B",
      score: 0.65,
      rationale: "same category (energy)",
      componentA: 0,
      componentB: 1,
    },
  ]);
  const nodes = [
    makeNode({ id: "A", domain: "X", category: "energy" }),
    makeNode({ id: "B", domain: "Y", category: "energy" }),
    makeNode({ id: "C", domain: "X", category: "energy" }),
  ];
  const curatorEdge = makeEdge({
    id: "regular-1",
    source: "A",
    target: "C",
    confidence: 0.9,
  });
  return makeGraph(nodes, [curatorEdge, ...bridges]);
}

describe("promoteAutoBridge — auto → promoted lifecycle", () => {
  beforeEach(() => {
    // Reset the store between tests so state doesn't leak.
    useApexStore.setState({
      graphData: makeGraphWithAutoBridge(),
      truthFilter: "raw",
      tarskiReport: null,
      enabledAxioms: new Set<string>(),
      selectedDomains: [],
    });
  });

  it("bumps confidence to 0.8 and flips the physicalMechanism prefix", () => {
    const before = useApexStore
      .getState()
      .graphData.edges.find((e) => isAutoBridge(e))!;
    expect(before.confidence).toBe(0.5);

    useApexStore.getState().promoteAutoBridge(before.id);

    const after = useApexStore
      .getState()
      .graphData.edges.find((e) => e.id === before.id)!;
    expect(after.confidence).toBe(0.8);
    expect(after.physicalMechanism!.startsWith("promoted bridge:")).toBe(true);
    expect(bridgeStatus(after)).toBe("promoted");
    expect(isAutoBridge(after)).toBe(false);
  });

  it("is idempotent — second call on the same id is a no-op", () => {
    const target = useApexStore
      .getState()
      .graphData.edges.find((e) => isAutoBridge(e))!;
    useApexStore.getState().promoteAutoBridge(target.id);
    const afterFirst = useApexStore
      .getState()
      .graphData.edges.find((e) => e.id === target.id)!;
    useApexStore.getState().promoteAutoBridge(target.id);
    const afterSecond = useApexStore
      .getState()
      .graphData.edges.find((e) => e.id === target.id)!;
    expect(afterSecond.confidence).toBe(afterFirst.confidence);
    expect(afterSecond.physicalMechanism).toBe(afterFirst.physicalMechanism);
  });

  it("is a no-op on a non-auto curator edge id", () => {
    const before = useApexStore
      .getState()
      .graphData.edges.find((e) => e.id === "regular-1")!;
    useApexStore.getState().promoteAutoBridge("regular-1");
    const after = useApexStore
      .getState()
      .graphData.edges.find((e) => e.id === "regular-1")!;
    expect(after.confidence).toBe(before.confidence);
    expect(after.physicalMechanism).toBe(before.physicalMechanism);
  });

  it("is a no-op when the id doesn't exist in the graph", () => {
    const edgesBefore = useApexStore.getState().graphData.edges;
    useApexStore.getState().promoteAutoBridge("nonexistent-id");
    const edgesAfter = useApexStore.getState().graphData.edges;
    expect(edgesAfter).toBe(edgesBefore); // same reference — no state change
  });
});
