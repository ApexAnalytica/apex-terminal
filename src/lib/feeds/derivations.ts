/**
 * Derivation provider — computes synthetic-composite nodes from primitives
 * already pulled by other providers. Eliminates synthetic composites from
 * the graph by replacing them with live derivations of real data.
 *
 * No upstream HTTP. The provider's `matchPayload` reads other nodes'
 * `liveData[]` from the `nodes` argument and emits computed values onto
 * the matching composite nodes.
 *
 * Currently derives:
 *   - Currency Contagion Channel = mean ratio across EM FX pairs
 *     (DEXTUUS / DEXSFUS / DEXBZUS already pulled by FRED)
 *   - Exchange Rate Pressure Index = max ratio across the same EM FX pairs
 *
 * Both are bounded as 0..1 normalized stress metrics, displayed as a
 * percentage with capacity = 1.0 (so the qualifier reads "78%" etc.).
 */
import type { CausalNode } from "@/lib/types";

/** Substrings (case-insensitive) identifying EM FX primitives in node.label */
const EM_FX_LABEL_PATTERNS = [
  "turkey fx stress",
  "south africa fx stress",
  "brazil fx stress",
];

/** Pull the latest indicator value/capacity ratio from each matching FX node. */
export function collectEmFxRatios(
  nodes: ReadonlyArray<CausalNode>,
): Array<{ nodeLabel: string; ratio: number; observedAt: string; mockTagged: boolean }> {
  const results: Array<{ nodeLabel: string; ratio: number; observedAt: string; mockTagged: boolean }> = [];
  for (const n of nodes) {
    const lower = n.label.toLowerCase();
    if (!EM_FX_LABEL_PATTERNS.some((p) => lower.includes(p))) continue;
    const indicator = n.liveData?.find((p) => p.kind === "indicator");
    if (!indicator || indicator.capacity <= 0) continue;
    const ratio = indicator.value / indicator.capacity;
    if (!Number.isFinite(ratio)) continue;
    results.push({
      nodeLabel: n.label,
      ratio,
      observedAt: indicator.observedAt,
      mockTagged: indicator.source.toLowerCase().includes("(mock"),
    });
  }
  return results;
}

export interface DerivationsTrigger {
  /** Stub field — the provider doesn't consume any upstream payload. */
  trigger: string;
}

export function mockDerivationsTrigger(): DerivationsTrigger {
  return { trigger: new Date().toISOString() };
}
