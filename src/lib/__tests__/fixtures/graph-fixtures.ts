import {
  CausalNode,
  CausalEdge,
  CausalGraph,
  CausalShock,
  OmegaFragilityProfile,
  GraphMetadata,
  NodeCategory,
  EdgeType,
} from "@/lib/types";

// ─── Factory Helpers ─────────────────────────────────────────────

const DEFAULT_OMEGA: OmegaFragilityProfile = {
  composite: 5.0,
  irreplaceability: 5.0,
  cascadeLoad: 5.0,
  tailDepth: 5.0,
  restorationLatency: 5.0,
  jurisdictionalHazard: 5.0,
};

export function makeNode(overrides: Partial<CausalNode> & { id: string }): CausalNode {
  return {
    label: overrides.id,
    shortLabel: overrides.id.slice(0, 3).toUpperCase(),
    category: "infrastructure" as NodeCategory,
    omegaFragility: { ...DEFAULT_OMEGA },
    globalConcentration: "Unknown",
    replacementTime: "Unknown",
    domain: "Test",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    ...overrides,
  };
}

export function makeEdge(
  overrides: Partial<CausalEdge> & { id: string; source: string; target: string }
): CausalEdge {
  return {
    weight: 0.5,
    lag: 0,
    type: "directed" as EdgeType,
    confidence: 0.8,
    isInconsistent: false,
    physicalMechanism: "test mechanism",
    ...overrides,
  };
}

function makeMetadata(nodes: CausalNode[], edges: CausalEdge[]): GraphMetadata {
  const n = nodes.length;
  return {
    density: n > 1 ? edges.length / (n * (n - 1)) : 0,
    constraintType: "test",
    verificationStatus: "UNVERIFIED",
    totalNodes: n,
    totalEdges: edges.length,
    inconsistentEdges: edges.filter((e) => e.isInconsistent).length,
    restrictedNodes: nodes.filter((n) => n.isRestricted).length,
  };
}

export function makeGraph(nodes: CausalNode[], edges: CausalEdge[]): CausalGraph {
  return { nodes, edges, metadata: makeMetadata(nodes, edges) };
}

// ─── Preset Graphs ──────────────────────────────────────────────

// A→B→C  (basic linear cascade)
export function linearGraph(): CausalGraph {
  const nodes = [
    makeNode({ id: "A", category: "manufacturing", domain: "EUV Lithography" }),
    makeNode({ id: "B", category: "infrastructure", domain: "AI Compute" }),
    makeNode({ id: "C", category: "energy", domain: "Energy Grid" }),
  ];
  const edges = [
    makeEdge({ id: "e_AB", source: "A", target: "B", weight: 0.7 }),
    makeEdge({ id: "e_BC", source: "B", target: "C", weight: 0.6 }),
  ];
  return makeGraph(nodes, edges);
}

// Fan-out: A→B, A→C, A→D, B→C, B→D, C→D (high row sums → lambdaMax > 1)
export function unstableGraph(): CausalGraph {
  const nodes = [
    makeNode({ id: "A", category: "manufacturing" }),
    makeNode({ id: "B", category: "infrastructure" }),
    makeNode({ id: "C", category: "energy" }),
    makeNode({ id: "D", category: "finance" }),
  ];
  const edges = [
    makeEdge({ id: "e_AB", source: "A", target: "B", weight: 0.8 }),
    makeEdge({ id: "e_AC", source: "A", target: "C", weight: 0.7 }),
    makeEdge({ id: "e_AD", source: "A", target: "D", weight: 0.6 }),
    makeEdge({ id: "e_BC", source: "B", target: "C", weight: 0.5 }),
    makeEdge({ id: "e_BD", source: "B", target: "D", weight: 0.4 }),
    makeEdge({ id: "e_CD", source: "C", target: "D", weight: 0.3 }),
  ];
  return makeGraph(nodes, edges);
}

// Edges with lag > 0 for temporal propagation
export function laggedGraph(): CausalGraph {
  const nodes = [
    makeNode({ id: "A", category: "manufacturing" }),
    makeNode({ id: "B", category: "infrastructure" }),
    makeNode({ id: "C", category: "energy" }),
  ];
  const edges = [
    makeEdge({ id: "e_AB", source: "A", target: "B", weight: 0.7, lag: 2 }),
    makeEdge({ id: "e_BC", source: "B", target: "C", weight: 0.6, lag: 0 }),
  ];
  return makeGraph(nodes, edges);
}

// Confounded / inconsistent edges for Tarski tests
export function confoundedGraph(): CausalGraph {
  const nodes = [
    makeNode({ id: "A", isConfounded: true }),
    makeNode({ id: "B", isRestricted: true }),
    makeNode({ id: "C" }),
  ];
  const edges = [
    makeEdge({
      id: "e_AB",
      source: "A",
      target: "B",
      type: "confounded",
      isInconsistent: true,
    }),
    makeEdge({ id: "e_BC", source: "B", target: "C" }),
  ];
  return makeGraph(nodes, edges);
}

// Empty graph (for edge cases)
export function emptyGraph(): CausalGraph {
  return makeGraph([], []);
}

// Single node (no edges)
export function singleNodeGraph(): CausalGraph {
  return makeGraph([makeNode({ id: "A" })], []);
}

// ─── Preset Shocks ──────────────────────────────────────────────

export function makeShock(overrides: Partial<CausalShock> & { id: string }): CausalShock {
  return {
    name: overrides.id.toUpperCase(),
    severity: 0.3,
    category: "compute",
    description: "Test shock",
    ...overrides,
  };
}

export const SINGLE_SHOCK: CausalShock = makeShock({
  id: "test_shock",
  severity: 0.5,
  category: "compute",
});

export const MULTI_SHOCKS: CausalShock[] = [
  makeShock({ id: "shock_1", severity: 0.3, category: "compute" }),
  makeShock({ id: "shock_2", severity: 0.25, category: "energy" }),
];

export const FULL_PRESET_SHOCKS: CausalShock[] = [
  makeShock({ id: "s1", severity: 0.25, category: "supply" }),
  makeShock({ id: "s2", severity: 0.3, category: "compute" }),
  makeShock({ id: "s3", severity: 0.45, category: "geopolitical" }),
  makeShock({ id: "s4", severity: 0.35, category: "energy" }),
  makeShock({ id: "s5", severity: 0.2, category: "cooling" }),
  makeShock({ id: "s6", severity: 0.3, category: "supply" }),
  makeShock({ id: "s7", severity: 0.55, category: "energy" }),
];
