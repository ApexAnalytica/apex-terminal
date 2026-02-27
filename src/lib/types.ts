export interface CausalShock {
  id: string;
  name: string;
  severity: number; // 0-1
  category: "compute" | "energy" | "cooling" | "supply" | "geopolitical";
  description: string;
  physicalConstraint?: string;
}

export interface OmegaState {
  buffer: number; // 0-100, criticality buffer
  shocks: CausalShock[];
  status: "NOMINAL" | "ELEVATED" | "CRITICAL" | "OMEGA_BREACH";
  lastUpdate: number;
}

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

export interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "system" | "warning";
  content: string;
  timestamp: number;
  module?: ModuleId;
}

export interface DAGNode {
  id: string;
  label: string;
  category: "compute" | "energy" | "cooling" | "intelligence" | "supply";
  fragility: number; // 0-1, Ω-Fragility score
  status: "stable" | "stressed" | "fractured";
}
