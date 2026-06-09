// Inferred latent-node derivation — Dr. Pita's "synthetic node" #1.
//
// A `confounded` edge asserts that its two endpoints share an *unobserved*
// common cause (latent confounder; the FCI bidirected ↔ made concrete). When
// several confounded edges share endpoints, the honest reading is that one
// hidden factor drives the whole cluster. This module surfaces that factor as
// an INFERRED LATENT node so the analyst can see "you're missing a measurement
// here" rather than having to read it off a tangle of dashed edges.
//
// Design guarantees (see LatentNode in types.ts):
//   - PURE + ON-DEMAND. Latent nodes are computed from the graph, never stored
//     on it, so they cannot enter cascade sim, ΩF, or the ΩSF/ΩSX/contagion
//     system metrics. Read-only annotation only.
//   - NODE-OVER-EDGE RULE. A cluster is promoted to a latent node only when it
//     is the common cause of MIN_LATENT_MEMBERS (3) or more observed nodes; a
//     pairwise hidden cause stays the dashed edge it already is.
//   - HYPOTHESIS FRAMING. The label never asserts what the latent *is* — it's a
//     prompt for investigation, disclosed as inferred at the render layer.

import type { CausalGraph, CausalNode, LatentNode } from "./types";

/** Minimum observed nodes a latent must explain to earn promotion from an edge. */
export const MIN_LATENT_MEMBERS = 3;

/** Min aligned observations between two members to compute a correlation. */
export const SUPPORT_MIN_ALIGNED = 8;
/** |mean pairwise r| at/above which the live data is judged to SUPPORT the
 *  shared-driver hypothesis. (Adjustable.) */
export const SUPPORT_R_THRESHOLD = 0.4;

/**
 * Date→value series for a node from its primary live signal (history +
 * current point), keyed by ISO date (yyyy-mm-dd) for cross-member alignment.
 * Returns null if the node carries no usable live history. Pure.
 */
function liveSeries(node: CausalNode): Map<string, number> | null {
  const p = (node.liveData ?? []).find(
    (d) => typeof d.value === "number" && (d.history?.length ?? 0) > 0,
  );
  if (!p) return null;
  const series = new Map<string, number>();
  for (const h of p.history ?? []) {
    if (typeof h.value === "number" && h.observedAt) {
      series.set(h.observedAt.slice(0, 10), h.value);
    }
  }
  if (p.observedAt) series.set(p.observedAt.slice(0, 10), p.value);
  return series.size > 0 ? series : null;
}

/** Pearson correlation over paired samples; null if degenerate. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Consistency check, NOT a discovery claim: do the member nodes that carry
 * live time-series actually co-move, as a shared hidden driver would predict?
 * Mean pairwise Pearson correlation over date-aligned member series. Pure —
 * reads node `liveData` only, never mutates.
 */
export function computeLatentSupport(
  memberIds: string[],
  graph: CausalGraph,
): NonNullable<LatentNode["dataSupport"]> {
  const seriesById = new Map<string, Map<string, number>>();
  for (const id of memberIds) {
    const node = graph.nodes.find((n) => n.id === id);
    const s = node ? liveSeries(node) : null;
    if (s) seriesById.set(id, s);
  }
  const liveMembers = seriesById.size;
  if (liveMembers < 2) {
    return { status: "insufficient", liveMembers, method: "pairwise-correlation" };
  }
  const ids = [...seriesById.keys()];
  const rs: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = seriesById.get(ids[i])!;
      const b = seriesById.get(ids[j])!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [date, v] of a) {
        const bv = b.get(date);
        if (bv !== undefined) { xs.push(v); ys.push(bv); }
      }
      if (xs.length >= SUPPORT_MIN_ALIGNED) {
        const r = pearson(xs, ys);
        if (r !== null) rs.push(r);
      }
    }
  }
  if (rs.length === 0) {
    return { status: "insufficient", liveMembers, method: "pairwise-correlation" };
  }
  const meanR = Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 100) / 100;
  return {
    status: meanR >= SUPPORT_R_THRESHOLD ? "supported" : "inconsistent",
    statistic: meanR,
    method: "pairwise-correlation",
    liveMembers,
  };
}

export function deriveLatentNodes(graph: CausalGraph): LatentNode[] {
  // Each confounded (non-severed) edge = "these two observed nodes share a
  // latent common cause."
  const confounded = graph.edges.filter(
    (e) => e.type === "confounded" && !e.isSevered,
  );
  if (confounded.length === 0) return [];

  // Undirected adjacency over the confounded endpoints.
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  };
  for (const e of confounded) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  // Connected components (BFS) — each is one candidate hidden factor.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const v = queue.shift()!;
      comp.push(v);
      for (const w of adj.get(v) ?? []) {
        if (!seen.has(w)) {
          seen.add(w);
          queue.push(w);
        }
      }
    }
    components.push(comp);
  }

  const shortLabelOf = new Map(
    graph.nodes.map((n) => [n.id, n.shortLabel || n.label || n.id]),
  );

  const latents: LatentNode[] = [];
  for (const comp of components) {
    if (comp.length < MIN_LATENT_MEMBERS) continue; // node-over-edge rule

    const members = [...comp].sort();
    const memberSet = new Set(members);
    const internal = confounded.filter(
      (e) => memberSet.has(e.source) && memberSet.has(e.target),
    );
    const strength =
      internal.length > 0
        ? Math.round(
            (internal.reduce((s, e) => s + e.confidence, 0) / internal.length) *
              100,
          ) / 100
        : 0;

    // Hub = the most-confounded member; used only to make the hypothesis
    // label legible ("...behind <hub> + N more"), not as an assertion.
    let hub = members[0];
    let hubDeg = -1;
    for (const m of members) {
      const deg = adj.get(m)?.size ?? 0;
      if (deg > hubDeg) {
        hubDeg = deg;
        hub = m;
      }
    }

    // Hypothesised channel — the author-stated mechanism of the strongest
    // internal confounded edge, surfaced verbatim (not an empirically named
    // variable; it's the channel the graph author asserted).
    const driverEdge = internal
      .filter((e) => (e.physicalMechanism ?? "").trim().length > 0)
      .sort((a, b) => b.confidence - a.confidence)[0];

    latents.push({
      id: `latent__${members[0]}`,
      explains: members,
      method: "confounded-cluster",
      strength,
      label: `Inferred common cause of ${shortLabelOf.get(hub) ?? hub} + ${members.length - 1} more`,
      hypothesizedDriver: driverEdge?.physicalMechanism,
      // Real-data consistency check (NOT discovery): do the live members co-move?
      dataSupport: computeLatentSupport(members, graph),
    });
  }

  return latents;
}
