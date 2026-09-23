// ─── Discovery — Algorithm Registry ──────────────────────────────────
//
// Central registry of available discovery algorithms. The API layer
// (src/app/api/discovery/*) looks up algorithms by id; new algorithms
// register here once and become callable from every entry point
// (UI, API, scripts) automatically.

import type { DiscoveryAlgorithm } from "./algorithm-interface";
import { lagCorrelationAlgorithm } from "./algorithms/lag-correlation";
import { pcmciLinearAlgorithm } from "./algorithms/pcmci-linear";
import { pcmciPlusAlgorithm } from "./algorithms/pcmci-plus";
import { fciAlgorithm } from "./algorithms/fci";
import { notearsAlgorithm } from "./algorithms/notears";
import { notearsMlpAlgorithm } from "./algorithms/notears-mlp";

// Erase the parameter generic so the registry is uniform; param shape
// is documented per-algorithm via its description string + the source.
const REGISTRY: Record<string, DiscoveryAlgorithm<Record<string, unknown>>> = {
  [lagCorrelationAlgorithm.id]:
    lagCorrelationAlgorithm as unknown as DiscoveryAlgorithm<
      Record<string, unknown>
    >,
  [pcmciLinearAlgorithm.id]:
    pcmciLinearAlgorithm as unknown as DiscoveryAlgorithm<
      Record<string, unknown>
    >,
  [pcmciPlusAlgorithm.id]:
    pcmciPlusAlgorithm as unknown as DiscoveryAlgorithm<
      Record<string, unknown>
    >,
  [fciAlgorithm.id]:
    fciAlgorithm as unknown as DiscoveryAlgorithm<Record<string, unknown>>,
  [notearsAlgorithm.id]:
    notearsAlgorithm as unknown as DiscoveryAlgorithm<Record<string, unknown>>,
  [notearsMlpAlgorithm.id]:
    notearsMlpAlgorithm as unknown as DiscoveryAlgorithm<
      Record<string, unknown>
    >,
};

/** Look up an algorithm by id; returns null if unknown. */
export function getAlgorithm(
  id: string,
): DiscoveryAlgorithm<Record<string, unknown>> | null {
  return REGISTRY[id] ?? null;
}

/** Public algorithm descriptor returned by GET /api/discovery/algorithms. */
export interface AlgorithmCatalogEntry {
  id: string;
  version: string;
  description: string;
  defaultParams: Record<string, unknown>;
}

/** List all registered algorithms — the catalog API consumes this. */
export function listAlgorithms(): AlgorithmCatalogEntry[] {
  return Object.values(REGISTRY).map((a) => ({
    id: a.id,
    version: a.version,
    description: a.description,
    defaultParams: a.defaultParams,
  }));
}
