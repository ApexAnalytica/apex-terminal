/**
 * Loads real analyst-collected time-series data from timeseries.json
 * and resolves the appropriate series for each graph node.
 *
 * This replaces the synthetic generateTemporalData() function
 * with real data collected by the analyst team.
 */

import { NODE_TIMESERIES_MAP, type TimeseriesMapping } from "./node-timeseries-map";
import type { CausalNode, CausalEdge, OmegaFragilityProfile } from "./types";
import type {
  TemporalDataset,
  TemporalNodeData,
  NodeTemporalState,
  TemporalEdgeData,
  EdgeTemporalState,
  TemporalEvent,
} from "./temporal-data";

// ─── Types for raw timeseries.json records ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRecord = Record<string, any>;
type TimeseriesJSON = Record<string, RawRecord[]>;

// Cache the loaded JSON so we don't fetch it multiple times
let cachedData: TimeseriesJSON | null = null;

async function loadTimeseriesJSON(): Promise<TimeseriesJSON> {
  if (cachedData) return cachedData;
  const resp = await fetch("/datasets/claire/timeseries.json");
  cachedData = await resp.json();
  return cachedData!;
}

/**
 * Represents a resolved real time-series data point for a node.
 */
export interface RealDataPoint {
  date: Date;
  value: number;
  label: string;
  unit: string;
}

/**
 * Resolved real time-series for a specific node, ready to render.
 */
export interface NodeRealTimeseries {
  nodeId: string;
  mapping: TimeseriesMapping;
  dataPoints: RealDataPoint[];
}

/**
 * Filter and extract the data points for a given mapping.
 */
