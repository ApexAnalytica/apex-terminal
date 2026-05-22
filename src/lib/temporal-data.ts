import type { CausalNode, CausalEdge, OmegaFragilityProfile } from "./types";

// ─── Temporal Types ──────────────────────────────────────────────
// The short presets (hour/day/week/month) cover fast-moving signals (FRED
// daily, EIA 5-min). The long presets (year/5year/all) cover annual-cadence
// signals — World Bank annual series, WGI governance — whose published
// history spans decades. Without these, the dial maxed out at 30 days and
// annual data always rendered as a flat hold-forward line. See PR #381
// (2026-05-21 user feedback after the live-data coverage finale).
export type TimeGranularity = "hour" | "day" | "week" | "month" | "year" | "5year" | "all";

export interface TemporalEvent {
  id: string;
  date: Date;
  label: string;
  description: string;
  affectedNodeIds: string[];
  severity: number; // 0-1, magnitude of impact
}

export interface NodeTemporalState {
  timestamp: number; // ms since epoch
  omegaComposite: number;
  omegaProfile: OmegaFragilityProfile;
  /** Raw underlying value before omega normalization (e.g. 6.76 % food
   *  inflation, 87.3 $/bbl Brent). Optional — only populated for nodes
   *  driven by real-timeseries.ts via NODE_TIMESERIES_MAP. Lets the
   *  TimeSeriesOverlay plot the actual metric instead of duplicating
   *  the per-card sparkline's omega-scale view. */
  rawValue?: number;
}

export interface TemporalNodeData {
  nodeId: string;
  /** When this node first appeared in the causal network */
  appearedAt: Date;
  /** Time series of omega score snapshots */
  history: NodeTemporalState[];
}

/** Edge state at a point in time — derived from connected node stress levels */
export interface EdgeTemporalState {
  timestamp: number;
  weight: number;        // dynamic weight (0-1) modulated by node stress
  confidence: number;    // dynamic confidence (0-1)
  stressSignal: number;  // 0-1 stress propagation intensity through this edge
  isStrained: boolean;   // true when connected nodes are under high stress
}

export interface TemporalEdgeData {
  edgeId: string;
  history: EdgeTemporalState[];
}

export interface TemporalDataset {
  nodes: Map<string, TemporalNodeData>;
  edges: Map<string, TemporalEdgeData>;
  events: TemporalEvent[];
  rangeStart: Date;
  rangeEnd: Date;
}

// ─── Seeded random for determinism ──────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Synthetic Events ───────────────────────────────────────────
const EVENT_TEMPLATES: Omit<TemporalEvent, "id" | "date">[] = [
  {
    label: "Abqaiq Processing Disruption",
    description: "Drone strike on Abqaiq processing facility disrupts 5.7M bpd capacity",
    affectedNodeIds: ["sa_abqaiq_plants", "sa_ras_tanura_terminal", "sa_east_west_pipeline"],
    severity: 0.85,
  },
  {
    label: "Strait of Hormuz Tensions",
    description: "Naval incident in Strait of Hormuz raises shipping insurance premiums",
    affectedNodeIds: ["qf_strait_of_hormuz", "mn_strait_of_hormuz", "qe_ras_laffan_port"],
    severity: 0.8,
  },
  {
    label: "North Field Expansion Milestone",
    description: "QatarEnergy North Field Expansion reaches first gas, adding 32 Mtpa LNG",
    affectedNodeIds: ["qe_north_field_expansion_nfe_nfs", "qe_north_field_gas_field", "qe_ras_laffan_industrial_city_rlic"],
    severity: 0.4,
  },
  {
    label: "Fertilizer Export Ban",
    description: "Major producer announces temporary urea export restrictions",
    affectedNodeIds: ["qf_qafco_urea_product", "qf_global_food_prices", "mn_global_food_price_stress"],
    severity: 0.7,
  },
  {
    label: "Ma'aden Phosphate 3 Delay",
    description: "Phosphate 3 mega-project commissioning delayed by 6 months",
    affectedNodeIds: ["mn_phosphate_3_mega_project", "mn_ma_aden_phosphate_business", "mn_ras_al_khair_phosphate_hub"],
    severity: 0.55,
  },
  {
    label: "Saudi Gas Grid Overload",
    description: "Summer peak demand strains Master Gas System capacity",
    affectedNodeIds: ["sa_master_gas_system_mgs", "sa_master_gas_system", "sa_hawiyah_gas_plant"],
    severity: 0.6,
  },
  {
    label: "Bangladesh DAP Procurement Crisis",
    description: "BADC procurement delays leave 40% of DAP demand unmet",
    affectedNodeIds: ["mn_bangladesh_agricultural_development_corp", "mn_ras_al_khair_dap_plant", "mn_global_food_price_stress"],
    severity: 0.65,
  },
  {
    label: "QAFCO Blue Ammonia Launch",
    description: "QAFCO-7 blue ammonia facility begins commercial operations",
    affectedNodeIds: ["qf_qafco7_blue_ammonia", "qf_qafco_ammonia_product", "qf_qafco_complex"],
    severity: 0.35,
  },
];

