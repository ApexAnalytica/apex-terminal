import { describe, expect, it } from "vitest";
import { requestLayout3D, requestLayout2D } from "../layout3d-client";
import type { CausalGraph } from "@/lib/types";

// vitest's jsdom env typically doesn't supply a working Web Worker —
// the client wrapper detects this and falls back to a synchronous
// in-process compute. These tests verify that fallback path (which is
// also what runs under Next.js SSR) returns a well-shaped result.

function tinyGraph(): CausalGraph {
  const baseProfile = {
    composite: 5,
    irreplaceability: 5,
    restorationLatency: 5,
    jurisdictionalHazard: 5,
    cascadeLoad: 5,
    tailDepth: 5,
  };
  const node = (id: string) => ({
    id,
    label: id.toUpperCase(),
    shortLabel: id,
    category: "energy" as const,
    domain: "Saudi Aramco Energy",
    omegaFragility: { ...baseProfile },
    globalConcentration: "100% Saudi Arabia",
    replacementTime: "10y",
    physicalConstraint: "",
    isRestricted: false,
    isConfounded: false,
    discoverySource: "DCD" as const,
  });
  return {
    nodes: [node("a"), node("b"), node("c"), node("d")],
    edges: [
      { id: "ab", source: "a", target: "b", weight: 0.7, type: "directed", lag: 0, confidence: 0.9, isInconsistent: false, physicalMechanism: "" },
      { id: "bc", source: "b", target: "c", weight: 0.7, type: "directed", lag: 0, confidence: 0.9, isInconsistent: false, physicalMechanism: "" },
      { id: "cd", source: "c", target: "d", weight: 0.7, type: "directed", lag: 0, confidence: 0.9, isInconsistent: false, physicalMechanism: "" },
    ],
    metadata: {
      totalNodes: 4,
      totalEdges: 3,
      density: 0.25,
      verificationStatus: "VERIFIED",
      constraintType: "—",
      inconsistentEdges: 0,
      restrictedNodes: 0,
    },
  };
}

describe("requestLayout3D — fallback path", () => {
  it("returns positions + metrics for every node", async () => {
    const g = tinyGraph();
    const req = requestLayout3D(g.nodes, g.edges);
    // Each call gets a monotonically-increasing id
    expect(typeof req.id).toBe("number");
    expect(req.id).toBeGreaterThanOrEqual(0);

    const { positions, metrics } = await req;
    expect(positions).toHaveLength(g.nodes.length);
    for (const p of positions) {
      expect(typeof p.id).toBe("string");
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
    for (const id of ["a", "b", "c", "d"]) {
      expect(metrics[id]).toBeDefined();
      expect(typeof metrics[id].degree).toBe("number");
      expect(typeof metrics[id].eigenvectorCentrality).toBe("number");
    }
  });

  it("assigns a different id to a second concurrent call", () => {
    const g = tinyGraph();
    const a = requestLayout3D(g.nodes, g.edges);
    const b = requestLayout3D(g.nodes, g.edges);
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe("requestLayout2D — fallback path", () => {
  it("returns a positions2d Map + metrics for every node", async () => {
    const g = tinyGraph();
    const req = requestLayout2D(g.nodes, g.edges);
    expect(typeof req.id).toBe("number");

    const { positions2d, metrics } = await req;
    expect(positions2d).toBeInstanceOf(Map);
    for (const id of ["a", "b", "c", "d"]) {
      const p = positions2d.get(id);
      expect(p).toBeDefined();
      expect(Number.isFinite(p!.x)).toBe(true);
      expect(Number.isFinite(p!.y)).toBe(true);
      expect(metrics[id]).toBeDefined();
    }
  });
});
