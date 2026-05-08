import type { CausalNode, CausalEdge } from "./types";

// ─── Community Detection (Modularity-Greedy / Louvain Phase 1) ──
//
// Owner: SPIRTES session.
//
// Replaces the prior "domain regrouping" implementation in ModulePanel
// which mislabelled `node.domain` as community structure. This is
// modularity-optimization on the actual edge topology, so emergent
// communities can — and often do — diverge from the curator-assigned
// domain partition. Cross-domain communities flag candidate contagion
// pathways the hand-coded domain partition does not surface.
//
// Algorithm: Louvain phase 1 (local moves only — no super-node
// aggregation phase). Each node iteratively considers moving to a
// neighbor's community and commits the move with the largest positive
// modularity gain ΔQ. Repeats until no node moves or `MAX_ITERATIONS`.
// Output is deterministic: nodes are processed in sorted-id order, ties
// in ΔQ resolve toward the lex-smallest community id.
//
// The classic Newman modularity for an undirected graph:
//   Q = (1/2m) Σ_ij [A_ij - k_i*k_j/(2m)] · δ(c_i, c_j)
// The local-move ΔQ formula used here (single node moving into community C):
//   ΔQ = (k_i_in / m) - (k_i * Σ_tot_C) / (2 m^2)
// where k_i_in = sum of edges from node i into community C, Σ_tot_C =
// sum of degrees of nodes in C (excluding i if it was already in C).

export interface CommunitySummary {
  id: string;
  size: number;
  members: string[];
  dominantDomain: string;
  domainCount: number;
  crossesDomains: boolean;
}

export interface CommunityDetectionResult {
  membership: Map<string, string>;
  communities: CommunitySummary[];
  modularityProxy: number;
  iterations: number;
  converged: boolean;
}

const MAX_ITERATIONS = 20;

export function detectCommunities(
  nodes: CausalNode[],
  edges: CausalEdge[],
): CommunityDetectionResult {
  if (nodes.length === 0) {
    return {
      membership: new Map(),
      communities: [],
      modularityProxy: 0,
      iterations: 0,
      converged: true,
    };
  }

  const sortedIds = nodes.map((n) => n.id).slice().sort();
  const idSet = new Set(sortedIds);

  // Build undirected adjacency (multigraph-collapsed).
  const adj = new Map<string, Map<string, number>>();
  sortedIds.forEach((id) => adj.set(id, new Map()));
  edges.forEach((e) => {
    if (!idSet.has(e.source) || !idSet.has(e.target)) return;
    if (e.source === e.target) return;
    const a = adj.get(e.source)!;
    const b = adj.get(e.target)!;
    a.set(e.target, (a.get(e.target) ?? 0) + 1);
    b.set(e.source, (b.get(e.source) ?? 0) + 1);
  });

  const degree = new Map<string, number>();
  let totalDegree = 0;
  sortedIds.forEach((id) => {
    let d = 0;
    adj.get(id)!.forEach((w) => (d += w));
    degree.set(id, d);
    totalDegree += d;
  });
  const m = totalDegree / 2;

  // membership[node] = community id; communityDegreeSum[c] = Σ degrees of members.
  const membership = new Map<string, string>();
  const communityDegreeSum = new Map<string, number>();
  sortedIds.forEach((id) => {
    membership.set(id, id);
    communityDegreeSum.set(id, degree.get(id) ?? 0);
  });

  if (m === 0) {
    return finalize(nodes, sortedIds, membership, edges, 0, true);
  }

  let iter = 0;
  let converged = false;
  for (; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (const id of sortedIds) {
      const own = membership.get(id)!;
      const k_i = degree.get(id) ?? 0;
      const neighbors = adj.get(id)!;

      // Tally edge weight from node i into each candidate community
      // (current community contribution excludes the node itself).
      const weightsToCommunity = new Map<string, number>();
      neighbors.forEach((w, nbr) => {
        const c = membership.get(nbr)!;
        weightsToCommunity.set(c, (weightsToCommunity.get(c) ?? 0) + w);
      });

      // Remove i from its current community for the purpose of evaluation.
      const ownTotalMinusI = (communityDegreeSum.get(own) ?? 0) - k_i;
      const ownInternalToI = weightsToCommunity.get(own) ?? 0;

      // ΔQ of staying = 0 (baseline). Compute ΔQ of moving to each candidate.
      let bestCommunity = own;
      let bestGain = 0;
      const sortedCandidates = [...weightsToCommunity.keys()].sort();
      for (const c of sortedCandidates) {
        if (c === own) continue;
        const k_i_in = weightsToCommunity.get(c) ?? 0;
        const sigmaTot = communityDegreeSum.get(c) ?? 0;
        // ΔQ of moving i out of own and into c:
        //   gain_in  = (k_i_in / m)        - (k_i * sigmaTot)         / (2 m^2)
        //   loss_out = (ownInternalToI / m) - (k_i * ownTotalMinusI) / (2 m^2)
        // Net ΔQ = gain_in - loss_out.
        const gainIn = k_i_in / m - (k_i * sigmaTot) / (2 * m * m);
        const lossOut =
          ownInternalToI / m - (k_i * ownTotalMinusI) / (2 * m * m);
        const delta = gainIn - lossOut;
        if (delta > bestGain + 1e-12) {
          bestGain = delta;
          bestCommunity = c;
        }
      }

      if (bestCommunity !== own) {
        membership.set(id, bestCommunity);
        communityDegreeSum.set(own, ownTotalMinusI);
        communityDegreeSum.set(
          bestCommunity,
          (communityDegreeSum.get(bestCommunity) ?? 0) + k_i,
        );
        changed = true;
      }
    }
    if (!changed) {
      converged = true;
      iter++;
      break;
    }
  }

  return finalize(nodes, sortedIds, membership, edges, iter, converged);
}

function finalize(
  nodes: CausalNode[],
  sortedIds: string[],
  membership: Map<string, string>,
  edges: CausalEdge[],
  iterations: number,
  converged: boolean,
): CommunityDetectionResult {
  const groups = new Map<string, string[]>();
  for (const id of sortedIds) {
    const lbl = membership.get(id)!;
    if (!groups.has(lbl)) groups.set(lbl, []);
    groups.get(lbl)!.push(id);
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const communities: CommunitySummary[] = [];
  for (const [groupId, members] of groups) {
    const domainCounts = new Map<string, number>();
    members.forEach((mid) => {
      const dom = nodeById.get(mid)?.domain ?? "unknown";
      domainCounts.set(dom, (domainCounts.get(dom) ?? 0) + 1);
    });
    const dominant = [...domainCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    communities.push({
      id: groupId,
      size: members.length,
      members: members.slice().sort(),
      dominantDomain: dominant?.[0] ?? "unknown",
      domainCount: domainCounts.size,
      crossesDomains: domainCounts.size > 1,
    });
  }
  communities.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));

  let intra = 0;
  let totalCounted = 0;
  edges.forEach((e) => {
    if (membership.has(e.source) && membership.has(e.target) && e.source !== e.target) {
      totalCounted++;
      if (membership.get(e.source) === membership.get(e.target)) intra++;
    }
  });
  const modularityProxy = totalCounted > 0 ? intra / totalCounted : 0;

  return { membership, communities, modularityProxy, iterations, converged };
}
