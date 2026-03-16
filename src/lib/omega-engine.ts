import {
  CausalShock,
  OmegaState,
  DoomsdayState,
  RegimeType,
  AlertLevel,
  CascadeAnalysis,
  CausalGraph,
} from "./types";

const PRESET_SHOCKS: CausalShock[] = [
  {
    id: "hormuz_closure",
    name: "STRAIT OF HORMUZ CLOSURE",
    severity: 0.50,
    category: "geopolitical",
    description: "Naval blockade shuts Strait of Hormuz — 21M bpd crude + 25% global LNG transit halted",
    physicalConstraint: "Only bypass: East-West Pipeline (5M bpd max vs 21M bpd transit volume)",
  },
  {
    id: "abqaiq_strike",
    name: "ABQAIQ PROCESSING ATTACK",
    severity: 0.45,
    category: "energy",
    description: "Drone/missile strike disables Abqaiq — 5.7M bpd processing capacity offline",
    physicalConstraint: "Single-site concentration: 50% of Saudi processing capacity",
  },
  {
    id: "lng_train_failure",
    name: "RAS LAFFAN LNG TRAIN OUTAGE",
    severity: 0.35,
    category: "energy",
    description: "Unplanned shutdown of 2 LNG mega-trains at Ras Laffan — 16 Mtpa capacity loss",
    physicalConstraint: "Cryogenic heat exchanger replacement: 12-18 month lead time",
  },
  {
    id: "fertilizer_export_ban",
    name: "UREA EXPORT RESTRICTION",
    severity: 0.30,
    category: "supply",
    description: "Emergency export controls on urea/ammonia — QAFCO output diverted to domestic",
    physicalConstraint: "Food security override: Qatar domestic demand priority clause",
  },
  {
    id: "phosphate_contamination",
    name: "PHOSPHATE ORE CONTAMINATION",
    severity: 0.25,
    category: "supply",
    description: "Cadmium contamination in Al Jalamid ore body — Ma'aden P3 output suspended",
    physicalConstraint: "EU cadmium limit: 60mg/kg P2O5 — contaminated ore exceeds threshold",
  },
  {
    id: "gas_grid_overload",
    name: "MASTER GAS SYSTEM OVERLOAD",
    severity: 0.40,
    category: "energy",
    description: "Summer peak demand exceeds MGS pipeline capacity — industrial curtailment",
    physicalConstraint: "Pipeline hydraulic limit: 9.6 Bcf/d throughput ceiling",
  },
  {
    id: "food_price_shock",
    name: "GLOBAL FOOD PRICE SPIKE",
    severity: 0.35,
    category: "geopolitical",
    description: "DAP/urea price surge >200% — importing nations face procurement crisis",
    physicalConstraint: "Haber-Bosch economics: natural gas = 70-90% of ammonia production cost",
  },
];

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
