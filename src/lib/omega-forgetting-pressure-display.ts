// Display helpers for Ω-Forgetting Pressure on the snapshot-diagnostics
// surface.
//
// The math lives in src/lib/discovery/omega-forgetting-pressure.ts.
// This file is the UI concern: mapping the [0, 1] scalar to a color
// band + human-readable label.
//
// Higher pressure = more forgetting = WORSE (opposite-polarity to
// Ω-Bridge Density, where the value is interpreted relative to a
// "redundant"/"nominal"/"fragile" topology spectrum). Bands:
//
//   pressure < 0.15      — NOMINAL: model is retaining knowledge
//                          across all exposed tasks.
//   0.15 ≤ pressure ≤ 0.30 — ELEVATED: some forgetting is visible;
//                          worth watching but not yet critical.
//   0.30 < pressure ≤ 0.60 — CRITICAL: substantial capability rot on
//                          tasks that carry real exposure.
//   pressure > 0.60      — CATASTROPHIC: majority of weighted task
//                          accuracy has been lost. Retraining or
//                          replay-buffer interventions warranted.
//
// Thresholds chosen to mirror Ω-Bridge Density's spacing (0.05 / 0.30 /
// 0.60) shifted up by 0.10 — the FR scalar is a fraction of peak
// accuracy lost, which empirically sits higher than the bridge density
// in well-behaved traces.

export interface ForgettingPressureBand {
  /** Discrete band identifier. */
  band: "nominal" | "elevated" | "critical" | "catastrophic";
  /** Short human-readable label suitable for a status badge. */
  label: string;
  /** CSS color (uses the project's accent CSS variables). */
  color: string;
  /** Hover-tooltip text explaining the reading + band threshold. */
  tooltip: string;
}

/**
 * Map an Ω-Forgetting-Pressure value into the display band the
 * snapshot-diagnostics card uses. Pure function — no React or DOM
 * access; safe to unit-test directly.
 *
 * NaN / negative inputs return an "—" placeholder band that the UI
 * surfaces as the "no data" state.
 */
export function forgettingPressureBand(
  pressure: number,
): ForgettingPressureBand {
  if (!Number.isFinite(pressure) || pressure < 0) {
    return {
      band: "nominal",
      label: "—",
      color: "var(--text-muted)",
      tooltip:
        "Ω-Forgetting Pressure unavailable. No training trace loaded, or every task is degenerate (zero peak accuracy).",
    };
  }
  if (pressure > 0.6) {
    return {
      band: "catastrophic",
      label: "CATASTROPHIC",
      color: "#ff1744",
      tooltip:
        "Ω-Forgetting Pressure > 0.60 — the majority of exposure-weighted task accuracy has been lost. The model has catastrophically forgotten high-exposure attack classes; replay buffers or retraining warranted.",
    };
  }
  if (pressure > 0.3) {
    return {
      band: "critical",
      label: "CRITICAL",
      color: "#ff7043",
      tooltip:
        "Ω-Forgetting Pressure 0.30–0.60 — substantial capability rot on tasks that carry real exposure. Worth a continual-learning review of the curriculum.",
    };
  }
  if (pressure > 0.15) {
    return {
      band: "elevated",
      label: "ELEVATED",
      color: "var(--accent-amber)",
      tooltip:
        "Ω-Forgetting Pressure 0.15–0.30 — some forgetting visible on exposed tasks. Not yet critical, but the curriculum is drifting away from where exposure sits.",
    };
  }
  return {
    band: "nominal",
    label: "NOMINAL",
    color: "var(--accent-green)",
    tooltip:
      "Ω-Forgetting Pressure < 0.15 — model is retaining knowledge across all exposed tasks. Curriculum and exposure are well-aligned.",
  };
}
