// Domain profiles — per-vertical vocabulary layered over the same engine
// substrate. The four module IDs (spirtes/tarski/pearl/pareto) and the
// ΩF-pillar shape are fixed; each profile only swaps the display labels,
// descriptions, and the default estimator set the criticality layer runs.
//
// This is the seam that lets Manifold render as a geopolitical-risk
// terminal on one dataset and a medical-research terminal on another
// without forking the codebase.

import type { ManifoldModule } from "./types";

export type EstimatorId =
  // Criticality engines (graph-derived)
  | "csd"
  | "ph"
  | "lppls"
  // Patient-trace estimators (TS-ported)
  | "bocpd"
  | "transfer-entropy"
  | "moran"
  | "takens"
  // Clinical / trial estimators (Python reference canonical)
  | "hte-meta"
  | "cox-ph"
  | "nlme"
  | "gp-regression"
  | "hlm-cross-species";

export type PillarKey =
  | "irreplaceability"
  | "restorationLatency"
  | "jurisdictionalHazard"
  | "cascadeLoad"
  | "tailDepth";

export interface PillarLabels {
  composite: string;                         // headline score label (e.g. "Ω-FRAGILITY" vs "CRITICALITY")
  irreplaceability: string;
  restorationLatency: string;
  jurisdictionalHazard: string;
  cascadeLoad: string;
  tailDepth: string;
}

export interface PillarDetail {
  label: string;
  short: string;
  detail: string;
  formula: string;
}

export interface DomainProfile {
  id: string;
  displayName: string;
  modules: ManifoldModule[];
  pillarLabels: PillarLabels;
  pillarDetails: Record<PillarKey, PillarDetail>;
  compositeMethodology: string;
  criticalityEstimators: EstimatorId[];
}

// ─── Geopolitical / financial (current default) ─────────────────────

const GEOPOLITICAL_MODULES: ManifoldModule[] = [
  {
    id: "spirtes",
    name: "SPIRTES",
    subtitle: "Structure Discovery",
    description: "Causal DAG learning from observational data",
    icon: "\u25C7",
    color: "var(--accent-cyan)",
    status: "ACTIVE",
  },
  {
    id: "tarski",
    name: "TARSKI",
    subtitle: "Truth Verification",
    description: "Physical constraint validation \u2014 reject hallucinations",
    icon: "\u22A2",
    color: "var(--accent-green)",
    status: "ACTIVE",
  },
  {
    id: "pearl",
    name: "PEARL",
    subtitle: "Counterfactual Engine",
    description: "do-calculus reasoning \u2014 interventional queries",
    icon: "\u27D0",
    color: "var(--accent-amber)",
    status: "STANDBY",
  },
  {
    id: "pareto",
    name: "PARETO",
    subtitle: "Criticality Warning",
    description: "Strategic risk & \u03A9-fragility assessment",
    icon: "\u26A0",
    color: "var(--accent-red)",
    status: "ALERT",
  },
];

const GEOPOLITICAL_PILLARS: PillarLabels = {
  composite: "\u03A9-FRAGILITY",
  irreplaceability: "IRREPLACEABILITY",
  restorationLatency: "RESTORATION LATENCY",
  jurisdictionalHazard: "JURISDICTIONAL HAZARD",
  cascadeLoad: "CASCADE LOAD",
  tailDepth: "TAIL DEPTH",
};

const GEOPOLITICAL_PILLAR_DETAILS: Record<PillarKey, PillarDetail> = {
  irreplaceability: {
    label: GEOPOLITICAL_PILLARS.irreplaceability,
    short: "How difficult is it to substitute this node if it fails?",
    detail:
      "Measures the global concentration of capability. A node scoring 10 means a single facility or entity controls the entire supply \u2014 no alternative exists. Derived from market share data, patent exclusivity, and geographic monopoly indicators.",
    formula: "I = f(HHI, market_share_top1, patent_exclusivity, geographic_monopoly)",
  },
  restorationLatency: {
    label: GEOPOLITICAL_PILLARS.restorationLatency,
    short: "How long would it take to restore function after disruption?",
    detail:
      "Captures the time horizon to rebuild or reroute. A semiconductor fab takes 3\u20135 years to build; a shipping route reroute may take weeks. Scored from replacement time estimates, capital intensity, and regulatory approval cycles.",
    formula: "R = g(replacement_time_months, capex_intensity, regulatory_gates)",
  },
  jurisdictionalHazard: {
    label: GEOPOLITICAL_PILLARS.jurisdictionalHazard,
    short: "How exposed is this node to sovereign or regulatory risk?",
    detail:
      "Reflects the political and legal environment governing this asset. Nodes in contested jurisdictions, under sanctions exposure, or subject to export controls score higher. Incorporates governance indices, sanctions lists, and geopolitical tension scores.",
    formula: "J = h(governance_index, sanctions_proximity, export_control_tier, conflict_zone)",
  },
  cascadeLoad: {
    label: GEOPOLITICAL_PILLARS.cascadeLoad,
    short: "How many downstream nodes depend on this one?",
    detail:
      "Measures the systemic importance through graph topology. A node with high cascade load sits at a critical junction \u2014 its failure propagates to many dependent systems. Computed from edge degree, betweenness centrality, and the omega scores of downstream neighbors.",
    formula: "C = \u03A3(edge_degree \u00D7 downstream_\u03A9F) / normalization_factor",
  },
  tailDepth: {
    label: GEOPOLITICAL_PILLARS.tailDepth,
    short: "How severe is the worst-case disruption scenario?",
    detail:
      "Quantifies fat-tail risk \u2014 the potential for extreme, non-linear damage. Nodes where disruption triggers cascading failures across domains (e.g., Strait of Hormuz blocking both energy and fertilizer supply chains) score highest. Derived from historical crisis data and concentration \u00D7 criticality interaction.",
    formula: "T = concentration_score \u00D7 system_criticality \u00D7 historical_tail_events",
  },
};

