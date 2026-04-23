// Minimal T1D \u03B2-cell restoration causal graph. A stub, not a scientific
// claim \u2014 enough nodes and edges for the Manifold UI to render a coherent
// T1D pathway story so the domain profile swap (module names, pillar
// labels, copilot vocabulary) has data to sit on top of. The full
// literature-grounded graph lives in research/ and will port here in a
// later pass.

import type { CausalGraph, CausalNode, CausalEdge, OmegaFragilityProfile } from "./types";

function omega(
  composite: number,
  irreplaceability: number,
  restorationLatency: number,
  jurisdictionalHazard: number,
  cascadeLoad: number,
  tailDepth: number,
): OmegaFragilityProfile {
  return { composite, irreplaceability, restorationLatency, jurisdictionalHazard, cascadeLoad, tailDepth };
}

// All nodes carry the T1D brand color on `datasetColor` so they pop
// distinctly from the geopolitical palette even when both are present.
const T1D_COLOR = "#40c4ff";

const NODES: CausalNode[] = [
  // ─── Autoimmune axis ───────────────────────────────────────
  {
    id: "t1d_autoantibodies",
    label: "Islet Autoantibodies (GADA / IA-2A / ZnT8A)",
    shortLabel: "Auto-Ab",
    category: "science",
    omegaFragility: omega(7.4, 8.5, 6.0, 5.5, 8.5, 7.0),
    globalConcentration: "Predictive marker — >2 autoantibodies ≈ 85% 10y risk",
    replacementTime: "Irreversible once established",
    physicalConstraint: "Immune memory persists — no known mechanism for autoantibody seroreversion at scale",
    domain: "T1D Autoimmune",
    discoverySource: "FCI",
    isConfounded: true,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_cd8_teff",
    label: "Islet-Reactive CD8+ T Effectors",
    shortLabel: "CD8-Teff",
    category: "science",
    omegaFragility: omega(8.2, 8.0, 7.5, 6.5, 9.0, 8.0),
    globalConcentration: "Primary cytotoxic driver of β-cell loss",
    replacementTime: "Ongoing — requires sustained immunomodulation",
    physicalConstraint: "HLA-restricted recognition; tissue-resident memory hard to clear",
    domain: "T1D Autoimmune",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_treg_deficit",
    label: "Regulatory T-cell Deficit",
    shortLabel: "Treg-def",
    category: "science",
    omegaFragility: omega(7.0, 7.0, 6.5, 5.0, 8.5, 7.0),
    globalConcentration: "Quantitative and qualitative Treg defects in T1D",
    replacementTime: "Months — Treg expansion protocols under trial",
    physicalConstraint: "IL-2 signalling defect limits pharmacological restoration",
    domain: "T1D Autoimmune",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },

  // ─── β-cell biology ────────────────────────────────────────
  {
    id: "t1d_beta_mass",
    label: "Functional β-cell Mass",
    shortLabel: "β-mass",
    category: "science",
    omegaFragility: omega(9.4, 10.0, 9.5, 6.0, 10.0, 9.5),
    globalConcentration: "Sole physiological source of regulated insulin",
    replacementTime: "Years — proliferation rate ~0.5–2%/yr in adults",
    physicalConstraint: "Terminally differentiated in humans; limited endogenous regeneration",
    domain: "T1D β-cell Biology",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_c_peptide",
    label: "C-peptide (Endogenous Insulin Proxy)",
    shortLabel: "C-pep",
    category: "science",
    omegaFragility: omega(7.8, 9.0, 8.0, 4.5, 8.5, 7.5),
    globalConcentration: "Only reliable biomarker of residual β-cell function",
    replacementTime: "Declines ~50%/year post-onset without intervention",
    physicalConstraint: "Assay sensitivity floor at ~0.02 nmol/L limits late-stage tracking",
    domain: "T1D β-cell Biology",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_er_stress",
    label: "β-cell ER Stress / UPR",
    shortLabel: "ER-str",
    category: "science",
    omegaFragility: omega(6.8, 6.5, 7.0, 5.0, 7.5, 6.5),
    globalConcentration: "Common final pathway of β-cell dysfunction",
    replacementTime: "Hours–days reversible if stressor removed",
    physicalConstraint: "Chronic UPR triggers apoptosis; narrow therapeutic window",
    domain: "T1D β-cell Biology",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },

  // ─── Metabolic / glycemic ──────────────────────────────────
  {
    id: "t1d_cgm_tir",
    label: "CGM Time-in-Range (70–180 mg/dL)",
    shortLabel: "TIR",
    category: "science",
    omegaFragility: omega(7.2, 5.5, 6.5, 4.0, 9.0, 8.5),
    globalConcentration: "Consensus primary endpoint in modern T1D trials",
    replacementTime: "Responds within weeks to therapy changes",
    physicalConstraint: "Sensor accuracy ±10% — behavioural and pharmacological confounds",
    domain: "T1D Metabolic",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_hypo_events",
    label: "Severe Hypoglycemia Events",
    shortLabel: "Hypo",
    category: "science",
    omegaFragility: omega(8.6, 7.0, 7.5, 5.5, 8.0, 10.0),
    globalConcentration: "Leading cause of acute T1D mortality; nocturnal risk concentrated",
    replacementTime: "Event-driven — prevention is the only lever",
    physicalConstraint: "Hypoglycemia unawareness compounds risk over disease duration",
    domain: "T1D Metabolic",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_dka",
    label: "Diabetic Ketoacidosis (DKA)",
    shortLabel: "DKA",
    category: "science",
    omegaFragility: omega(8.4, 6.5, 7.0, 6.0, 8.5, 9.5),
    globalConcentration: "~30–40% of pediatric T1D presents in DKA at diagnosis",
    replacementTime: "Acute — hours to correct; days to recover",
    physicalConstraint: "Insulin pump failure is a recurring precipitant",
    domain: "T1D Metabolic",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },

  // ─── Intervention nodes ───────────────────────────────────
  {
    id: "t1d_teplizumab",
    label: "Teplizumab (anti-CD3)",
    shortLabel: "Tepliz",
    category: "science",
    omegaFragility: omega(6.4, 8.5, 5.0, 8.0, 5.5, 5.0),
    globalConcentration: "Only FDA-approved T1D-onset-delay therapy (Tzield)",
    replacementTime: "Single 14-day course; durable ~2–3yr delay effect",
    physicalConstraint: "Stage 2 window only — narrow eligibility population",
    domain: "T1D Intervention",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_stem_cell_beta",
    label: "Stem-cell-derived β-cell Replacement",
    shortLabel: "SC-β",
    category: "science",
    omegaFragility: omega(7.2, 9.0, 8.5, 8.5, 6.0, 5.0),
    globalConcentration: "VX-880 / Vertex program; still early-stage trials",
    replacementTime: "5–10yr to broad approval on current trial timelines",
    physicalConstraint: "Immune protection (encapsulation / gene edit) unsolved at scale",
    domain: "T1D Intervention",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },

  // ─── Complication endpoints ───────────────────────────────
  {
    id: "t1d_dkd",
    label: "Diabetic Kidney Disease",
    shortLabel: "DKD",
    category: "science",
    omegaFragility: omega(8.0, 7.0, 9.0, 5.0, 8.5, 8.5),
    globalConcentration: "~30% lifetime risk; primary T1D mortality driver post-40",
    replacementTime: "Decades to develop; ESRD irreversible",
    physicalConstraint: "Glycemic legacy effect — early control determines late outcome",
    domain: "T1D Complications",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_retinopathy",
    label: "Diabetic Retinopathy",
    shortLabel: "Retino",
    category: "science",
    omegaFragility: omega(7.0, 6.0, 8.5, 4.5, 7.5, 7.5),
    globalConcentration: "Leading cause of working-age blindness",
    replacementTime: "Years; anti-VEGF slows but rarely reverses",
    physicalConstraint: "Microvascular damage cumulative with glycemic exposure",
    domain: "T1D Complications",
    discoverySource: "DCD",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_population_hba1c",
    label: "Population Glycemic Control (HbA1c, T1DX Registry)",
    shortLabel: "HbA1c-pop",
    category: "science",
    omegaFragility: omega(7.6, 5.0, 6.5, 4.5, 9.0, 8.0),
    globalConcentration: "Adolescent 13–17y cohort persistently ~8.7% across 4 T1DX waves — chronic under-target",
    replacementTime: "Weeks to months per individual; population-level shift stalled since 2010",
    physicalConstraint: "Real-world adherence ceiling — the ADA <7% target remains unmet in >70% of adolescents",
    domain: "T1D Metabolic",
    discoverySource: "merged",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
  {
    id: "t1d_realworld_tir",
    label: "Real-World CGM Time-in-Range (D1NAMO cohort)",
    shortLabel: "TIR-RW",
    category: "science",
    omegaFragility: omega(7.0, 5.0, 6.0, 3.5, 8.5, 8.0),
    globalConcentration: "D1NAMO 9-subject cohort median TIR ~60% under standard MDI / pump care",
    replacementTime: "Responds within days to closed-loop system adoption",
    physicalConstraint: "4-day recording window + small n limits external validity; treat as proof-of-concept signal",
    domain: "T1D Metabolic",
    discoverySource: "PCMCI+",
    isConfounded: false,
    isRestricted: false,
    datasetColor: T1D_COLOR,
  },
];

const EDGES: CausalEdge[] = [
  // Autoimmune → β-cell destruction
  { id: "t1d_e1", source: "t1d_autoantibodies", target: "t1d_cd8_teff", weight: 0.55, lag: 12, type: "temporal", confidence: 0.7, isInconsistent: false, physicalMechanism: "Humoral presentation primes islet-reactive CD8+ T cells (seropositivity precedes clinical onset by years)" },
  { id: "t1d_e2", source: "t1d_cd8_teff", target: "t1d_beta_mass", weight: 0.85, lag: 1, type: "directed", confidence: 0.9, isInconsistent: false, physicalMechanism: "Granzyme/perforin-mediated β-cell cytolysis" },
  { id: "t1d_e3", source: "t1d_treg_deficit", target: "t1d_cd8_teff", weight: 0.6, lag: 0, type: "directed", confidence: 0.75, isInconsistent: false, physicalMechanism: "Loss of peripheral tolerance allows effector expansion" },
  { id: "t1d_e4", source: "t1d_er_stress", target: "t1d_beta_mass", weight: 0.55, lag: 1, type: "directed", confidence: 0.7, isInconsistent: false, physicalMechanism: "Chronic UPR activates intrinsic apoptosis" },

  // β-cell mass → metabolic control
  { id: "t1d_e5", source: "t1d_beta_mass", target: "t1d_c_peptide", weight: 0.95, lag: 0, type: "directed", confidence: 0.95, isInconsistent: false, physicalMechanism: "C-peptide is co-secreted 1:1 with endogenous insulin" },
  { id: "t1d_e6", source: "t1d_c_peptide", target: "t1d_cgm_tir", weight: 0.65, lag: 0, type: "directed", confidence: 0.8, isInconsistent: false, physicalMechanism: "Residual endogenous insulin reduces glycemic variability" },
  { id: "t1d_e7", source: "t1d_c_peptide", target: "t1d_hypo_events", weight: -0.5, lag: 0, type: "directed", confidence: 0.75, isInconsistent: false, physicalMechanism: "Endogenous insulin + glucagon response protects against hypoglycemia" },
  { id: "t1d_e8", source: "t1d_beta_mass", target: "t1d_dka", weight: -0.7, lag: 0, type: "directed", confidence: 0.85, isInconsistent: false, physicalMechanism: "Collapse below critical β-cell mass triggers ketogenesis" },

  // Metabolic → complications
  { id: "t1d_e9", source: "t1d_cgm_tir", target: "t1d_dkd", weight: -0.6, lag: 36, type: "temporal", confidence: 0.8, isInconsistent: false, physicalMechanism: "Glycemic exposure drives mesangial matrix expansion over years" },
  { id: "t1d_e10", source: "t1d_cgm_tir", target: "t1d_retinopathy", weight: -0.55, lag: 24, type: "temporal", confidence: 0.8, isInconsistent: false, physicalMechanism: "Hyperglycemia-driven microvascular damage accumulates" },
  { id: "t1d_e15", source: "t1d_c_peptide", target: "t1d_population_hba1c", weight: -0.45, lag: 3, type: "temporal", confidence: 0.75, isInconsistent: false, physicalMechanism: "Residual endogenous insulin reduces post-prandial hyperglycemia → lower HbA1c" },
  { id: "t1d_e16", source: "t1d_population_hba1c", target: "t1d_dkd", weight: 0.7, lag: 60, type: "temporal", confidence: 0.9, isInconsistent: false, physicalMechanism: "Each 1% HbA1c rise ~1.3× DKD progression risk (DCCT/EDIC legacy)" },
  { id: "t1d_e17", source: "t1d_population_hba1c", target: "t1d_retinopathy", weight: 0.65, lag: 48, type: "temporal", confidence: 0.9, isInconsistent: false, physicalMechanism: "Cumulative glycemic exposure drives microvascular damage (DCCT)" },
  { id: "t1d_e18", source: "t1d_realworld_tir", target: "t1d_population_hba1c", weight: -0.8, lag: 2, type: "temporal", confidence: 0.95, isInconsistent: false, physicalMechanism: "TIR % and HbA1c are mathematically coupled via time-averaged glucose (Vigersky/Battelino 2019)" },
  { id: "t1d_e19", source: "t1d_c_peptide", target: "t1d_realworld_tir", weight: 0.5, lag: 0, type: "directed", confidence: 0.8, isInconsistent: false, physicalMechanism: "Residual endogenous insulin dampens CGM excursions, raising TIR" },

  // Interventions
  { id: "t1d_e11", source: "t1d_teplizumab", target: "t1d_cd8_teff", weight: -0.6, lag: 0, type: "directed", confidence: 0.8, isInconsistent: false, physicalMechanism: "anti-CD3 induces partial T-cell anergy / exhaustion" },
  { id: "t1d_e12", source: "t1d_teplizumab", target: "t1d_c_peptide", weight: 0.3, lag: 12, type: "temporal", confidence: 0.7, isInconsistent: false, physicalMechanism: "Delayed β-cell loss preserves endogenous insulin" },
  { id: "t1d_e13", source: "t1d_stem_cell_beta", target: "t1d_beta_mass", weight: 0.7, lag: 6, type: "temporal", confidence: 0.5, isInconsistent: false, physicalMechanism: "Exogenous β-cell engraftment restores functional mass (subject to immune rejection)" },

  // Confounding: glycemic variability <-> autoimmunity via inflammation (latent)
  { id: "t1d_e14", source: "t1d_er_stress", target: "t1d_autoantibodies", weight: 0.3, lag: 0, type: "confounded", confidence: 0.5, isInconsistent: false, physicalMechanism: "Stressed β-cells release neoantigens that seed autoimmune recognition (bidirectional feedback)" },
];

const METADATA = {
  density: EDGES.length / (NODES.length * (NODES.length - 1)),
  constraintType: "T1D biological-pathway stub",
  verificationStatus: "UNVERIFIED" as const,
  totalNodes: NODES.length,
  totalEdges: EDGES.length,
  inconsistentEdges: EDGES.filter((e) => e.isInconsistent).length,
  restrictedNodes: NODES.filter((n) => n.isRestricted).length,
};

export const T1D_GRAPH: CausalGraph = {
  nodes: NODES,
  edges: EDGES,
  metadata: METADATA,
};
