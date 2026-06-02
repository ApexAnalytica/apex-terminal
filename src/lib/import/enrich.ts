import { CausalNode, CausalEdge, DEFAULT_OMEGA_WEIGHTS, OmegaPillarWeights } from "@/lib/types";
import { weightedComposite } from "@/lib/omega-weighting";

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
 * Jeremy's 5-pillar framework: I, R, J, C, T
 * Only overwrites sub-scores that are still at the 5.0 default.
 *
 * Module mapping:
 *   I (Irreplaceability)     → Pearl counterfactual: "what if we substitute this node?"
 *   R (Restoration Latency)  → Pearl counterfactual: "how long until system recovers?"
 *   J (Jurisdictional Hazard) → Tarski: validates geopolitical constraint claims
 *   C (Cascade Load)         → Spirtes topology + Pareto simulation depth
 *   T (Tail Depth)           → Pareto: tail statistics from cascade simulation
 */
function computeOmegaScores(
  nodes: CausalNode[],
  edges: CausalEdge[],
  weights: OmegaPillarWeights = DEFAULT_OMEGA_WEIGHTS,
): CausalNode[] {
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

  // Build domain size map and count unique domains depending on each node
  const domainGroups = new Map<string, string[]>();
  for (const node of nodes) {
    if (!domainGroups.has(node.domain)) domainGroups.set(node.domain, []);
    domainGroups.get(node.domain)!.push(node.id);
  }

  const nodeDomain = new Map<string, string>();
  for (const node of nodes) {
    nodeDomain.set(node.id, node.domain);
  }

  const dependentDomains = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!dependentDomains.has(edge.target)) dependentDomains.set(edge.target, new Set());
    const srcDomain = nodeDomain.get(edge.source);
    if (srcDomain) dependentDomains.get(edge.target)!.add(srcDomain);
    if (!dependentDomains.has(edge.source)) dependentDomains.set(edge.source, new Set());
    const tgtDomain = nodeDomain.get(edge.target);
    if (tgtDomain) dependentDomains.get(edge.source)!.add(tgtDomain);
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  // Parse replacementTime string into a numeric score (0-10)
  function parseRestorationLatency(rt: string): number {
    if (!rt) return 5.0;
    const lower = rt.toLowerCase();
    if (lower.includes("non-substitutable") || lower.includes("non-reproducible") || lower.includes("systemic")) return 9.5;
    if (lower.includes("political") || lower.includes("no replacement") || lower.includes("no market")) return 9.0;
    // Extract first number (years)
    const match = lower.match(/(\d+)/);
    if (!match) return 5.0;
    const years = parseInt(match[1], 10);
    if (years >= 15) return 9.5;
    if (years >= 10) return 9.0;
    if (years >= 7) return 8.5;
    if (years >= 5) return 8.0;
    if (years >= 3) return 7.0;
    if (years >= 2) return 6.0;
    return 5.0;
  }

  // Heuristic jurisdictional hazard from category + concentration string
  function inferJurisdictionalHazard(node: CausalNode): number {
    let j = 3.0;
    const gc = node.globalConcentration?.toLowerCase() ?? "";
    const cat = node.category;

    // Geopolitical nodes inherently high J
    if (cat === "geopolitical") j += 5;
    // Finance nodes exposed to regulatory/sovereign risk
    else if (cat === "finance") j += 4;

    // Geographic concentration signals
    if (gc.includes("china") || gc.includes("baotou")) j += 3;
    else if (gc.includes("taiwan") || gc.includes("tsmc") || gc.includes("hsinchu")) j += 3;
    else if (gc.includes("russia") || gc.includes("belarus")) j += 2.5;
    else if (gc.includes("morocco")) j += 1.5;
    else if (gc.includes("middle east") || gc.includes("gulf")) j += 2;

    // Export control / sanctions keywords
    if (gc.includes("sanction") || gc.includes("export") || gc.includes("embargo")) j += 2;

    return clamp(j, 1, 10);
  }

  return nodes.map((node) => {
    const omega = { ...node.omegaFragility };
    const inDeg = inDegree.get(node.id) ?? 0;
    const outDeg = outDegree.get(node.id) ?? 0;
    const domainSize = domainGroups.get(node.domain)?.length ?? 1;
    const depDomainCount = dependentDomains.get(node.id)?.size ?? 0;

    // I — Irreplaceability: sole-source penalty + dependent domains
    if (isDefault(omega.irreplaceability)) {
      let score = 5.0;
      if (domainSize === 1) score += 2;
      score += depDomainCount;
      const gc = node.globalConcentration?.toLowerCase() ?? "";
      const pctMatch = gc.match(/(\d+)%/);
      const pctValue = pctMatch ? parseInt(pctMatch[1], 10) : 0;
      if (pctValue >= 90 || gc.includes("single-source") || gc.includes("100%")) score += 2;
      else if (pctValue >= 70) score += 1;
      omega.irreplaceability = clamp(score, 1, 10);
    }

    // R — Restoration Latency: parsed from replacementTime metadata
    if (isDefault(omega.restorationLatency)) {
      omega.restorationLatency = parseRestorationLatency(node.replacementTime);
    }

    // J — Jurisdictional Hazard: inferred from category + geography
    if (isDefault(omega.jurisdictionalHazard)) {
      omega.jurisdictionalHazard = inferJurisdictionalHazard(node);
    }

    // C — Cascade Load: downstream impact via topology (merges old downstreamLoad + cascadingVoltage)
    if (isDefault(omega.cascadeLoad)) {
      const downstream = Math.min(10, 2 + outDeg * 2);
      const connectivity = Math.min(10, 2 + (inDeg + outDeg) * 1.5);
      omega.cascadeLoad = clamp((downstream + connectivity) / 2, 1, 10);
    }

    // T — Tail Depth: concentration risk + domain scarcity
    if (isDefault(omega.tailDepth)) {
      let t = 3.0;
      const gc = node.globalConcentration?.toLowerCase() ?? "";
      const pctMatch = gc.match(/(\d+)%/);
      const pctValue = pctMatch ? parseInt(pctMatch[1], 10) : 0;
      if (pctValue >= 90 || gc.includes("single-source") || gc.includes("single source")) t += 3;
      else if (pctValue >= 70) t += 2;
      else if (pctValue >= 50) t += 1;
      if (domainSize <= 2) t += 2;
      omega.tailDepth = clamp(t, 1, 10);
    }

    // ΩF composite: configurable weighted average (shared formula —
    // see weightedComposite in omega-weighting.ts, also used by the
    // runtime profile recompute so the two can't diverge).
    if (isDefault(omega.composite)) {
      omega.composite = weightedComposite(omega, weights);
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

export function enrichGraph(
  nodes: CausalNode[],
  edges: CausalEdge[],
  weights: OmegaPillarWeights = DEFAULT_OMEGA_WEIGHTS,
): EnrichResult {
  // Normalize concentration values before scoring
  const normalizedNodes = normalizeConcentration(nodes);

  // Infer edges from shared attributes
  const { edges: inferredEdges, warnings } = inferEdges(normalizedNodes, edges);
  const allEdges = [...edges, ...inferredEdges];

  // Compute omega scores using full topology (original + inferred edges).
  // `weights` lets an import under a non-default profile score against that
  // profile's pillar weighting; defaults to the platform default so the
  // common import path is unchanged.
  const enrichedNodes = computeOmegaScores(normalizedNodes, allEdges, weights);

  return {
    nodes: enrichedNodes,
    edges: allEdges,
    warnings,
  };
}
