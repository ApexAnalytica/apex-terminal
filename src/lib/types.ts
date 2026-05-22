// ─── Causal Shocks ───────────────────────────────────────────────
export type ShockCategory =
  | "compute"
  | "energy"
  | "cooling"
  | "supply"
  | "geopolitical"
  | "financial"
  | "cyber"
  | "regulatory"
  | "environmental"
  | "health";

export interface CausalShock {
  id: string;
  name: string;
  severity: number; // 0-1
  category: ShockCategory;
  description: string;
  physicalConstraint?: string;
  /**
   * Optional override: if supplied, the shock is injected only at these node
   * ids and the category-based `SHOCK_TO_NODE_CATEGORIES` broadcast is
   * skipped. Use this for tightly-scoped subgraph attacks (e.g. the VX-880
   * graft-protect preset) where the default broadcast would saturate the
   * graph and collapse the interdiction solver's marginal-reduction signal.
   */
  targetNodes?: string[];
}

// ─── Omega State ─────────────────────────────────────────────────
export type OmegaStatus = "NOMINAL" | "ELEVATED" | "CRITICAL" | "OMEGA_BREACH";

export interface OmegaState {
  buffer: number; // 0-100, criticality buffer
  shocks: CausalShock[];
  status: OmegaStatus;
  lastUpdate: number;
}

// ─── Modules ─────────────────────────────────────────────────────
export type ModuleId = "spirtes" | "tarski" | "pearl" | "pareto";

export interface ManifoldModule {
  id: ModuleId;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  status: "ACTIVE" | "STANDBY" | "ALERT";
}

// ─── Terminal ────────────────────────────────────────────────────
export interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "system" | "warning";
  content: string;
  timestamp: number;
  module?: ModuleId;
}

// ─── Omega-Fragility Profile ────────────────────────────────────
export interface OmegaFragilityProfile {
  composite: number;              // ΩF 0-10 headline fragility score
  irreplaceability: number;       // I  0-10 how impossible to substitute (capacity share, tech exclusivity)
  restorationLatency: number;     // R  0-10 time to restore equivalent capacity after catastrophic failure
  jurisdictionalHazard: number;   // J  0-10 sanctions, conflict, export controls, regulatory exposure
  cascadeLoad: number;            // C  0-10 downstream impact depth (GDP, sectors, nonlinear propagation)
  tailDepth: number;              // T  0-10 distributional depth beyond VaR (fat-tail severity)
}

/** Pillar weight configuration for ΩF composite aggregation */
export interface OmegaPillarWeights {
  irreplaceability: number;
  restorationLatency: number;
  jurisdictionalHazard: number;
  cascadeLoad: number;
  tailDepth: number;
}

/** Default pillar weights (must sum to 1.0) */
export const DEFAULT_OMEGA_WEIGHTS: OmegaPillarWeights = {
  irreplaceability: 0.25,
  restorationLatency: 0.20,
  jurisdictionalHazard: 0.15,
  cascadeLoad: 0.25,
  tailDepth: 0.15,
};

/** System-level ΩSF: weighted aggregation of node ΩF scores */
export interface OmegaSystemFragility {
  omegaSF: number;             // Σ(αi × ΩFi) — throughput-weighted fragility
  omegaSX: number;             // Σ(ei × ΩFi) — exposure-weighted fragility
  contagionRadius: number;     // count of downstream nodes exceeding loss threshold
  bufferHorizon: number;       // epochs between node failure and systemic failure
}

// ─── Causal Graph ────────────────────────────────────────────────
export type NodeCategory =
  | "manufacturing"
  | "infrastructure"
  | "economic"
  | "finance"
  | "energy"
  | "geopolitical"
  | "communications"
  | "agriculture"
  | "science";

export type EdgeType = "directed" | "confounded" | "temporal";

/**
 * Where an edge attribute (weight, confidence) came from. Surfaces in
 * EdgeInspector so an analyst can answer "where did this 0.8 come
 * from?" without leaving the canvas.
 *
 * Kinds:
 *  - author      hand-set during graph construction; no external source
 *  - literature  point estimate from a published paper / standard
 *  - regression  fit from a real-data regression on this network
 *  - discovery   output of a structure-learning run (SPIRTES / FCI / NOTEARS)
 *  - tarski      value derived from an axiom check / proof trace
 *
 * Context fields are kind-flavoured but loose-typed so we can grow
 * them per-domain without ballooning a discriminated union. Backfill
 * convention: missing source ≡ `{kind:"author"}` — handled centrally
 * by `resolveEdgeAttributeSource` in src/lib/edge-provenance.ts so
 * existing edges don't need to be touched in this PR.
 */
