import { CausalNode, CausalEdge } from "@/lib/types";

interface EnrichResult {
  nodes: CausalNode[];
  edges: CausalEdge[];
  warnings: string[];
}

/**
 * Infer directed edges from shared node attributes (domain, category).
 * Within each domain group: chain nodes sequentially.
 * Across domain groups: connect nodes sharing a category.
 */
function inferEdges(nodes: CausalNode[], edges: CausalEdge[]): { edges: CausalEdge[]; warnings: string[] } {
  const warnings: string[] = [];
  const newEdges: CausalEdge[] = [];

  // Build set of existing edge pairs for dedup
  const existingPairs = new Set<string>();
  for (const e of edges) {
    existingPairs.add(`${e.source}->${e.target}`);
  }

  let edgeIndex = edges.length;

  function addEdge(source: string, target: string, weight: number, confidence: number, mechanism: string): void {
    const key = `${source}->${target}`;
    if (existingPairs.has(key)) return;
    existingPairs.add(key);
    newEdges.push({
      id: `inferred_edge_${edgeIndex++}`,
      source,
      target,
      weight,
      lag: 0,
      type: "directed",
      confidence,
      isInconsistent: false,
      physicalMechanism: mechanism,
    });
  }

  // 1. Group nodes by domain → chain within each group
  const domainGroups = new Map<string, CausalNode[]>();
  for (const node of nodes) {
    const d = node.domain;
    if (!d || d === "Imported") continue; // skip default/unresolved domains
    if (!domainGroups.has(d)) domainGroups.set(d, []);
    domainGroups.get(d)!.push(node);
  }

  for (const [domain, group] of domainGroups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i++) {
      addEdge(group[i].id, group[i + 1].id, 0.7, 0.5, `co-located in ${domain}`);
    }
  }

  // 2. Cross-domain: connect nodes sharing the same category
  const categoryGroups = new Map<string, CausalNode[]>();
  for (const node of nodes) {
    const c = node.category;
    if (!categoryGroups.has(c)) categoryGroups.set(c, []);
    categoryGroups.get(c)!.push(node);
  }

  for (const [category, group] of categoryGroups) {
    // Only connect nodes from different domains
    const byDomain = new Map<string, CausalNode[]>();
    for (const node of group) {
      if (!byDomain.has(node.domain)) byDomain.set(node.domain, []);
      byDomain.get(node.domain)!.push(node);
    }
    const domains = [...byDomain.keys()];
    if (domains.length < 2) continue;

    // Connect first node of each domain to first node of next domain
    for (let i = 0; i < domains.length - 1; i++) {
      const srcNode = byDomain.get(domains[i])![0];
      const tgtNode = byDomain.get(domains[i + 1])![0];
      addEdge(srcNode.id, tgtNode.id, 0.5, 0.4, `cross-domain ${category} dependency`);
    }
  }

  if (newEdges.length > 0) {
    warnings.push(
      `Auto-inferred ${newEdges.length} edges from shared attributes (domain/category). These are structural hypotheses — verify with domain expertise.`
    );
  }

  return { edges: newEdges, warnings };
}

const DEFAULT_OMEGA_VALUE = 5.0;

function isDefault(v: number): boolean {
  return v === DEFAULT_OMEGA_VALUE;
}

/**
 * Compute heuristic Ω-Fragility scores from topology + metadata.
 * Only overwrites sub-scores that are still at the 5.0 default.
 */
