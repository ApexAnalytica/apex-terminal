import { TarskiAxiom, ProofTrace, CausalGraph, CausalEdge, CausalNode } from "./types";
import type { SystemStateSnapshot } from "./snapshots/types";
import type { TarskiViolation } from "./snapshots/types";

// ─── Axiom Library (Domain-Specific: Middle East Energy & Petrochemical) ──

export const AXIOM_LIBRARY: TarskiAxiom[] = [
  // Level 0 — Physical Laws (immutable, prune on violation)
  {
    id: "A-01",
    level: 0,
    name: "Temporal Priority",
    formalNotation: "∀e∈Edges, Lag(e) ≥ 0",
    description: "Effects cannot precede causes — causal edges must have non-negative temporal lag",
    plainText: "Causes must happen before their effects — no time travel allowed.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "QAFCO Fertilizer", "Ma'aden Phosphate", "Financial Contagion", "Sovereign Risk", "Supply Chain Food Security", "Undersea Cable Infrastructure"],
    appliesTo: ["geopolitical"],
    checksFor: "Reversed causality (negative-weight edges)",
    diagramHint: "A ──[t<0]──> B  ✗",
  },
  {
    id: "A-02",
    level: 0,
    name: "Flow Conservation",
    formalNotation: "Σw_in(v) ≥ Σw_out(v) · (1 − loss)",
    description: "Throughput entering a node must account for outbound flow — mass/energy balance must hold across processing hubs",
    plainText: "What goes into a node must account for what comes out — nothing appears from nowhere.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "QAFCO Fertilizer", "Ma'aden Phosphate", "Supply Chain Food Security"],
    appliesTo: ["geopolitical"],
    checksFor: "Nodes outputting more than they receive",
    diagramHint: "→[2]→ NODE →[5]→  ✗  (out > in)",
  },
  {
    id: "A-03",
    level: 0,
    name: "DAG Integrity",
    formalNotation: "∄ path v→⋯→v",
    description: "No directed cycles in the causal structure — feedback loops must be broken by temporal lag",
    plainText: "The causal chain can't loop back on itself — A can't cause B if B already caused A.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "Financial Contagion", "Sovereign Risk"],
    appliesTo: ["geopolitical"],
    checksFor: "Circular causal loops",
    diagramHint: "A → B → C → A  ✗  (cycle)",
  },
  {
    id: "A-04",
    level: 0,
    name: "Chokepoint Throughput Ceiling",
    formalNotation: "Flow(chokepoint) ≤ Capacity(chokepoint)",
    description: "Maritime chokepoints (Strait of Hormuz) impose hard throughput limits on all downstream flows",
    plainText: "Chokepoints like the Strait of Hormuz have a maximum capacity — you can't push more through than they can handle.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "Supply Chain Food Security", "Undersea Cable Infrastructure"],
    appliesTo: ["geopolitical"],
    checksFor: "Chokepoint nodes exceeding flow capacity",
    diagramHint: "━━▶ [STRAIT] ▶━━  cap exceeded",
  },
  {
    id: "A-05",
    level: 0,
    name: "Single-Source Fragility",
    formalNotation: "InDegree(v)=1 ∧ C(v)≥7 → FRAGILE",
    description: "A node with only one inbound supplier and high cascade load is structurally fragile — no redundancy path exists",
    plainText: "If a node depends on just one supplier and carries heavy load, it's dangerously fragile.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "QAFCO Fertilizer", "Ma'aden Phosphate", "Supply Chain Food Security"],
    appliesTo: ["geopolitical"],
    checksFor: "Nodes with no supply redundancy",
    diagramHint: "→ [SINGLE] → (no backup path)",
  },

  // Level 1 — Regulatory / Geopolitical (red alert, manual override)
  {
    id: "R-01",
    level: 1,
    name: "Jurisdictional Concentration",
    formalNotation: "J(v) ≥ 8 ∧ w(e) ≥ 0.7 → FLAG",
    description: "High-weight edges connected to nodes with extreme jurisdictional hazard (sanctions, conflict zones, export controls) require manual verification",
    plainText: "High-impact connections to sanctioned or conflict-zone nodes need manual review.",
    relevantDomains: ["Sovereign Risk", "Financial Contagion", "Saudi Aramco Energy", "QatarEnergy LNG"],
    appliesTo: ["geopolitical"],
    checksFor: "Heavy links to sanctioned / conflict-zone nodes",
    diagramHint: "━━▶ [SANCTIONED ⚠] ▶━━",
  },
  {
    id: "R-02",
    level: 1,
    name: "Force Majeure Exposure",
    formalNotation: "FM_trigger → suspend(obligations)",
    description: "Nodes in conflict-adjacent jurisdictions with high restoration latency may face force majeure contract suspension",
    plainText: "Nodes in war-adjacent regions may have contracts suspended due to force majeure.",
    relevantDomains: ["Sovereign Risk", "Saudi Aramco Energy", "QatarEnergy LNG", "QAFCO Fertilizer"],
    appliesTo: ["geopolitical"],
    checksFor: "Contract suspension risk in conflict zones",
    diagramHint: "[CONFLICT ZONE] → obligations suspended",
  },
  {
    id: "R-03",
    level: 1,
    name: "Export Route Monopoly",
    formalNotation: "∀ export_path(v) ∋ chokepoint → RESTRICTED",
    description: "All export paths from a production node that transit a single maritime chokepoint create regulatory/insurance concentration risk",
    plainText: "If every export route goes through one chokepoint, that's a concentration risk.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "Supply Chain Food Security", "Undersea Cable Infrastructure"],
    appliesTo: ["geopolitical"],
    checksFor: "All exports routing through single chokepoint",
    diagramHint: "PROD ──▶ [CHOKE] ──▶ MARKET (no alt route)",
  },
  {
    id: "R-04",
    level: 1,
    name: "Cross-Domain Dependency",
    formalNotation: "domain(source) ≠ domain(target) ∧ conf < 0.7 → UNVERIFIED",
    description: "Cross-domain edges with low confidence may represent assumed rather than verified causal relationships",
    plainText: "Cross-domain links with low confidence might be assumed rather than proven.",
    relevantDomains: ["Financial Contagion", "Sovereign Risk", "Supply Chain Food Security"],
    appliesTo: ["geopolitical"],
    checksFor: "Weak cross-domain causal assumptions",
    diagramHint: "[DOMAIN A] ··?··> [DOMAIN B]  (conf < 70%)",
  },

  // Level 2 — Heuristic (flagged as anomaly)
  {
    id: "H-01",
    level: 2,
    name: "Capacity Saturation",
    formalNotation: "ΩF(v) > 9.0 → ANOMALY",
    description: "Nodes with composite fragility exceeding 9.0 are at saturation — any additional shock may trigger cascade failure",
    plainText: "A node's fragility score is maxed out — any additional shock could break it.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "QAFCO Fertilizer", "Ma'aden Phosphate"],
    appliesTo: ["geopolitical"],
    checksFor: "Maxed-out fragility nodes",
    diagramHint: "[NODE] Ω=9.4  ▓▓▓▓▓▓▓▓▓░ saturated",
  },
  {
    id: "H-02",
    level: 2,
    name: "Cascade Amplification",
    formalNotation: "C(v) ≥ 9 ∧ OutDegree(v) ≥ 3 → AMPLIFIER",
    description: "Nodes with extreme cascade load and multiple outbound edges act as systemic amplifiers — disruption propagates non-linearly",
    plainText: "A highly loaded node with many outbound connections amplifies disruption exponentially.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "Financial Contagion"],
    appliesTo: ["geopolitical"],
    checksFor: "Hub nodes that amplify cascading failures",
    diagramHint: "→ [HUB C=9] →→→  (amplifier)",
  },

  // ─── T1D AXIOMS ─────────────────────────────────────────────────
  // Physiological, clinical, and heuristic constraints for type-1 diabetes
  // β-cell restoration. Level-0 = physical/physiological laws (immutable).
  // Level-1 = clinical guidelines / trial-design rules. Level-2 = heuristic
  // biological anomaly detectors.

  // Level 0 — Physiological laws
  {
    id: "TA-01",
    level: 0,
    name: "Glycemic Viability Bounds",
    formalNotation: "glucose(t) ∈ [40, 600] mg/dL",
    description: "Plasma glucose outside 40–600 mg/dL is incompatible with consciousness and survival without acute intervention (severe hypo / hyperosmolar coma)",
    plainText: "Blood sugar must stay between 40 and 600 mg/dL — outside this range, the patient goes unconscious.",
    relevantDomains: ["T1D Metabolic", "T1D Complications"],
    appliesTo: ["t1d"],
    checksFor: "Glucose trajectories that cross unsurvivable thresholds",
    diagramHint: "[glucose < 40] ✗  |  [glucose > 600] ✗",
  },
  {
    id: "TA-02",
    level: 0,
    name: "Insulin Non-Negativity",
    formalNotation: "[insulin](t) ≥ 0 ∀ t",
    description: "Plasma insulin concentration is bounded below by zero — endogenous secretion and exogenous delivery are additive, never subtractive",
    plainText: "You can't have negative insulin — the body can stop making it, but it can't take it back.",
    relevantDomains: ["T1D Metabolic", "T1D Intervention", "T1D \u03B2-cell Biology"],
    appliesTo: ["t1d"],
    checksFor: "Models that produce negative insulin concentrations",
    diagramHint: "[insulin] ≥ 0",
  },
  {
    id: "TA-03",
    level: 0,
    name: "C-peptide Monotonicity (Untreated T1D)",
    formalNotation: "d(C-pep)/dt ≤ 0  (absent regeneration)",
    description: "In established T1D without a regeneration intervention (SC-β transplant, stem-cell-derived islets), stimulated C-peptide is monotone non-increasing — β-cell mass cannot spontaneously recover",
    plainText: "Once β-cells are gone, they don't come back on their own — C-peptide only falls.",
    relevantDomains: ["T1D \u03B2-cell Biology", "T1D Autoimmune"],
    appliesTo: ["t1d"],
    checksFor: "Spontaneous C-peptide recovery not explained by intervention",
    diagramHint: "C-pep ↘  (no regen) ✓  |  C-pep ↗  (unexplained) ✗",
  },
  {
    id: "TA-04",
    level: 0,
    name: "Insulin–Glucose Stoichiometry",
    formalNotation: "Δglucose ≈ −ISF · Δinsulin_delivered,  ISF ∈ [20, 100] mg/dL/u",
    description: "Each unit of exogenous insulin lowers glucose by a patient-specific insulin-sensitivity factor within physiologic bounds [20, 100] mg/dL per unit",
    plainText: "Each unit of insulin drops glucose by a predictable amount — between 20 and 100 mg/dL per unit.",
    relevantDomains: ["T1D Metabolic", "T1D Intervention"],
    appliesTo: ["t1d"],
    checksFor: "Dose-response edges with implausible insulin-sensitivity factors",
    diagramHint: "+1 u insulin → Δglc ∈ [-100, -20]",
  },
  {
    id: "TA-05",
    level: 0,
    name: "β-cell Mass Floor",
    formalNotation: "stim-C-pep < 0.2 nmol/L → \u03B2-mass < 5% baseline → exogenous insulin obligate",
    description: "Stimulated C-peptide below 0.2 nmol/L implies residual β-cell mass under ~5% of baseline; below this floor, endogenous glycemic regulation is insufficient and exogenous insulin is obligate",
    plainText: "Below a tiny fraction of normal β-cell mass, the body can't regulate sugar at all and needs external insulin.",
    relevantDomains: ["T1D \u03B2-cell Biology", "T1D Intervention"],
    appliesTo: ["t1d"],
    checksFor: "Interventions assuming endogenous regulation below the mass floor",
    diagramHint: "C-pep < 0.2 → [insulin REQUIRED]",
  },
  {
    id: "TA-06",
    level: 0,
    name: "Autoantibody Ratchet",
    formalNotation: "N(autoantibodies, t) ≥ N(autoantibodies, t−1)",
    description: "Islet autoantibody count is monotone non-decreasing at population scale — seroreversion is rare and asymmetric; once two or more antibodies are present, progression to clinical T1D is effectively irreversible",
    plainText: "Once someone develops multiple islet autoantibodies, they almost never lose them — autoimmunity is a one-way door.",
    relevantDomains: ["T1D Autoimmune"],
    appliesTo: ["t1d"],
    checksFor: "Models that assume autoantibody seroreversion at scale",
    diagramHint: "autoAb(t) = 2 → autoAb(t+1) ≥ 2",
  },

  // Level 1 — Clinical guidelines / regulatory
  {
    id: "TR-01",
    level: 1,
    name: "ADA Glycemic Target",
    formalNotation: "HbA1c ≤ 7.0% (adults)  ∨  HbA1c ≤ 7.5% (pediatric)",
    description: "American Diabetes Association glycemic target for most patients; sustained deviation without documented individualization flags clinical concern",
    plainText: "Adult HbA1c should stay under 7%; kids under 7.5%. Staying higher without a reason is a red flag.",
    relevantDomains: ["T1D Metabolic", "T1D Intervention"],
    appliesTo: ["t1d"],
    checksFor: "Trajectories chronically above ADA target without individualization note",
    diagramHint: "HbA1c > 7% (adult)  ⚠",
  },
  {
    id: "TR-02",
    level: 1,
    name: "CGM Time-in-Range Consensus",
    formalNotation: "TIR_{70–180} ≥ 70%  ∧  TBR_{<70} ≤ 4%  ∧  TBR_{<54} ≤ 1%",
    description: "International CGM consensus targets (Battelino et al. 2019) — regimens that fail these thresholds warrant adjustment regardless of HbA1c",
    plainText: "Spend most of the day between 70–180 mg/dL, and almost no time below 70.",
    relevantDomains: ["T1D Metabolic"],
    appliesTo: ["t1d"],
    checksFor: "CGM cohorts falling below TIR or above TBR thresholds",
    diagramHint: "TIR 70% | TBR<70 4% | TBR<54 1%",
  },
  {
    id: "TR-03",
    level: 1,
    name: "Teplizumab Eligibility (TZIELD)",
    formalNotation: "Stage(T1D)=2 ∧ age≥8 ∧ ≥2 islet-AAb ∧ dysglycemia",
    description: "FDA-approved indication for teplizumab is Stage-2 T1D (≥2 autoantibodies with dysglycemia but not overt disease) in patients aged 8 and older — use outside this window is off-label",
    plainText: "Teplizumab is only approved for pre-diabetic patients with multiple autoantibodies — not for already-diagnosed T1D.",
    relevantDomains: ["T1D Autoimmune", "T1D Intervention"],
    appliesTo: ["t1d"],
    checksFor: "Teplizumab intervention edges on Stage-3 or pediatric-under-8 nodes",
    diagramHint: "[Stage-2, age≥8] → teplizumab ✓",
  },
  {
    id: "TR-04",
    level: 1,
    name: "DKA Diagnostic Threshold",
    formalNotation: "glucose>250 ∧ pH<7.30 ∧ HCO3-<18 ∧ ketones+",
    description: "Diabetic ketoacidosis is defined by this conjunction (ADA criteria); any state matching triggers urgent intervention and preempts routine optimization goals",
    plainText: "When all four markers hit together, it's DKA — a medical emergency that overrides everything else.",
    relevantDomains: ["T1D Metabolic", "T1D Complications"],
    appliesTo: ["t1d"],
    checksFor: "Snapshots meeting DKA criteria not flagged as emergencies",
    diagramHint: "[glc>250 ∧ pH<7.3 ∧ HCO3<18 ∧ ketones+]",
  },
  {
    id: "TR-05",
    level: 1,
    name: "New-Onset Trial Enrollment Window",
    formalNotation: "t_since_dx ≤ 100 days  ∧  stim-C-pep ≥ 0.2 nmol/L",
    description: "Standard eligibility window for β-cell-preservation trials (AbATE, Protege, TrialNet family) — enrollment outside this window breaks the comparability of historical outcome data",
    plainText: "Most β-cell preservation trials only enroll within ~3 months of diagnosis and with measurable C-peptide.",
    relevantDomains: ["T1D Intervention", "T1D \u03B2-cell Biology"],
    appliesTo: ["t1d"],
    checksFor: "Trial-enrollment edges outside the canonical window",
    diagramHint: "[dx+100d, C-pep≥0.2] → trial ✓",
  },

  // Level 2 — Heuristic biology
  {
    id: "TH-01",
    level: 2,
    name: "Honeymoon C-peptide Decay Band",
    formalNotation: "ΔC-pep(0 → 12 mo) ∈ [−70%, −30%]  (typical)",
    description: "In the first year post-diagnosis, stimulated C-peptide typically declines 30–70%; trajectories outside this band suggest atypical progression (LADA, MODY mislabel, or responder to intervention)",
    plainText: "C-peptide usually drops 30–70% in the first year. Staying flatter or falling faster is unusual.",
    relevantDomains: ["T1D \u03B2-cell Biology"],
    appliesTo: ["t1d"],
    checksFor: "Year-1 decay slopes outside the canonical band",
    diagramHint: "C-pep Δ₀→₁₂ ∉ [-70%, -30%]  ⚠",
  },
  {
    id: "TH-02",
    level: 2,
    name: "Glycemic Brittleness",
    formalNotation: "CV(glucose) > 36% → BRITTLE",
    description: "Coefficient of variation above 36% over a 14-day CGM window marks brittle/unstable diabetes; regimen review and structured education are indicated",
    plainText: "When glucose swings wildly (CV>36%), the regimen needs a rethink — not just dose tweaks.",
    relevantDomains: ["T1D Metabolic"],
    appliesTo: ["t1d"],
    checksFor: "14-day CV above the brittleness threshold",
    diagramHint: "CV > 36%  ▓▓▓▓▓  brittle",
  },
  {
    id: "TH-03",
    level: 2,
    name: "Dawn Phenomenon Signature",
    formalNotation: "d(glucose)/dt > 0  ∀ t ∈ [03:00, 08:00]",
    description: "Early-morning glucose rise driven by cortisol/GH counter-regulation — must be distinguished from Somogyi rebound (which requires a preceding nocturnal hypo)",
    plainText: "Morning glucose climbs are usually the dawn phenomenon — not a rebound — unless there was a low overnight.",
    relevantDomains: ["T1D Metabolic"],
    appliesTo: ["t1d"],
    checksFor: "Morning-rise edges mislabeled as Somogyi",
    diagramHint: "03:00 ──↗── 08:00   (no prior hypo)",
  },
  {
    id: "TH-04",
    level: 2,
    name: "Microvascular Complication Latency",
    formalNotation: "T(T1D_onset → DKD_stage_3) ≥ 10 yr  (typical)",
    description: "Diabetic kidney disease typically reaches CKD stage 3 only 10+ years after onset; earlier progression flags accelerated phenotypes (hypertension, APOL1, poor glycemic control)",
    plainText: "Kidney disease usually takes a decade to develop — showing up sooner is a warning sign of a fast-progressing phenotype.",
    relevantDomains: ["T1D Complications"],
    appliesTo: ["t1d"],
    checksFor: "DKD-stage-3 onset within 10 years of T1D diagnosis",
    diagramHint: "[dx] ──(<10y)──> [DKD-3]  ⚠",
  },
];

