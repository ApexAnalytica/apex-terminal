import { describe, it, expect } from "vitest";
import {
  applyOmegaLiveAdjustments,
  computeCascadeLoadDelta,
  computeJurisdictionalHazardDelta,
  getEffectivePillars,
} from "@/lib/omega-pillar-wiring";
import type { CausalGraph, LiveDataPoint } from "@/lib/types";
import { makeNode, makeEdge, makeGraph } from "./fixtures/graph-fixtures";

const sanctionsPoint = (programs: number, source = "OFAC SDN — Iran"): LiveDataPoint => ({
  kind: "sanctions",
  value: programs,
  capacity: 1,
  unit: "programs",
  observedAt: "2025-01-01T00:00:00.000Z",
  source,
});

describe("computeJurisdictionalHazardDelta — Tarski → J wire", () => {
  it("returns zero when the node has no sanctions liveData", () => {
    const node = makeNode({ id: "n1", label: "Quiet Asset" });
    const { delta, source } = computeJurisdictionalHazardDelta(node);
    expect(delta).toBe(0);
    expect(source).toBe("");
  });

  it("scales the delta by program count (0.4 per program)", () => {
    const node = makeNode({
      id: "n1",
      label: "Iranian Producer",
      liveData: [sanctionsPoint(3)],
    });
    const { delta, source } = computeJurisdictionalHazardDelta(node);
    expect(delta).toBe(1.2); // 3 * 0.4
    expect(source).toContain("3 active sanctions programs");
  });

  it("caps the delta at 4.0 even when programs are extreme", () => {
    const node = makeNode({
      id: "n1",
      label: "Heavy Sanctions Target",
      liveData: [sanctionsPoint(20)],
    });
    const { delta } = computeJurisdictionalHazardDelta(node);
    expect(delta).toBe(4.0);
  });

  it("formats the source string for a single program (no plural 's')", () => {
    const node = makeNode({
      id: "n1",
      label: "Single-Program Target",
      liveData: [sanctionsPoint(1)],
    });
    const { source } = computeJurisdictionalHazardDelta(node);
    expect(source).toContain("1 active sanctions program ");
    expect(source).not.toContain("programs");
  });
});

describe("computeCascadeLoadDelta — Spirtes-metrics → C wire", () => {
  const graphWithOutDegree = (centerOutDegree: number): CausalGraph => {
    const nodes = [
      makeNode({ id: "center", label: "Hub" }),
      ...Array.from({ length: centerOutDegree + 1 }, (_, i) => makeNode({ id: `t${i}`, label: `Target ${i}` })),
    ];
    const edges = Array.from({ length: centerOutDegree }, (_, i) =>
      makeEdge({ id: `e${i}`, source: "center", target: `t${i}` }),
    );
    return makeGraph(nodes, edges);
  };

  it("returns zero when out-degree is below the structural threshold", () => {
    const graph = graphWithOutDegree(3);
    const center = graph.nodes[0];
    const { delta } = computeCascadeLoadDelta(center, graph);
    expect(delta).toBe(0);
  });

  it("scales by excess out-degree above the threshold (0.3 per edge)", () => {
    const graph = graphWithOutDegree(8); // 3 above threshold of 5
    const center = graph.nodes[0];
    const { delta, source } = computeCascadeLoadDelta(center, graph);
    expect(delta).toBe(0.9); // 3 * 0.3
    expect(source).toContain("out-degree 8");
  });

  it("caps the delta at 3.0 even for extreme out-degrees", () => {
    const graph = graphWithOutDegree(50);
    const center = graph.nodes[0];
    const { delta } = computeCascadeLoadDelta(center, graph);
    expect(delta).toBe(3.0);
  });
});

describe("applyOmegaLiveAdjustments — graph-level walk", () => {
  it("attaches liveAdjustments only to nodes with non-zero deltas", () => {
    const graph = makeGraph(
      [
        makeNode({ id: "iran", label: "Iranian Producer", liveData: [sanctionsPoint(2)] }),
        makeNode({ id: "neutral", label: "Neutral Asset" }),
      ],
      [],
    );
    const adjusted = applyOmegaLiveAdjustments(graph);
    const iran = adjusted.nodes.find((n) => n.id === "iran")!;
    const neutral = adjusted.nodes.find((n) => n.id === "neutral")!;
    expect(iran.liveAdjustments?.jurisdictionalHazardDelta).toBeCloseTo(0.8, 1);
    expect(iran.liveAdjustments?.jSource).toContain("sanctions");
    expect(neutral.liveAdjustments).toBeUndefined();
  });

  it("strips a stale overlay when the underlying signal goes away", () => {
    // Start with a sanctioned node, then re-walk a graph where the
    // sanctions signal has been removed.
    const withSanctions = makeGraph(
      [makeNode({ id: "iran", label: "Iranian Producer", liveData: [sanctionsPoint(2)] })],
      [],
    );
    const a = applyOmegaLiveAdjustments(withSanctions);
    expect(a.nodes[0].liveAdjustments?.jurisdictionalHazardDelta).toBeGreaterThan(0);

    // Now strip the live data and re-apply; overlay should be removed.
    const cleared = makeGraph(
      [{ ...a.nodes[0], liveData: undefined }],
      [],
    );
    const b = applyOmegaLiveAdjustments(cleared);
    expect(b.nodes[0].liveAdjustments).toBeUndefined();
  });

  it("combines J and C deltas on a node that triggers both", () => {
    // Hub node with sanctions + high out-degree → both J and C bumps.
    const hub = makeNode({ id: "hub", label: "Iran Hub", liveData: [sanctionsPoint(2)] });
    const targets = Array.from({ length: 8 }, (_, i) => makeNode({ id: `t${i}` }));
    const edges = Array.from({ length: 8 }, (_, i) =>
      makeEdge({ id: `e${i}`, source: "hub", target: `t${i}` }),
    );
    const graph = makeGraph([hub, ...targets], edges);
    const adjusted = applyOmegaLiveAdjustments(graph);
    const adjustedHub = adjusted.nodes.find((n) => n.id === "hub")!;
    expect(adjustedHub.liveAdjustments?.jurisdictionalHazardDelta).toBeCloseTo(0.8, 1);
    expect(adjustedHub.liveAdjustments?.cascadeLoadDelta).toBeCloseTo(0.9, 1);
  });
});

describe("getEffectivePillars — static + overlay readout", () => {
  it("returns the static profile when no overlay is present", () => {
    const node = makeNode({
      id: "n1",
      omegaFragility: {
        composite: 5,
        irreplaceability: 5,
        cascadeLoad: 4,
        tailDepth: 5,
        restorationLatency: 5,
        jurisdictionalHazard: 6,
      },
    });
    const eff = getEffectivePillars(node);
    expect(eff.jurisdictionalHazard).toBe(6);
    expect(eff.cascadeLoad).toBe(4);
  });

  it("adds the overlay deltas to the static profile and clamps to 0..10", () => {
    const node = {
      ...makeNode({
        id: "n1",
        omegaFragility: {
          composite: 5,
          irreplaceability: 5,
          cascadeLoad: 8,
          tailDepth: 5,
          restorationLatency: 5,
          jurisdictionalHazard: 8,
        },
      }),
      liveAdjustments: {
        jurisdictionalHazardDelta: 4, // would push J to 12
        cascadeLoadDelta: 1.5,
      },
    };
    const eff = getEffectivePillars(node);
    expect(eff.jurisdictionalHazard).toBe(10); // clamped
    expect(eff.cascadeLoad).toBe(9.5);
  });
});
