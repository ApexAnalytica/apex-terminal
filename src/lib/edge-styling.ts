import type { CausalEdge } from "./types";

/**
 * Cross-view edge appearance — color, dash, width.
 *
 * The 3D view (`DAGEdge3D.tsx`) is the canonical source of truth for these
 * conventions. This helper exists so the MAP view can mirror them without
 * each surface drifting independently. 2D inlines the same color logic in
 * `CausalDAG2D.tsx`'s edge memo; a future pass can route it through here too.
 *
 * Color tiers (highest precedence first):
 *   1. ablated      → magenta (#e040fb)  — Pearl do(X) edge isolation
 *   2. severed      → slate   (#78909c)  — Pearl link-break (distinct from Tarski red)
 *   3. consequence  → orange  (#ff6d00)  — edge spawned downstream of an intervention
 *   4. inconsistent → red     (#ff1744)  — Tarski-flagged, only in `verified` truthFilter
 *   5. type-based   → cyan / amber / orange / cyan(fallback)
 */

export type TruthFilter = "raw" | "verified" | "incoherent";

export interface EdgeStyleInput {
  edge: CausalEdge;
  truthFilter: TruthFilter;
  isAblated: boolean;
}

export interface EdgeAppearance {
  color: string;
  isDashed: boolean;
  /**
   * Power-scaled stroke width factor in [0.7, 4.0] for an edge weight in
   * [0, 1]. Mirrors the 3D mapping `0.7 + pow(w, 2.4) * 3.3` so a thick
   * edge reads ~3× a thin one even at the typical 0.4–0.8 weight band.
   * Callers convert this to whatever screen-space unit the renderer wants.
   */
  widthFactor: number;
}

const POWER_BASE = 0.7;
const POWER_RANGE = 3.3;
const POWER_EXPONENT = 2.4;

export function edgeWidthFactor(weight: number): number {
  const w = Math.max(0, Math.min(1, weight));
  return POWER_BASE + Math.pow(w, POWER_EXPONENT) * POWER_RANGE;
}

export function deriveEdgeAppearance(input: EdgeStyleInput): EdgeAppearance {
  const { edge, truthFilter, isAblated } = input;
  const isSevered = edge.isSevered ?? false;
  const isConsequence = edge.isConsequenceEdge ?? false;
  const isInconsistent = truthFilter === "verified" && !!edge.isInconsistent;

  let color: string;
  if (isAblated) {
    color = "#e040fb";
  } else if (isSevered) {
    color = "#78909c";
  } else if (isConsequence) {
    color = "#ff6d00";
  } else if (isInconsistent) {
    color = "#ff1744";
  } else {
    switch (edge.type) {
      case "temporal":
        color = "#ffab00";
        break;
      case "confounded":
        color = "#ff6d00";
        break;
      case "directed":
      default:
        color = "#00e5ff";
    }
  }

  // Dashed: confounded type, Tarski-verified inconsistent, ablation, or sever.
  // Mirrors `DAGEdge3D.tsx`'s `isDashed = confounded || isVerifiedInconsistent || isAblated || isSevered`.
  const isDashed =
    edge.type === "confounded" || isInconsistent || isAblated || isSevered;

  return {
    color,
    isDashed,
    widthFactor: edgeWidthFactor(edge.weight),
  };
}
