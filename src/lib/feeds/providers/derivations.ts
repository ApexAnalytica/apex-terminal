/**
 * Derivation provider — emits Currency Contagion Channel and Exchange Rate
 * Pressure Index as live values computed from the FRED EM FX primitives
 * already on the graph. First step in eliminating synthetic composites.
 */
import type { CausalNode, LiveDataPoint } from "@/lib/types";
import {
  collectEmFxRatios,
  collectMenaFxRatios,
  deriveCapitalRatios,
  type DerivationsTrigger,
} from "@/lib/feeds/derivations";
import type { FeedDispatchBatch, FeedProvider } from "./types";

const findByLabel = (
  nodes: ReadonlyArray<CausalNode>,
  pattern: string,
): CausalNode | undefined => nodes.find((n) => n.label.toLowerCase().includes(pattern));

const findByLabelAll = (
  nodes: ReadonlyArray<CausalNode>,
  patterns: string[],
): CausalNode | undefined =>
  nodes.find((n) => {
    const l = n.label.toLowerCase();
    return patterns.every((p) => l.includes(p));
  });

export const derivationsProvider: FeedProvider<DerivationsTrigger> = {
  id: "derivations",
  label: "Derived composites",
  endpoint: "/api/feeds/derivations/trigger",
  // Faster than FRED's 30-min cadence so derived values pick up new
  // primitives within one cycle of when they land.
  pollIntervalMs: 5 * 60 * 1000,
  matchPayload(_payload, nodes): FeedDispatchBatch {
    const updates: Array<{ nodeId: string; point: LiveDataPoint }> = [];
    const affectedNodeIds: string[] = [];

    // EM FX composites — Currency Contagion (mean) + Exchange Rate
    // Pressure (max) from the FRED EM FX primitives (DEXTUUS / DEXSFUS /
    // DEXBZUS). Skip the whole block if no primitives have ticked.
    const ratios = collectEmFxRatios(nodes);

    if (ratios.length > 0) {
      const meanRatio = ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length;
      const maxRatio = ratios.reduce((m, r) => Math.max(m, r.ratio), 0);
      const observedAt = ratios.map((r) => r.observedAt).sort().reverse()[0];
      const allMock = ratios.every((r) => r.mockTagged);
      const mockSuffix = allMock ? " (mock — primitives are mocked)" : "";
      const breakdown = ratios
        .map((r) => `${r.nodeLabel.replace(" FX Stress", "")}: ${(r.ratio * 100).toFixed(0)}%`)
        .join(", ");

      const contagionNode = findByLabel(nodes, "currency contagion");
      if (contagionNode) {
        updates.push({
          nodeId: contagionNode.id,
          point: {
            kind: "indicator",
            value: +(meanRatio * 100).toFixed(1),
            capacity: 100,
            unit: "%",
            observedAt,
            source: `Derived · mean EM FX stress${mockSuffix} — ${breakdown}`,
          },
        });
        affectedNodeIds.push(contagionNode.id);
      }

      const pressureNode = findByLabel(nodes, "exchange rate pressure");
      if (pressureNode) {
        updates.push({
          nodeId: pressureNode.id,
          point: {
            kind: "indicator",
            value: +(maxRatio * 100).toFixed(1),
            capacity: 100,
            unit: "%",
            observedAt,
            source: `Derived · max EM FX stress${mockSuffix} — ${breakdown}`,
          },
        });
        affectedNodeIds.push(pressureNode.id);
      }
    }

    // MENA Currency Depreciation — regional subset (EGY + ARG).
    const menaRatios = collectMenaFxRatios(nodes);
    if (menaRatios.length > 0) {
      const menaMean = menaRatios.reduce((s, r) => s + r.ratio, 0) / menaRatios.length;
      const menaObsAt = menaRatios.map((r) => r.observedAt).sort().reverse()[0];
      const menaAllMock = menaRatios.every((r) => r.mockTagged);
      const menaMockSuffix = menaAllMock ? " (mock — primitives are mocked)" : "";
      const menaBreakdown = menaRatios
        .map((r) => `${r.nodeLabel.replace(" FX Stress", "").replace(" Exchange Rate Pressure Index", "")}: ${(r.ratio * 100).toFixed(0)}%`)
        .join(", ");
      const menaNode = findByLabel(nodes, "mena currency depreciation");
      if (menaNode) {
        updates.push({
          nodeId: menaNode.id,
          point: {
            kind: "indicator",
            value: +(menaMean * 100).toFixed(1),
            capacity: 100,
            unit: "%",
            observedAt: menaObsAt,
            source: `Derived · mean MENA FX depreciation${menaMockSuffix} — ${menaBreakdown}`,
          },
        });
        affectedNodeIds.push(menaNode.id);
      }
    }

    // NY Fed Consumer Inflation Expectations — pass-through from the
    // live UMich Consumer Inflation Expectations node. NY Fed SCE
    // (Survey of Consumer Expectations) is published only on the NY
    // Fed microeconomics page, not mirrored to FRED — a dedicated
    // fetcher would need to download/parse their monthly Excel file.
    //
    // UMich and NY Fed SCE measure the same construct (median
    // household 1y-ahead inflation expectation) via different survey
    // methodologies; historical correlation is r ≈ 0.85. Using UMich
    // as the live proxy is defensible per the existing graph edge
    // structure — both nodes share the same upstream parent
    // (ip_cpi_headline_yoy → ip_umich_expectations / ip_nyfed_expectations
    // with identical mechanism comments). Source string explicitly
    // notes the proxy so users can trace it.
    const umichNode = findByLabel(nodes, "umich consumer inflation expectations");
    const nyfedNode = findByLabel(nodes, "ny fed consumer inflation expectations");
    if (umichNode && nyfedNode) {
      const umichSignal = umichNode.liveData?.find((p) => p.kind === "indicator");
      if (umichSignal) {
        updates.push({
          nodeId: nyfedNode.id,
          point: {
            kind: "indicator",
            value: umichSignal.value,
            capacity: umichSignal.capacity,
            unit: umichSignal.unit,
            observedAt: umichSignal.observedAt,
            source: `Derived · UMich Consumer Inflation Expectations (proxy — NY Fed SCE not on FRED, r≈0.85)${umichSignal.source.toLowerCase().includes("(mock") ? " (mock — primitive is mocked)" : ""}`,
          },
        });
        affectedNodeIds.push(nyfedNode.id);
      }
    }

    // CB Policy Rate Regime (Financial Contagion) — pass-through from
    // the live Fed Funds Target Range node. The US Fed policy rate is
    // the global anchor for emerging-market CB policy decisions (per
    // the existing edge `fc_em_fx_reserves__fc_cb_policy_rate`), so
    // surfacing the US rate as the CB Policy Rate Regime signal gives
    // the Financial Contagion domain a live policy-rate anchor without
    // requiring a separate EM-CB-rate aggregation pipeline (which would
    // need bespoke data from Bloomberg / Reuters that isn't free).
    const fedTargetNode = findByLabel(nodes, "fed funds target range");
    const cbPolicyNode = findByLabel(nodes, "cb policy rate");
    if (fedTargetNode && cbPolicyNode) {
      const fedSignal = fedTargetNode.liveData?.find((p) => p.kind === "indicator");
      if (fedSignal) {
        updates.push({
          nodeId: cbPolicyNode.id,
          point: {
            kind: "indicator",
            value: fedSignal.value,
            capacity: fedSignal.capacity,
            unit: fedSignal.unit,
            observedAt: fedSignal.observedAt,
            source: `Derived · US Fed Funds Target Range (global anchor for EM CB policy)${fedSignal.source.toLowerCase().includes("(mock") ? " (mock — primitive is mocked)" : ""}`,
          },
        });
        affectedNodeIds.push(cbPolicyNode.id);
      }
    }

    // Sovereign Risk: K/L Ratio + MPK for Brazil and China, derived
    // from the live Capital Formation + Real GDP primitives (WB,
    // both wired via #411 and the original WB_SERIES).
    for (const country of ["brazil", "china"] as const) {
      const ratios = deriveCapitalRatios(nodes, country);
      if (!ratios) continue;
      const countryMockSuffix = ratios.mockTagged
        ? " (mock — primitives are mocked)"
        : "";
      const capitalLabel = country === "brazil" ? "Brazil" : "China";

      const klNode = findByLabelAll(nodes, [country, "k/l ratio"]);
      if (klNode) {
        updates.push({
          nodeId: klNode.id,
          point: {
            kind: "indicator",
            value: +ratios.kRatio.toFixed(3),
            // Capacity 0.5 = "elevated" capital intensity. China sits
            // above 0.3 in 2024; Brazil 0.15-0.2. Higher = more
            // capital-deep economy (mature industrial regime).
            capacity: 0.5,
            unit: "K/Y",
            observedAt: ratios.observedAt,
            source: `Derived · ${capitalLabel} K/Y = Capital Formation / Real GDP${countryMockSuffix} — K=${(ratios.capital / 1000).toFixed(2)}T$, Y=${(ratios.gdp / 1000).toFixed(2)}T$`,
          },
        });
        affectedNodeIds.push(klNode.id);
      }

      const mpkNode = findByLabelAll(nodes, [country, "mpk"]);
      if (mpkNode) {
        updates.push({
          nodeId: mpkNode.id,
          point: {
            kind: "indicator",
            value: +ratios.mpk.toFixed(3),
            // Capacity 2.0 = above-normal MPK (catch-up regime).
            // Brazil ~1.7, China ~0.8 in 2024. Higher = more unrealized
            // capital-deepening potential.
            capacity: 2.0,
            unit: "MPK",
            observedAt: ratios.observedAt,
            source: `Derived · ${capitalLabel} MPK = 0.3 × Y/K (Cobb-Douglas, α=0.3)${countryMockSuffix}`,
          },
        });
        affectedNodeIds.push(mpkNode.id);
      }
    }

    // Pick the most-recent observedAt across all emitted updates as the
    // event timestamp. Falls back to "now" if no updates emitted (event
    // is undefined in that case anyway). Severity is the highest
    // single-value normalized magnitude across updates so the timeline
    // marker is sized by the worst signal in the batch.
    const eventObservedAt = updates
      .map((u) => u.point.observedAt)
      .sort()
      .reverse()[0] ?? new Date().toISOString();
    const eventSeverity = updates.length === 0
      ? 0
      : Math.min(1, Math.max(...updates.map((u) =>
          // Normalize to 0..1: percentage signals divide by 100; ratio
          // signals (K/Y, MPK) divide by their capacity.
          u.point.unit === "%"
            ? u.point.value / 100
            : u.point.capacity > 0
              ? u.point.value / u.point.capacity
              : 0,
        )));

    return {
      providerId: this.id,
      signalKinds: ["indicator"],
      updates,
      event:
        updates.length > 0
          ? {
              id: `derivations-${eventObservedAt}`,
              label: "Derived composites refresh",
              description: `${updates.length} composite${updates.length === 1 ? "" : "s"} derived from FRED + WB primitives`,
              observedAt: eventObservedAt,
              severity: eventSeverity,
              affectedNodeIds,
            }
          : undefined,
    };
  },
};
