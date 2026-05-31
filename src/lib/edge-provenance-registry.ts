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
 * The `geo_energy` domain is the third audit — its six `regression` entries are
 * the highest-provenance edges in the graph (the weight IS a fitted ARDL
 * multiplier from research/macro, not a calibration). The `ai_safety` domain is
 * the fourth: its dataset→attack edges cite public IDS benchmarks (CICIDS-2017,
 * UNSW-NB15, AWID3), while its `ghauri-*` pipeline edges cite a single-author
 * D.Eng. dissertation that is NOT independently web-verifiable — so each of
 * those notes carries that caveat and points at the in-repo implementation
 * (src/lib/discovery/*) as the concrete, checkable grounding.
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
  // AI-safety / IDS continual-learning pipeline (Ghauri 2025 D.Eng., Ch 5-8).
  // TWO grounding tiers, kept honestly distinct:
  //   (a) the three dataset→attack-class entries cite PUBLIC, web-verifiable
  //       IDS benchmarks (CICIDS-2017, UNSW-NB15, AWID3) — the cited paper's
  //       published class taxonomy is the verifiable anchor for "corpus X
  //       contains attack class Y"; the 0.9/0.95 scalars are author
  //       calibration of detection salience, not lifted from any paper.
  //   (b) the four `ghauri-*` entries cite the dissertation's OWN architecture
  //       (GAT continual learner, BES/FR/HES metrics, χ★-biased replay buffer).
  //       HONESTY CAVEAT carried in every ghauri-* note: this is a single-author
  //       D.Eng. dissertation that is NOT independently web-verified — but the
  //       machinery it describes is concretely IMPLEMENTED in this repo
  //       (src/lib/discovery/{bes-temporal,fr-estimator,omega-forgetting-pressure,
  //       ai-safety-demo-trace}.ts + src/lib/estimators/chi-star.ts), and every
  //       chapter/section ref reproduced below already appears on the matching
  //       ais_* node in graph-data.ts. The two `ghauri-*-replay-*` entries are
  //       the registry migration of the two inline seeds shipped in PR #391
  //       (verbatim — same kind, section, rSquared, and numeric claims).
  ai_safety: [
    {
      // Datasets (3) → attack classes. Public, web-verified IDS benchmarks.
      id: "cicids-2017-dataset",
      domain: "ai_safety",
      kind: "literature",
      citation:
        "Sharafaldin I, Lashkari AH, Ghorbani AA. 'Toward Generating a New Intrusion Detection Dataset " +
        "and Intrusion Traffic Characterization.' 4th Intl Conf on Information Systems Security and Privacy " +
        "(ICISSP), Portugal, Jan 2018. Canadian Institute for Cybersecurity, Univ. of New Brunswick " +
        "(unb.ca/cic/datasets/ids-2017.html).",
      note:
        "Grounds the CICIDS-2017→{DDoS, Brute Force, Heartbleed} membership edges: all three are labelled " +
        "classes in the published taxonomy (Heartbleed captured Wed 5-Jul-2017). The edge asserts corpus→" +
        "class membership (verifiable from the dataset docs); the 0.9/0.95 weight/confidence are an author " +
        "calibration of detection salience, not a figure from the paper.",
    },
    {
      id: "unsw-nb15-dataset",
      domain: "ai_safety",
      kind: "literature",
      citation:
        "Moustafa N, Slay J. 'UNSW-NB15: a comprehensive data set for network intrusion detection systems.' " +
        "2015 Military Communications and Information Systems Conference (MilCIS), Canberra, 10-12 Nov 2015. " +
        "Cyber Range Lab, Australian Centre for Cyber Security, UNSW (research.unsw.edu.au/projects/unsw-nb15-dataset).",
      note:
        "Grounds the UNSW-NB15→{Exploits, DoS, Fuzzers} membership edges: all three are among the dataset's " +
        "nine published attack categories (49 features). Corpus→class membership is verifiable; the scalars " +
        "are author calibration of detection salience.",
    },
    {
      id: "awid3-dataset",
      domain: "ai_safety",
      kind: "literature",
      citation:
        "Chatzoglou E, Kambourakis G, Kolias C. 'Empirical Evaluation of Attacks Against IEEE 802.11 " +
        "Enterprise Networks: The AWID3 Dataset.' IEEE Access, 2021. (Original AWID: Kolias C, Kambourakis G, " +
        "Stavrou A, Gritzalis S. 'Intrusion Detection in 802.11 Networks.' IEEE Comms Surveys & Tutorials, 2016.) " +
        "Univ. of the Aegean.",
      note:
        "Grounds the AWID→{frame-injection, spoofing/impersonation, evil-twin MITM} membership edges: all are " +
        "covered 802.11 attack classes in AWID3. CAVEAT: the node's 'AWID-H23Q' label (HTTP/2-3/QUIC revision) " +
        "is the DISSERTATION'S working subset name, NOT a published benchmark — the citable public dataset is " +
        "AWID3. Scalars are author calibration.",
    },
    {
      // Dissertation architecture (Ch 8): GAT learner + window scheduler + eval harness.
      id: "ghauri-gat-continual-ids",
      domain: "ai_safety",
      kind: "literature",
      citation:
        "Ghauri 2025 D.Eng., Ch 8 — continual-IDS reference architecture: 3-layer Graph Attention Network " +
        "(8 heads, dim 64, ELU, dropout 0.2); streaming scheduler segmenting each corpus into 24 one-hour " +
        "windows (one epoch/window, weights frozen between windows); evaluation harness computing Forgetting " +
        "Rate (FR), Bridge-Edge Strength (BES) and Hub-Edge Strength (HES) per window.",
      note:
        "Backs the corpus→GAT, scheduler→GAT and GAT→eval pipeline edges. HONESTY: single-author D.Eng. " +
        "dissertation, NOT independently web-verified — but the FR/window-scheduler/eval machinery is " +
        "implemented in src/lib/discovery/{fr-estimator,ai-safety-demo-trace}.ts, and the Ch 8 architecture " +
        "specs reproduced here already appear on the ais_gat / ais_training_scheduler / ais_eval_harness " +
        "nodes. weight/confidence are author calibration. (On the corpus→GAT edges the dataset citation sits " +
        "on the confidence axis — the corpus identity IS web-verifiable.)",
    },
    {
      // Dissertation result (Ch 8 §4.1): BES is a leading indicator of forgetting.
      id: "ghauri-bes-leading-indicator",
      domain: "ai_safety",
      kind: "literature",
      citation:
        "Ghauri 2025 D.Eng., Ch 8 §4.1 — Bridge-Edge Strength (BES = mean attention weight α_e over edges " +
        "e ∈ χ★) measured at the GAT attention heads; BES peaks lead Forgetting-Rate spikes by 0-1 windows.",
      note:
        "Backs the GAT→attention-layer edge (BES is read at the attention heads as a leading cascade " +
        "indicator). HONESTY: dissertation not independently web-verified; the BES↔FR temporal-lead " +
        "relationship is implemented in src/lib/discovery/bes-temporal.ts + src/lib/estimators/chi-star.ts, " +
        "and the Ch 8 §4.1 ref already appears on the ais_attention_layer node. weight is author calibration.",
    },
    {
      // MIGRATED from PR #391 inline seed on ais_attention_layer__ais_replay_buffer (verbatim).
      id: "ghauri-bes-replay-selection",
      domain: "ai_safety",
      kind: "literature",
      citation: "Ghauri 2025 D.Eng., Ch 6 §3 (BES-biased buffer selection)",
      note:
        "p=0.9 incident, p=0.05 baseline. Backs the attention→replay-buffer and eval→replay-buffer edges: " +
        "flows incident on χ★ bridge edges enter the rehearsal buffer at p=0.9 vs p=0.05 baseline. HONESTY: " +
        "dissertation not independently web-verified; the χ★-biased selection is implemented in " +
        "src/lib/discovery/omega-forgetting-pressure.ts + src/lib/estimators/chi-star.ts. (Registry migration " +
        "of the inline seed shipped in PR #391 — kind, section and numeric claim unchanged.)",
    },
    {
      // MIGRATED from PR #391 inline seed on ais_replay_buffer__ais_gat (verbatim).
      id: "ghauri-replay-forgetting-reduction",
      domain: "ai_safety",
      kind: "regression",
      citation: "Ghauri 2025 D.Eng., Ch 8 §6",
      rSquared: 0.51,
      note:
        "Forgetting Rate halved vs. no-replay baseline (paired t, n=24 windows). Backs the replay-buffer→GAT " +
        "rehearsal-loop edge (and the confidence of eval→buffer). HONESTY: single-author dissertation, NOT " +
        "independently web-verified; the forgetting-reduction loop is implemented in " +
        "src/lib/discovery/fr-estimator.ts + omega-forgetting-pressure.ts. (Registry migration of the inline " +
        "seed shipped in PR #391 — kind, section, rSquared and numeric claim unchanged.)",
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