function computeOmegaScores(nodes: CausalNode[], edges: CausalEdge[]): CausalNode[] {
  // Build degree maps
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Build domain size map and count unique domains depending on each node (via incoming edges)
  const domainGroups = new Map<string, string[]>();
  for (const node of nodes) {
    if (!domainGroups.has(node.domain)) domainGroups.set(node.domain, []);
    domainGroups.get(node.domain)!.push(node.id);
  }

  // Map node id → domain for quick lookup
  const nodeDomain = new Map<string, string>();
  for (const node of nodes) {
    nodeDomain.set(node.id, node.domain);
  }

  // For each node, count unique domains that depend on it (via incoming edges to that node = sources)
  const dependentDomains = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!dependentDomains.has(edge.target)) dependentDomains.set(edge.target, new Set());
    const srcDomain = nodeDomain.get(edge.source);
    if (srcDomain) dependentDomains.get(edge.target)!.add(srcDomain);
    // Also count for source (nodes that it feeds into)
    if (!dependentDomains.has(edge.source)) dependentDomains.set(edge.source, new Set());
    const tgtDomain = nodeDomain.get(edge.target);
    if (tgtDomain) dependentDomains.get(edge.source)!.add(tgtDomain);
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  return nodes.map((node) => {
    const omega = { ...node.omegaFragility };
    const inDeg = inDegree.get(node.id) ?? 0;
    const outDeg = outDegree.get(node.id) ?? 0;
    const domainSize = domainGroups.get(node.domain)?.length ?? 1;
    const depDomainCount = dependentDomains.get(node.id)?.size ?? 0;

    // substitutionFriction: sole-source penalty + dependent domains
    if (isDefault(omega.substitutionFriction)) {
      let sf = 5.0;
      if (domainSize === 1) sf += 2; // sole source in domain
      sf += depDomainCount; // +1 per unique domain depending on it
      omega.substitutionFriction = clamp(sf, 1, 10);
    }

    // downstreamLoad: more outgoing edges = more downstream dependents
    if (isDefault(omega.downstreamLoad)) {
      omega.downstreamLoad = clamp(Math.min(10, 2 + outDeg * 2), 1, 10);
    }

    // cascadingVoltage: total connectivity drives nonlinear propagation
    if (isDefault(omega.cascadingVoltage)) {
      omega.cascadingVoltage = clamp(Math.min(10, 2 + (inDeg + outDeg) * 1.5), 1, 10);
    }

    // existentialTailWeight: concentration risk
    if (isDefault(omega.existentialTailWeight)) {
      let etw = 3.0;
      const gc = node.globalConcentration?.toLowerCase() ?? "";
      // Check for high concentration (>90%, "single-source", or "XX% concentration" where XX >= 90)
      const pctMatch = gc.match(/(\d+)%/);
      const pctValue = pctMatch ? parseInt(pctMatch[1], 10) : 0;
      if (pctValue >= 90 || gc.includes("single-source") || gc.includes("single source")) {
        etw += 3;
      } else if (pctValue >= 70) {
        etw += 2;
      } else if (pctValue >= 50) {
        etw += 1;
      }
      if (domainSize <= 2) etw += 2;
      omega.existentialTailWeight = clamp(etw, 1, 10);
    }

    // composite: weighted average (only if still default)
    if (isDefault(omega.composite)) {
      omega.composite = Math.round(
        (0.25 * omega.substitutionFriction +
          0.25 * omega.downstreamLoad +
          0.25 * omega.cascadingVoltage +
          0.25 * omega.existentialTailWeight) * 10
      ) / 10;
    }

    return { ...node, omegaFragility: omega };
  });
}

/**
 * Post-import enrichment: infer edges and compute omega scores.
 * Runs after validation/defaults, before merge.
 */
/**
 * Normalize globalConcentration: convert raw numbers (0.69) to readable strings ("69% concentration").
 */
function normalizeConcentration(nodes: CausalNode[]): CausalNode[] {
  return nodes.map((node) => {
    const gc = node.globalConcentration;
    if (gc === "Unknown" || gc == null) return node;

    // If it's a number-like string (e.g. "0.69" or "69"), convert to percentage
    const num = Number(gc);
    if (!isNaN(num) && gc !== "") {
      const pct = num <= 1 ? Math.round(num * 100) : Math.round(num);
      return { ...node, globalConcentration: `${pct}% concentration` };
    }
    return node;
  });
}

export function enrichGraph(nodes: CausalNode[], edges: CausalEdge[]): EnrichResult {
  // Normalize concentration values before scoring
  const normalizedNodes = normalizeConcentration(nodes);

  // Infer edges from shared attributes
  const { edges: inferredEdges, warnings } = inferEdges(normalizedNodes, edges);
  const allEdges = [...edges, ...inferredEdges];

  // Compute omega scores using full topology (original + inferred edges)
  const enrichedNodes = computeOmegaScores(normalizedNodes, allEdges);

  return {
    nodes: enrichedNodes,
    edges: allEdges,
    warnings,
  };
}