export type EdgeAttributeSourceKind =
  | "author"
  | "literature"
  | "regression"
  | "discovery"
  | "tarski";

export interface EdgeAttributeSource {
  kind: EdgeAttributeSourceKind;
  /** Free-text citation — DOI, paper title, NEJM url, dissertation patch id. */
  citation?: string;
  /** Discovery estimator that produced the value (e.g. "FCI", "NOTEARS"). */
  estimator?: string;
  /** Regression fit quality (0-1) — populated when kind="regression". */
  rSquared?: number;
  /** Free-text caveat / sample size note. Any kind can carry one. */
  note?: string;
}

export interface LiveDataHistoryEntry {
  value: number;
  observedAt: string;
}

export interface LiveDataPoint {
  /** discriminator — multiple feeds can attach distinct signals to one node */
  kind: "throughput" | "sanctions" | string;
  /**
   * Provider id that wrote this signal. Critical for cleanup: when a
   * provider's batch dispatches, only signals it itself wrote should be
   * candidates for stale-signal removal. Without this, providers that
   * share a `kind` (e.g. multiple providers all using "indicator") would
   * clobber each other on every poll cycle.
   *
   * Optional only for backwards compatibility with hand-built test data;
   * all real provider emissions populate this field.
   */
  providerId?: string;
  /** observed quantity in the unit below (e.g. mb/d for Hormuz) */
  value: number;
  /** physical / regulatory ceiling against which value is compared */
  capacity: number;
  /** unit string for display ("mb/d", "%", "USD/bbl", ...) */
  unit: string;
  /** ISO-8601 timestamp when upstream feed reported this value */
  observedAt: string;
  /** human-readable provenance ("EIA v2 / Persian Gulf producers (mock)") */
  source: string;
  /**
   * Past observations for this kind, oldest-first. Populated by
   * `upsertLiveSignal` accumulating across feed ticks (the previous current
   * value rolls into the history when a new value arrives). Capped at
   * `LIVE_HISTORY_MAX` to bound memory. Undefined or [] means no history yet.
   */
  history?: LiveDataHistoryEntry[];
}

/** Cap on the per-signal history array length. */
export const LIVE_HISTORY_MAX = 60;

/**
 * Live deltas on top of the static omega profile, surfaced separately so
 * the underlying baseline stays auditable. Each field is an additive
 * adjustment in 0..10 ΩF units; positive = elevates fragility, negative =
 * dampens. `source` carries human-readable provenance ("OFAC sanctions",
 * "high eigenvector centrality") so a hover/tooltip can explain why.
 *
 * Engine-side ΩF wiring (per the session brief):
 *   - Tarski violations feed pillar J (jurisdictionalHazard).
 *   - Spirtes network metrics feed pillar C (cascadeLoad).
 * The static `omegaFragility` profile is the baseline; this overlay is
 * the live delta. Consumers (ΩF radar, hover, copilot) can render either
 * the baseline alone, the adjusted total, or the breakdown.
 */
export interface OmegaLiveAdjustments {
  /** Pillar deltas; only set when non-zero. */
  jurisdictionalHazardDelta?: number;
  cascadeLoadDelta?: number;
  /** Per-pillar provenance. */
  jSource?: string;
  cSource?: string;
}

/**
 * Provenance label for a node's omega/data state. Distinguishes
 *   - "live": at least one live feed is currently attached.
 *   - "modeled": synthetic / inferred / static-baseline only (the historic
 *     default for nodes without live coverage).
 *   - "blank-needs-data": intentionally blank — the data session has
 *     decided this node has no defensible free source, so the slot is
 *     preserved as a known-incomplete TODO marker. UI surfaces this
 *     explicitly so it isn't confused with "no provider matched yet."
 *
 * Derivation rule (see `getDataStatus`): when `dataStatus` is unset on
 * a node, it's inferred from `liveData` ("live" if any entries exist,
 * else "modeled"). An explicit value always overrides — that's how the
 * data session marks a node as Category-C blank-needs-data without
 * affecting nodes that simply haven't been wired yet.
 */
export type DataStatus = "live" | "modeled" | "blank-needs-data";

