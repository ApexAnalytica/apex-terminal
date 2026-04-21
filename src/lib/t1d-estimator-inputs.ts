/**
 * T1D estimator input extractor.
 *
 * Reads the TemporalDataset already loaded into the store and returns the
 * longest available time-series per T1D node, shaped for the TS-ported
 * criticality estimators (BOCPD, Transfer Entropy, Moran's I).
 *
 * All seven Tier-A T1D nodes are covered.  Any node that has no history
 * entries returns null — callers must guard.
 */

import type { TemporalDataset } from "./temporal-data";

// ─── Source labels ───────────────────────────────────────────────────────────
// Derived from NODE_TIMESERIES_MAP source field for each T1D node.
const T1D_NODE_SOURCE: Record<string, "vx880" | "tn10" | "index"> = {
  t1d_beta_mass:       "vx880",
  t1d_cgm_tir:         "vx880",
  t1d_hypo_events:     "vx880",
  t1d_stem_cell_beta:  "vx880",
  t1d_c_peptide:       "tn10",
  t1d_teplizumab:      "tn10",
  t1d_dka:             "index",
};

export const T1D_NODE_IDS = Object.keys(T1D_NODE_SOURCE) as Array<
  keyof typeof T1D_NODE_SOURCE
>;

export interface T1DSeriesEntry {
  nodeId: string;
  values: number[];
  timestamps: number[];
  source: "vx880" | "tn10" | "index";
}

/**
 * Returns one entry per T1D node whose history is non-empty.
 * Nodes with no history in the store are returned as null in the map.
 * Accepts null temporalData (store not yet populated) — returns all-null map.
 */
export function extractT1DSeries(
  temporalData: TemporalDataset | null,
): Map<string, T1DSeriesEntry | null> {
  const result = new Map<string, T1DSeriesEntry | null>();
  if (!temporalData) {
    for (const nodeId of T1D_NODE_IDS) result.set(nodeId, null);
    return result;
  }

  for (const nodeId of T1D_NODE_IDS) {
    const nodeData = temporalData.nodes.get(nodeId);
    if (!nodeData || nodeData.history.length === 0) {
      result.set(nodeId, null);
      continue;
    }

    const sorted = [...nodeData.history].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    result.set(nodeId, {
      nodeId,
      values: sorted.map((h) => h.omegaComposite),
      timestamps: sorted.map((h) => h.timestamp),
      source: T1D_NODE_SOURCE[nodeId],
    });
  }

  return result;
}
