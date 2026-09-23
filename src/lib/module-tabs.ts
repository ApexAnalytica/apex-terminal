import type { ManifoldModule } from "./types";

// The default module tab list shown in HeaderBar. Lives in its own
// lightweight file (~40 LOC) so `HeaderBar` — on the critical-path
// bundle — doesn't pull the 480-LOC `domain-profiles.ts` (three full
// profile definitions with pillar labels + detail copy + estimator
// configs) just to render the four tab labels.
//
// `domain-profiles.ts` re-imports this constant so the GEOPOLITICAL
// profile's `modules` field stays in sync.
export const MODULE_TABS: ManifoldModule[] = [
  {
    id: "spirtes",
    name: "SPIRTES",
    subtitle: "Structure Discovery",
    description: "Causal DAG learning from observational data",
    icon: "◇",
    color: "var(--accent-cyan)",
    status: "ACTIVE",
  },
  {
    id: "tarski",
    name: "TARSKI",
    subtitle: "Truth Verification",
    description: "Physical constraint validation — reject hallucinations",
    icon: "⊢",
    color: "var(--accent-green)",
    status: "ACTIVE",
  },
  {
    id: "pearl",
    name: "PEARL",
    subtitle: "Counterfactual Engine",
    description: "do-calculus reasoning — interventional queries",
    icon: "⟐",
    color: "var(--accent-amber)",
    status: "STANDBY",
  },
  {
    id: "pareto",
    name: "PARETO",
    subtitle: "Criticality Warning",
    description: "Strategic risk & Ω-fragility assessment",
    icon: "⚠",
    color: "var(--accent-red)",
    status: "ALERT",
  },
];
