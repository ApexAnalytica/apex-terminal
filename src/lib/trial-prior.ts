// ─── Trial-Grounded Prior ────────────────────────────────────────────
//
// A minimal interface for dataset-specific analysis panels (VX-880 today,
// other flagship subgraphs later) to publish a parametric readout that
// downstream Pearl-stage computations — notably the Monte Carlo forecast
// — can consume as a prior.
//
// The shape is deliberately narrow: a single Cox-style treatment-effect
// log-hazard-ratio `beta` with its standard error `se`, a tagged outcome
// node in the active causal graph, and a baseline per-epoch hazard for
// that outcome in the control arm. That's enough for the MC engine to
// draw β* ~ N(β, SE²) per path, attenuate it by cascade attack on the
// outcome, and produce a survival trajectory S(t) alongside the existing
// Ω-buffer fan chart — which turns the fan chart into a literature-
// calibrated "P(event by t)" curve that visibly responds to interdiction
// cuts and estimator uncertainty.
//
// Keeping the type graph-agnostic (just an `outcomeNodeId` string) means
// the MC engine never has to know about VX-880 specifically; any future
// trial panel can publish its own prior and the same machinery lights up.

export interface TrialPrior {
  /** Human-readable label for UI ("VX-880 insulin independence"). */
  label: string;
  /**
   * Log hazard ratio for the treatment effect (β from a Cox fit).
   * Positive β means treatment raises the hazard of the *desirable*
   * outcome event (e.g. sustained insulin independence).
   */
  beta: number;
  /** Standard error on β. Feeds the MC fan width. */
  se: number;
  /**
   * Id of the causal-graph node that represents the outcome event.
   * The MC engine watches this node's cascade intensity to attenuate
   * the treatment effect — when the cascade reaches the outcome,
   * the treatment effect is washed out.
   */
  outcomeNodeId: string;
  /**
   * Baseline hazard in the control arm, per MC epoch. Calibrated so
   * that `1 - exp(-baselineHazardPerEpoch * horizonEpochs)` matches
   * the published control-arm event rate at the reporting horizon.
   */
  baselineHazardPerEpoch: number;
  /**
   * Optional per-year β-cell decay rate (NLME `k`) and its between-
   * subject SD (τ_k). Not consumed by the MC today but kept on the
   * prior so a future wiring can modulate graft-node forgetting
   * without reshaping this interface.
   */
  popK?: number;
  tauK?: number;
  /** Source citation for the prior — shown in the fan-chart legend. */
  source: string;
}
