/**
 * Edge-provenance registry — a per-domain catalog of reusable, named
 * `EdgeAttributeSource` entries.
 *
 * Before this module, the only way to attach provenance to an edge was to
 * type an inline `EdgeAttributeSource` object on `edge.weightSource` /
 * `edge.confidenceSource` in the domain graph-data files. That works, but
 * the per-domain audit (T1D → DCCT/NEJM, geopolitical-energy → IEA/EIA)
 * would re-type the same citation across dozens of edges — no single source
 * of truth, and a typo in one copy silently diverges from the others.
 *
 * The registry fixes that: a citation is authored ONCE as a catalog entry
 * with a stable `id`, and edges reference it via `weightSourceRef` /
 * `confidenceSourceRef`. The resolver expands the ref at read time.
 *
 * Resolution precedence (see `resolveEdgeSource`):
 *   1. inline `weightSource` object        — author override, wins
 *   2. `weightSourceRef` → catalog entry   — the registry path
 *   3. `{kind:"author"}` backfill          — nothing recorded
 *
 * The mechanism shipped with an EMPTY catalog; the per-domain audit
 * populates `CATALOGS` (and tags edges with refs) domain by domain — no
 * change to this module's logic is required for that, only data. The `t1d`
 * domain is the first audited (DCCT/EDIC, TrialNet TN-10, FORWARD-101,
 * TIR↔HbA1c consensus); every entry is a real, verifiable publication, all
 * DOIs cross-checked against the repo's own vetted source-of-truth in
 * research/scripts/build_t1d_timeseries.py. The `vx880` companion graph is the
 * second audited domain (Edmonton/Shapiro, CIT-07, Ryan 5-yr, HLA-DR matching),
 * and it also showcases cross-domain reuse — its dose→engraftment and TIR→HbA1c
 * edges reference `t1d`-domain entries by global id rather than re-citing them.
 * Other domains (geopolitical energy, AI-safety) land in later passes.
 *
 * Honesty note: a `literature` entry asserts that the *relationship* (sign +
 * approximate magnitude) of an edge is grounded in the cited source. The
 * exact edge `weight`/`confidence` scalar remains an author calibration onto
 * the network's [-1,1] / [0,1] scale — each entry's `note` says so plainly,
 * so the inspector never implies a number was lifted verbatim from a paper.
 *
 * Convention matches `criticality-registry.ts` (static const dict + pure
 * accessors) rather than a runtime `register()` call, so the full catalog is
 * statically analysable and tree-shakes predictably.
 */

import type { EdgeAttributeSource } from "@/lib/types";
import { DEFAULT_AUTHOR_SOURCE } from "@/lib/edge-provenance";

/**
 * A catalog entry: an `EdgeAttributeSource` plus the registry bookkeeping
 * fields (`id`, `domain`). The extra fields are stripped before the source
 * is handed to the display layer so `id`/`domain` never leak into the UI.
 */
export interface EdgeProvenanceEntry extends EdgeAttributeSource {
  /** Stable id referenced from CausalEdge.weightSourceRef / confidenceSourceRef. */
  id: string;
  /**
   * Owning domain (e.g. "t1d", "geopolitical", "finance"). Organizational
   * only — resolution is by global `id`, so a ref doesn't need to know which
   * domain it came from. Use "shared" for cross-domain sources.
   */
  domain: string;
}

/**
 * The catalog, grouped by domain for authoring clarity. Populated one domain
 * at a time by the per-domain provenance audit. `t1d` is the first audited
 * domain; see the module header for the honesty convention on `literature`
 * entries (relationship grounded in source; scalar is author calibration).
 */