export interface CausalNode {
  id: string;
  label: string;
  shortLabel: string; // abbreviated for sub-panels
  category: NodeCategory;
  omegaFragility: OmegaFragilityProfile;
  globalConcentration: string; // e.g. "100% ASML", "93% China"
  replacementTime: string; // e.g. "5-7 years"
  physicalConstraint?: string;
  domain: string; // playbook domain name
  discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged";
  isConfounded: boolean;
  isRestricted: boolean; // Tarski restriction
  position3d?: { x: number; y: number; z: number };
  isConsequence?: boolean; // spawned by link break tool
  consequenceOf?: string; // edge ID that spawned this node
  datasetColor?: string; // color from imported dataset
  /** Live API-fed measurements; multiple feeds can co-attach distinct kinds. */
  liveData?: LiveDataPoint[];
  /** Live deltas on top of the static omega profile (see OmegaLiveAdjustments). */
  liveAdjustments?: OmegaLiveAdjustments;
  /** Provenance label — see `DataStatus`. Optional; defaults to derivation. */
  dataStatus?: DataStatus;
}

/**
 * Resolve a node's data-status, preferring the explicit `dataStatus`
 * field when set. Without it, derives from `liveData` presence: any
 * entry → "live", none → "modeled". Never returns "blank-needs-data"
 * by derivation — that label is only set explicitly by the data
 * session for category-C nodes.
 */
export function getDataStatus(node: CausalNode): DataStatus {
  if (node.dataStatus) return node.dataStatus;
  return (node.liveData?.length ?? 0) > 0 ? "live" : "modeled";
}

/** Pull a single live signal of a given kind from a node. */
export function getLiveSignal(node: CausalNode, kind: string): LiveDataPoint | undefined {
  return node.liveData?.find((p) => p.kind === kind);
}

/** Upsert a live signal into a node's liveData array (immutable; returns new array).
 *  When replacing a point of the same `kind`, accumulates the previous
 *  current value into `history`, capped at `LIVE_HISTORY_MAX`. */
export function upsertLiveSignal(
  existing: LiveDataPoint[] | undefined,
  point: LiveDataPoint,
): LiveDataPoint[] {
  const without = (existing ?? []).filter((p) => p.kind !== point.kind);
  const old = (existing ?? []).find((p) => p.kind === point.kind);
  // Accumulate: previous (value, observedAt) rolls into history, plus any
  // history the previous point already carried. De-dupe identical timestamps
  // and cap to LIVE_HISTORY_MAX entries (oldest first).
  if (old) {
    const carried: LiveDataHistoryEntry[] = [...(old.history ?? [])];
    // Only roll the old current into history if the incoming point has a
    // *different* timestamp — otherwise it's the same observation, no
    // history change. Also skip if the old timestamp already terminates
    // the carried history.
    const oldAlreadyTerminates =
      carried.length > 0 && carried[carried.length - 1].observedAt === old.observedAt;
    if (old.observedAt !== point.observedAt && !oldAlreadyTerminates) {
      carried.push({ value: old.value, observedAt: old.observedAt });
    }
    // Honour any pre-existing history on the incoming point too (provider may
    // have hydrated it from a multi-period upstream response).
    const merged = [...carried, ...(point.history ?? [])];
    // Sort by observedAt ascending so the sparkline plots left-to-right.
    merged.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    // De-dupe identical timestamps.
    const deduped: LiveDataHistoryEntry[] = [];
    for (const e of merged) {
      if (deduped.length === 0 || deduped[deduped.length - 1].observedAt !== e.observedAt) {
        deduped.push(e);
      }
    }
    const trimmed = deduped.length > LIVE_HISTORY_MAX
      ? deduped.slice(-LIVE_HISTORY_MAX)
      : deduped;
    return [...without, { ...point, history: trimmed }];
  }
  return [...without, point];
}

export interface CausalEdge {
  id: string;
  source: string;
  target: string;
  weight: number; // 0-1
  lag: number; // temporal lag in steps
  type: EdgeType;
  confidence: number; // 0-1
  isInconsistent: boolean; // Tarski flagged
  physicalMechanism: string; // e.g. "powers", "constrains supply"
  isSevered?: boolean; // severed by link break tool
  isConsequenceEdge?: boolean; // spawned by link break
  /**
   * Where the `weight` value came from. Absent ≡ author-set during
   * graph construction (see EdgeAttributeSource + resolveEdge-
   * AttributeSource). Set explicitly when an edge has external
   * provenance (literature citation, regression fit, discovery run,
   * Tarski derivation).
   */
  weightSource?: EdgeAttributeSource;
  /** Where the `confidence` value came from. Same semantics as weightSource. */
  confidenceSource?: EdgeAttributeSource;
}

export interface GraphMetadata {
  density: number;
  constraintType: string;
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "INCONSISTENCIES_FOUND";
  totalNodes: number;
  totalEdges: number;
  inconsistentEdges: number;
  restrictedNodes: number;
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
  metadata: GraphMetadata;
}

