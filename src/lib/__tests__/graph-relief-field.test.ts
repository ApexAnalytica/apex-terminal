import { describe, it, expect } from "vitest";
import {
  computeFusedReliefField,
  computeNodeAnchors,
  computeReliefField,
  computeReliefLayers,
  pickNearestNode,
} from "../graph-relief-field";
import type { CausalNode } from "../types";

function makeNode(id: string, domain: string, omega: number): CausalNode {
  return {
    id,
    label: id,
    description: "",
    category: "geopolitical",
    domain,
    omegaFragility: {
      institutionalRot: omega,
      regulatoryFog: omega,
      jurisdictionalHazard: omega,
      cascadeLoad: omega,
      tailRisk: omega,
      composite: omega,
    },
    discoverySource: "manual",
  } as unknown as CausalNode;
}

describe("computeReliefField", () => {
  it("returns empty field for nodes with no layout entries", () => {
    const nodes = [makeNode("a", "X", 5)];
    const empty = new Map<string, { x: number; y: number }>();
    const field = computeReliefField(nodes, empty);
    expect(field.positions.length).toBe(0);
    expect(field.indices.length).toBe(0);
    expect(field.peak).toBe(0);
  });

  it("produces a non-empty heightfield with vertices count = N×N", () => {
    const nodes = [makeNode("a", "X", 8), makeNode("b", "X", 4)];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 50 }],
    ]);
    const field = computeReliefField(nodes, layout, { resolution: 16 });
    expect(field.resolution).toBe(16);
    expect(field.positions.length).toBe(16 * 16 * 3);
    expect(field.indices.length).toBe(15 * 15 * 6);
    expect(field.peak).toBeGreaterThan(0);
  });

  it("re-centers world bounds around the origin", () => {
    const nodes = [makeNode("a", "X", 5)];
    const layout = new Map([["a", { x: 1000, y: 1000 }]]);
    const field = computeReliefField(nodes, layout, { resolution: 8 });
    let xSum = 0, zSum = 0;
    for (let i = 0; i < field.positions.length; i += 3) {
      xSum += field.positions[i];
      zSum += field.positions[i + 2];
    }
    const meanX = xSum / (field.positions.length / 3);
    const meanZ = zSum / (field.positions.length / 3);
    expect(Math.abs(meanX)).toBeLessThan(0.01);
    expect(Math.abs(meanZ)).toBeLessThan(0.01);
  });
});

