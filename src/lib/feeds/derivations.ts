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
 *   - MENA Currency Depreciation = mean ratio across EGY + ARG FX
 *     (WB PA.NUS.FCRF for each, already pulled annually)
 *   - sr_*_kl Capital-to-Output ratio = Capital Formation / Real GDP
 *     for BRA + CHN (both primitives WB-pulled)
 *   - sr_*_mpk Marginal Product of Capital = 0.3 * GDP / Capital Formation
 *     (Cobb-Douglas approximation with α = 0.3)
 *
 * EM FX stress metrics are bounded as 0..1 normalized stress, displayed
 * as a percentage with capacity = 1.0. K/L and MPK display in raw ratio
 * units; their capacity thresholds reflect EM macro regimes.
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

/** Substrings (case-insensitive) identifying MENA-region FX primitives.
 *  These are the regional subset of EM_FX_LABEL_PATTERNS — Egypt + Argentina
 *  are the WB-pulled FX rates currently representing MENA-region currency
 *  stress (Egypt directly; Argentina included as a proxy for the broader
 *  EM-FX contagion channel since the original PIMCO snapshot grouped them). */
const MENA_FX_LABEL_PATTERNS = [
  "exchange rate pressure",
  "argentina fx",
];

/** Pull MENA-region FX ratios. Same shape as collectEmFxRatios but
 *  scoped to a different label set so we can emit a regional composite
 *  (sc_currency_depreciation) alongside the global EM Currency Contagion. */
export function collectMenaFxRatios(
  nodes: ReadonlyArray<CausalNode>,
): Array<{ nodeLabel: string; ratio: number; observedAt: string; mockTagged: boolean }> {
  const results: Array<{ nodeLabel: string; ratio: number; observedAt: string; mockTagged: boolean }> = [];
  for (const n of nodes) {
    const lower = n.label.toLowerCase();
    if (!MENA_FX_LABEL_PATTERNS.some((p) => lower.includes(p))) continue;
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

/** Sovereign-risk capital-to-output ratio + marginal product of capital
 *  for a single country. Pulled from the live Capital Formation + Real GDP
 *  signals (both WB, both wired in PR #411).
 *
 *  Capital-to-output (K/Y) is the standard proxy for K/L when capital
 *  stock isn't directly published. Brazil ~0.18, China ~0.39 in 2024 —
 *  reflects China's higher capital deepening vs Brazil's catch-up regime.
 *
 *  MPK via Cobb-Douglas: MPK = α * Y/K with α = 0.3 (typical capital share
 *  for EM economies, per PWT). Brazil ~1.7, China ~0.8 in 2024 — Brazil's
 *  higher MPK reflects unrealized capital-deepening potential.
 *
 *  Returns null if either primitive is missing (e.g. WB poll hasn't run
 *  yet on first load). */
export function deriveCapitalRatios(
  nodes: ReadonlyArray<CausalNode>,
  countryKeyword: string,
): { kRatio: number; mpk: number; observedAt: string; mockTagged: boolean; capital: number; gdp: number } | null {
  const lower = countryKeyword.toLowerCase();
  // The Capital Formation node has label "{Country} Capital Stock"
  // (the historical PWT label; #411 wires it via WB Gross Capital
  // Formation). The Real GDP node has label "{Country} Real GDP".
  const capitalNode = nodes.find((n) => {
    const l = n.label.toLowerCase();
    return l.includes(lower) && l.includes("capital stock");
  });
  const gdpNode = nodes.find((n) => {
    const l = n.label.toLowerCase();
    return l.includes(lower) && l.includes("real gdp");
  });
  if (!capitalNode || !gdpNode) return null;

  const capitalSignal = capitalNode.liveData?.find((p) => p.kind === "indicator");
  const gdpSignal = gdpNode.liveData?.find((p) => p.kind === "indicator");
  if (!capitalSignal || !gdpSignal) return null;
  if (capitalSignal.value <= 0 || gdpSignal.value <= 0) return null;

  // Both come from WB in trillions/billions of constant USD. The exact
  // scale depends on each entry's WB_SERIES `scale` config — Brazil
  // capital is in $B (scale 1e9), China capital in $T (scale 1e12),
  // both GDPs in $T (scale 1e12). Normalize to a common scale before
  // dividing so the ratio is unit-free.
  const capitalAbsolute = capitalSignal.unit === "$T" ? capitalSignal.value * 1000 : capitalSignal.value; // express in B$
  const gdpAbsolute = gdpSignal.unit === "$T" ? gdpSignal.value * 1000 : gdpSignal.value; // express in B$
  const kRatio = capitalAbsolute / gdpAbsolute;
  if (!Number.isFinite(kRatio) || kRatio <= 0) return null;

  // Cobb-Douglas α = 0.3 (capital share). MPK = α * Y/K = α / (K/Y).
  const mpk = 0.3 / kRatio;
  if (!Number.isFinite(mpk)) return null;

  // Use the most recent observedAt of the two primitives.
  const observedAt = [capitalSignal.observedAt, gdpSignal.observedAt].sort().reverse()[0];
  const mockTagged =
    capitalSignal.source.toLowerCase().includes("(mock") ||
    gdpSignal.source.toLowerCase().includes("(mock");

  return {
    kRatio,
    mpk,
    observedAt,
    mockTagged,
    capital: capitalAbsolute,
    gdp: gdpAbsolute,
  };
}

export interface DerivationsTrigger {
  /** Stub field — the provider doesn't consume any upstream payload. */
  trigger: string;
}

export function mockDerivationsTrigger(): DerivationsTrigger {
  return { trigger: new Date().toISOString() };
}
