import {
  CausalShock,
  OmegaState,
  DoomsdayState,
  RegimeType,
  AlertLevel,
  CascadeAnalysis,
  CausalGraph,
} from "./types";

// Preset shock library — intentionally empty.
//
// The previous list was a domain-specific Saudi/Gulf scenario set
// (Strait of Hormuz, Abqaiq, Ras Laffan, QAFCO, Ma'aden, MGS, food
// price spike) that read as clutter to most users and tied the demo
// to one geopolitical narrative. The platform's value is the engines
// (causal discovery, criticality, interdiction), not a curated catalog
// of scenarios — when a customer wants scenario presets they should
// supply their own through the API, the import path, or a profile-
// scoped catalog we add per-engagement.
//
// Active shocks injected by the user via direct node selection still
// flow through the same `addShock` / cascade pipeline; only the
// pre-baked SCENARIOS strip in the right rail is now empty by default.
const PRESET_SHOCKS: CausalShock[] = [];

export function getPresetShocks(): CausalShock[] {
  return PRESET_SHOCKS;
}

export function computeOmegaState(shocks: CausalShock[]): OmegaState {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const buffer = Math.max(0, Math.min(100, 100 - totalSeverity * 100));

  let status: OmegaState["status"] = "NOMINAL";
  if (buffer < 15) status = "OMEGA_BREACH";
  else if (buffer < 35) status = "CRITICAL";
  else if (buffer < 65) status = "ELEVATED";

  return {
    buffer,
    shocks,
    status,
    lastUpdate: Date.now(),
  };
}

export function getStatusColor(status: OmegaState["status"]): string {
  switch (status) {
    case "NOMINAL":
      return "var(--accent-green)";
    case "ELEVATED":
      return "var(--accent-amber)";
    case "CRITICAL":
      return "var(--accent-red)";
    case "OMEGA_BREACH":
      return "var(--accent-red)";
  }
}

export function getFragilityForCategory(
  shocks: CausalShock[],
  category: string
): number {
  const relevant = shocks.filter((s) => s.category === category);
  if (relevant.length === 0) return 0;
  return Math.min(1, relevant.reduce((sum, s) => sum + s.severity, 0));
}

// ─── Doomsday State ─────────────────────────────────────────────

export function computeDoomsdayState(
  shocks: CausalShock[],
  buffer: number
): DoomsdayState {
  const totalSeverity = shocks.reduce((sum, s) => sum + s.severity, 0);
  const fragilityIndex = Math.min(100, Math.max(0, totalSeverity * 50 + (100 - buffer) * 0.5));

  // Time to failure scales with buffer: 365d nominal → 3d at breach
  const timeToFailureDays = Math.max(3, Math.round(365 * (buffer / 100)));

  // Regime type from fragility thresholds
  let regimeType: RegimeType = "STABLE";
  if (fragilityIndex > 80) regimeType = "CRASH";
  else if (fragilityIndex > 60) regimeType = "PHASE_TRANSITION";
  else if (fragilityIndex > 40) regimeType = "MELT_UP";
  else if (fragilityIndex > 20) regimeType = "STAGNATION";

  // Dragon King detection
  const dragonKingDetected = fragilityIndex > 70;
  const dragonKingProbability = Math.min(1, Math.max(0, (fragilityIndex - 50) / 50));

  // LPPLS parameters (log-periodic power law singularity)
  const lpplsOscFreq = 6.36 + totalSeverity * 2.1;
  const lpplsTc = timeToFailureDays + Math.random() * 5; // critical time
  const singularityScore = fragilityIndex > 60 ? fragilityIndex / 100 : 0;

  return {
    timeToFailureDays,
    dragonKingDetected,
    dragonKingProbability,
    regimeType,
    fragilityIndex,
    lpplsOscFreq,
    lpplsTc,
    singularityScore,
  };
}

// ─── Alert Level ────────────────────────────────────────────────

export function computeAlertLevel(
  omegaStatus: OmegaState["status"],
  doomsday: DoomsdayState
): AlertLevel {
  if (
    omegaStatus === "OMEGA_BREACH" ||
    omegaStatus === "CRITICAL" ||
    doomsday.timeToFailureDays < 30
  ) {
    return "RED";
  }
  if (omegaStatus === "ELEVATED" || doomsday.fragilityIndex > 40) {
    return "AMBER";
  }
  return "GREEN";
}

// ─── Cascade Analysis ───────────────────────────────────────────

export function computeCascadeAnalysis(graph: CausalGraph): CascadeAnalysis {
  const nodes = graph.nodes;
  const edges = graph.edges;

  // Approximate λ_max via max weighted row sum of adjacency matrix
  const rowSums = new Map<string, number>();
  for (const node of nodes) {
    rowSums.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!edge.isSevered) {
      rowSums.set(edge.source, (rowSums.get(edge.source) || 0) + edge.weight);
    }
  }
  const lambdaMax = Math.max(...Array.from(rowSums.values()), 0);

  // Degree centrality
  const degree = new Map<string, number>();
  for (const node of nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!edge.isSevered) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
  }

  const maxDegree = Math.max(...Array.from(degree.values()), 1);
  const topCentralityNodes = [...degree.entries()]
    .map(([nodeId, deg]) => ({
      nodeId,
      label: nodes.find((n) => n.id === nodeId)?.shortLabel || nodeId,
      centrality: deg / maxDegree,
    }))
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, 3);

  const isStable = lambdaMax < 1.0;
  const dampingCoeff = isStable ? 1.0 - lambdaMax : 0;
  const forgettingRate = 0.05 + lambdaMax * 0.1;

  return {
    lambdaMax,
    isStable,
    topCentralityNodes,
    forgettingRate,
    dampingCoeff,
  };
}
