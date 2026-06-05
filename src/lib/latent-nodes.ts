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

import type { CausalGraph, LatentNode } from "./types";

/** Minimum observed nodes a latent must explain to earn promotion from an edge. */
export const MIN_LATENT_MEMBERS = 3;

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

    latents.push({
      id: `latent__${members[0]}`,
      explains: members,
      method: "confounded-cluster",
      strength,
      label: `Inferred common cause of ${shortLabelOf.get(hub) ?? hub} + ${members.length - 1} more`,
    });
  }

  return latents;
}
