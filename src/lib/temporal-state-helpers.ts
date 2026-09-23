import type { OmegaFragilityProfile } from "./types";

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

// ─── Lightweight readers ────────────────────────────────────────
// Pure utility functions that read from an already-built TemporalDataset.
// Live in their own file so hot consumers (`useTemporalGraph`, the
// per-frame timeline cursor) don't transitively pull the 145-LOC
// `generateTemporalData` synthetic generator from `temporal-data.ts`.

/** Get the node state at a specific point in time */
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
  return temporal.history[lo].timestamp <= timestamp ? temporal.history[lo] : null;
}

/** Get all nodes that are visible at a specific point in time */
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
