/**
 * CLAIMS — single source of truth for every cross-page factual claim
 * on the marketing site.
 *
 * Why this exists: the same facts (pillar weights, engine roles,
 * engine→pillar mappings, system-level metrics) were hand-written in
 * six-plus files and drifted three separate times — most recently the
 * homepage advertising a metric (ΩSX) the platform doesn't compute and
 * per-domain weight configurability the platform deliberately doesn't
 * have. Pages import from here; prose stays in pages, facts live here.
 *
 * Platform anchors (the code these claims must match):
 * - Pillar weights:   src/lib/types.ts DEFAULT_OMEGA_WEIGHTS
 * - Engine roster:    src/lib/domain-profiles.ts modules
 * - System metrics:   src/lib/omega-engine.ts computeDoomsdayState
 *                     (fragilityIndex, timeToFailureDays) and
 *                     src/lib/monte-carlo-engine.ts (cascade reach)
 * - ΩSX / "System Exposure" is NOT implemented on the platform.
 *   Do not add it here until backlog item 1h ships.
 */

export type PillarLetter = "I" | "R" | "J" | "C" | "T";

/**
 * The five ΩF pillars with their canonical weights. Weights are FIXED
 * and identical across every domain (DEFAULT_OMEGA_WEIGHTS is applied
 * uniformly in enrich.ts) — never describe them as configurable.
 */
export const PILLAR_META: Record<
  PillarLetter,
  { name: string; weight: number; color: string }
> = {
  I: { name: "Irreplaceability", weight: 0.25, color: "cyan" },
  R: { name: "Restoration Latency", weight: 0.2, color: "green" },
  J: { name: "Jurisdictional Hazard", weight: 0.15, color: "red" },
  C: { name: "Cascade Load", weight: 0.25, color: "purple" },
  T: { name: "Tail Depth", weight: 0.15, color: "amber" },
};

export const PILLAR_LETTERS: PillarLetter[] = ["I", "R", "J", "C", "T"];

/**
 * The four engines in pipeline order, with the canonical role label
 * and the pillars each one feeds. `feeds` is the one mapping — if it
 * changes, every page (product, framework, domain pages) follows.
 */
export const ENGINE_META = [
  {
    name: "SPIRTES",
    role: "Structure Discovery",
    color: "cyan",
    feeds: ["C"] as PillarLetter[],
  },
  {
    name: "TARSKI",
    role: "Formal Verification",
    color: "amber",
    feeds: ["J"] as PillarLetter[],
  },
  {
    name: "PEARL",
    role: "Counterfactual Engine",
    color: "purple",
    feeds: ["I", "R"] as PillarLetter[],
  },
  {
    name: "PARETO",
    role: "Cascade & Tail Simulation",
    color: "orange",
    feeds: ["C", "T"] as PillarLetter[],
  },
] as const;

export type EngineName = (typeof ENGINE_META)[number]["name"];

/** "C · CASCADE LOAD · T · TAIL DEPTH"-style label for an engine's pillars. */
export function engineBacksLabel(feeds: readonly PillarLetter[]): string {
  return feeds
    .map((l) => `${l} · ${PILLAR_META[l].name.toUpperCase()}`)
    .join("  ·  ");
}

/**
 * The system-level readouts the platform actually computes. These are
 * the ONLY system metrics the site may name. Formulas and blurbs match
 * omega-engine.ts / monte-carlo-engine.ts.
 */
export const SYSTEM_METRICS = [
  {
    symbol: "ΩSF",
    name: "System Fragility",
    color: "cyan",
    formula: "∝ Σσᵢ + (100 − buffer)",
    blurb:
      "Live 0–100 system fragility index. Rises with aggregate shock severity and depleted buffer, and drives the regime band (STABLE → CRASH) in the Ω monitor.",
  },
  {
    symbol: "Ω-Contagion",
    name: "Cascade Reach",
    color: "red",
    formula: "|{j : Lⱼ(failᵢ) > τ}|",
    blurb:
      "Count of downstream nodes whose loss exceeds threshold τ when node i fails — measured across Monte Carlo cascade runs.",
  },
  {
    symbol: "Ω-Buffer",
    name: "Time to Failure",
    color: "green",
    formula: "365 · (buffer/100)",
    blurb:
      "Days from the current buffer to systemic failure: 365 nominal, compressing toward 3 at breach. The operational window for response.",
  },
] as const;

/** One-line Ω-outputs roster for visuals (EngineFlow output pill etc.). */
export const OMEGA_OUTPUTS_LINE = "ΩSF · cascade reach · Ω-buffer";

/**
 * Discovery algorithms shipped on the platform (SPIRTES). Matches the
 * homepage hero stat and the /product SPIRTES detail bullet.
 */
export const DISCOVERY_ALGORITHMS = [
  "PC",
  "FCI (CMI-knn)",
  "NOTEARS",
  "PCMCI-linear",
  "lag-correlation",
] as const;
