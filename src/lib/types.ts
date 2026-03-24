// ─── Causal Shocks ───────────────────────────────────────────────
export type ShockCategory = "compute" | "energy" | "cooling" | "supply" | "geopolitical";

export interface CausalShock {
  id: string;
  name: string;
  severity: number; // 0-1
  category: ShockCategory;
  description: string;
  physicalConstraint?: string;
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
export type ViewMode = "2d" | "3d" | "map";
export type TruthFilter = "raw" | "verified";

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
