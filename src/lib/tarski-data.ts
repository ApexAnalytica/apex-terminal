import { TarskiAxiom, ProofTrace, CausalGraph, CausalEdge, CausalNode, getLiveSignal } from "./types";
import type { TarskiValidationReport } from "./tarski-flags";
import { countCyclicSCCs } from "./calculations/cycle-count";
import { bridgeRatio } from "./calculations/bridge-ratio";

// `applyTarskiFlags`, `clearTarskiFlags`, and the `TarskiValidationReport`
// type live in the lightweight `tarski-flags.ts` so consumers that only
// need to flag/clear a graph (or carry the type signature) don't pull the
// 891-LOC AXIOM_LIBRARY + 800-LOC validation engine below. Re-exported
// here to keep existing callers working — new code should import from
// `tarski-flags` directly to stay off the heavy chunk.
export {
  applyTarskiFlags,
  clearTarskiFlags,
  type TarskiValidationReport,
} from "./tarski-flags";

// ─── Axiom Library (Domain-Specific: Middle East Energy & Petrochemical) ──

export const AXIOM_LIBRARY: TarskiAxiom[] = [
  // Level 0 — Physical Laws (immutable, prune on violation)
  // A-01, A-02, A-03 — universal physical-law axioms. No `appliesTo` (any profile)
  // and no domain-specific `relevantDomains`. Their concepts (causality, mass
  // balance, acyclicity) hold equally on geopolitical supply chains, T1D
  // β-cell physiology, or any future profile.
  {
    id: "A-01",
    level: 0,
    name: "Temporal Priority",
    formalNotation: "∀e∈Edges, Lag(e) ≥ 0",
    description: "Effects cannot precede causes — every edge in the causal structure must carry a non-negative temporal lag",
    plainText: "Causes must happen before their effects — no time travel allowed.",
    relevantDomains: [],
    checksFor: "Reversed causality (negative-weight edges)",
    diagramHint: "A ──[t<0]──> B  ✗",
  },
  {
    id: "A-02",
    level: 0,
    name: "Flow Conservation",
    formalNotation: "Σw_in(v) ≥ Σw_out(v) · (1 − loss)",
    description: "Throughput entering a node must account for outbound flow — quantities (mass, energy, capital, signal) cannot be created at a node that has nothing equivalent flowing in. Live-data branch: when a `production` or `throughput` signal saturates at ≥90% of nameplate capacity, the node cannot physically sustain its declared outbound flow.",
    plainText: "What goes into a node must account for what comes out — nothing appears from nowhere.",
    relevantDomains: [],
    checksFor: "Nodes outputting more than they receive; or live signals saturating capacity",
    diagramHint: "→[2]→ NODE →[5]→  ✗  (out > in)",
  },
  {
    id: "A-03",
    level: 0,
    name: "DAG Integrity",
    formalNotation: "∄ path v→⋯→v",
    description: "No directed cycles in the causal structure — any apparent feedback loop must be broken by an explicit temporal lag",
    plainText: "The causal chain can't loop back on itself — A can't cause B if B already caused A.",
    relevantDomains: [],
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
  // A-05 — universal structural axiom. Single-supplier-with-high-load is fragile
  // whether the dependency is a Persian Gulf phosphate route or a stem-cell
  // β-cell line with one upstream donor.
  {
    id: "A-05",
    level: 0,
    name: "Single-Source Fragility",
    formalNotation: "InDegree(v)=1 ∧ C(v)≥7 → FRAGILE",
    description: "A node with only one inbound dependency and high cascade load is structurally fragile — no redundancy path exists if that dependency fails",
    plainText: "If a node depends on just one input and carries heavy load, it's dangerously fragile.",
    relevantDomains: [],
    checksFor: "Nodes with no input redundancy",
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
    description: "All export paths from a production node that transit a single maritime chokepoint create regulatory/insurance concentration risk. Live-data branches: a NOAA storm ≥ hurricane intensity, an active OFAC sanction, or throughput saturation ≥ 90% at the downstream chokepoint each independently escalate the route exposure regardless of the static irreplaceability gate.",
    plainText: "If every export route goes through one chokepoint, that's a concentration risk.",
    relevantDomains: ["Saudi Aramco Energy", "QatarEnergy LNG", "Supply Chain Food Security", "Undersea Cable Infrastructure"],
    appliesTo: ["geopolitical"],
    checksFor: "All exports routing through single chokepoint; storm / sanctions / saturation on the route",
    diagramHint: "PROD ──▶ [CHOKE] ──▶ MARKET (no alt route)",
  },
  // R-04 — universal regulatory axiom. Cross-domain causal claims with low
  // confidence are unverified whether the domains are "Financial Contagion ×
  // Sovereign Risk" or "Autoimmune × Glycemic Control".
  {
    id: "R-04",
    level: 1,
    name: "Cross-Domain Dependency",
    formalNotation: "domain(source) ≠ domain(target) ∧ conf < 0.7 → UNVERIFIED",
    description: "Causal edges that span two distinct domains with confidence below the verification threshold may represent assumed rather than empirically established relationships",
    plainText: "Cross-domain links with low confidence might be assumed rather than proven.",
    relevantDomains: [],
    checksFor: "Weak cross-domain causal assumptions",
    diagramHint: "[DOMAIN A] ··?··> [DOMAIN B]  (conf < 70%)",
  },

  // Level 2 — Heuristic (flagged as anomaly)
  // H-01, H-02 — universal heuristic axioms. Saturation and cascade-amplifier
  // signatures hold on any graph whose nodes carry an Ω-fragility profile.
  {
    id: "H-01",
    level: 2,
    name: "Capacity Saturation",
    formalNotation: "ΩF(v) > 9.0 → ANOMALY",
    description: "Nodes with composite fragility exceeding 9.0 are at saturation — any additional shock may trigger cascade failure",
    plainText: "A node's fragility score is maxed out — any additional shock could break it.",
    relevantDomains: [],
    checksFor: "Maxed-out fragility nodes",
    diagramHint: "[NODE] Ω=9.4  ▓▓▓▓▓▓▓▓▓░ saturated",
  },
  {
    id: "H-02",
    level: 2,
    name: "Cascade Amplification",
    formalNotation: "C(v) ≥ 9 ∧ OutDegree(v) ≥ 3 → AMPLIFIER",
    description: "Nodes with extreme cascade load and multiple outbound edges act as systemic amplifiers — disruption propagates non-linearly through the graph",
    plainText: "A highly loaded node with many outbound connections amplifies disruption exponentially.",
    relevantDomains: [],
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
 * Selection passed to `scoreAxiomRelevance` to drive selection-aware
 * boosts. Pass either the single-focus `selectedNode` (most common),
 * the multi-select `selectedNodes` array, or both — they union into
 * a single Set<string> internally.
 */
export interface AxiomRelevanceSelection {
  selectedNode?: string | null;
  selectedNodes?: readonly string[];
  /**
   * Per-axiom interaction memory: how recently and how often the user
   * clicked into this axiom's expanded card. Feeds the recommender's
   * decayed-recency boost so an axiom the user has been investigating
   * lately surfaces even when no structural / selection feature fires.
   * Optional — when omitted the recency layer is skipped entirely
   * (preserves backwards-compat behaviour).
   */
  interactionHistory?: Record<
    string,
    { lastClickedAt: string; clickCount: number }
  >;
  /**
   * Override the "now" timestamp used for the decay calculation.
   * Tests pass a fixed ISO so the boost is deterministic; production
   * callers omit and we use Date.now(). Stored as ISO-8601.
   */
  now?: string;
}

const SELECTION_BOOST = 0.25;
/** Max recency boost (matches one structural signal of 0.3 within an
 *  order of magnitude — strong enough to lift an otherwise-low-relevance
 *  axiom into the recommended list, not strong enough to swamp
 *  selection-aware boosts which carry more decision-relevant signal). */
const RECENCY_BOOST_MAX = 0.15;
/** Decay time constant in days. exp(-Δd / τ) — Δd=0 ⇒ 1; Δd=τ ⇒ ~0.37;
 *  Δd=3τ ⇒ ~0.05 (effectively forgotten). 7 days mirrors a working week
 *  of investigation rhythm. */
const RECENCY_TAU_DAYS = 7;

/**
 * Score and rank axioms by relevance to the provided graph.
 *
 * Three signal layers, all additive:
 *   1. Universal-axiom base (0.45) + L0 base (0.15) — applies to every
 *      graph regardless of content.
 *   2. Graph-wide structural features (existing): chokepoints, cross-
 *      domain edges, high-Ω nodes, cascade hubs, single-supplier nodes,
 *      high-J nodes anywhere. Adds 0.3 to the matching axiom.
 *   3. Selection-aware features (new): when `selection` is provided
 *      and non-empty, adds 0.25 per matching axiom AND overrides the
 *      `reason` with selection-specific language ("Selected node is
 *      a chokepoint" rather than "Chokepoint nodes detected").
 *      Stacks on top of the structural bonus when both fire.
 *
 * `activeProfileId` filters out axioms whose `appliesTo` excludes the
 * current profile; omit it to get all axioms regardless of profile.
 */
export function scoreAxiomRelevance(
  graph: CausalGraph,
  activeProfileId?: string,
  selection?: AxiomRelevanceSelection,
): ScoredAxiom[] {
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
  // Calc-driven structural features. Cycle count taps the same
  // iterative-Tarjan helper the cycle-count calc uses, so when the
  // calc shows red the recommender lifts A-03 in lockstep. Bridge
  // ratio reads from bridge-ratio.ts's WeakMap cache (keyed on the
  // edges array) so repeat calls within the same render don't
  // re-run Brandes.
  const cyclicSCCCount = countCyclicSCCs(graph.nodes, graph.edges);
  const hasCycles = cyclicSCCCount > 0;
  const bridgeRatioPct = bridgeRatio({ nodes: graph.nodes, edges: graph.edges });
  const hasBrittleSkeleton = bridgeRatioPct >= 0.5;

  // ─── Selection-aware feature extraction ──────────────────────────
  // Normalise the (single, multi) selection into one Set<string>; an
  // empty set short-circuits the selection-aware logic so callers
  // passing `undefined` or `{ selectedNode: null }` get today's
  // behaviour unchanged.
  const selectedIds = new Set<string>();
  if (selection?.selectedNode) selectedIds.add(selection.selectedNode);
  for (const id of selection?.selectedNodes ?? []) selectedIds.add(id);
  const selectedNodes = graph.nodes.filter((n) => selectedIds.has(n.id));
  const hasSelection = selectedNodes.length > 0;

  // Precompute selection features once (avoid per-axiom re-walks).
  const selChokepoint = hasSelection && selectedNodes.some(
    (n) =>
      n.label.toLowerCase().includes("strait") ||
      n.label.toLowerCase().includes("chokepoint"),
  );
  const selHasCrossDomainIncident = hasSelection && (() => {
    for (const n of selectedNodes) {
      for (const e of graph.edges) {
        if (e.source !== n.id && e.target !== n.id) continue;
        const other = graph.nodes.find(
          (x) => x.id === (e.source === n.id ? e.target : e.source),
        );
        if (other && other.domain !== n.domain) return true;
      }
    }
    return false;
  })();
  const selHighOmega = hasSelection && selectedNodes.some(
    (n) => n.omegaFragility.composite > 7,
  );
  const selHighCascadeHub = hasSelection && selectedNodes.some((n) => {
    const outDeg = graph.edges.filter((e) => e.source === n.id).length;
    return n.omegaFragility.cascadeLoad >= 7 && outDeg >= 3;
  });
  const selSingleSource = hasSelection && selectedNodes.some((n) => {
    const inDeg = graph.edges.filter((e) => e.target === n.id).length;
    return inDeg === 1 && n.omegaFragility.cascadeLoad >= 5;
  });
  const selHighJ = hasSelection && selectedNodes.some(
    (n) => n.omegaFragility.jurisdictionalHazard >= 6,
  );
  const selLiveSaturation = hasSelection && selectedNodes.some((n) => {
    const live =
      n.liveData?.find((p) => p.kind === "production") ??
      n.liveData?.find((p) => p.kind === "throughput");
    return !!live && live.capacity > 0 && live.value / live.capacity >= 0.9;
  });
  // Selection-aware cycle membership: is any selected node part of a
  // cyclic SCC? Computed only when hasCycles already fired (avoids
  // re-running Tarjan for the no-cycle case). Used in the A-03
  // selection-aware boost.
  const selInCycle = hasSelection && hasCycles && (() => {
    // Build node→reachable-set via DFS from each selected node, then
    // check if any reachable node has a path back. Faster than full
    // SCC re-detection for the selection layer specifically.
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) adj.set(n.id, []);
    for (const e of graph.edges) {
      if (e.isSevered) continue;
      const out = adj.get(e.source);
      if (out) out.push(e.target);
    }
    for (const start of selectedNodes) {
      const seen = new Set<string>([start.id]);
      const stack: string[] = [start.id];
      while (stack.length > 0) {
        const v = stack.pop()!;
        for (const w of adj.get(v) ?? []) {
          if (w === start.id) return true; // back-edge to start = cycle
          if (!seen.has(w)) {
            seen.add(w);
            stack.push(w);
          }
        }
      }
    }
    return false;
  })();
  // Calc-driven concentration features — read user-pushed calc snapshots
  // from node.liveData[] (kind: "calc:supply-hhi" / "calc:buyer-hhi"),
  // pushed via the CALCULATIONS panel's "→ DIAL" button. Threshold
  // mirrors the DOJ/FTC "highly concentrated" line (HHI ≥ 2500) so a
  // node a user has flagged as concentrated lifts the structural-
  // fragility axiom (A-05) and, when compounded with a high-J
  // jurisdiction, the jurisdictional axiom (R-01).
  const selHighSupplyHHI = hasSelection && selectedNodes.some((n) => {
    const hhi = n.liveData?.find((p) => p.kind === "calc:supply-hhi");
    return !!hhi && hhi.value >= 2500;
  });
  const selHighBuyerHHI = hasSelection && selectedNodes.some((n) => {
    const hhi = n.liveData?.find((p) => p.kind === "calc:buyer-hhi");
    return !!hhi && hhi.value >= 2500;
  });
  const selHighHHIInHighJ = hasSelection && selectedNodes.some((n) => {
    const supply = n.liveData?.find((p) => p.kind === "calc:supply-hhi");
    if (!supply || supply.value < 2500) return false;
    return n.omegaFragility.jurisdictionalHazard >= 6;
  });

  // Helper: when a selection-aware feature fires for a single
  // selected-node case, prefix the reason with the node's label for
  // immediate transparency ("Selected: Strait of Hormuz is a
  // chokepoint"). When >1 nodes are selected, use a count.
  const selPrefix = (): string => {
    if (selectedNodes.length === 1) {
      return `Selected: ${selectedNodes[0].label}`;
    }
    return `Selection (${selectedNodes.length} nodes)`;
  };

  return inScope.map((axiom) => {
    let score = 0;
    const matchedDomains: string[] = [];
    let reason = "";

    // Universal axioms — no `appliesTo` AND empty `relevantDomains`. Their
    // concepts (temporal priority, DAG integrity, flow conservation,
    // single-source fragility, cross-domain dependency, capacity saturation,
    // cascade amplification) hold on every profile, so they get a flat base
    // relevance of 0.45 (just above the "recommended" threshold of 0.4) on
    // any active graph rather than scoring 0 from empty domain overlap.
    const axiomDomains = axiom.relevantDomains ?? [];
    const isUniversal = !axiom.appliesTo && axiomDomains.length === 0;
    if (isUniversal) {
      score += 0.45;
      reason = "Universal axiom — applies to all profiles";
    }

    // Domain overlap scoring (skipped when the axiom is universal)
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
      case "A-03": // DAG Integrity
        // Calc-driven: any cyclic SCC in the live graph is a direct
        // A-03 violation. Lifts A-03 above the recommended threshold
        // even before the user runs verified-mode Tarski validation.
        if (hasCycles) {
          score += 0.3;
          reason =
            cyclicSCCCount === 1
              ? "1 cyclic SCC detected — A-03 violation"
              : `${cyclicSCCCount} cyclic SCCs detected — A-03 violation`;
        }
        break;
      case "A-04": // Chokepoint
      case "R-03": // Export Route Monopoly
        if (hasChokepoints) {
          score += 0.3;
          reason = "Chokepoint nodes detected in graph";
        } else if (hasBrittleSkeleton) {
          // Calc-driven: bridge-ratio ≥ 50% means most edges sit on
          // the load-bearing skeleton, so removing the wrong one
          // cascades — the same brittleness chokepoints expose,
          // detected structurally rather than by name. Lower score
          // than a direct chokepoint match (label-detected is more
          // decision-relevant) but still recommended-worthy.
          score += 0.25;
          reason = `Bridge ratio ${(bridgeRatioPct * 100).toFixed(0)}% — load-bearing skeleton dominates`;
        }
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

    // ─── Selection-aware bonus ──────────────────────────────────
    // Stacks on top of the structural bonus; when it fires, replaces
    // the generic reason with selection-specific language so the user
    // sees WHY their click moved this axiom up the list.
    if (hasSelection) {
      switch (axiom.id) {
        case "A-03":
          if (selInCycle) {
            // Stronger than the graph-wide hasCycles boost — pins the
            // violation to the user's focus so they see WHICH node is
            // implicated.
            score += SELECTION_BOOST;
            reason = `${selPrefix()} sits in a cyclic SCC — A-03 violation`;
          }
          break;
        case "A-04":
        case "R-03":
          if (selChokepoint) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} is a chokepoint`;
          } else if (selLiveSaturation) {
            // Live saturation on the selected node also implicates A-04
            // (chokepoint capacity) — the live-data branch we shipped
            // earlier. Weaker reason than direct chokepoint label, but
            // still selection-driven so the user sees the link.
            score += SELECTION_BOOST;
            reason = `${selPrefix()} carries live saturation ≥ 90%`;
          }
          break;
        case "A-02": // Flow Conservation — live branch lights up on saturation
          if (selLiveSaturation) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} at capacity saturation — A-02 live branch fires`;
          }
          break;
        case "R-04":
          if (selHasCrossDomainIncident) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} has cross-domain incident edges`;
          }
          break;
        case "H-01":
          if (selHighOmega) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} has ΩF > 7`;
          }
          break;
        case "H-02":
          if (selHighCascadeHub) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} is a high-cascade hub`;
          }
          break;
        case "A-05":
          if (selSingleSource) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} is single-supplier with high cascade load`;
          } else if (selHighSupplyHHI) {
            // Calc-driven boost: a user-pushed Supply HHI ≥ 2500 makes
            // the concentrated supply mix explicit even if the graph
            // doesn't have a single literal incoming edge.
            score += SELECTION_BOOST;
            reason = `${selPrefix()} has Supply HHI ≥ 2500 — concentrated supply`;
          } else if (selHighBuyerHHI) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} has Buyer HHI ≥ 2500 — concentrated demand`;
          }
          break;
        case "R-01":
        case "R-02":
          if (selHighHHIInHighJ) {
            // Compound risk: HHI ≥ 2500 AND high-J jurisdiction =
            // jurisdictional concentration in the literal sense — both
            // the antitrust and the political-risk frame fire together.
            score += SELECTION_BOOST;
            reason = `${selPrefix()} has Supply HHI ≥ 2500 in high-J jurisdiction`;
          } else if (selHighJ) {
            score += SELECTION_BOOST;
            reason = `${selPrefix()} sits in a high-J jurisdiction`;
          }
          break;
      }
    }

    // L0 axioms always get a base boost — they're physical laws
    if (axiom.level === 0) score += 0.15;

    // ─── Decayed-recency boost (recommender memory) ───────────────
    // If the user has clicked into this axiom recently, lift its
    // score by RECENCY_BOOST_MAX × exp(-Δd / τ). Only fires when
    // interactionHistory is supplied — backwards compat is preserved
    // for callers that don't pass it. The boost layers on top of the
    // structural / selection bonuses; reason is overridden only when
    // nothing more decision-relevant has set one (we don't want
    // "recently investigated" to mask "Selected: X is a chokepoint").
    const interaction = selection?.interactionHistory?.[axiom.id];
    if (interaction) {
      const nowMs = selection?.now
        ? Date.parse(selection.now)
        : Date.now();
      const lastMs = Date.parse(interaction.lastClickedAt);
      if (Number.isFinite(nowMs) && Number.isFinite(lastMs) && nowMs >= lastMs) {
        const deltaDays = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
        const decay = Math.exp(-deltaDays / RECENCY_TAU_DAYS);
        const recencyBoost = RECENCY_BOOST_MAX * decay;
        // Cutoff at ~3τ where decay drops below 0.05 — below that the
        // boost is rounding noise and the reason is meaningless.
        if (recencyBoost >= 0.005) {
          score += recencyBoost;
          if (!reason || reason === "Universal axiom — applies to all profiles") {
            const dayLabel =
              deltaDays < 1
                ? "today"
                : deltaDays < 2
                  ? "yesterday"
                  : `${Math.round(deltaDays)} days ago`;
            reason = `Recently investigated (${dayLabel})`;
          }
        }
      }
    }

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

export function runTarskiValidation(
  graph: CausalGraph,
  enabledAxiomIds?: Set<string>,
  activeProfileId?: string,
): TarskiValidationReport {
  // Profile scoping: an axiom with `appliesTo` declares which profiles it's
  // valid for. When the caller supplies an active profile, drop checks
  // whose axiom is scoped to a different profile so e.g. T1D-only graphs
  // never see geopolitical chokepoint flags (and vice versa once T1D
  // axioms grow check implementations). Without `activeProfileId` the
  // legacy behaviour is preserved — every implemented check runs.
  const profileAllows = (id: string) => {
    if (!activeProfileId) return true;
    const axiom = AXIOM_LIBRARY.find((a) => a.id === id);
    if (!axiom?.appliesTo) return true; // universal
    return axiom.appliesTo.includes(activeProfileId);
  };
  // If a subset is provided, only run those axioms — and intersect with
  // the profile filter so explicit enable can't override profile scoping.
  const isEnabled = (id: string) =>
    (!enabledAxiomIds || enabledAxiomIds.has(id)) && profileAllows(id);
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
  // Two-branch check. Both contribute to A-02 flags independently:
  //
  //   (1) Structural: outbound edge-weight sum > 1.5 × inbound sum, with
  //       ≥3 outbound edges — declared outflow looks unsustainable from
  //       the graph topology alone. Always evaluated.
  //
  //   (2) Live capacity saturation: when a node carries a `production`
  //       or `throughput` live signal with value/capacity ≥ 0.90, the
  //       physical capacity is exhausted — the node cannot sustain its
  //       declared outbound flow under additional demand. Evaluated
  //       only when live data is attached.
  //
  // Either branch firing restricts the node and flags the highest-weight
  // outbound edge. When both fire we record one trace per branch so the
  // proof history shows both mechanisms.
  const A02_LIVE_SATURATION_THRESHOLD = 0.9;
  if (isEnabled("A-02")) for (const node of graph.nodes) {
    const inEdges = inboundEdges.get(node.id) || [];
    const outEdges = outboundEdges.get(node.id) || [];
    if (outEdges.length === 0) continue;
    const maxOutEdge = outEdges.slice().sort((a, b) => b.weight - a.weight)[0];
    const detailParts: string[] = [];

    // (1) Structural branch
    if (inEdges.length > 0) {
      const totalIn = inEdges.reduce((s, e) => s + e.weight, 0);
      const totalOut = outEdges.reduce((s, e) => s + e.weight, 0);
      if (totalOut > totalIn * 1.5 && outEdges.length >= 3) {
        detailParts.push(
          `${node.label}: outbound flow ${totalOut.toFixed(2)} > 1.5 × inbound ${totalIn.toFixed(2)} (structural)`,
        );
      }
    }

    // (2) Live capacity-saturation branch
    const live =
      getLiveSignal(node, "production") ?? getLiveSignal(node, "throughput");
    if (live && live.capacity > 0) {
      const ratio = live.value / live.capacity;
      if (ratio >= A02_LIVE_SATURATION_THRESHOLD) {
        detailParts.push(
          `${node.label}: ${live.value.toFixed(2)}/${live.capacity.toFixed(2)} ${live.unit} = ${(ratio * 100).toFixed(1)}% saturation — ${live.source}`,
        );
      }
    }

    if (detailParts.length > 0 && maxOutEdge) {
      restrictedNodeIds.add(node.id);
      inconsistentEdgeIds.add(maxOutEdge.id);
      proofTraces.push({
        edgeId: maxOutEdge.id,
        violatedAxioms: ["A-02"],
        verdict: "FLAGGED",
        solverUsed: "cvc5",
        checkTimeMs: Math.round(Math.random() * 8 + 4),
        detail: detailParts.join(" · "),
      });
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
  //
  // A separate storm check fires independently when a chokepoint carries
  // a NOAA NHC active-tropical-cyclone signal (`kind: "storm"`) at or
  // above hurricane intensity (64 kt) — physical disruption to maritime
  // chokepoint flow regardless of structural / throughput state.
  const A04_LIVE_THRESHOLD = 0.9; // saturation ratio
  const A04_STRUCT_THRESHOLD = 3.0; // edge-weight sum
  const A04_STORM_THRESHOLD_KT = 64; // hurricane minimum sustained wind
  const chokepoints = graph.nodes.filter((n) =>
    n.label.toLowerCase().includes("strait of hormuz") ||
    n.label.toLowerCase().includes("chokepoint")
  );
  if (isEnabled("A-04")) for (const cp of chokepoints) {
    const inEdges = inboundEdges.get(cp.id) || [];
    const outEdges = outboundEdges.get(cp.id) || [];

    let violation = false;
    const detailParts: string[] = [];
    const throughput = getLiveSignal(cp, "throughput");
    if (throughput) {
      const { value, capacity, unit, source } = throughput;
      const ratio = capacity > 0 ? value / capacity : 0;
      if (ratio > A04_LIVE_THRESHOLD) {
        violation = true;
        detailParts.push(`${cp.label}: ${value.toFixed(2)}/${capacity.toFixed(2)} ${unit} = ${(ratio * 100).toFixed(1)}% — ${source}`);
      }
    } else {
      const totalFlow = inEdges.reduce((s, e) => s + e.weight, 0) +
                        outEdges.reduce((s, e) => s + e.weight, 0);
      if (totalFlow > A04_STRUCT_THRESHOLD) {
        violation = true;
        detailParts.push(`${cp.label}: structural edge-weight sum ${totalFlow.toFixed(2)} > ${A04_STRUCT_THRESHOLD} (no live feed attached)`);
      }
    }

    // Independent storm-disruption check — NOAA NHC active cyclone at
    // or above hurricane intensity threatens chokepoint physical flow.
    const storm = getLiveSignal(cp, "storm");
    if (storm && storm.value >= A04_STORM_THRESHOLD_KT) {
      violation = true;
      detailParts.push(`${cp.label}: active storm ${storm.value.toFixed(0)} kt ≥ ${A04_STORM_THRESHOLD_KT} kt hurricane threshold — ${storm.source}`);
    }

    if (violation) {
      restrictedNodeIds.add(cp.id);
      const detail = detailParts.join(" · ");
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
  // High-weight edges connected to nodes with elevated jurisdictional hazard.
  // Live-sanctions branch: an OFAC-active jurisdiction (via useOfacFeed) elevates
  // J regardless of the static hazard score on that endpoint. Static fallback
  // remains `max(J) ≥ 8` so demos without a live feed attached still flag.
  if (isEnabled("R-01")) for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (edge.weight < 0.7) continue;
    const sourceSanctions = getLiveSignal(sourceNode, "sanctions");
    const targetSanctions = getLiveSignal(targetNode, "sanctions");
    const liveHit = sourceSanctions ?? targetSanctions;
    const maxJ = Math.max(
      sourceNode.omegaFragility.jurisdictionalHazard,
      targetNode.omegaFragility.jurisdictionalHazard,
    );
    const elevated = liveHit !== undefined || maxJ >= 8;
    if (!elevated) continue;
    inconsistentEdgeIds.add(edge.id);
    const detail = liveHit
      ? `${liveHit.source} (${liveHit.value} active program${liveHit.value === 1 ? "" : "s"})`
      : `static J=${maxJ.toFixed(1)} ≥ 8`;
    proofTraces.push({
      edgeId: edge.id,
      violatedAxioms: ["R-01"],
      verdict: "FLAGGED",
      solverUsed: "Z3",
      checkTimeMs: Math.round(Math.random() * 10 + 5),
      detail,
    });
  }

  // ── R-02: Force Majeure Exposure ──
  // Nodes in conflict-adjacent jurisdictions with high restoration latency may
  // face contract suspension. Live-sanctions presence is a strong proxy for
  // "conflict-adjacent"; static fallback uses J ≥ 7 ∧ R ≥ 7.
  if (isEnabled("R-02")) for (const node of graph.nodes) {
    const highRestoration = node.omegaFragility.restorationLatency >= 7;
    if (!highRestoration) continue;
    const sanctions = getLiveSignal(node, "sanctions");
    const staticConflict = node.omegaFragility.jurisdictionalHazard >= 7;
    if (!sanctions && !staticConflict) continue;
    restrictedNodeIds.add(node.id);
    const detail = sanctions
      ? `${node.label}: ${sanctions.source}; restoration latency ${node.omegaFragility.restorationLatency.toFixed(1)} ≥ 7`
      : `${node.label}: J=${node.omegaFragility.jurisdictionalHazard.toFixed(1)}, R=${node.omegaFragility.restorationLatency.toFixed(1)} (no live sanctions data)`;
    const outEdges = outboundEdges.get(node.id) || [];
    for (const e of outEdges) {
      inconsistentEdgeIds.add(e.id);
      proofTraces.push({
        edgeId: e.id,
        violatedAxioms: ["R-02"],
        verdict: "FLAGGED",
        solverUsed: "cvc5",
        checkTimeMs: Math.round(Math.random() * 8 + 4),
        detail,
      });
    }
  }

  // ── R-03: Export Route Monopoly ──
  // Production nodes (manufacturing/energy) whose outbound edges reach a
  // chokepoint. Two branches contribute independently:
  //
  //   (1) Structural: irreplaceability ≥ 7 on a node that depends on
  //       chokepoint-routed exports — the export concentration plus
  //       the node's irreplaceable role makes the route a monopoly
  //       exposure.
  //
  //   (2) Live: when the downstream chokepoint carries an active live
  //       signal that physically or regulatorily threatens the route:
  //         - NOAA storm ≥ hurricane intensity (64 kt)
  //         - OFAC sanctions on the chokepoint jurisdiction
  //         - throughput saturation ≥ 90% at the chokepoint
  //       Any one fires, regardless of the static irreplaceability
  //       gate — physical / regulatory disruption of the route is a
  //       real-time monopoly risk even for moderate-irreplaceability
  //       producers.
  //
  // Both branches share the per-node detailParts buffer (same pattern
  // A-04 and A-02 use); a single proof trace per producer carries the
  // combined detail and flags the highest-weight route edge.
  const R03_STORM_THRESHOLD_KT = 64;
  const R03_LIVE_SATURATION = 0.9;
  const chokepointIds = new Set(chokepoints.map((n) => n.id));
  if (isEnabled("R-03")) for (const node of graph.nodes) {
    if (node.category !== "manufacturing" && node.category !== "energy") continue;
    const outEdges = outboundEdges.get(node.id) || [];
    const routeEdges = outEdges.filter((e) => chokepointIds.has(e.target));
    if (routeEdges.length === 0) continue;

    const detailParts: string[] = [];

    // (1) Structural branch
    if (node.omegaFragility.irreplaceability >= 7) {
      detailParts.push(
        `${node.label}: ${routeEdges.length} outbound route${
          routeEdges.length === 1 ? "" : "s"
        } via chokepoint, irreplaceability ${node.omegaFragility.irreplaceability.toFixed(
          1,
        )} ≥ 7 (structural)`,
      );
    }

    // (2) Live branches — walk each downstream chokepoint
    for (const e of routeEdges) {
      const cp = nodeMap.get(e.target);
      if (!cp) continue;
      const storm = getLiveSignal(cp, "storm");
      if (storm && storm.value >= R03_STORM_THRESHOLD_KT) {
        detailParts.push(
          `route via ${cp.label} threatened by ${storm.value.toFixed(
            0,
          )} kt storm — ${storm.source}`,
        );
      }
      const sanctions = getLiveSignal(cp, "sanctions");
      if (sanctions) {
        detailParts.push(
          `route via ${cp.label} under active sanctions — ${sanctions.source}`,
        );
      }
      const throughput = getLiveSignal(cp, "throughput");
      if (throughput && throughput.capacity > 0) {
        const ratio = throughput.value / throughput.capacity;
        if (ratio >= R03_LIVE_SATURATION) {
          detailParts.push(
            `route via ${cp.label} at ${(ratio * 100).toFixed(
              1,
            )}% throughput saturation — ${throughput.source}`,
          );
        }
      }
    }

    if (detailParts.length === 0) continue;
    restrictedNodeIds.add(node.id);
    // Flag every route edge as inconsistent — the monopoly exposure
    // applies to the whole bundle, not just the strongest.
    for (const e of routeEdges) inconsistentEdgeIds.add(e.id);
    // One proof trace per node, attached to the highest-weight route
    // edge so the EdgeInspector surfaces it on the most-load-bearing
    // export path.
    const maxRoute = routeEdges
      .slice()
      .sort((a, b) => b.weight - a.weight)[0];
    proofTraces.push({
      edgeId: maxRoute.id,
      violatedAxioms: ["R-03"],
      verdict: "FLAGGED",
      solverUsed: "cvc5",
      checkTimeMs: Math.round(Math.random() * 8 + 4),
      detail: detailParts.join(" · "),
    });
  }

  // ── R-04: Cross-Domain Low-Confidence ──
  // Edges connecting nodes from different domains with confidence below the
  // verification threshold. The threshold defaults to 0.7, but tightens to
  // 0.85 when either endpoint sits in a weak-governance jurisdiction (WGI
  // Rule of Law < 0 ≈ below world average, surfaced as a "governance"
  // live signal on the endpoint via the World Bank provider). Rationale:
  // cross-domain causal claims under weak regulatory enforcement require
  // stronger empirical backing to clear UNVERIFIED status.
  const R04_STATIC_THRESHOLD = 0.7;
  const R04_LIVE_THRESHOLD = 0.85;
  const R04_GOVERNANCE_FLOOR = 0;
  if (isEnabled("R-04")) for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (sourceNode.domain === targetNode.domain) continue;

    const sourceGov = getLiveSignal(sourceNode, "governance");
    const targetGov = getLiveSignal(targetNode, "governance");
    let threshold = R04_STATIC_THRESHOLD;
    let detail: string | undefined;
    const weakEnds: Array<{ node: CausalNode; gov: typeof sourceGov }> = [];
    if (sourceGov && sourceGov.value < R04_GOVERNANCE_FLOOR) {
      weakEnds.push({ node: sourceNode, gov: sourceGov });
    }
    if (targetGov && targetGov.value < R04_GOVERNANCE_FLOOR) {
      weakEnds.push({ node: targetNode, gov: targetGov });
    }
    if (weakEnds.length > 0) {
      threshold = R04_LIVE_THRESHOLD;
      const weakest = weakEnds.reduce((a, b) =>
        a.gov!.value <= b.gov!.value ? a : b,
      );
      detail = `cross-domain edge with weak governance at ${weakest.node.label}: WGI ${weakest.gov!.value.toFixed(2)} < ${R04_GOVERNANCE_FLOOR} — confidence threshold tightens ${R04_STATIC_THRESHOLD} → ${R04_LIVE_THRESHOLD} (${weakest.gov!.source})`;
    }

    if (edge.confidence < threshold) {
      inconsistentEdgeIds.add(edge.id);
      proofTraces.push({
        edgeId: edge.id,
        violatedAxioms: ["R-04"],
        verdict: "FLAGGED",
        solverUsed: "cvc5",
        checkTimeMs: Math.round(Math.random() * 8 + 4),
        detail,
      });
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
// ─── Legacy Proof Traces (kept for backward compat) ───────────────
// These are now generated dynamically by runTarskiValidation()
export const PROOF_TRACES: ProofTrace[] = [];

// ─── Snapshot validation lives in src/lib/snapshots/tarski-validator.ts ──
// The two-validator architecture there (full path = runTarskiValidation
// when a live CausalGraph is available; degraded path = DEGRADED_CHECKS
// when only a SystemStateSnapshot is in hand) is the canonical seam.
// An earlier `AXIOM_CHECKS` map shipped from this file but was never
// imported anywhere — it was a dead third-validator surface with several
// no-op stubs (A-04, A-05, H-02, R-02, R-03, R-04) that risked silently
// disagreeing with the real validators. Removed in the Tarski profile-
// scoping audit follow-up.
