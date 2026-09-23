// Display helpers for Ω-Bridge Density on the system-metrics surface.
//
// The math lives in src/lib/estimators/omega-bridge-density.ts. This
// file is the UI concern: mapping the [0, 1] scalar to a color band +
// human-readable label that surfaces the dissertation's interpretation:
//
//   0.05 ≲ density ≲ 0.30 — "well-connected with some critical
//                            chokepoints", the typical regime for real
//                            causal graphs (NOMINAL).
//   density > 0.30        — elevated chokepoint concentration; the
//                            graph has more bridge-like structure than
//                            usual (ELEVATED).
//   density > 0.60        — tree-like topology, removing any of many
//                            edges would fragment cascade pathways
//                            (FRAGILE).
//   density < 0.05        — almost no bridge structure; cycle-rich,
//                            highly redundant. Not a fragility flag —
//                            shown the same as nominal.

export interface BridgeDensityBand {
  /** Discrete band identifier. */
  band: "redundant" | "nominal" | "elevated" | "fragile";
  /** Short human-readable label suitable for a status badge. */
  label: string;
  /** CSS color (uses the project's accent CSS variables). */
  color: string;
  /** Hover-tooltip text explaining the reading + band threshold. */
  tooltip: string;
}

/**
 * Map an Ω-Bridge Density value into the display band the system-
 * metrics strip uses. Pure function — no React or DOM access; safe to
 * unit-test directly.
 */
export function bridgeDensityBand(density: number): BridgeDensityBand {
  if (!Number.isFinite(density) || density < 0) {
    return {
      band: "nominal",
      label: "—",
      color: "var(--text-muted)",
      tooltip: "Ω-Bridge Density unavailable for the current selection.",
    };
  }
  if (density > 0.6) {
    return {
      band: "fragile",
      label: "FRAGILE",
      color: "#ff1744",
      tooltip:
        "Ω-Bridge Density > 0.60 — near-tree topology. Most edges sit in χ★, so removing any of them fragments the cascade pathways. Investigate redundancy.",
    };
  }
  if (density > 0.3) {
    return {
      band: "elevated",
      label: "ELEVATED",
      color: "var(--accent-amber)",
      tooltip:
        "Ω-Bridge Density 0.30–0.60 — elevated chokepoint concentration. More edges than typical fall in χ★; the graph has bridge-like structure to monitor.",
    };
  }
  if (density < 0.05) {
    return {
      band: "redundant",
      label: "REDUNDANT",
      color: "var(--accent-green)",
      tooltip:
        "Ω-Bridge Density < 0.05 — cycle-rich, highly redundant graph. Few edges sit in χ★. Not a fragility flag — alternate paths absorb most disruptions.",
    };
  }
  return {
    band: "nominal",
    label: "NOMINAL",
    color: "var(--accent-green)",
    tooltip:
      "Ω-Bridge Density 0.05–0.30 — well-connected with some critical chokepoints. Typical regime for real causal graphs.",
  };
}
