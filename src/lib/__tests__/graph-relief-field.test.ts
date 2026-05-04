import { describe, it, expect } from "vitest";
import {
  computeReliefField,
  computeReliefLayers,
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
});
