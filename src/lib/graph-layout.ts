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

export function computeLayout3D(
  nodes: CausalNode[],
  edges: CausalEdge[]
): NodePosition[] {
  const simNodes: LayoutNode[] = nodes.map((n) => ({
    id: n.id,
    x: (Math.random() - 0.5) * 100,
    y: (Math.random() - 0.5) * 100,
    z: (Math.random() - 0.5) * 100,
  }));

  const simLinks: LayoutLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const sim = forceSimulation(simNodes)
    .numDimensions(3)
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(50)
        .strength(0.5)
    )
    .force("charge", forceManyBody().strength(-120))
    .force("center", forceCenter(0, 0, 0))
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < 150; i++) {
    sim.tick();
  }

  return simNodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    z: n.z,
  }));
}