const GEOPOLITICAL_METHODOLOGY =
  "The \u03A9F (Omega Fragility) composite score is a weighted aggregation of five orthogonal risk pillars, each scored 0\u201310. The composite weights are: I(0.25) + R(0.20) + J(0.20) + C(0.20) + T(0.15). Scores above 7.0 indicate elevated systemic fragility; above 9.0 indicates critical nodes where disruption would cascade across multiple domains.";

export const GEOPOLITICAL_PROFILE: DomainProfile = {
  id: "geopolitical",
  displayName: "Geopolitical / Financial",
  modules: GEOPOLITICAL_MODULES,
  pillarLabels: GEOPOLITICAL_PILLARS,
  pillarDetails: GEOPOLITICAL_PILLAR_DETAILS,
  compositeMethodology: GEOPOLITICAL_METHODOLOGY,
  criticalityEstimators: ["csd", "ph", "lppls"],
};

// ─── Medical / T1D beta-cell restoration ────────────────────────────

const T1D_MODULES: ManifoldModule[] = [
  {
    id: "spirtes",
    name: "MECHANISM",
    subtitle: "Pathway Discovery",
    description:
      "Causal DAG learning across autoimmune, \u03B2-cell, and metabolic signals",
    icon: "\u25C7",
    color: "var(--accent-cyan)",
    status: "ACTIVE",
  },
  {
    id: "tarski",
    name: "AXIOMS",
    subtitle: "Biological Constraints",
    description:
      "Glucose / insulin / C-peptide physical bounds \u2014 reject infeasible states",
    icon: "\u22A2",
    color: "var(--accent-green)",
    status: "ACTIVE",
  },
  {
    id: "pearl",
    name: "INTERVENTION",
    subtitle: "Counterfactual Treatment",
    description:
      "HTE / do-calculus \u2014 which intervention helps which patient",
    icon: "\u27D0",
    color: "var(--accent-amber)",
    status: "STANDBY",
  },
  {
    id: "pareto",
    name: "CRITICALITY",
    subtitle: "Regime Shift Detection",
    description:
      "BOCPD change-points on CGM, transfer entropy on hormone coupling",
    icon: "\u26A0",
    color: "var(--accent-red)",
    status: "ALERT",
  },
];

const T1D_PILLARS: PillarLabels = {
  composite: "CRITICALITY",
  irreplaceability: "MECHANISM RARITY",
  restorationLatency: "RESTORATION LATENCY",
  jurisdictionalHazard: "REGULATORY EXPOSURE",
  cascadeLoad: "COMPLICATION LOAD",
  tailDepth: "OUTCOME TAIL",
};

