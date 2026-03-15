import type { CausalNode, OmegaFragilityProfile } from "./types";

// ─── Temporal Types ──────────────────────────────────────────────
export type TimeGranularity = "hour" | "day" | "week" | "month";

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
}

export interface TemporalNodeData {
  nodeId: string;
  /** When this node first appeared in the causal network */
  appearedAt: Date;
  /** Time series of omega score snapshots */
  history: NodeTemporalState[];
}

export interface TemporalDataset {
  nodes: Map<string, TemporalNodeData>;
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
    label: "ASML EUV Delay",
    description: "Supply chain disruption delayed EUV shipments by 6 weeks",
    affectedNodeIds: ["asml_euv", "zeiss_optics", "tsmc_fab"],
    severity: 0.7,
  },
  {
    label: "Taiwan Strait Tensions",
    description: "Elevated military activity near TSMC facilities",
    affectedNodeIds: ["tsmc_fab", "taiwan_energy", "geopolitical_risk"],
    severity: 0.85,
  },
  {
    label: "Neon Gas Shortage",
    description: "Ukrainian neon supply disrupted, affecting lithography",
    affectedNodeIds: ["asml_euv", "chip_design", "global_foundries"],
    severity: 0.6,
  },
  {
    label: "EU Export Controls",
    description: "New restrictions on advanced semiconductor exports",
    affectedNodeIds: ["asml_euv", "zeiss_optics", "trade_policy"],
    severity: 0.5,
  },
  {
    label: "Cooling Infra Failure",
    description: "Major datacenter cooling system outage in Singapore",
    affectedNodeIds: ["dc_cooling", "cloud_compute", "ai_training"],
    severity: 0.65,
  },
  {
    label: "Rare Earth Embargo",
    description: "China restricts gallium and germanium exports",
    affectedNodeIds: ["rare_earth", "chip_substrate", "defense_chips"],
    severity: 0.75,
  },
  {
    label: "Energy Grid Instability",
    description: "Texas power grid fluctuations affect fab operations",
    affectedNodeIds: ["us_energy", "samsung_fab", "power_grid"],
    severity: 0.55,
  },
  {
    label: "AI Compute Demand Spike",
    description: "GPT-5 training clusters drive unprecedented HBM demand",
    affectedNodeIds: ["hbm_memory", "sk_hynix", "ai_training"],
    severity: 0.4,
  },
];

// ─── Generator ──────────────────────────────────────────────────
export function generateTemporalData(
  nodes: CausalNode[],
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
          substitutionFriction:
            Math.round(baseProfile.substitutionFriction * profileScale * 100) / 100,
          downstreamLoad:
            Math.round(baseProfile.downstreamLoad * profileScale * 100) / 100,
          cascadingVoltage:
            Math.round(baseProfile.cascadingVoltage * profileScale * 100) / 100,
          existentialTailWeight:
            Math.round(baseProfile.existentialTailWeight * profileScale * 100) / 100,
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

  return { nodes: nodeMap, events, rangeStart, rangeEnd };
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
