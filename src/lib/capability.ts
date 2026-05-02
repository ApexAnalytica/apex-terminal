// ─── Platform-wide Capability Tag ─────────────────────────────────────
//
// Generalises the existing `EstimatorAvailability` pattern from
// `criticality-registry.ts` into a tag that can be applied to anything
// the user sees in the platform: estimators, discovery algorithms,
// ingesters, cohorts, UI sections.
//
// Why this matters:
//   - The seven institutional outreach proposals (Joslin, nPOD, etc.)
//     reference capabilities that are at different readiness levels.
//     "Production-ready" overclaims; "coming soon" is empty.
//     Capability tags surface the truth on every relevant surface so a
//     PI viewing the platform sees what's real vs scaffolded.
//   - The `EstimatorAvailability` shape was per-estimator. This is
//     platform-wide and additive.

export type Capability =
  /** TS implementation runs, real data flows, in production. */
  | "live"
  /** TS implementation runs, but on illustrative / synthetic data
   *  pending real-cohort access (DUA / DAC / contract). */
  | "live-synthetic"
  /** Python reference is canonical; TS port deferred (typically because
   *  a linalg dep is needed). Functional via research/ scripts. */
  | "porting"
  /** TS-ready but the input data source isn't wired yet (e.g. BOCPD
   *  on a real T1D longitudinal series before partnership data lands). */
  | "awaiting-data"
  /** Roadmap. Only built once a partnership / paying customer asks. */
  | "phase-2";

export interface CapabilityMeta {
  label: string;
  /** One-line explanation, surfaced as a tooltip / hover. */
  description: string;
  /** Tailwind colour-token suffix used by the badge component. */
  tone: "green" | "amber" | "yellow" | "cyan" | "muted";
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  live: {
    label: "LIVE",
    description:
      "Implementation runs in production with real data flowing. Verified via tests and end-to-end runs.",
    tone: "green",
  },
  "live-synthetic": {
    label: "LIVE · SYNTHETIC",
    description:
      "Implementation runs in production, but on illustrative / synthetic data pending real-cohort access (DAC / DUA). Schema-identical to what the real ingester will produce.",
    tone: "amber",
  },
  porting: {
    label: "PORTING",
    description:
      "Python reference is canonical and validated; TS port is deferred behind a linalg dependency. Available today via research/ scripts; the platform UI will pick it up automatically when the port lands.",
    tone: "yellow",
  },
  "awaiting-data": {
    label: "AWAITING DATA",
    description:
      "TS implementation is ready but the data source it consumes isn't wired yet. Activates the moment a partnership-data ingester delivers the input series.",
    tone: "yellow",
  },
  "phase-2": {
    label: "PHASE 2",
    description:
      "Roadmap. Built only once a partnership engagement scopes it in. Listed for transparency about platform direction.",
    tone: "cyan",
  },
};

/** Tone → Tailwind colour pair (border + bg + text). */
export function tailwindClassesForTone(tone: CapabilityMeta["tone"]): {
  border: string;
  bg: string;
  text: string;
} {
  switch (tone) {
    case "green":
      return {
        border: "border-accent-green/40",
        bg: "bg-accent-green/10",
        text: "text-accent-green",
      };
    case "amber":
      return {
        border: "border-accent-amber/40",
        bg: "bg-accent-amber/10",
        text: "text-accent-amber",
      };
    case "yellow":
      return {
        border: "border-yellow-500/40",
        bg: "bg-yellow-500/10",
        text: "text-yellow-400",
      };
    case "cyan":
      return {
        border: "border-accent-cyan/40",
        bg: "bg-accent-cyan/10",
        text: "text-accent-cyan",
      };
    case "muted":
    default:
      return {
        border: "border-border",
        bg: "bg-surface-elevated",
        text: "text-text-muted",
      };
  }
}