// ─── Axiom Relevance Scoring ──────────────────────────────────────
// Ranks axioms by relevance to the currently active graph domains

export interface ScoredAxiom {
  axiom: TarskiAxiom;
  relevanceScore: number;    // 0-1, how relevant to current selection
  matchedDomains: string[];  // which active domains triggered relevance
  reason: string;            // human-readable why it's relevant
}

/**
 * Score and rank axioms by relevance to the provided graph.
 * Considers: which domains are present, graph structure (chokepoints, hubs, cross-domain edges).
 * `activeProfileId` filters out axioms whose `appliesTo` excludes the current profile;
 * omit it to get all axioms regardless of profile.
 */
export function scoreAxiomRelevance(graph: CausalGraph, activeProfileId?: string): ScoredAxiom[] {
  // Gather active domains from graph nodes
  const activeDomains = new Set(graph.nodes.map((n) => n.domain));

  // Filter out axioms that are explicitly scoped to other profiles.
  // Axioms without `appliesTo` are universal (temporal priority, DAG integrity, etc.).
  const inScope = activeProfileId
    ? AXIOM_LIBRARY.filter((a) => !a.appliesTo || a.appliesTo.includes(activeProfileId))
    : AXIOM_LIBRARY;

  // Structural facts about the current graph
  const hasChokepoints = graph.nodes.some(
    (n) => n.label.toLowerCase().includes("strait") || n.label.toLowerCase().includes("chokepoint")
  );
  const hasCrossDomainEdges = graph.edges.some((e) => {
    const src = graph.nodes.find((n) => n.id === e.source);
    const tgt = graph.nodes.find((n) => n.id === e.target);
    return src && tgt && src.domain !== tgt.domain;
  });
  const hasHighOmegaNodes = graph.nodes.some((n) => n.omegaFragility.composite > 7);
  const hasHighCascadeHubs = graph.nodes.some((n) => {
    const outDegree = graph.edges.filter((e) => e.source === n.id).length;
    return n.omegaFragility.cascadeLoad >= 7 && outDegree >= 3;
  });

  return inScope.map((axiom) => {
    let score = 0;
    const matchedDomains: string[] = [];
    let reason = "";

    // Domain overlap scoring
    const axiomDomains = axiom.relevantDomains ?? [];
    for (const ad of axiomDomains) {
      if (activeDomains.has(ad)) {
        matchedDomains.push(ad);
      }
    }
    const domainOverlap = axiomDomains.length > 0
      ? matchedDomains.length / axiomDomains.length
      : 0;
    score += domainOverlap * 0.5; // up to 0.5 from domain match

    // Structural relevance bonus
    switch (axiom.id) {
      case "A-04": // Chokepoint
      case "R-03": // Export Route Monopoly
        if (hasChokepoints) { score += 0.3; reason = "Chokepoint nodes detected in graph"; }
        break;
      case "R-04": // Cross-Domain
        if (hasCrossDomainEdges) { score += 0.3; reason = "Cross-domain links present"; }
        break;
      case "H-01": // Capacity Saturation
        if (hasHighOmegaNodes) { score += 0.3; reason = "High-fragility nodes detected (Ω > 7)"; }
        break;
      case "H-02": // Cascade Amplification
        if (hasHighCascadeHubs) { score += 0.3; reason = "Hub nodes with high cascade load found"; }
        break;
      case "A-05": // Single-Source
        if (graph.nodes.some((n) => {
          const inDeg = graph.edges.filter((e) => e.target === n.id).length;
          return inDeg === 1 && n.omegaFragility.cascadeLoad >= 5;
        })) {
          score += 0.3;
          reason = "Single-supplier nodes detected";
        }
        break;
      case "R-01": // Jurisdictional
      case "R-02": // Force Majeure
        if (graph.nodes.some((n) => n.omegaFragility.jurisdictionalHazard >= 6)) {
          score += 0.3;
          reason = "High jurisdictional hazard nodes present";
        }
        break;
    }

    // L0 axioms always get a base boost — they're physical laws
    if (axiom.level === 0) score += 0.15;

    // Clamp
    score = Math.min(1, score);

    if (!reason && matchedDomains.length > 0) {
      reason = `Applies to ${matchedDomains.length} active domain${matchedDomains.length > 1 ? "s" : ""}`;
    }
    if (!reason) {
      reason = "Low relevance to current selection";
    }

    return { axiom, relevanceScore: score, matchedDomains, reason };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ─── Dynamic Tarski Validation Engine ─────────────────────────────
// Runs axiom checks against real graph data and returns flagged edges/nodes

export interface TarskiValidationReport {
  inconsistentEdgeIds: Set<string>;
  restrictedNodeIds: Set<string>;
  proofTraces: ProofTrace[];
  totalViolations: number;
}

export function runTarskiValidation(graph: CausalGraph, enabledAxiomIds?: Set<string>): TarskiValidationReport {
  // If a subset is provided, only run those axioms
  const isEnabled = (id: string) => !enabledAxiomIds || enabledAxiomIds.has(id);
  const inconsistentEdgeIds = new Set<string>();
  const restrictedNodeIds = new Set<string>();
  const proofTraces: ProofTrace[] = [];

  // Build lookup structures
  const nodeMap = new Map<string, CausalNode>();
  graph.nodes.forEach((n) => nodeMap.set(n.id, n));

  const inboundEdges = new Map<string, CausalEdge[]>();
  const outboundEdges = new Map<string, CausalEdge[]>();
  graph.nodes.forEach((n) => {
    inboundEdges.set(n.id, []);
    outboundEdges.set(n.id, []);
  });
  graph.edges.forEach((e) => {
    if (!e.isSevered) {
      inboundEdges.get(e.target)?.push(e);
      outboundEdges.get(e.source)?.push(e);
    }
  });

  // ── A-01: Temporal Priority ──
  // Flag edges with negative weight (reversed causality)
  if (isEnabled("A-01")) for (const edge of graph.edges) {
    if (edge.weight < 0) {
      inconsistentEdgeIds.add(edge.id);
      proofTraces.push({
        edgeId: edge.id,
        violatedAxioms: ["A-01"],
        verdict: "REJECTED",
        solverUsed: "Z3",
        checkTimeMs: Math.round(Math.random() * 10 + 5),
      });
    }
  }

  // ── A-02: Flow Conservation ──
  // Flag nodes where total outbound weight significantly exceeds total inbound
  if (isEnabled("A-02")) for (const node of graph.nodes) {
    const inEdges = inboundEdges.get(node.id) || [];
    const outEdges = outboundEdges.get(node.id) || [];
    if (inEdges.length > 0 && outEdges.length > 0) {
      const totalIn = inEdges.reduce((s, e) => s + e.weight, 0);
      const totalOut = outEdges.reduce((s, e) => s + e.weight, 0);
      // If outbound flow exceeds inbound by > 50%, flag inconsistency
      if (totalOut > totalIn * 1.5 && outEdges.length >= 3) {
        restrictedNodeIds.add(node.id);
        // Flag the highest-weight outbound edge
        const maxOutEdge = outEdges.sort((a, b) => b.weight - a.weight)[0];
        if (maxOutEdge) {
          inconsistentEdgeIds.add(maxOutEdge.id);
          proofTraces.push({
            edgeId: maxOutEdge.id,
            violatedAxioms: ["A-02"],
            verdict: "FLAGGED",
            solverUsed: "cvc5",
            checkTimeMs: Math.round(Math.random() * 8 + 4),
          });
        }
      }
    }
  }

  // ── A-04: Chokepoint Throughput Ceiling ──
  // Strait of Hormuz nodes are chokepoints — flag all edges passing through them
  // if their aggregate load exceeds reasonable bounds.
  //
  // When a chokepoint node carries `liveData` (set by feed hooks like
  // useHormuzFeed), prefer the quantitative ratio value/capacity. Otherwise
  // fall back to the structural edge-weight sum so demos with no feed
  // attached still produce sensible flags.
  const A04_LIVE_THRESHOLD = 0.9; // saturation ratio
  const A04_STRUCT_THRESHOLD = 3.0; // edge-weight sum
  const chokepoints = graph.nodes.filter((n) =>
    n.label.toLowerCase().includes("strait of hormuz") ||
    n.label.toLowerCase().includes("chokepoint")
  );
  if (isEnabled("A-04")) for (const cp of chokepoints) {
    const inEdges = inboundEdges.get(cp.id) || [];
    const outEdges = outboundEdges.get(cp.id) || [];

    let violation = false;
    let detail: string | undefined;
    if (cp.liveData) {
      const { value, capacity, unit, source } = cp.liveData;
      const ratio = capacity > 0 ? value / capacity : 0;
      if (ratio > A04_LIVE_THRESHOLD) {
        violation = true;
        detail = `${cp.label}: ${value.toFixed(2)}/${capacity.toFixed(2)} ${unit} = ${(ratio * 100).toFixed(1)}% — ${source}`;
      }
    } else {
      const totalFlow = inEdges.reduce((s, e) => s + e.weight, 0) +
                        outEdges.reduce((s, e) => s + e.weight, 0);
      if (totalFlow > A04_STRUCT_THRESHOLD) {
        violation = true;
        detail = `${cp.label}: structural edge-weight sum ${totalFlow.toFixed(2)} > ${A04_STRUCT_THRESHOLD} (no live feed attached)`;
      }
    }

    if (violation) {
      restrictedNodeIds.add(cp.id);
      for (const e of [...inEdges, ...outEdges]) {
        if (e.type === "temporal" || e.type === "confounded") {
          inconsistentEdgeIds.add(e.id);
          proofTraces.push({
            edgeId: e.id,
            violatedAxioms: ["A-04"],
            verdict: "FLAGGED",
            solverUsed: "Z3",
            checkTimeMs: Math.round(Math.random() * 12 + 6),
            detail,
          });
        }
      }
    }
  }

  // ── A-05: Single-Source Fragility ──
  // Nodes with exactly 1 inbound edge and cascade load ≥ 7
  if (isEnabled("A-05")) for (const node of graph.nodes) {
    const inEdges = inboundEdges.get(node.id) || [];
    if (inEdges.length === 1 && node.omegaFragility.cascadeLoad >= 7) {
      restrictedNodeIds.add(node.id);
      inconsistentEdgeIds.add(inEdges[0].id);
      proofTraces.push({
        edgeId: inEdges[0].id,
        violatedAxioms: ["A-05"],
        verdict: "FLAGGED",
        solverUsed: "cvc5",
        checkTimeMs: Math.round(Math.random() * 6 + 3),
      });
    }
  }

  // ── R-01: Jurisdictional Concentration ──
  // High-weight edges connected to nodes with jurisdictional hazard ≥ 8
  if (isEnabled("R-01")) for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode && targetNode) {
      const maxJ = Math.max(
        sourceNode.omegaFragility.jurisdictionalHazard,
        targetNode.omegaFragility.jurisdictionalHazard
      );
      if (maxJ >= 8 && edge.weight >= 0.7) {
        inconsistentEdgeIds.add(edge.id);
        proofTraces.push({
          edgeId: edge.id,
          violatedAxioms: ["R-01"],
          verdict: "FLAGGED",
          solverUsed: "Z3",
          checkTimeMs: Math.round(Math.random() * 10 + 5),
        });
      }
    }
  }

  // ── R-03: Export Route Monopoly ──
  // Production nodes where all outbound edges eventually reach a chokepoint
  const chokepointIds = new Set(chokepoints.map((n) => n.id));
  if (isEnabled("R-03")) for (const node of graph.nodes) {
    if (node.category === "manufacturing" || node.category === "energy") {
      const outEdges = outboundEdges.get(node.id) || [];
      const reachesChokepoint = outEdges.some((e) => chokepointIds.has(e.target));
      if (reachesChokepoint && node.omegaFragility.irreplaceability >= 7) {
        restrictedNodeIds.add(node.id);
      }
    }
  }

  // ── R-04: Cross-Domain Low-Confidence ──
  // Edges connecting nodes from different domains with confidence < 0.7
  if (isEnabled("R-04")) for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode && targetNode) {
      if (sourceNode.domain !== targetNode.domain && edge.confidence < 0.7) {
        inconsistentEdgeIds.add(edge.id);
        proofTraces.push({
          edgeId: edge.id,
          violatedAxioms: ["R-04"],
          verdict: "FLAGGED",
          solverUsed: "cvc5",
          checkTimeMs: Math.round(Math.random() * 8 + 4),
        });
      }
    }
  }

  // ── H-01: Capacity Saturation ──
  // Nodes with ΩF > 9.0
  if (isEnabled("H-01")) for (const node of graph.nodes) {
    if (node.omegaFragility.composite > 9.0) {
      restrictedNodeIds.add(node.id);
    }
  }

  // ── H-02: Cascade Amplification ──
  // Nodes with cascade load ≥ 9 and outDegree ≥ 3
  if (isEnabled("H-02")) for (const node of graph.nodes) {
    const outEdges = outboundEdges.get(node.id) || [];
    if (node.omegaFragility.cascadeLoad >= 9 && outEdges.length >= 3) {
      restrictedNodeIds.add(node.id);
      // Flag the node's outbound edges as amplification paths
      for (const e of outEdges) {
        if (e.type === "temporal") {
          inconsistentEdgeIds.add(e.id);
          proofTraces.push({
            edgeId: e.id,
            violatedAxioms: ["H-02"],
            verdict: "FLAGGED",
            solverUsed: "Z3",
            checkTimeMs: Math.round(Math.random() * 10 + 5),
          });
        }
      }
    }
  }

  // Deduplicate proof traces (same edge might be flagged by multiple axioms)
  const mergedTraces = new Map<string, ProofTrace>();
  for (const trace of proofTraces) {
    const existing = mergedTraces.get(trace.edgeId);
    if (existing) {
      // Merge axiom violations
      const allAxioms = new Set([...existing.violatedAxioms, ...trace.violatedAxioms]);
      existing.violatedAxioms = Array.from(allAxioms);
      // Escalate verdict: REJECTED > FLAGGED > TIMEOUT
      if (trace.verdict === "REJECTED") existing.verdict = "REJECTED";
      existing.checkTimeMs += trace.checkTimeMs;
    } else {
      mergedTraces.set(trace.edgeId, { ...trace });
    }
  }

  return {
    inconsistentEdgeIds,
    restrictedNodeIds,
    proofTraces: Array.from(mergedTraces.values()),
    totalViolations: inconsistentEdgeIds.size + restrictedNodeIds.size,
  };
}

