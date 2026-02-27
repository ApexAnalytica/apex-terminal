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

// ─── Causal Graph ────────────────────────────────────────────────
export type NodeCategory =
  | "manufacturing"
  | "infrastructure"
  | "economic"
  | "finance"
  | "energy"
  | "geopolitical";

export type EdgeType = "directed" | "confounded" | "temporal";

export interface CausalNode {
  id: string;
  label: string;
  shortLabel: string; // abbreviated for sub-panels
  category: NodeCategory;
  riskScore: number; // 0-1
  discoverySource: "DCD" | "PCMCI+" | "FCI" | "merged";
  isConfounded: boolean;
  isRestricted: boolean; // Tarski restriction
  position3d?: { x: number; y: number; z: number };
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
  riskPercent: number; // 0-100
}

// ─── View State ──────────────────────────────────────────────────
export type ViewMode = "2d" | "3d";
export type TruthFilter = "raw" | "verified";

// ─── Legacy DAG (for 2D fallback) ───────────────────────────────
export interface DAGNode {
  id: string;
  label: string;
  category: "compute" | "energy" | "cooling" | "intelligence" | "supply";
  fragility: number; // 0-1, Ω-Fragility score
  status: "stable" | "stressed" | "fractured";
}