const T1D_PILLAR_DETAILS: Record<PillarKey, PillarDetail> = {
  irreplaceability: {
    label: T1D_PILLARS.irreplaceability,
    short: "How unique is this biological mechanism — is there a backup pathway?",
    detail:
      "Measures whether the function of this node is served by a single pathway or has redundant biological coverage. \u03B2-cells scoring 10 means no alternative insulin-secreting cell type exists at meaningful capacity; a cytokine scoring 2 likely has 3\u20135 redundant signalling routes. Drawn from KEGG pathway coverage, knockout phenotype severity, and pharmacological substitutability.",
    formula: "I = f(pathway_redundancy, knockout_severity, druggable_alternatives)",
  },
  restorationLatency: {
    label: T1D_PILLARS.restorationLatency,
    short: "How long does function take to recover after intervention or damage?",
    detail:
      "Captures the biological time constant for regeneration or compensation. \u03B2-cell mass restoration via proliferation runs on a months\u2013years horizon; C-peptide decay in new-onset T1D runs on weeks\u2013months; acute insulin response is seconds\u2013minutes. Scored from NLME C-peptide models and cross-species proliferation rate priors.",
    formula: "R = g(tau_regen, proliferation_rate, immune_memory_halflife)",
  },
  jurisdictionalHazard: {
    label: T1D_PILLARS.jurisdictionalHazard,
    short: "How exposed is this mechanism to regulatory or trial-design constraints?",
    detail:
      "Reflects the translational path complexity: FDA accelerated-approval eligibility, pediatric trial restrictions, orphan designation, and ex-US approval divergence. Teplizumab scored high pre-approval; commodity insulin analogs score near zero. Incorporates regulatory tier, IRB complexity, and cross-jurisdictional variance.",
    formula: "J = h(fda_tier, pediatric_gates, ex_us_divergence, orphan_status)",
  },
  cascadeLoad: {
    label: T1D_PILLARS.cascadeLoad,
    short: "How many downstream complications or pathways depend on this node?",
    detail:
      "Measures systemic downstream load in the causal DAG. Glycemic control propagates to retinopathy, nephropathy, neuropathy, and CV risk; a single cytokine may touch only one tissue. Computed from graph topology (betweenness, downstream \u03A9F mass) and long-term complication risk weights.",
    formula: "C = \u03A3(edge_weight \u00D7 downstream_criticality) / normalization_factor",
  },
  tailDepth: {
    label: T1D_PILLARS.tailDepth,
    short: "How severe is the worst-case outcome if this node fails?",
    detail:
      "Quantifies fat-tail outcome risk \u2014 DKA, hypoglycemic coma, end-stage renal disease, sudden death. Nodes where failure triggers acute life-threatening events (e.g., unrecognised hypoglycemia during sleep) score highest. Derived from CGM tail statistics and historical mortality / hospitalisation rates.",
    formula: "T = acute_event_rate \u00D7 mortality_weight \u00D7 tail_concentration",
  },
};

const T1D_METHODOLOGY =
  "The CRITICALITY composite score aggregates five orthogonal biological risk pillars, each scored 0\u201310: mechanism rarity, restoration latency, regulatory exposure, complication load, and outcome tail. Weights match the geopolitical composite (0.25 / 0.20 / 0.20 / 0.20 / 0.15) so cross-domain comparison stays apples-to-apples. Scores above 7.0 flag mechanisms worth prioritising for intervention; above 9.0 indicates nodes whose failure cascades across metabolic, vascular, and neurological subsystems.";

export const T1D_PROFILE: DomainProfile = {
  id: "t1d",
  displayName: "T1D Beta-Cell Restoration",
  modules: T1D_MODULES,
  pillarLabels: T1D_PILLARS,
  pillarDetails: T1D_PILLAR_DETAILS,
  compositeMethodology: T1D_METHODOLOGY,
  criticalityEstimators: [
    "bocpd",
    "transfer-entropy",
    "hte-meta",
    "cox-ph",
    "nlme",
    "hlm-cross-species",
  ],
};

// ─── Resolution ─────────────────────────────────────────────────────

const PROFILES_BY_DOMAIN_ID: Record<string, DomainProfile> = {
  // Geopolitical / financial domain cards from DomainSelector.tsx
  "energy-systems": GEOPOLITICAL_PROFILE,
  "manufacturing": GEOPOLITICAL_PROFILE,
  "supply-chain": GEOPOLITICAL_PROFILE,
  "financial-contagion": GEOPOLITICAL_PROFILE,
  "sovereign-risk": GEOPOLITICAL_PROFILE,
  "infrastructure": GEOPOLITICAL_PROFILE,
  "defense-isr": GEOPOLITICAL_PROFILE,
  "frontier-science": GEOPOLITICAL_PROFILE,
  // Life sciences
  "t1d-beta-cell": T1D_PROFILE,
};

export function resolveDomainProfile(
  selectedDomainIds: readonly string[] | null | undefined,
): DomainProfile {
  if (!selectedDomainIds || selectedDomainIds.length === 0) {
    return GEOPOLITICAL_PROFILE;
  }
  // In multi-domain mode, the first non-default profile wins so picking
  // T1D + Energy still renders medical vocabulary. If all selected
  // domains resolve to the same profile, that one wins trivially.
  for (const id of selectedDomainIds) {
    const p = PROFILES_BY_DOMAIN_ID[id];
    if (p && p.id !== GEOPOLITICAL_PROFILE.id) return p;
  }
  return GEOPOLITICAL_PROFILE;
}

export const DEFAULT_PROFILE = GEOPOLITICAL_PROFILE;