describe("computeReliefLayers", () => {
  it("returns one layer per unique domain", () => {
    const nodes = [
      makeNode("a", "Saudi Aramco Energy", 8),
      makeNode("b", "Saudi Aramco Energy", 6),
      makeNode("c", "Sovereign Risk", 7),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 50, y: 0 }],
      ["c", { x: 0, y: 100 }],
    ]);
    const layers = computeReliefLayers(nodes, layout, { resolution: 8 });
    expect(layers.length).toBe(2);
    const domains = layers.map((l) => l.domain).sort();
    expect(domains).toEqual(["Saudi Aramco Energy", "Sovereign Risk"]);
  });

  it("all layers share the same world-space dimensions", () => {
    const nodes = [
      makeNode("a", "X", 8),
      makeNode("b", "Y", 6),
      makeNode("c", "Z", 4),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 200, y: 0 }],
      ["c", { x: 100, y: 200 }],
    ]);
    const layers = computeReliefLayers(nodes, layout, { resolution: 8 });
    expect(layers.length).toBe(3);
    const w = layers[0].field.width;
    const h = layers[0].field.height;
    for (const l of layers) {
      expect(l.field.width).toBe(w);
      expect(l.field.height).toBe(h);
      expect(l.field.resolution).toBe(8);
    }
  });

  it("nodeCount matches per-domain node populations", () => {
    const nodes = [
      makeNode("a", "X", 5),
      makeNode("b", "X", 5),
      makeNode("c", "X", 5),
      makeNode("d", "Y", 5),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 50, y: 0 }],
      ["c", { x: 0, y: 50 }],
      ["d", { x: 100, y: 100 }],
    ]);
    const layers = computeReliefLayers(nodes, layout, { resolution: 8 });
    const xLayer = layers.find((l) => l.domain === "X")!;
    const yLayer = layers.find((l) => l.domain === "Y")!;
    expect(xLayer.nodeCount).toBe(3);
    expect(yLayer.nodeCount).toBe(1);
  });

  it("layer ordering is stable: highest peak first", () => {
    const nodes = [
      makeNode("a", "Strong", 10),
      makeNode("b", "Strong", 10),
      makeNode("c", "Weak", 1),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 30, y: 30 }],
      ["c", { x: 200, y: 200 }],
    ]);
    const layers = computeReliefLayers(nodes, layout, { resolution: 8 });
    expect(layers[0].domain).toBe("Strong");
    expect(layers[0].field.peak).toBeGreaterThan(layers[1].field.peak);
  });

  it("vertex valleys are dark (additive black)", () => {
    const nodes = [makeNode("a", "X", 10)];
    const layout = new Map([["a", { x: 0, y: 0 }]]);
    const layers = computeReliefLayers(nodes, layout, { resolution: 16 });
    const field = layers[0].field;
    // The corner vertex should be far from the (0,0) source — color tint ≈ 0.
    const cornerR = field.colors[0];
    const cornerG = field.colors[1];
    const cornerB = field.colors[2];
    expect(cornerR + cornerG + cornerB).toBeLessThan(0.05);
  });

  it("returns empty array for graphs with no layout entries", () => {
    const nodes = [makeNode("a", "X", 5)];
    const empty = new Map<string, { x: number; y: number }>();
    const layers = computeReliefLayers(nodes, empty);
    expect(layers).toEqual([]);
  });

  it("ReliefField exposes the cx/cy world center used for recentering", () => {
    const nodes = [
      makeNode("a", "X", 5),
      makeNode("b", "X", 5),
    ];
    const layout = new Map([
      ["a", { x: 100, y: 200 }],
      ["b", { x: 200, y: 400 }],
    ]);
    const field = computeReliefField(nodes, layout, { resolution: 8 });
    // cx/cy should be the midpoint of the padded bounds — the same recentering
    // origin the mesh uses, so labels can convert (layout x,y) → mesh-local.
    expect(field.cx).toBeCloseTo(150, 0);
    expect(field.cy).toBeCloseTo(300, 0);
  });
});

describe("computeNodeAnchors", () => {
  it("returns at most topK anchors, sorted by composite descending", () => {
    const nodes = [
      makeNode("low", "X", 1),
      makeNode("mid", "X", 5),
      makeNode("high", "X", 9),
      makeNode("higher", "X", 9.5),
    ];
    const layout = new Map([
      ["low", { x: 0, y: 0 }],
      ["mid", { x: 100, y: 0 }],
      ["high", { x: 0, y: 100 }],
      ["higher", { x: 100, y: 100 }],
    ]);
    const field = computeReliefField(nodes, layout, { resolution: 16 });
    const anchors = computeNodeAnchors(nodes, layout, field, {}, 2);
    expect(anchors.length).toBe(2);
    expect(anchors[0].id).toBe("higher");
    expect(anchors[1].id).toBe("high");
  });

  it("anchors are recentered to mesh-local coords (matches field.cx/cy)", () => {
    const nodes = [makeNode("a", "X", 8)];
    const layout = new Map([["a", { x: 500, y: 300 }]]);
    const field = computeReliefField(nodes, layout, { resolution: 16 });
    const [anchor] = computeNodeAnchors(nodes, layout, field, {}, 1);
    expect(anchor.x).toBeCloseTo(500 - field.cx, 1);
    expect(anchor.z).toBeCloseTo(300 - field.cy, 1);
    expect(anchor.y).toBeGreaterThan(0);
  });

  it("returns [] when the field is empty", () => {
    const nodes = [makeNode("a", "X", 5)];
    const empty = new Map<string, { x: number; y: number }>();
    const field = computeReliefField(nodes, empty);
    const anchors = computeNodeAnchors(nodes, empty, field);
    expect(anchors).toEqual([]);
  });
});