// ─── Copilot ─────────────────────────────────────────────────────
export type CopilotRole = "system" | "user" | "assistant";

export interface CopilotMessage {
  id: string;
  role: CopilotRole;
  content: string;
  timestamp: number;
  module?: ModuleId;
}

// ─── Risk Propagation ────────────────────────────────────────────
export interface RiskPropagationCard {
  nodeId: string;
  label: string;
  category: NodeCategory;
  omegaScore: number; // 0-10
  domain: string;
  globalConcentration: string;
}

// ─── View State ──────────────────────────────────────────────────
export type ViewMode = "2d" | "3d" | "map" | "relief";
export type TruthFilter = "raw" | "verified";
/**
 * Which signal the 3D orbs encode in their radius. `omega` reads as
 * "criticality" (the most actionable signal for typical users), the two
 * centrality options reveal network structure (which nodes are influence
 * hubs vs. bridges).
 */
export type NodeSizeMetric = "omega" | "eigenvector" | "betweenness";

// ─── Regime & Doomsday ──────────────────────────────────────────
export type RegimeType = "STABLE" | "MELT_UP" | "CRASH" | "PHASE_TRANSITION" | "STAGNATION";

export interface DoomsdayState {
  timeToFailureDays: number;
  dragonKingDetected: boolean;
  dragonKingProbability: number; // 0-1
  regimeType: RegimeType;
  fragilityIndex: number; // 0-100
  lpplsOscFreq: number;
  lpplsTc: number; // critical time estimate
  singularityScore: number;
}

// ─── Alert Level ────────────────────────────────────────────────
export type AlertLevel = "GREEN" | "AMBER" | "RED";

// ─── Tarski Axioms ──────────────────────────────────────────────
export interface TarskiAxiom {
  id: string;
  level: 0 | 1 | 2;
  name: string;
  formalNotation: string;
  description: string;
  plainText: string;
  /** Which graph-domain keywords make this axiom more relevant */
  relevantDomains?: string[];
  /** Restricts which DomainProfile ids (e.g. "geopolitical", "t1d") this
      axiom applies to. Omit for truly universal laws (temporal priority,
      DAG integrity). When set, the Tarski panel hides this axiom on any
      other profile. */
  appliesTo?: string[];
  /** One-liner: what structure this axiom looks for */
  checksFor?: string;
  /** SVG-friendly mini-diagram label (e.g. "A → B → A  ✗") */
  diagramHint?: string;
}

export interface ProofTrace {
  edgeId: string;
  violatedAxioms: string[];
  verdict: "REJECTED" | "FLAGGED" | "TIMEOUT";
  solverUsed: "Z3" | "cvc5";
  checkTimeMs: number;
  /** Optional human-readable detail (e.g. "Hormuz: 18.4/21 mb/d = 87.6% — EIA") */
  detail?: string;
}

// ─── Pearl Counterfactuals ──────────────────────────────────────
export interface CounterfactualResult {
  interventionNode: string;
  expectedUtility: number;
  regretBound: number;
  policyRecommendation: string;
  affectedNodes: { nodeId: string; deltaOmega: number }[];
  method: "DeepCFR" | "BackdoorAdjustment";
}

// ─── Spirtes Cascade ────────────────────────────────────────────
export interface CascadeAnalysis {
  lambdaMax: number;
  isStable: boolean;
  topCentralityNodes: { nodeId: string; label: string; centrality: number }[];
  forgettingRate: number;
  dampingCoeff: number;
}

// ─── Legacy DAG (for 2D fallback) ───────────────────────────────
export interface DAGNode {
  id: string;
  label: string;
  category: "compute" | "energy" | "cooling" | "intelligence" | "supply";
  fragility: number; // 0-1, Ω-Fragility score
  status: "stable" | "stressed" | "fractured";
}

// ─── Replay / Cascade Simulation ───────────────────────────────
export interface NodeEpochState {
  omegaComposite: number;
  omegaProfile: OmegaFragilityProfile;
  shockIntensity: number; // 0-1
  isActivated: boolean;
}

export interface EdgeEpochState {
  activeWeight: number;
  propagationSignal: number; // 0-1
  isSevered: boolean;
}

export interface EpochSnapshot {
  epoch: number;
  nodeStates: Record<string, NodeEpochState>;
  edgeStates: Record<string, EdgeEpochState>;
  omegaBuffer: number;
  omegaStatus: OmegaStatus;
  criticalityEstimate: number | null; // epochs until critical, null if stable
  isStable: boolean;
  isCritical: boolean;
}

export type TimelineId = "baseline" | "intervention";
