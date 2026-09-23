// ΩF composite weighting — the single place that turns the five pillar
// scores into the headline composite, and the only place that applies a
// domain profile's per-pillar weighting to a graph at display time.
//
// Why this module exists:
//   - Built-in graphs hand-author `omegaFragility.composite` as a literal
//     (graph-data.ts etc.). Those literals were tuned against the DEFAULT
//     weighting, so Geopolitical/T1D (`compositeMode: "authored"`) keep
//     them untouched.
//   - AI-Safety has no nodes of its own — the `ai-safety-ids` card overlays
//     the `main` graph (domains.ts). The only way its cascade+tail skew can
//     reach the score is to RE-DERIVE composite from the borrowed pillars
//     under AI-Safety's weights. That's `compositeMode: "recomputed"`.
//
// Recompute happens ONCE, at graph-build time (see build-domain-graph.ts),
// so every downstream consumer of `omegaFragility.composite` (CDΩ header,
// inspector, 2D/3D/Map/Relief geometry, interdiction, Pareto, copilot) picks
// up the reweighted value with no per-consumer changes.

import type { CausalGraph, OmegaFragilityProfile, OmegaPillarWeights } from "./types";
import type { DomainProfile } from "./domain-profiles";

/** Just the five pillar scores — the inputs to a composite. */
type Pillars = Pick<
  OmegaFragilityProfile,
  | "irreplaceability"
  | "restorationLatency"
  | "jurisdictionalHazard"
  | "cascadeLoad"
  | "tailDepth"
>;

/**
 * Weighted aggregation of the five pillars, rounded to one decimal.
 *
 * This is the canonical composite formula — extracted verbatim from the
 * import-path scorer (enrich.ts) so the import path and the runtime
 * recompute can never disagree on the math. `weights` is assumed to sum to
 * 1.0 (enforced by the profile definitions + a unit test); no
 * re-normalisation is applied, matching the original behaviour.
 */
export function weightedComposite(p: Pillars, w: OmegaPillarWeights): number {
  return (
    Math.round(
      (w.irreplaceability * p.irreplaceability +
        w.restorationLatency * p.restorationLatency +
        w.jurisdictionalHazard * p.jurisdictionalHazard +
        w.cascadeLoad * p.cascadeLoad +
        w.tailDepth * p.tailDepth) *
        10,
    ) / 10
  );
}

/**
 * Apply a domain profile's pillar weighting to every node's composite.
 *
 *   - `compositeMode === "authored"` → returns the graph UNCHANGED. The
 *     hand-authored / default-weighted composites stay the source of truth.
 *   - `compositeMode === "recomputed"` → returns a new graph whose nodes'
 *     `composite` is re-derived from their pillars under `profile.weights`,
 *     with the prior value preserved in `baselineComposite` for audit
 *     (so the inspector can show "reweighted from X.X").
 *
 * Idempotent: re-running preserves the FIRST-seen baseline (via
 * `baselineComposite ?? composite`), so a double apply on the same graph
 * doesn't lose the original authored value.
 */
export function recomputeComposite(
  graph: CausalGraph,
  profile: DomainProfile,
): CausalGraph {
  if (profile.compositeMode !== "recomputed") return graph;

  const nodes = graph.nodes.map((node) => {
    const omega = node.omegaFragility;
    const baseline = omega.baselineComposite ?? omega.composite;
    const composite = weightedComposite(omega, profile.weights);
    return {
      ...node,
      omegaFragility: {
        ...omega,
        composite,
        baselineComposite: baseline,
      },
    };
  });

  return { ...graph, nodes };
}