describe("computeFusedReliefField", () => {
  it("produces a single mesh with N×N vertices and a populated legend", () => {
    const nodes = [
      makeNode("a", "Saudi Aramco Energy", 8),
      makeNode("b", "Sovereign Risk", 7),
      makeNode("c", "Saudi Aramco Energy", 6),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 200, y: 200 }],
      ["c", { x: 50, y: 50 }],
    ]);
    const field = computeFusedReliefField(nodes, layout, { resolution: 16 });
    expect(field.positions.length).toBe(16 * 16 * 3);
    expect(field.indices.length).toBe(15 * 15 * 6);
    expect(field.peak).toBeGreaterThan(0);
    // Legend: 2 distinct domains, biggest first.
    expect(field.legend.length).toBe(2);
    expect(field.legend[0].domain).toBe("Saudi Aramco Energy");
    expect(field.legend[0].nodeCount).toBe(2);
  });

  it("each peak takes its dominant domain's tint (no haze)", () => {
    // Two distant clusters — the vertex closest to cluster A should be
    // tinted with A's domain colour, the one near cluster B with B's.
    const nodes = [
      // Cluster A at (0,0), domain X (#00e676 → very green)
      makeNode("a1", "Saudi Aramco Energy", 10),
      makeNode("a2", "Saudi Aramco Energy", 10),
      // Cluster B far away, domain Y (#ff1744 → very red)
      makeNode("b1", "Kill Chain", 10),
      makeNode("b2", "Kill Chain", 10),
    ];
    const layout = new Map([
      ["a1", { x: 0, y: 0 }],
      ["a2", { x: 20, y: 20 }],
      ["b1", { x: 1000, y: 1000 }],
      ["b2", { x: 1020, y: 1020 }],
    ]);
    const field = computeFusedReliefField(nodes, layout, { resolution: 32 });
    // Find vertex closest to cluster A peak (mesh origin minus midpoint).
    // Easier — just sample a vertex near the corner where A clusters.
    // A is at (0,0) in layout, recentered to (0 - cx, 0 - cy).
    // Find vertex closest to that mesh-local point.
    const targetX = 0 - field.cx;
    const targetZ = 0 - field.cy;
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < field.positions.length; i += 3) {
      const dx = field.positions[i] - targetX;
      const dz = field.positions[i + 2] - targetZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    // Domain Saudi Aramco (#00e676) → green channel dominates.
    const r = field.colors[bestIdx];
    const g = field.colors[bestIdx + 1];
    const b = field.colors[bestIdx + 2];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("returns empty + legend=[] for graphs with no layout entries", () => {
    const nodes = [makeNode("a", "X", 5)];
    const empty = new Map<string, { x: number; y: number }>();
    const field = computeFusedReliefField(nodes, empty);
    expect(field.positions.length).toBe(0);
    expect(field.legend).toEqual([]);
  });
});

describe("pickNearestNode", () => {
  it("returns the node id closest to a click in mesh-local coords", () => {
    const nodes = [
      makeNode("a", "X", 5),
      makeNode("b", "X", 5),
      makeNode("c", "X", 5),
    ];
    const layout = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 300, y: 0 }],
      ["c", { x: 0, y: 300 }],
    ]);
    const field = computeReliefField(nodes, layout, { resolution: 16 });
    // Click near where node "b" sits in mesh-local coords.
    const bLocal = { x: 300 - field.cx, z: 0 - field.cy };
    const id = pickNearestNode(
      bLocal.x,
      bLocal.z,
      nodes,
      layout,
      field,
    );
    expect(id).toBe("b");
  });

  it("returns null when the click is outside the cap radius", () => {
    const nodes = [makeNode("a", "X", 5)];
    const layout = new Map([["a", { x: 0, y: 0 }]]);
    const field = computeReliefField(nodes, layout, { resolution: 16 });
    // Click 100,000 units away — well outside any cap.
    const id = pickNearestNode(
      100_000,
      100_000,
      nodes,
      layout,
      field,
      {},
      50,
    );
    expect(id).toBeNull();
  });

  it("returns null on an empty field", () => {
    const nodes = [makeNode("a", "X", 5)];
    const empty = new Map<string, { x: number; y: number }>();
    const field = computeReliefField(nodes, empty);
    expect(pickNearestNode(0, 0, nodes, empty, field)).toBeNull();
  });
});