const CATALOGS: Record<string, EdgeProvenanceEntry[]> = {
  t1d: [
    {
      // DCCT — the landmark T1D glycemic-control RCT. Grounds the
      // glycemia → microvascular-complication edges (retinopathy + nephropathy).
      id: "dcct-1993",
      domain: "t1d",
      kind: "literature",
      citation:
        "DCCT Research Group. N Engl J Med 1993;329:977-986. doi:10.1056/NEJM199309303291401",
      note:
        "Landmark RCT (n=1,441): intensive glycemic control cut retinopathy ~76% and " +
        "early nephropathy (albuminuria) ~50% vs conventional therapy. Grounds the sign " +
        "and approximate magnitude of the glycemic-control → complication edges; the edge " +
        "weight itself is an author calibration to the [-1,1] scale.",
    },
    {
      // EDIC — the observational follow-up of the DCCT cohort that established
      // the durable "metabolic memory" / legacy effect. Grounds the long-lagged
      // HbA1c → complication temporal edges (lag measured in years).
      id: "edic-legacy",
      domain: "t1d",
      kind: "literature",
      citation:
        "DCCT/EDIC Research Group; Nathan DM et al. N Engl J Med 2005;353:2643-2653. doi:10.1056/NEJMoa052187",
      note:
        "EDIC follow-up of the DCCT cohort — the 'metabolic memory'/legacy effect: early " +
        "glycemic control determines complication risk decades later. Grounds the multi-year " +
        "lagged HbA1c → complication edges; lag and direction are literature-derived, weight is calibrated.",
    },
    {
      // TrialNet TN-10 — teplizumab onset-delay RCT. Grounds the
      // teplizumab → C-peptide preservation edge.
      id: "herold-nejm-2019",
      domain: "t1d",
      kind: "literature",
      citation:
        "Herold KC et al. N Engl J Med 2019;381:603-613. doi:10.1056/NEJMoa1902226",
      note:
        "TrialNet TN-10: a single 14-day teplizumab course delayed Stage-3 T1D onset by a " +
        "median ~2 years vs placebo, with preserved C-peptide. Grounds the teplizumab → " +
        "C-peptide edge.",
    },
    {
      // TN-10 immunological follow-up — anti-CD3 mechanism on islet-reactive
      // CD8+ effectors. Grounds the teplizumab → CD8-Teff edge.
      id: "perdigoto-stm-2021",
      domain: "t1d",
      kind: "literature",
      citation:
        "Perdigoto AL et al. Sci Transl Med 2021. doi:10.1126/scitranslmed.abc8980",
      note:
        "TN-10 immunological follow-up: anti-CD3 drives partial exhaustion/anergy of " +
        "islet-reactive CD8+ T effectors — the mechanism behind the teplizumab → CD8-Teff edge.",
    },
    {
      // Vertex FORWARD-101 (zimislecel/VX-880) — stem-cell-derived islet
      // engraftment. Grounds the SC-β → β-mass restoration edge (low confidence:
      // early phase, n=12).
      id: "reichman-nejm-2025",
      domain: "t1d",
      kind: "literature",
      citation:
        "Reichman et al. N Engl J Med 2025. doi:10.1056/NEJMoa2506549",
      note:
        "Vertex FORWARD-101 (zimislecel): single intraportal infusion of stem-cell-derived " +
        "islets; full-dose cohort (n=12) reached 83% insulin-independence at 1 year, half-dose " +
        "(part A) markedly less. The dose-response + engraftment evidence base. Early-phase, " +
        "small n. (Shared by the t1d SC-β edge and the vx880 dose→engraftment edge.)",
    },
    {
      // TIR↔HbA1c published relationship + international consensus. Grounds the
      // real-world-TIR → population-HbA1c edge (near-mathematical coupling →
      // high confidence).
      id: "vigersky-2019",
      domain: "t1d",
      kind: "literature",
      citation:
        "Vigersky RA, McMahon C. Diabetes Technol Ther 2019;21(2):81-85. doi:10.1089/dia.2018.0310; " +
        "consensus: Battelino T et al. Diabetes Care 2019;42(8):1593-1603. doi:10.2337/dci19-0028",
      note:
        "Published TIR↔HbA1c relationship — a near-mathematical coupling via time-averaged " +
        "glucose (r²≈0.80). Grounds the high confidence on real-world TIR → HbA1c edges " +
        "(shared by the t1d and vx880 graphs).",
    },
  ],
  vx880: [
    {
      // Edmonton Protocol — the steroid-free immunosuppression regimen that
      // made clinical islet transplantation reproducible. Grounds the
      // immunosuppression → alloimmune-rejection (graft-protection) weight.
      id: "shapiro-edmonton-2000",
      domain: "vx880",
      kind: "literature",
      citation:
        "Shapiro AMJ et al. N Engl J Med 2000;343(4):230-238. doi:10.1056/NEJM200007273430401",
      note:
        "The Edmonton Protocol: 7/7 recipients achieved insulin independence under a " +
        "glucocorticoid-free sirolimus/tacrolimus/daclizumab regimen. Grounds the SIGN and " +
        "approximate strength of the immunosuppression → alloimmune-rejection edge (more " +
        "effective IS ⇒ less graft loss); the edge weight is an author calibration to [-1,1].",
    },
    {
      // CIT-07 — the phase-3 multicentre trial that confirmed the Edmonton
      // approach at scale. Grounds CONFIDENCE on the immunosuppression edge
      // (intentionally a different source from the weight, to show the
      // registry's weight-vs-confidence separation across two citations).
      id: "hering-cit07-2016",
      domain: "vx880",
      kind: "literature",
      citation:
        "Hering BJ et al. Diabetes Care 2016;39(7):1230-1240. PMID:27208344 (CIT-07)",
      note:
        "CIT-07 phase-3 (n=48): 87.5% reached HbA1c <7.0% with no severe hypoglycemia at 1 " +
        "year, establishing reproducibility of the regimen across centres. Used to ground the " +
        "CONFIDENCE of the immunosuppression edge (the weight is grounded by Edmonton/Shapiro " +
        "— two sources deliberately split across the weight/confidence axes).",
    },
    {
      // Ryan 5-year follow-up — established the durability picture and the
      // stimulated-C-peptide ('Ryan criteria') link to lasting independence.
      // Grounds the MMTT-AUC C-peptide → insulin-independence edge.
      id: "ryan-2005",
      domain: "vx880",
      kind: "literature",
      citation:
        "Ryan EA et al. Diabetes 2005;54(7):2060-2069. doi:10.2337/diabetes.54.7.2060",
      note:
        "Five-year follow-up of the Edmonton cohort: graft function (stimulated C-peptide) " +
        "tracked durable insulin independence — the basis for using MMTT-stimulated C-peptide " +
        "AUC as the functional-mass readout. Grounds the sign/approximate magnitude of the " +
        "C-peptide → insulin-independence edge; weight is calibrated.",
    },
    {
      // HLA-DR matching and islet-transplant outcomes. Replaces a vague prior
      // attribution with a specific, verifiable source. Grounds the HLA-risk →
      // autoimmune-recurrence edge.
      id: "hla-dr-islet-2023",
      domain: "vx880",
      kind: "literature",
      citation:
        "Front Immunol 2023;14:1110544. doi:10.3389/fimmu.2023.1110544",
      note:
        "HLA-DR matching (notably excluding DR3/DR4 mismatch) associated with better islet-" +
        "graft survival and insulin independence — the basis for the recipient HLA-risk → " +
        "autoimmune-recurrence edge. Grounds direction/approximate strength; weight is calibrated.",
    },
  ],
  // Geopolitical-energy → US-macro pass-through. Unlike the t1d/vx880
  // literature entries (where the scalar is an author calibration onto
  // [-1,1]), the six `regression` entries below are the highest-provenance
  // edges in the whole graph: their weight IS an empirically fitted long-run
  // multiplier scaled by the source node's documented share of global supply
  // (see research/macro/README.md + output/*.json — ARDL on monthly
  // log-returns, AIC-selected lags, Newey-West HAC). The two `literature`
  // EIA entries ground the *source shares* / disruption realism (so they sit
  // on the confidence axis), and the two academic `literature` entries cover
  // the DXY channels that were too noisy to identify on the synthetic proxy.
  // Honesty caveat carried in each note: the DXY driver is a SYNTHETIC 6-major
  // basket (real DXY feed unreachable from the sandbox); commodity/EM targets
  // are real public series (IMF Pink Sheet, EM FX panels).
  geo_energy: [
    {
      // P1 Energy → inflation. Brent + Henry Hub → IMF Fuel Energy channel.
      id: "imf-fuel-energy-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "IMF Primary Commodity Prices (Pink Sheet, monthly; imf.org/en/Research/commodity-prices, " +
        "datasets/commodity-prices mirror). ARDL channel fit (research/macro/output/edge_fits.json): " +
        "Brent crude → IMF Fuel Energy Index, long-run multiplier 0.918 [0.839, 0.996], n=303 " +
        "(1992-02–2017-06); Henry Hub gas → IMF Fuel Energy, 0.107 [0.033, 0.182], n=304. Newey-West HAC SEs.",
      note:
        "Backs the energy→US-inflation pass-through edges (Ras Tanura/Abqaiq/Hormuz/North Field/Ras " +
        "Laffan → CPI/PPI energy). The edge weight IS the fitted long-run multiplier scaled by the " +
        "source's documented share of global supply (a transmission coefficient under full source " +
        "disruption) — not an author calibration. IMF Fuel Energy is the reachable monthly proxy for " +
        "the BLS CPI/PPI energy series (FRED CPIENGSL).",
    },
    {
      // P2 Food → CPI-food. IMF Wheat → IMF Food Price Index channel.
      id: "imf-wheat-food-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "IMF Primary Commodity Prices (Pink Sheet, monthly). ARDL fit (research/macro/output/edge_fits.json): " +
        "IMF Wheat price → IMF Food Price Index, long-run multiplier 0.184 [0.122, 0.245], n=316 " +
        "(1991-02–2017-06), Newey-West HAC.",
      note:
        "Backs the food/fertilizer→US-CPI-food edges. Edge weight = fitted multiplier × source share " +
        "(QAFCO nitrogen / Ma'aden phosphate shares of the global food-cost channel). IMF Food Price " +
        "Index proxies the BLS CPI-food series (FRED CPIUFDSL).",
    },
    {
      // P2/P3 Industrial Inputs → All Commodity (fertilizer → PPI).
      id: "imf-industrial-inputs-allcommodity-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "IMF Primary Commodity Prices (Pink Sheet, monthly). ARDL fit (research/macro/output/edge_fits.json): " +
        "IMF Industrial Inputs Index → IMF All Commodity Index, long-run multiplier 0.785 [0.609, 0.960], " +
        "n=304 (1992-02–2017-06), Newey-West HAC.",
      note:
        "Backs the fertilizer→all-commodities-PPI edge. Edge weight = fitted multiplier × source share. " +
        "IMF All Commodity proxies the BLS PPI all-commodities series (FRED PPIACO). (The P3 shipping " +
        "edges reuse this Industrial-Inputs fit as a PARTIAL proxy and are left untagged at 0.55 " +
        "confidence until a real freight feed — Cass/Baltic Dry — is reachable.)",
    },
    {
      // P4 Sovereign → US macro. China iron-ore → Industrial Inputs channel.
      id: "imf-ironore-industrial-inputs-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "IMF Primary Commodity Prices (Pink Sheet, monthly). ARDL fit (research/macro/output/edge_fits.json): " +
        "IMF China-import Iron-Ore Fines (62% Fe) → IMF Industrial Inputs Index, long-run multiplier " +
        "0.193 [0.129, 0.257], n=446 (1980-03–2017-06), Newey-West HAC.",
      note:
        "Backs the China-demand→US-manufacturing/IP/PPI feedback edges (P4). Iron-ore is the China " +
        "marginal-demand proxy. Edge weight = fitted multiplier × per-target mapping share.",
    },
    {
      // DXY → CPI-goods import-price channel.
      id: "dxy-allcommodity-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "ARDL fit (research/macro/output/dxy_fits.json): synthetic DXY → IMF All Commodity Index, " +
        "long-run multiplier −0.749 [−1.189, −0.310], n=220 (1999-02–2017-06), Newey-West HAC.",
      note:
        "Backs the USD-strength→CPI-goods import-price edge — strong, sign-correct, significant. " +
        "CAVEAT: the DXY driver is a SYNTHETIC monthly basket of 6 majors (EUR/JPY/GBP/CAD/SEK/CHF) " +
        "rebuilt from the datasets/exchange-rates mirror (tracks real DXY to ~1% in 2026-03) pending " +
        "FRED DTWEXBGS access; the IMF All Commodity target is real. Edge weight is the fitted " +
        "multiplier magnitude (negative sign carried in the mechanism text).",
    },
    {
      // DXY → EM FX pressure + EM reserve drawdown.
      id: "dxy-em-fx-ardl",
      domain: "geo_energy",
      kind: "regression",
      citation:
        "Panel fits (research/macro/output/dxy_em_fits.json): synthetic DXY → EM FX pressure — " +
        "(i) monthly 7-EM geometric-mean panel β=0.381 [0.270, 0.493], n=325 (1999-02–2026-03); " +
        "(ii) annual 14-EM PIMCO sovereign panel β=0.520 [0.097, 0.943], n=195. DXY → EM FX reserves " +
        "(same PIMCO panel) β=−0.478 [−1.006, +0.050], n=195.",
      note:
        "Backs the USD-strength→EM-FX-pressure and →EM-reserve-drawdown edges. The two FX panels " +
        "triangulate the channel (tight low-vol monthly CI vs wider literature-anchored annual CI); the " +
        "edge weight sits between the point estimates. CAVEAT: same synthetic 6-major DXY driver as " +
        "dxy-allcommodity-ardl; the EM FX/reserve targets are real. Reserves CI just touches zero — " +
        "channel real, identification benefits from a longer panel.",
    },
    {
      // EIA chokepoint fact — grounds the Hormuz source-share + confidence.
      id: "eia-hormuz-chokepoint",
      domain: "geo_energy",
      kind: "literature",
      citation:
        "U.S. EIA, 'The Strait of Hormuz is the world's most important oil transit chokepoint' " +
        "(Today in Energy, 2023; eia.gov/todayinenergy/detail.php?id=61002) + EIA World Oil Transit Chokepoints.",
      note:
        "EIA: ~20 million b/d transit the Strait of Hormuz (2024), ≈20% of global petroleum-liquids " +
        "consumption and ~a quarter of seaborne oil. Grounds the 0.20 source-share scaling and the high " +
        "confidence on the Hormuz→energy-inflation edge; the multiplier itself comes from imf-fuel-energy-ardl.",
    },
    {
      // EIA event fact — grounds the Abqaiq disruption realism + confidence.
      id: "eia-abqaiq-2019",
      domain: "geo_energy",
      kind: "literature",
      citation:
        "U.S. EIA, 'Saudi Arabia crude oil production outage affects global crude oil and gasoline prices' " +
        "(Today in Energy, Sep 2019; eia.gov/todayinenergy/detail.php?id=41413).",
      note:
        "EIA: the 14-Sep-2019 Abqaiq/Khurais attack temporarily removed 5.7 million b/d (~5% of global " +
        "supply); Abqaiq's ~7 million b/d capacity is ~7% of global crude processing. The realized event " +
        "(largest single-day Brent/WTI jump in a decade) is the high-confidence anchor for the " +
        "Abqaiq→energy-inflation edge; the multiplier comes from imf-fuel-energy-ardl.",
    },
    {
      // Literature anchor — real-rate-differential → USD (synthetic-proxy refit too noisy).
      id: "dxy-real-rate-literature",
      domain: "geo_energy",
      kind: "literature",
      citation:
        "Engel C, Mark NC, West KD. 'Exchange Rate Models Are Not as Bad as You Think.' NBER " +
        "Macroeconomics Annual 2007;22:381-441 (NBER WP 13318). Stavrakeva V, Tang J. 'Exchange Rates " +
        "and Monetary Policy.' Federal Reserve Bank of Boston Working Paper No. 15-16.",
      note:
        "Grounds the real-rate-differential→USD edge: higher US real rates pull capital in and appreciate " +
        "the dollar (≈+5-7% DXY per +1pp 10y real rate over 12-18m in the literature). The empirical refit " +
        "on the synthetic real-rate proxy was too noisy to identify (β≈0, n=219), so this edge is " +
        "LITERATURE-CITED until FRED DFII10 (TIPS yield) is reachable; weight/lag are author calibration " +
        "to the cited magnitude.",
    },
    {
      // Literature anchor — USD → EM financial stress (confidence axis).
      id: "em-dollar-funding-literature",
      domain: "geo_energy",
      kind: "literature",
      citation:
        "Bruno V, Shin HS. 'Cross-Border Banking and Global Liquidity.' Review of Economic Studies " +
        "2015;82(2):535-564. doi:10.1093/restud/rdu042. Hofmann B, Patel N, Wu SPY. 'Original sin redux: " +
        "a model-based evaluation.' BIS Working Paper No. 1004, 2022.",
      note:
        "Mechanism anchor for the USD→EM-financial-stress edges: dollar appreciation tightens dollar " +
        "funding and lifts EM risk premia (Bruno-Shin leverage channel; Hofmann-Patel-Wu original-sin-" +
        "redux). Used to ground the CONFIDENCE of the dxy→FX-pressure and dxy→reserves edges; the " +
        "magnitudes come from the dxy-em-fx-ardl panel fits.",
    },
  ],
};

/**
 * Build an id → entry index from a catalog map. Pure — separated from the
 * live index so tests can exercise it with fixtures.
 *
 * Throws on a duplicate id across the whole catalog: ids are the global
 * resolution key, so a collision would make resolution order-dependent and
 * silently shadow one citation with another. Better to fail loudly at module
 * load (and in the audit author's test run) than to mis-attribute an edge.
 */
export function buildProvenanceIndex(
  catalogs: Record<string, EdgeProvenanceEntry[]>,
): Map<string, EdgeProvenanceEntry> {
  const index = new Map<string, EdgeProvenanceEntry>();
  for (const [domain, entries] of Object.entries(catalogs)) {
    for (const entry of entries) {
      if (index.has(entry.id)) {
        const existing = index.get(entry.id)!;
        throw new Error(
          `Duplicate edge-provenance id "${entry.id}" (in domain "${domain}"; ` +
            `already registered under domain "${existing.domain}"). ` +
            `Provenance ids must be globally unique.`,
        );
      }
      index.set(entry.id, entry);
    }
  }
  return index;
}

/** Live index, built once at module load from the static catalog. */
const INDEX: Map<string, EdgeProvenanceEntry> = buildProvenanceIndex(CATALOGS);

/** Look up a catalog entry by id. Undefined if the id isn't registered. */
export function getEdgeProvenanceEntry(
  id: string,
): EdgeProvenanceEntry | undefined {
  return INDEX.get(id);
}

/** All entries for one domain, in authoring order. Empty array if none. */
export function getEdgeProvenanceCatalog(
  domain: string,
): readonly EdgeProvenanceEntry[] {
  return CATALOGS[domain] ?? [];
}

/** Every registered entry across all domains. */
export function allEdgeProvenanceEntries(): readonly EdgeProvenanceEntry[] {
  return [...INDEX.values()];
}

/**
 * Strip the registry-only bookkeeping fields, leaving a plain
 * `EdgeAttributeSource` suitable for the display layer.
 */
function toAttributeSource(entry: EdgeProvenanceEntry): EdgeAttributeSource {
  const { id: _id, domain: _domain, ...source } = entry;
  void _id;
  void _domain;
  return source;
}

/**
 * Resolve an (inline, ref) pair against a given index. Pure — the bound
 * `resolveEdgeSource` below uses the live index; tests inject fixtures.
 *
 * Precedence: inline object > registry ref > author backfill. A ref that
 * doesn't resolve falls through to the backfill rather than throwing — a
 * stale ref on an edge should degrade to "AUTHOR / not validated", not crash
 * the inspector. (`validateEdgeProvenanceRefs` is the loud guard for catching
 * stale refs in a test, where failing fast is the right call.)
 */
export function resolveEdgeSourceWith(
  index: Map<string, EdgeProvenanceEntry>,
  inline: EdgeAttributeSource | undefined,
  ref: string | undefined,
): EdgeAttributeSource {
  if (inline) return inline;
  if (ref) {
    const entry = index.get(ref);
    if (entry) return toAttributeSource(entry);
  }
  return DEFAULT_AUTHOR_SOURCE;
}

/**
 * Resolve an edge attribute's provenance against the live registry. This is
 * the call EdgeInspector (and any future provenance surface) makes.
 */
export function resolveEdgeSource(
  inline: EdgeAttributeSource | undefined,
  ref: string | undefined,
): EdgeAttributeSource {
  return resolveEdgeSourceWith(INDEX, inline, ref);
}

/**
 * Return the subset of refs in `refs` that don't resolve against a given
 * index. Intended for a test that scans the real graph data once the audit
 * tags edges with refs — an unresolved ref is almost always a typo. Returns
 * `[]` when everything resolves (the current state: no edge carries a ref
 * yet, so this trivially passes and becomes a real guard as the audit lands).
 */
export function validateEdgeProvenanceRefs(
  refs: ReadonlyArray<string | undefined>,
  index: Map<string, EdgeProvenanceEntry> = INDEX,
): string[] {
  const missing: string[] = [];
  for (const ref of refs) {
    if (ref && !index.has(ref)) missing.push(ref);
  }
  return missing;
}
