// ─── Calculations registry ────────────────────────────────────────────
//
// Single ordered array of every calculation Manifold exposes. Adding
// a new calculation = appending an entry. Categories ordered so
// concentration (node-scoped, requires selection) appears first
// when relevant, then structural and scoring measures that always
// apply.
//
// Future entries: financial Greeks (delta/gamma/vega over a domain
// slice), T1D risk scores (β-cell mass · HbA1c trajectory), supply-
// chain criticality variants. All conform to the `Calculation`
// interface and require zero changes to the panel renderer.

import type { Calculation, CalculationContext } from "./types";
import { hhiCalculation } from "./hhi";
import { giniCalculation } from "./gini";
import { outdegreeHhiCalculation } from "./outdegree-hhi";
import { crossDomainEdgesCalculation } from "./cross-domain-edges";
import { edgeDensityCalculation } from "./edge-density";
import { cycleCountCalculation } from "./cycle-count";
import { bridgeRatioCalculation } from "./bridge-ratio";
import { meanOmegaCalculation } from "./mean-omega";
import { meanJurisdictionalHazardCalculation } from "./mean-jurisdictional-hazard";

export const CALCULATION_REGISTRY: Calculation[] = [
  // Node-scoped concentration measures — surface first when a node is
  // selected so they're paired in the visual scan. HHI and Gini answer
  // subtly different concentration questions: HHI flags a dominant
  // supplier (quadratic top weight); Gini flags broad inequality
  // (mean pairwise difference).
  hhiCalculation,
  giniCalculation,
  outdegreeHhiCalculation,
  // Graph-wide structural measures.
  crossDomainEdgesCalculation,
  edgeDensityCalculation,
  cycleCountCalculation,
  bridgeRatioCalculation,
  // Graph-wide scores (composite + isolated pillar).
  meanOmegaCalculation,
  meanJurisdictionalHazardCalculation,
];

/** Filter the registry to entries whose `appliesWhen` predicate
 *  passes for the given context. Stable order preserved. */
export function availableCalculations(
  ctx: CalculationContext,
): Calculation[] {
  return CALCULATION_REGISTRY.filter((c) => c.appliesWhen(ctx));
}

export type { Calculation, CalculationContext } from "./types";