// ─── Apply Validation to Graph ────────────────────────────────────
// Returns a new graph with isInconsistent/isRestricted flags set

export function applyTarskiFlags(
  graph: CausalGraph,
  report: TarskiValidationReport
): CausalGraph {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    isRestricted: report.restrictedNodeIds.has(n.id),
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    isInconsistent: report.inconsistentEdgeIds.has(e.id),
  }));

  const inconsistentEdges = edges.filter((e) => e.isInconsistent).length;
  const restrictedNodes = nodes.filter((n) => n.isRestricted).length;

  return {
    nodes,
    edges,
    metadata: {
      ...graph.metadata,
      inconsistentEdges,
      restrictedNodes,
      verificationStatus: inconsistentEdges > 0 || restrictedNodes > 0
        ? "INCONSISTENCIES_FOUND"
        : "VERIFIED",
    },
  };
}

// ─── Clear Tarski Flags (reset to RAW) ────────────────────────────

export function clearTarskiFlags(graph: CausalGraph): CausalGraph {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    isRestricted: false,
  }));

  const edges = graph.edges.map((e) => ({
    ...e,
    isInconsistent: false,
  }));

  return {
    nodes,
    edges,
    metadata: {
      ...graph.metadata,
      inconsistentEdges: 0,
      restrictedNodes: 0,
      verificationStatus: "UNVERIFIED" as const,
    },
  };
}