// ─── Generator ──────────────────────────────────────────────────
export function generateTemporalData(
  nodes: CausalNode[],
  edges: CausalEdge[],
  daysBack: number = 60,
): TemporalDataset {
  const rand = seededRandom(42);
  const now = new Date();
  const rangeEnd = new Date(now);
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - daysBack);

  const nodeMap = new Map<string, TemporalNodeData>();

  // Generate daily snapshots for each node
  for (const node of nodes) {
    // Most nodes appeared at the start; a few appeared later
    const daysBeforeAppearance =
      rand() < 0.15 ? Math.floor(rand() * (daysBack * 0.6)) : 0;
    const appearedAt = new Date(rangeStart);
    appearedAt.setDate(appearedAt.getDate() + daysBeforeAppearance);

    const history: NodeTemporalState[] = [];
    let omega = node.omegaFragility.composite;
    const baseProfile = { ...node.omegaFragility };

    // Walk day by day from appearance to now
    const cursor = new Date(appearedAt);
    while (cursor <= rangeEnd) {
      // Random walk on omega — mean-reverting to base
      const drift = (node.omegaFragility.composite - omega) * 0.05;
      const noise = (rand() - 0.5) * 0.3;
      omega = Math.max(0, Math.min(10, omega + drift + noise));

      const profileScale = omega / Math.max(0.1, node.omegaFragility.composite);
      history.push({
        timestamp: cursor.getTime(),
        omegaComposite: Math.round(omega * 100) / 100,
        omegaProfile: {
          composite: Math.round(omega * 100) / 100,
          irreplaceability:
            Math.round(baseProfile.irreplaceability * profileScale * 100) / 100,
          restorationLatency:
            Math.round(baseProfile.restorationLatency * profileScale * 100) / 100,
          jurisdictionalHazard:
            Math.round(baseProfile.jurisdictionalHazard * profileScale * 100) / 100,
          cascadeLoad:
            Math.round(baseProfile.cascadeLoad * profileScale * 100) / 100,
          tailDepth:
            Math.round(baseProfile.tailDepth * profileScale * 100) / 100,
        },
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    nodeMap.set(node.id, { nodeId: node.id, appearedAt, history });
  }

  // Place events across the timeline
  const events: TemporalEvent[] = [];
  const eventCount = Math.min(EVENT_TEMPLATES.length, Math.floor(daysBack / 8));
  const usedTemplates = EVENT_TEMPLATES.slice(0, eventCount);

  for (let i = 0; i < usedTemplates.length; i++) {
    const t = usedTemplates[i];
    const dayOffset = Math.floor(((i + 1) / (eventCount + 1)) * daysBack);
    const eventDate = new Date(rangeStart);
    eventDate.setDate(eventDate.getDate() + dayOffset);

    events.push({ ...t, id: `evt-${i}`, date: eventDate });

    // Apply event impact to affected nodes
    for (const nodeId of t.affectedNodeIds) {
      const nodeData = nodeMap.get(nodeId);
      if (!nodeData) continue;

      // Bump omega scores around the event date
      for (const snap of nodeData.history) {
        const snapDate = new Date(snap.timestamp);
        const daysDiff = Math.abs(
          (snapDate.getTime() - eventDate.getTime()) / 86400000,
        );
        if (daysDiff < 7) {
          const impact = t.severity * (1 - daysDiff / 7) * 1.5;
          snap.omegaComposite = Math.min(10, snap.omegaComposite + impact);
          snap.omegaProfile.composite = snap.omegaComposite;
        }
      }
    }
  }

  // ── Generate temporal edge states ──
  // Edge weight/confidence/stress are derived from connected node omega over time
  const edgeMap = new Map<string, TemporalEdgeData>();

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const edgeHistory: EdgeTemporalState[] = [];
    const baseWeight = edge.weight;
    const baseConfidence = edge.confidence;

    // Walk through timestamps — use source node's history as time axis
    for (const srcSnap of sourceNode.history) {
      const ts = srcSnap.timestamp;
      const tgtSnap = getNodeStateAt(targetNode, ts);
      if (!tgtSnap) continue;

      // Stress signal: average of how far both nodes deviate from their baselines
      const srcStress = Math.max(0, (srcSnap.omegaComposite - 5) / 5); // 0-1 when omega > 5
      const tgtStress = Math.max(0, (tgtSnap.omegaComposite - 5) / 5);
      const avgStress = (srcStress + tgtStress) / 2;

      // When nodes are stressed, edge weight increases (more load on the link)
      // but confidence drops (higher uncertainty under stress)
      const stressMultiplier = 1 + avgStress * 0.4; // up to 1.4x weight
      const confidenceDrop = 1 - avgStress * 0.3;   // down to 0.7x confidence

      const dynamicWeight = Math.min(1, baseWeight * stressMultiplier);
      const dynamicConfidence = Math.max(0.2, baseConfidence * confidenceDrop);

      // Stress signal for rendering (opacity/glow effects)
      const stressSignal = Math.min(1, avgStress * 1.2);

      edgeHistory.push({
        timestamp: ts,
        weight: Math.round(dynamicWeight * 1000) / 1000,
        confidence: Math.round(dynamicConfidence * 1000) / 1000,
        stressSignal: Math.round(stressSignal * 1000) / 1000,
        isStrained: avgStress > 0.5,
      });
    }

    edgeMap.set(edge.id, { edgeId: edge.id, history: edgeHistory });
  }

  return { nodes: nodeMap, edges: edgeMap, events, rangeStart, rangeEnd };
}

// ─── Query Helpers ──────────────────────────────────────────────

/** Get the node state at a specific point in time (nearest preceding snapshot) */
export function getNodeStateAt(
  temporal: TemporalNodeData,
  timestamp: number,
): NodeTemporalState | null {
  if (temporal.history.length === 0) return null;
  if (timestamp < temporal.appearedAt.getTime()) return null;

  // Binary search for nearest snapshot <= timestamp
  let lo = 0;
  let hi = temporal.history.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (temporal.history[mid].timestamp <= timestamp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return temporal.history[lo];
}

/** Get all nodes that existed at a given timestamp */
export function getVisibleNodesAt(
  dataset: TemporalDataset,
  timestamp: number,
): string[] {
  const visible: string[] = [];
  for (const [nodeId, data] of dataset.nodes) {
    if (data.appearedAt.getTime() <= timestamp) {
      visible.push(nodeId);
    }
  }
  return visible;
}

/** Get the edge state at a specific point in time */
export function getEdgeStateAt(
  temporal: TemporalEdgeData,
  timestamp: number,
): EdgeTemporalState | null {
  if (temporal.history.length === 0) return null;

  // Binary search for nearest snapshot <= timestamp
  let lo = 0;
  let hi = temporal.history.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (temporal.history[mid].timestamp <= timestamp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return temporal.history[lo].timestamp <= timestamp ? temporal.history[lo] : null;
}

/** Get events in a date range */
export function getEventsInRange(
  dataset: TemporalDataset,
  start: number,
  end: number,
): TemporalEvent[] {
  return dataset.events.filter(
    (e) => e.date.getTime() >= start && e.date.getTime() <= end,
  );
}
