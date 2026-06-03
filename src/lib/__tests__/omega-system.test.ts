import { describe, it, expect } from "vitest";
import {
  computeSystemFragility,
  throughputWeight,
  exposureWeight,
  LOSS_THRESHOLD,
  MAX_BUFFER_EPOCHS,
} from "@/lib/omega-system";
import { buildGraphFromDomains } from "@/lib/build-domain-graph";
import type { CausalGraph, CausalNode, LiveDataPoint } from "@/lib/types";

function mkNode(
  id: string,
  composite: number,
  cascadeLoad: number,
  globalConcentration: string,
  liveData?: LiveDataPoint[],
): CausalNode {
  return {
    id,
    globalConcentration,
    liveData,
    omegaFragility: {
      composite,
      irreplaceability: 5,
      restorationLatency: 5,
      jurisdictionalHazard: 5,
      cascadeLoad,
      tailDepth: 5,
    },
  } as unknown as CausalNode;
}

function graph(nodes: CausalNode[]): CausalGraph {
  return { nodes, edges: [], metadata: {} } as unknown as CausalGraph;
}

const throughput = (value: number, capacity: number): LiveDataPoint[] => [
  { kind: "throughput", value, capacity, unit: "mb/d", observedAt: "", source: "" } as LiveDataPoint,
];

describe("exposureWeight (eᵢ = concentration share)", () => {
  it("parses a concentration percentage", () => {
    expect(exposureWeight(mkNode("a", 5, 5, "100% Saudi Arabia"))).toBe(1.0);
    expect(exposureWeight(mkNode("b", 5, 5, "93% China"))).toBeCloseTo(0.93, 10);
  });
  it("treats explicit single-source phrasing as full exposure", () => {
    expect(exposureWeight(mkNode("c", 5, 5, "single-source supplier"))).toBe(1.0);
  });
  it("falls back to neutral 0.5 when no concentration is stated", () => {
    expect(exposureWeight(mkNode("d", 5, 5, "diversified global market"))).toBe(0.5);
    expect(exposureWeight(mkNode("e", 5, 5, ""))).toBe(0.5);
  });
});

describe("throughputWeight (αᵢ = live utilization, else cascadeLoad)", () => {
  it("uses live throughput utilization when a feed is attached", () => {
    expect(throughputWeight(mkNode("a", 5, 2, "x", throughput(5, 10)))).toBe(0.5);
    expect(throughputWeight(mkNode("b", 5, 2, "x", throughput(9, 10)))).toBeCloseTo(0.9, 10);
  });
  it("falls back to the cascadeLoad pillar (normalised) when no feed", () => {
    expect(throughputWeight(mkNode("c", 5, 8, "x"))).toBeCloseTo(0.8, 10);
  });
  it("floors at a sliver so a zero-cascade node never drops out", () => {
    expect(throughputWeight(mkNode("d", 5, 0, "x"))).toBe(0.05);
  });
});

describe("computeSystemFragility", () => {
  it("returns zeros + full buffer for an empty graph", () => {
    expect(computeSystemFragility(graph([]))).toEqual({
      omegaSF: 0,
      omegaSX: 0,
      contagionRadius: 0,
      bufferHorizon: MAX_BUFFER_EPOCHS,
    });
  });

  it("computes the throughput- and exposure-weighted means", () => {
    // A: composite 8, cascadeLoad 10 (α=1.0), concentration 100% (e=1.0)
    // B: composite 4, cascadeLoad 0  (α=0.05 floor), concentration 10% (e=0.1)
    const g = graph([
      mkNode("A", 8, 10, "100% one country"),
      mkNode("B", 4, 0, "10% diversified"),
    ]);
    const sys = computeSystemFragility(g);
    // ΩSF = (1.0*8 + 0.05*4)/1.05 = 7.81 → 7.8
    expect(sys.omegaSF).toBe(7.8);
    // ΩSX = (1.0*8 + 0.1*4)/1.1 = 7.64 → 7.6
    expect(sys.omegaSX).toBe(7.6);
  });

  it("ΩSF and ΩSX diverge when throughput and exposure rank nodes differently", () => {
    // A: low composite but high throughput; B: high composite + high exposure.
    const g = graph([
      mkNode("A", 2, 10, "10% diversified"), // α=1.0, e=0.1
      mkNode("B", 9, 0, "100% sole source"), // α=0.05, e=1.0
    ]);
    const sys = computeSystemFragility(g);
    // throughput pulls toward the low-composite node; exposure toward the high one
    expect(sys.omegaSF).toBeLessThan(4);
    expect(sys.omegaSX).toBeGreaterThan(8);
    expect(sys.omegaSX).toBeGreaterThan(sys.omegaSF);
  });

  it("contagionRadius counts nodes in the loss zone (composite ≥ threshold)", () => {
    const g = graph([
      mkNode("A", LOSS_THRESHOLD, 5, "x"),
      mkNode("B", LOSS_THRESHOLD + 1, 5, "x"),
      mkNode("C", LOSS_THRESHOLD - 0.1, 5, "x"),
    ]);
    expect(computeSystemFragility(g).contagionRadius).toBe(2);
  });

  it("bufferHorizon shrinks as system fragility rises", () => {
    const calm = computeSystemFragility(graph([mkNode("A", 2, 5, "50% x")]));
    const dire = computeSystemFragility(graph([mkNode("A", 9, 5, "50% x")]));
    expect(dire.bufferHorizon).toBeLessThan(calm.bufferHorizon);
    expect(dire.bufferHorizon).toBeGreaterThanOrEqual(1);
    expect(calm.bufferHorizon).toBeLessThanOrEqual(MAX_BUFFER_EPOCHS);
  });
});

describe("computeSystemFragility on the real graph (integration)", () => {
  it("produces sane, populated system metrics for the default geopolitical graph", () => {
    const g = buildGraphFromDomains(["energy-systems"]);
    const sys = computeSystemFragility(g);
    expect(g.nodes.length).toBeGreaterThan(0);
    expect(sys.omegaSF).toBeGreaterThan(0);
    expect(sys.omegaSF).toBeLessThanOrEqual(10);
    expect(sys.omegaSX).toBeGreaterThan(0);
    expect(sys.omegaSX).toBeLessThanOrEqual(10);
    expect(sys.contagionRadius).toBeGreaterThan(0);
    expect(sys.contagionRadius).toBeLessThanOrEqual(g.nodes.length);
    expect(sys.bufferHorizon).toBeGreaterThanOrEqual(1);
    expect(sys.bufferHorizon).toBeLessThanOrEqual(MAX_BUFFER_EPOCHS);
    // throughput- and exposure-weighting are different lenses on real data
    expect(sys.omegaSF).not.toBe(sys.omegaSX);
  });
});
