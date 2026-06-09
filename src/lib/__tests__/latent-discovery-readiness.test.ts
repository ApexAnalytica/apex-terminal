import { describe, it, expect } from "vitest";
import {
  assessDiscoveryReadiness,
  deriveLatentNodes,
  DISCOVERY_MIN_POINTS,
  SUPPORT_MIN_ALIGNED,
} from "@/lib/latent-nodes";
import type {
  CausalGraph,
  CausalNode,
  CausalEdge,
  EdgeType,
  LiveDataPoint,
} from "@/lib/types";

/** Daily live series (history + current point) of length `n`. */
function series(n: number, start = "2026-01-01"): LiveDataPoint {
  const base = new Date(`${start}T00:00:00Z`);
  const at = (i: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toISOString();
  };
  const values = Array.from({ length: n }, (_, i) => i + 1);
  const history = values.slice(0, -1).map((v, i) => ({ value: v, observedAt: at(i) }));
  return {
    kind: "indicator",
    value: values[n - 1],
    capacity: 100,
    unit: "x",
    observedAt: at(n - 1),
    source: "test",
    history,
  };
}

function node(id: string, liveData?: LiveDataPoint[]): CausalNode {
  return { id, shortLabel: id, label: id, liveData } as unknown as CausalNode;
}

function confEdge(source: string, target: string): CausalEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    weight: 0.5,
    lag: 1,
    type: "confounded" as EdgeType,
    confidence: 0.65,
    isInconsistent: false,
    physicalMechanism: "shared channel",
  } as CausalEdge;
}

function graph(nodes: CausalNode[], edges: CausalEdge[] = []): CausalGraph {
  return { nodes, edges, metadata: {} } as unknown as CausalGraph;
}

describe("assessDiscoveryReadiness", () => {
  it("'blocked' on COVERAGE when a member carries no live feed", () => {
    const g = graph([node("A", [series(40)]), node("B"), node("C")]);
    const r = assessDiscoveryReadiness(["A", "B", "C"], g);
    expect(r.status).toBe("blocked");
    expect(r.limitingFactor).toBe("coverage");
    expect(r.missingFeeds.sort()).toEqual(["B", "C"]);
    expect(r.liveMembers).toBe(1);
    expect(r.recommendation).toMatch(/Acquire a live feed/i);
  });

  it("'ready' when every member is live with ≥ DISCOVERY_MIN_POINTS aligned points", () => {
    const n = DISCOVERY_MIN_POINTS + 5;
    const g = graph([node("A", [series(n)]), node("B", [series(n)]), node("C", [series(n)])]);
    const r = assessDiscoveryReadiness(["A", "B", "C"], g);
    expect(r.status).toBe("ready");
    expect(r.limitingFactor).toBe("none");
    expect(r.maxAlignedPoints).toBeGreaterThanOrEqual(DISCOVERY_MIN_POINTS);
    expect(r.missingFeeds).toEqual([]);
  });

  it("'partial' (underpowered) when all live but aligned points sit between the floors", () => {
    const n = SUPPORT_MIN_ALIGNED + 4; // ≥8 but < 30
    const g = graph([node("A", [series(n)]), node("B", [series(n)])]);
    const r = assessDiscoveryReadiness(["A", "B"], g);
    expect(r.status).toBe("partial");
    expect(r.limitingFactor).toBe("frequency");
    expect(r.maxAlignedPoints).toBe(n);
    expect(r.recommendation).toMatch(/Underpowered/i);
  });

  it("'blocked' on FREQUENCY when aligned points are far too few", () => {
    const g = graph([node("A", [series(4)]), node("B", [series(4)])]);
    const r = assessDiscoveryReadiness(["A", "B"], g);
    expect(r.status).toBe("blocked");
    expect(r.limitingFactor).toBe("frequency");
  });
});

describe("deriveLatentNodes — discoveryReadiness wiring", () => {
  it("attaches a coverage-blocked readiness when members have no live data", () => {
    const g = graph(
      [node("A"), node("B"), node("C")],
      [confEdge("A", "B"), confEdge("B", "C"), confEdge("A", "C")],
    );
    const [lat] = deriveLatentNodes(g);
    expect(lat.discoveryReadiness?.status).toBe("blocked");
    expect(lat.discoveryReadiness?.limitingFactor).toBe("coverage");
    expect(lat.discoveryReadiness?.missingFeeds.sort()).toEqual(["A", "B", "C"]);
  });
});
