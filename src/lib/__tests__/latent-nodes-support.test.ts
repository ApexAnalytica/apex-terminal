import { describe, it, expect } from "vitest";
import {
  deriveLatentNodes,
  computeLatentSupport,
  SUPPORT_MIN_ALIGNED,
} from "@/lib/latent-nodes";
import type {
  CausalGraph,
  CausalNode,
  CausalEdge,
  EdgeType,
  LiveDataPoint,
} from "@/lib/types";

/** Build a daily live series (history + current point) starting at `start`. */
function series(values: number[], start = "2026-01-01"): LiveDataPoint {
  const base = new Date(`${start}T00:00:00Z`);
  const at = (i: number) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toISOString();
  };
  const history = values.slice(0, -1).map((v, i) => ({ value: v, observedAt: at(i) }));
  return {
    kind: "indicator",
    value: values[values.length - 1],
    capacity: 100,
    unit: "x",
    observedAt: at(values.length - 1),
    source: "test",
    history,
  };
}

function node(id: string, liveData?: LiveDataPoint[]): CausalNode {
  return { id, shortLabel: id, label: id, liveData } as unknown as CausalNode;
}

function confEdge(
  source: string,
  target: string,
  physicalMechanism: string,
  confidence: number,
): CausalEdge {
  return {
    id: `${source}__${target}`,
    source,
    target,
    weight: 0.5,
    lag: 1,
    type: "confounded" as EdgeType,
    confidence,
    isInconsistent: false,
    physicalMechanism,
  } as CausalEdge;
}

function graph(nodes: CausalNode[], edges: CausalEdge[]): CausalGraph {
  return { nodes, edges, metadata: {} } as unknown as CausalGraph;
}

const N = SUPPORT_MIN_ALIGNED + 4; // comfortably above the alignment floor
const rising = Array.from({ length: N }, (_, i) => i + 1);
const falling = Array.from({ length: N }, (_, i) => N - i);

describe("computeLatentSupport (real-data consistency check)", () => {
  it("'supported' when live members co-move (positive correlation)", () => {
    const g = graph(
      [node("A", [series(rising)]), node("B", [series(rising)]), node("C")],
      [],
    );
    const s = computeLatentSupport(["A", "B", "C"], g);
    expect(s.status).toBe("supported");
    expect(s.statistic).toBeGreaterThanOrEqual(0.4);
    expect(s.liveMembers).toBe(2);
    expect(s.method).toBe("pairwise-correlation");
  });

  it("'inconsistent' when live members do NOT co-move (anti-correlated)", () => {
    const g = graph([node("A", [series(rising)]), node("B", [series(falling)])], []);
    const s = computeLatentSupport(["A", "B"], g);
    expect(s.status).toBe("inconsistent");
    expect(s.statistic).toBeLessThan(0.4);
    expect(s.liveMembers).toBe(2);
  });

  it("'insufficient' when fewer than 2 members carry live series", () => {
    const g = graph([node("A", [series(rising)]), node("B"), node("C")], []);
    const s = computeLatentSupport(["A", "B", "C"], g);
    expect(s.status).toBe("insufficient");
    expect(s.liveMembers).toBe(1);
  });

  it("'insufficient' when members have series but too few ALIGNED points", () => {
    // Non-overlapping date ranges → zero aligned points → insufficient.
    const g = graph(
      [
        node("A", [series(rising, "2026-01-01")]),
        node("B", [series(rising, "2030-01-01")]),
      ],
      [],
    );
    const s = computeLatentSupport(["A", "B"], g);
    expect(s.status).toBe("insufficient");
  });

  it("'insufficient' for short series below the alignment floor", () => {
    const short = [1, 2, 3]; // 3 points < SUPPORT_MIN_ALIGNED
    const g = graph([node("A", [series(short)]), node("B", [series(short)])], []);
    expect(computeLatentSupport(["A", "B"], g).status).toBe("insufficient");
  });
});

describe("deriveLatentNodes — hypothesizedDriver + dataSupport wiring", () => {
  it("surfaces the strongest internal confounded edge's mechanism as the driver", () => {
    const g = graph(
      [node("A"), node("B"), node("C")],
      [
        confEdge("A", "B", "weak channel", 0.6),
        confEdge("B", "C", "STRONGEST channel", 0.9),
        confEdge("A", "C", "mid channel", 0.7),
      ],
    );
    const [lat] = deriveLatentNodes(g);
    expect(lat.hypothesizedDriver).toBe("STRONGEST channel");
    // no live data on these nodes → support is insufficient, but present
    expect(lat.dataSupport?.status).toBe("insufficient");
  });

  it("derived latent carries 'supported' when its members co-move on live data", () => {
    const g = graph(
      [
        node("A", [series(rising)]),
        node("B", [series(rising)]),
        node("C", [series(rising)]),
      ],
      [
        confEdge("A", "B", "shared driver", 0.7),
        confEdge("B", "C", "shared driver", 0.7),
        confEdge("A", "C", "shared driver", 0.7),
      ],
    );
    const [lat] = deriveLatentNodes(g);
    expect(lat.dataSupport?.status).toBe("supported");
    expect(lat.dataSupport?.liveMembers).toBe(3);
  });
});
