import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from "d3-force-3d";
import { CausalNode, CausalEdge } from "./types";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  domain: string;
  index?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

interface LayoutLink {
  source: string | LayoutNode;
  target: string | LayoutNode;
  index?: number;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

// Domain z-layer targets (before normalization)
const DOMAIN_Z_OFFSETS: Record<string, number> = {
  "EUV Lithography": -4,
  "Undersea Cables": -2,
  "Rare Earth": -1,
  "HVDC Power": 0,
  "AI Compute": 1,
  "Fertilizer": 2.5,
  "Data Centers": -3,
  "Dollar Funding": 3,
  "Geopolitical": 4,
  "Energy Grid": 0.5,
};

// Target bounding box half-extents for the final layout
const BOUNDS = { x: 55, y: 40, z: 35 };

export function computeLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[],
  existingPositions?: NodePosition[]
): NodePosition[] {
  const existingMap = new Map<string, NodePosition>();
  if (existingPositions) {
    existingPositions.forEach((p) => existingMap.set(p.id, p));
  }
  const hasExisting = existingMap.size > 0;

  const simNodes: LayoutNode[] = nodes.map((n) => {
    const existing = existingMap.get(n.id);
    if (existing) {
      return { id: n.id, domain: n.domain, x: existing.x, y: existing.y, z: existing.z };
    }
    const zBase = DOMAIN_Z_OFFSETS[n.domain] ?? 0;
    return {
      id: n.id,
      domain: n.domain,
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: zBase + (Math.random() - 0.5) * 2,
    };
  });

  const simLinks: LayoutLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  // d3-force-3d types are incomplete — runtime API accepts (nodes, nDim)
  const sim = (forceSimulation as any)(simNodes, 3)
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(25)
        .strength(0.4)
    )
    .force("charge", forceManyBody().strength(-120))
    .force("center", forceCenter(0, 0, 0))
    .velocityDecay(0.4)
    .stop();

  const iterations = hasExisting ? 50 : 200;
  for (let i = 0; i < iterations; i++) {
    sim.tick();
  }

  // Shift each domain group's z toward its target layer
  const domainGroups: Record<string, LayoutNode[]> = {};
  simNodes.forEach((n) => {
    (domainGroups[n.domain] ??= []).push(n);
  });
  for (const [domain, group] of Object.entries(domainGroups)) {
    const targetZ = (DOMAIN_Z_OFFSETS[domain] ?? 0) * 5; // scale up
    const avgZ = group.reduce((s, n) => s + n.z, 0) / group.length;
    const shift = (targetZ - avgZ) * 0.7;
    group.forEach((n) => { n.z += shift; });
  }

  // Normalize positions to fit within BOUNDS
  const xs = simNodes.map((n) => n.x);
  const ys = simNodes.map((n) => n.y);
  const zs = simNodes.map((n) => n.z);
  const extX = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs))) || 1;
  const extY = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys))) || 1;
  const extZ = Math.max(Math.abs(Math.min(...zs)), Math.abs(Math.max(...zs))) || 1;

  return simNodes.map((n) => ({
    id: n.id,
    x: (n.x / extX) * BOUNDS.x,
    y: (n.y / extY) * BOUNDS.y,
    z: (n.z / extZ) * BOUNDS.z,
  }));
}