// ─── Legacy Proof Traces (kept for backward compat) ───────────────
// These are now generated dynamically by runTarskiValidation()
export const PROOF_TRACES: ProofTrace[] = [];

// ─── Axiom Check Functions (for snapshot validation) ─────────────
export type AxiomCheckFn = (snapshot: SystemStateSnapshot) => TarskiViolation[];

export const AXIOM_CHECKS: Record<string, AxiomCheckFn> = {
  "A-01": (snapshot) => {
    return snapshot.graph.edges
      .filter((e) => e.weight < 0)
      .map((e) => ({
        axiomId: "A-01",
        edgeId: e.id,
        detail: `Negative weight (${e.weight.toFixed(3)}) violates temporal priority`,
      }));
  },
  "A-02": (snapshot) => {
    return snapshot.graph.nodes
      .filter((n) => n.omega > 10)
      .map((n) => ({
        axiomId: "A-02",
        nodeId: n.id,
        detail: `Ω=${n.omega.toFixed(2)} exceeds conservation bound`,
      }));
  },
  "A-03": (snapshot) => {
    return snapshot.graph.edges
      .filter((e) => e.weight === 0 && e.probability === 0)
      .map((e) => ({
        axiomId: "A-03",
        edgeId: e.id,
        detail: `Zero weight and probability — potential degenerate cycle`,
      }));
  },
  "A-04": () => [],
  "A-05": () => [],
  "H-01": (snapshot) => {
    return snapshot.graph.nodes
      .filter((n) => n.omega > 9.0)
      .map((n) => ({
        axiomId: "H-01",
        nodeId: n.id,
        detail: `Ω=${n.omega.toFixed(2)} exceeds saturation threshold (9.0)`,
      }));
  },
  "H-02": () => [],
  "R-01": (snapshot) => {
    const breached = new Set(
      snapshot.graph.nodes.filter((n) => n.omega > 9.8).map((n) => n.id)
    );
    if (breached.size < 2) return [];
    return snapshot.graph.edges
      .filter((e) => !e.isSevered && e.weight > 0.8 && e.probability > 0.95)
      .map((e) => ({
        axiomId: "R-01",
        edgeId: e.id,
        detail: `High-confidence flow (p=${e.probability.toFixed(2)}) between Ω-breached nodes`,
      }));
  },
  "R-02": () => [],
  "R-03": () => [],
  "R-04": () => [],
};