function resolveDataPoints(
  data: TimeseriesJSON,
  mapping: TimeseriesMapping,
): RealDataPoint[] {
  const sourceArr = data[mapping.source];
  if (!sourceArr || sourceArr.length === 0) return [];

  // Apply metric filters
  let filtered = sourceArr;
  if (mapping.metricFilter) {
    for (const [key, val] of Object.entries(mapping.metricFilter)) {
      if (val !== undefined) {
        filtered = filtered.filter((r) => r[key] === val);
      }
    }
  }

  // Extract data points
  const points: RealDataPoint[] = [];
  for (const rec of filtered) {
    const dateStr = rec.date || rec.year;
    if (!dateStr) continue;

    const value = rec[mapping.valueKey];
    if (value === undefined || value === null || typeof value !== "number" || isNaN(value)) continue;

    const date = typeof dateStr === "number"
      ? new Date(dateStr, 0, 1) // year number
      : new Date(dateStr);

    if (isNaN(date.getTime())) continue;

    points.push({
      date,
      value,
      label: mapping.label,
      unit: mapping.unit,
    });
  }

  // Sort chronologically
  points.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Deduplicate by date
  const seen = new Set<number>();
  return points.filter((p) => {
    const key = p.date.getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalize a real-world value into an ΩF-compatible 0–10 score.
 * Uses min-max normalization within the node's own series,
 * then maps to 0–10 range. This preserves the shape of the
 * original time series while making it compatible with the
 * existing rendering pipeline.
 */
function normalizeToOmega(
  value: number,
  min: number,
  max: number,
  baseOmega: number,
): number {
  if (max === min) return baseOmega;
  const normalized = (value - min) / (max - min);
  // Scale around the base omega, ±2.5 points
  const scaled = baseOmega - 2.5 + normalized * 5;
  return Math.max(0, Math.min(10, Math.round(scaled * 100) / 100));
}

/**
 * Convert real data points into NodeTemporalState[] compatible with
 * the existing TemporalDataset format. This allows the existing
 * sparkline renderer and timeline scrubbing to work unchanged.
 */
function realDataToHistory(
  dataPoints: RealDataPoint[],
  baseProfile: OmegaFragilityProfile,
): NodeTemporalState[] {
  if (dataPoints.length === 0) return [];

  const values = dataPoints.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const baseOmega = baseProfile.composite;

  return dataPoints.map((dp) => {
    const omega = normalizeToOmega(dp.value, min, max, baseOmega);
    const profileScale = omega / Math.max(0.1, baseOmega);
    return {
      timestamp: dp.date.getTime(),
      omegaComposite: omega,
      omegaProfile: {
        composite: omega,
        irreplaceability: Math.round(baseProfile.irreplaceability * profileScale * 100) / 100,
        restorationLatency: Math.round(baseProfile.restorationLatency * profileScale * 100) / 100,
        jurisdictionalHazard: Math.round(baseProfile.jurisdictionalHazard * profileScale * 100) / 100,
        cascadeLoad: Math.round(baseProfile.cascadeLoad * profileScale * 100) / 100,
        tailDepth: Math.round(baseProfile.tailDepth * profileScale * 100) / 100,
      },
    };
  });
}

/**
 * Generate edge temporal states from connected node histories
 * (same logic as synthetic generator, but using real-data-derived histories).
 */
function generateEdgeHistory(
  sourceHistory: NodeTemporalState[],
  targetHistory: NodeTemporalState[],
  baseWeight: number,
  baseConfidence: number,
): EdgeTemporalState[] {
  const result: EdgeTemporalState[] = [];

  for (const srcSnap of sourceHistory) {
    // Find nearest target snapshot
    let nearest: NodeTemporalState | null = null;
    let bestDiff = Infinity;
    for (const tgtSnap of targetHistory) {
      const diff = Math.abs(tgtSnap.timestamp - srcSnap.timestamp);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = tgtSnap;
      }
    }
    if (!nearest) continue;

    const srcStress = Math.max(0, (srcSnap.omegaComposite - 5) / 5);
    const tgtStress = Math.max(0, (nearest.omegaComposite - 5) / 5);
    const avgStress = (srcStress + tgtStress) / 2;

    const stressMultiplier = 1 + avgStress * 0.4;
    const confidenceDrop = 1 - avgStress * 0.3;

    result.push({
      timestamp: srcSnap.timestamp,
      weight: Math.min(1, Math.round(baseWeight * stressMultiplier * 1000) / 1000),
      confidence: Math.max(0.2, Math.round(baseConfidence * confidenceDrop * 1000) / 1000),
      stressSignal: Math.min(1, Math.round(avgStress * 1.2 * 1000) / 1000),
      isStrained: avgStress > 0.5,
    });
  }

  return result;
}

/**
 * Hardcoded events from real-world incidents (not synthetic).
 * These are actual documented disruptions.
 */
const REAL_EVENTS: Omit<TemporalEvent, "id">[] = [
  {
    date: new Date("2019-09-14"),
    label: "Abqaiq-Khurais Attack",
    description: "Drone/missile strike on Abqaiq and Khurais oil facilities temporarily halved Saudi crude output (~5.7 mb/d)",
    affectedNodeIds: ["sa_abqaiq_plants", "sa_ras_tanura_terminal", "sa_east_west_pipeline"],
    severity: 0.95,
  },
  {
    date: new Date("2024-02-24"),
    label: "Red Sea Cable Cuts",
    description: "Houthi-linked anchor dragging severed 3+ submarine cables in Bab el-Mandeb, rerouting 25% of EU-Asia traffic",
    affectedNodeIds: ["ic_aae1", "ic_seamewe5", "ic_flag_europe_asia", "ic_red_sea_exposure"],
    severity: 0.85,
  },
  {
    date: new Date("2022-03-01"),
    label: "Ukraine Wheat Shock",
    description: "Russian invasion of Ukraine drove wheat prices above $450/ton, triggering food security crises across MENA",
    affectedNodeIds: ["sc_global_wheat_price", "sc_food_price_inflation", "qf_global_food_prices", "mn_global_food_price_stress"],
    severity: 0.9,
  },
  {
    date: new Date("2022-11-01"),
    label: "North Field Expansion FID",
    description: "QatarEnergy approved final investment decision for NFE/NFS, adding 48 Mtpa LNG capacity by 2027",
    affectedNodeIds: ["qe_north_field_expansion_nfe_nfs", "qe_north_field_gas_field", "qe_ras_laffan_industrial_city_rlic"],
    severity: 0.3,
  },
  {
    date: new Date("2023-01-01"),
    label: "Egypt Pound Devaluation",
    description: "Egyptian pound lost ~50% against USD, spiking food import costs and straining sovereign reserves",
    affectedNodeIds: ["fc_fx_pressure", "sc_currency_depreciation", "ic_telecom_egypt"],
    severity: 0.8,
  },
  {
    date: new Date("2024-06-01"),
    label: "Ma'aden Phosphate 3 Progress",
    description: "Ma'aden announced Phosphate 3 expansion on track for 9 Mtpa capacity target",
    affectedNodeIds: ["mn_phosphate_3_mega_project", "mn_ma_aden_phosphate_business"],
    severity: 0.25,
  },
];

/**
 * Main entry point: loads real analyst data and builds a TemporalDataset
 * compatible with the existing store and rendering pipeline.
 */
export async function loadRealTemporalData(
  nodes: CausalNode[],
  edges: CausalEdge[],
): Promise<TemporalDataset> {
  const data = await loadTimeseriesJSON();
  const nodeMap = new Map<string, TemporalNodeData>();

  // ── Pass 1: Resolve nodes that have real data ──────────────────
  const unmappedNodes: CausalNode[] = [];

  for (const node of nodes) {
    const mapping = NODE_TIMESERIES_MAP[node.id];

    if (mapping) {
      const dataPoints = resolveDataPoints(data, mapping);

      if (dataPoints.length > 0) {
        const history = realDataToHistory(dataPoints, node.omegaFragility);
        nodeMap.set(node.id, {
          nodeId: node.id,
          appearedAt: dataPoints[0].date,
          history,
        });
        continue;
      }
    }

    // No real data — defer to Pass 2
    unmappedNodes.push(node);
  }

  // Determine time range from real-data nodes only
  let rangeStart = new Date();
  let rangeEnd = new Date(0);
  for (const [, nodeData] of nodeMap) {
    for (const h of nodeData.history) {
      const d = new Date(h.timestamp);
      if (d < rangeStart) rangeStart = d;
      if (d > rangeEnd) rangeEnd = d;
    }
  }

  // ── Pass 2: Unmapped nodes — no real data available ─────────────
  // Store a single-point entry so the node exists in the temporal map
  // (needed for edge history generation), but with history.length < 2
  // the UI will show "NO DATA" instead of a fake curve.
  for (const node of unmappedNodes) {
    const now = rangeEnd.getTime() > 0 ? rangeEnd : new Date();
    nodeMap.set(node.id, {
      nodeId: node.id,
      appearedAt: now,
      history: [
        {
          timestamp: now.getTime(),
          omegaComposite: node.omegaFragility.composite,
          omegaProfile: { ...node.omegaFragility },
        },
      ],
    });
  }

  // Generate edge temporal states
  const edgeMap = new Map<string, TemporalEdgeData>();
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const edgeHistory = generateEdgeHistory(
      sourceNode.history,
      targetNode.history,
      edge.weight,
      edge.confidence,
    );

    edgeMap.set(edge.id, { edgeId: edge.id, history: edgeHistory });
  }

  // Build events list (filter to events within our data range)
  const events: TemporalEvent[] = REAL_EVENTS
    .filter((e) => e.date >= rangeStart && e.date <= rangeEnd)
    .map((e, i) => ({ ...e, id: `real-evt-${i}` }));

  // Release the 2.3MB raw JSON — its only job was to prevent concurrent
  // double-fetches during this processing pass. Now that we're done it has
  // no value and can be GC'd (item #14).
  cachedData = null;

  return { nodes: nodeMap, edges: edgeMap, events, rangeStart, rangeEnd };
}

/**
 * Get the resolved real data points for a specific node.
 * Used by NodeInspector to show the actual metric being tracked.
 */
export async function getNodeRealData(nodeId: string): Promise<NodeRealTimeseries | null> {
  const mapping = NODE_TIMESERIES_MAP[nodeId];
  if (!mapping) return null;

  const data = await loadTimeseriesJSON();
  const dataPoints = resolveDataPoints(data, mapping);

  if (dataPoints.length === 0) return null;

  return { nodeId, mapping, dataPoints };
}

/**
 * Synchronous version that works with already-loaded data.
 * Returns the mapping info for a node (for display purposes).
 */
export function getNodeDataDescription(nodeId: string): {
  description: string;
  label: string;
  unit: string;
  source: string;
} | null {
  const mapping = NODE_TIMESERIES_MAP[nodeId];
  if (!mapping) return null;
  return {
    description: mapping.description,
    label: mapping.label,
    unit: mapping.unit,
    source: mapping.source,
  };
}
