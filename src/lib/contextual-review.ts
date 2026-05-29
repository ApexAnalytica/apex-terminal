// ─── Contextual Review ─────────────────────────────────────────────
//
// Pure function that synthesises 1-3 verb-led recommendations for a
// selected node. Drives the "REVIEW" block at the top of NodeInspector
// so the user, on selecting a node, immediately sees what's worth
// looking at *about this specific node* — not generic graph-wide
// callouts.
//
// Signals consulted (in urgency order):
//   1. Tarski axiom hits on incident edges (red)
//   2. Confounder warning (amber)
//   3. Cascade saturation (red ≥9, amber ≥7)
//   4. ΩF velocity over the temporal window (amber if |Δ| ≥ 1.5)
//   5. Incident unpromoted auto-bridges (amber)
//   6. χ★ load-bearing membership (green — informational, not urgent)
//
// Cap at 3 recommendations. Tone ordering (red → amber → green) is
// applied after collection so the most urgent surface first.

import type { CausalGraph, CausalNode } from "./types";
import type { TarskiValidationReport } from "./tarski-flags";
import type { NodeTemporalState } from "./temporal-data";

export type ReviewTone = "red" | "amber" | "green";

export interface ReviewRecommendation {
  /** Short verb-led phrase (e.g. "Review A-04 flags"). Bold-rendered. */
  title: string;
  /** Supporting clause that explains the signal. */
  detail: string;
  tone: ReviewTone;
}

export interface ContextualReviewInputs {
  node: CausalNode;
  graph: Pick<CausalGraph, "edges">;
  tarskiReport: TarskiValidationReport | null;
  history: NodeTemporalState[];
  /** χ★ set ids — pass empty Set if not computed. */
  chiStarSet: Set<string>;
}

const TONE_RANK: Record<ReviewTone, number> = { red: 0, amber: 1, green: 2 };

export function buildContextualReview(
  inputs: ContextualReviewInputs,
): ReviewRecommendation[] {
  const { node, graph, tarskiReport, history, chiStarSet } = inputs;
  const out: ReviewRecommendation[] = [];

  // Incident edges — both directions, ignoring severed.
  const incidentEdges = graph.edges.filter(
    (e) => !e.isSevered && (e.source === node.id || e.target === node.id),
  );
  const incidentEdgeIds = new Set(incidentEdges.map((e) => e.id));

  // ── 1. Tarski axiom hits on incident edges ──
  if (tarskiReport) {
    const hitsByAxiom = new Map<string, number>();
    for (const trace of tarskiReport.proofTraces) {
      if (!incidentEdgeIds.has(trace.edgeId)) continue;
      for (const axiomId of trace.violatedAxioms) {
        hitsByAxiom.set(axiomId, (hitsByAxiom.get(axiomId) ?? 0) + 1);
      }
    }
    if (hitsByAxiom.size > 0) {
      const total = Array.from(hitsByAxiom.values()).reduce((a, b) => a + b, 0);
      const axiomList = Array.from(hitsByAxiom.keys()).sort().join(" · ");
      out.push({
        title: `Review ${axiomList}`,
        detail: `${total} flag${total > 1 ? "s" : ""} on incident edge${
          total > 1 ? "s" : ""
        } — open EdgeInspector to inspect`,
        tone: "red",
      });
    }
  }

  // ── 2. Confounder warning ──
  if (node.isConfounded) {
    out.push({
      title: "Investigate hidden confounder",
      detail:
        "FCI suspects a common cause; consider re-running discovery with a finer cohort",
      tone: "amber",
    });
  }

  // ── 3. Cascade saturation ──
  const cVal = node.omegaFragility.cascadeLoad;
  if (cVal >= 9) {
    out.push({
      title: "Run CASCADE DEFENSE",
      detail: `Cascade load saturated at ${cVal.toFixed(
        1,
      )} — propagation imminent on incident edges`,
      tone: "red",
    });
  } else if (cVal >= 7) {
    out.push({
      title: "Watch cascade load",
      detail: `Elevated at ${cVal.toFixed(1)} — track inbound shocks`,
      tone: "amber",
    });
  }

  // ── 4. ΩF velocity over the temporal window ──
  if (history.length >= 2) {
    const first = history[0].omegaComposite;
    const last = history[history.length - 1].omegaComposite;
    const delta = last - first;
    if (Math.abs(delta) >= 1.5) {
      const direction = delta > 0 ? "climbed" : "fell";
      const sign = delta > 0 ? "+" : "";
      out.push({
        title: "Watch ΩF velocity",
        detail: `${direction} ${sign}${delta.toFixed(1)} over ${
          history.length
        } steps — now ${last.toFixed(1)}`,
        tone: delta > 0 ? "amber" : "green",
      });
    }
  }

  // ── 5. Incident unpromoted auto-bridges ──
  const unpromotedBridges = incidentEdges.filter(
    (e) =>
      e.id.startsWith("auto-bridge") &&
      !(e.physicalMechanism?.startsWith("promoted bridge:") ?? false),
  );
  if (unpromotedBridges.length > 0) {
    out.push({
      title: "Promote bridges",
      detail: `${unpromotedBridges.length} unverified cross-domain edge${
        unpromotedBridges.length > 1 ? "s" : ""
      } anchor this node — click an edge → PROMOTE`,
      tone: "amber",
    });
  }

  // ── 6. χ★ load-bearing membership ──
  const chiStarIncident = incidentEdges.filter((e) => chiStarSet.has(e.id));
  if (chiStarIncident.length >= 2) {
    out.push({
      title: "Preserve in interventions",
      detail: `${chiStarIncident.length} of ${incidentEdges.length} edges sit on χ★ — load-bearing skeleton`,
      tone: "green",
    });
  }

  // Urgency ordering: red → amber → green, stable within tone.
  out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);

  return out.slice(0, 3);
}
