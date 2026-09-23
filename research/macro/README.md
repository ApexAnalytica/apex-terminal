# Manifold — Macro Channel Estimator Research

Empirical fits backing the cross-domain edge weights between the Manifold
geopolitical / macro domains and the US inflation / labor / growth
panels (PR #115). This subdirectory mirrors `research/` (T1D) so the
team's "validate in Python first, then port to TS" rule applies.

## What this fits

PR #115 added 15 cross-domain edges connecting energy, food, supply
chain, and sovereign nodes to the macro inflation panel. The original
weights were domain-knowledge priors. This research subdirectory
replaces those with weights estimated from real data.

```
P1  Energy → Inflation                (5 edges)
P2  Food / Fertilizer → Inflation     (4 edges)
P3  Supply Chain → Goods inflation    (3 edges)
P4  Sovereign → US Macro feedback     (3 edges)
```

The fitted parameters live in `output/edge_fits.json` and are ported to
`src/lib/graph-data.ts` in PR-B.

## Methodology

For each edge we fit a stationary autoregressive distributed-lag
regression on monthly log-returns:

```
Δy_t = α + Σ_{i=1..p} φ_i Δy_{t-i} + Σ_{j=0..q} β_j Δx_{t-j} + ε_t
```

selecting `(p, q)` by AIC over a small grid (`p ∈ {1..3}`, `q ∈ {0..6}`).
The long-run multiplier `Σ β_j` is the cumulative response of `Δy` to a
permanent unit shock in `Δx` — i.e. the elasticity that should govern
edge propagation in a causal graph.

Standard errors use Newey–West HAC with `floor(1.5·T^(1/3))` lags so the
95% confidence interval is robust to heteroskedasticity and
autocorrelation in the residuals.

### Edge weight scale

The fitted edge weight is

```
weight = clip( |long_run_multiplier| × source_share, 0, 0.95 )
```

where `source_share` is the source node's documented share of its
global aggregate (e.g. Aramco's share of global crude, Hormuz's share
of global oil transit, Ma'aden's share of global DAP). This makes the
weight a *transmission coefficient under full source disruption*: the
expected % move in the target if the source were taken offline.

This is a different — and tighter — interpretation than the qualitative
0–1 strength score used elsewhere in the graph. After PR-B lands, P1–P4
edge weights will be smaller than neighboring qualitative-prior edges.
The sign and lag are still on the same scale.

### Confidence

```
confidence = clip( 1 − 0.5 · |se_long_run / long_run_multiplier|, 0.5, 0.9 )
```

P3 edges are capped at 0.55 because the source (`sc_shipping_cost_index`,
`ic_red_sea_exposure`) is fit through a partial proxy (IMF Industrial
Inputs index instead of Baltic Dry / Drewry).

## Data

| source                  | series                                     | freq    | range            |
|-------------------------|--------------------------------------------|---------|------------------|
| IMF Pink Sheet (mirror) | 64 commodity prices + aggregate indices    | monthly | 1980-02 → 2017-06 |
| EIA-mirror (datasets/)  | Brent, WTI                                 | monthly | 1987-05 → present |
| EIA-mirror              | Henry Hub natgas                           | monthly | 1997-01 → present |
| US Treasury mirror      | 10y constant-maturity yield                | monthly | 1953-04 → present |
| Shiller (datasets/)     | CPI level + Long Interest Rate (S&P-500)   | monthly | 1871-01 → 2023-09 |
| FRED H.10 mirror        | 22-currency FX panel (LCU/USD)             | monthly | 1971-01 → present |
| statsmodels.macrodata   | US GDP, CPI, unemp, fed funds              | quarter | 1959Q1 → 2009Q3  |
| timeseries.json         | PWT China + Brazil GDP / employment / TFP  | annual  | 1979 → recent    |
| pimco_sovereign panel   | 20 EM FX rates + FX reserves               | annual  | 2010 → 2024      |
| disruption_events.json  | 6 facility shock events (Abqaiq, Hormuz, …)| event   | 2017 → 2026      |

All sources are public, free, no API key. Sandboxed runs use only
`raw.githubusercontent.com` + bundled `statsmodels` + repo files; no FRED
or BLS endpoint is required.

### Known data gaps + FRED fallback

The sandbox blocks every government endpoint (FRED, BLS, BEA, EIA
direct, World Bank). Where US-specific monthly CPI / PPI components or
labor data would be the ideal target, we use the IMF global counterpart
as a proxy. The mapping is disclosed in `output/edge_fits.json` per row
under `target_proxy`.

`datasets/fred.py` ships a fetcher with **automatic fallback**: when
FRED is reachable (anyone with `FRED_API_KEY` env var, or an
environment that doesn't block fred.stlouisfed.org) it pulls
US-specific series like `CPIENGSL`, `PPIACO`, `DFII10`, `T10YIE`,
`PAYEMS`, `INDPRO`. When FRED is unreachable the wrapper
`with_fred_or_fallback()` warns and returns the caller-supplied IMF
proxy. The fit record discloses which path was used in the
`data_path` field so weights are always traceable.

Probe reachability for your environment:

```bash
python -m research.macro.scripts.probe_fred
```

A FRED-preferred refit lives in `fits/edge_fits_with_fred.py`. Run it
on a machine with FRED access to get tighter US-specific weights —
topology stays unchanged.

## Layout

```
research/macro/
├── datasets/               loaders + on-disk cache
│   ├── _cache.py
│   ├── imf_pink_sheet.py
│   ├── commodities.py      Brent / WTI / natgas
│   ├── treasury.py
│   ├── pwt_sovereign.py    annual China + Brazil
│   ├── statsmodels_macro.py
│   ├── disruption_events.py
│   └── dxy.py              synthetic ICE DXY from FX panel
├── estimators/
│   ├── ardl.py             from-scratch ARDL + HAC SEs
│   └── event_study.py      pre/post abnormal-return
├── fits/
│   ├── edge_fits.py        15 cross-domain edges (PR #129)
│   ├── dxy_fits.py         4 DXY edges (PR #134)
│   └── dxy_em_fits.py      DXY → EM FX panel + reserves (PR #221 + #228)
├── scripts/
│   ├── probe_fred.py       check FRED reachability
│   └── build_macro_timeseries.py  builds public/datasets/claire/macro_timeseries.json
│                                  (drives ip_* node sparklines, PR #221)
├── validation/             synthetic-data correctness tests
│   ├── ardl_synthetic.py
│   ├── event_study_synthetic.py
│   └── dxy_construction.py
├── output/
│   ├── _cache/             gitignored
│   ├── edge_fits.json      cross-domain fit results
│   ├── dxy_fits.json       DXY edge fit results
│   └── dxy_em_fits.json    DXY → EM FX (monthly + annual) + reserves
├── README.md
└── requirements.txt
```

## Running

```bash
# In repo root
python3 -m pip install -r research/macro/requirements.txt

# Fits
python3 -m research.macro.fits.edge_fits
python3 -m research.macro.fits.dxy_fits

# Validation suite (no network needed; runs in <2s)
python3 -m research.macro.validation
```

First fit run downloads ~6 small CSVs (≈3 MB total) into
`output/_cache/`. Subsequent runs are offline.

## Validation suite

Two layers: synthetic-data correctness (does the estimator recover
known parameters?) and out-of-sample stability (does the channel
hold on a holdout?).

### Synthetic-data correctness

| suite                          | cases | tolerance                              |
|--------------------------------|-------|----------------------------------------|
| ARDL synthetic                 | 5     | ±0.15 on long-run β; CI-contains-0 in zero regime |
| Event-study synthetic          | 3     | ±2.0 percentage points abnormal return; sign + significance |
| DXY construction               | 6     | latest in [80, 130]; no NaNs; ≥1999-02 start |

The event-study suite caught a real bug in the original
implementation: inclusive `.loc[:event_date]` slicing on the pre
window double-counted the event-day return when the source series had
an observation exactly at ``event_date`` (daily data). Fixed in
PR #165; the existing monthly fits were unaffected because Brent /
DXY log-changes don't land on the event day.

### Out-of-sample stability

For each channel fit we split 80/20 in time, fit ARDL on train,
forecast one-step-ahead on test using the train coefficients, and
report OOS R², RMSE, and whether |β_train − β_test| > 0.5·|β_train|
(structural break flag).

| channel                          | β_train | β_test  | drift | OOS R²  | break? |
|----------------------------------|--------:|--------:|------:|--------:|:------:|
| P1: Brent → IMF Fuel Energy      |  +0.756 |  +0.778 |   3%  | **+0.970** | stable |
| P2: Wheat → IMF Food Index       |  +0.180 |  +0.192 |   7%  |  +0.550 | stable |
| P3: Indust Inputs → All Comm.    |  +0.669 |  +0.618 |   8%  |  +0.272 | stable |
| P4: China Iron-Ore → Indust In.  |  +0.146 |  +0.199 |  36%  |  +0.391 | stable |
| DXY: US10y → DXY                 |  +0.001 |  +0.076 | 6155% |  +0.210 | **BREAK** |
| DXY: DXY → All Commodity         |  −0.689 |  −0.988 |  43%  |  +0.215 | stable |

Findings: the **Brent → Fuel Energy channel is exceptionally stable**
(OOS R² 0.97). All commodity channels hold across train/test. The
**US10y → DXY channel shows a structural break** — confirming the
finding called out in PR #134 that it should be refit with breakeven-
adjusted real rates rather than nominal yields. The DXY → All
Commodity channel strengthened in the test period (−0.689 → −0.988)
which is consistent with the post-2014 commodity cycle but stays
within tolerance.

## Channel-fit summary

| channel                                 | long-run multiplier | 95% CI               | n   | sample        |
|-----------------------------------------|---------------------|----------------------|-----|---------------|
| Brent → IMF Fuel Energy                 |  0.918              | [0.839, 0.996]       | 303 | 1992 – 2017+  |
| Wheat → IMF Food Price Index            |  0.184              | (see fits.json)      | 316 | 1980 – 2017   |
| Industrial Inputs → All Commodity Idx   |  ~0.79              | (see fits.json)      | 446 | 1980 – 2017   |
| China Iron-Ore → Industrial Inputs      |  0.193              | (see fits.json)      | 446 | 1980 – 2017   |
| DXY → EM FX (monthly, 7-EM mirror)      |  0.381              | [0.27, 0.49]         | 325 | 1999 – 2026   |
| DXY → EM FX (annual, 15-EM PIMCO)       |  0.520              | [0.10, 0.94]         | 195 | 2011 – 2024   |
| DXY → EM FX (cap-weighted, 15-EM)       |  0.521              | [0.08, 0.96]         | 195 | 2011 – 2024   |
| DXY → EM FX reserves (annual, 14-EM)    | −0.478              | [−1.01, +0.05]       | 195 | 2011 – 2024   |

Robustness: the cap-weighted variant (WLS with each country's rows
weighted by 2011-2024 mean current-USD GDP) lands at β = 0.521,
indistinguishable from the equal-weighted β = 0.520. The DXY → EM FX
channel doesn't depend on whether Brazil + Mexico + Turkey carry more
weight than Sri Lanka + Tunisia + Ghana — Hofmann-Patel-Wu's literature
0.5-0.7 holds at both weighting schemes. Edge weight stays at the
0.44 blend (between monthly tier-2 and annual tier-3); confidence stays
0.85.

Cross-check: Abqaiq-Khurais 2019 attack drove +23% abnormal cumulative
return on Brent in the 90 days post (t=2.26, p≈0.02) — consistent with
the channel elasticity of 0.918 applied to a 57.6% peak Saudi
production disruption.

## Empirical playbook for cross-domain edges

When a new edge needs to be refit empirically, work the data sources in
this order. Each tier is a strictly weaker fallback when the prior tier
is unreachable from the sandbox.

```
1. FRED API     (FRED_API_KEY set) — canonical, monthly, US-specific
2. GitHub mirror of the FRED-equivalent series (datasets/oil-prices,
                  datasets/exchange-rates, datasets/bond-yields-us-10y,
                  datasets/commodity-prices, datasets/s-and-p-500)
3. PIMCO sovereign workbook (claire/timeseries.json → pimco_sovereign)
                  — annual, 20 EMs incl. Turkey/Argentina/Colombia/Egypt/
                  Pakistan that the FRED H.10 mirror skips
4. statsmodels.macrodata bundled CSVs — quarterly, 1959-2009
5. Literature-cited weight, transparently disclosed in the edge
                  description with mechanism + reference + "refit
                  pending <data>" tag
```

The DXY → EM FX refits (PR #221, PR #228) are the canonical worked
example: tier-2 monthly fit for the high-confidence point estimate,
tier-3 annual fit for panel breadth (catches Turkey + Argentina that
tier-2 misses), final edge weight is a defensible blend of both with
the description citing each panel's tradeoff. Same pattern applies to
any future EM-side edge.

When you can only get to tier-5 (literature), keep it small and stamped:

```
"physicalMechanism": "...<channel description>... <Author Year>:
                     <expected magnitude>. Literature-cited; refit
                     pending <missing data>."
```

The Tarski validator's R-04 (Cross-Domain Dependency) flags any cross-
domain edge with confidence < 0.7, so literature-cited weights surface
as audit candidates until they get refit.

## Follow-ons

1. ~~**FRED access**~~ — fetcher + IMF fallback shipped in PR #191. Set `FRED_API_KEY` to refit P1/P2 with US-specific CPIENGSL/PPIACO/etc.
2. ~~**Baltic Dry / Drewry WCI**~~ — Baltic Dry isn't free (proprietary); FRED CASSFI (Cass Freight Index) is the closest substitute and ships in PR #192.
3. ~~**DXY / USD-strength node**~~ — shipped in PR #134.
4. **Real-rate refit with TIPS** — shipped in PR #190 with a synthetic proxy; the topology is correct but the proxy is too noisy for monthly returns. Refit with FRED `DFII10` (10y TIPS yield) once FRED key is set; weight tightens, topology unchanged.
5. ~~**DXY → EM FX / reserves**~~ — empirical refits shipped in PR #221 (monthly 7-EM mirror) and PR #228 (annual 15-EM PIMCO panel including Turkey + Argentina).
6. ~~**Macro historical sparklines**~~ — `macro_timeseries.json` builder + 14 ip_* node mappings shipped in PR #221. Backfilling the 25 mi_* labor nodes still needs FRED API access (build script runs the same path with `FRED_API_KEY` set).
7. ~~**Cap-weighted EM FX panel**~~ — shipped. World Bank current-USD GDP from `datasets/gdp` mirror; WLS variant in `dxy_em_fits.py:fit_dxy_to_em_fx_cap_weighted`. β = 0.521, indistinguishable from equal-weighted 0.520 — confirms the channel is symmetric across panel composition.

## Sub-domain audit notes

- **Defense / ISR** — NOT empty (the session brief was stale). 18 nodes
  across Drone Swarms / SATCOM / ISR Fusion / Chip Embargo / Secure
  Compute / Kill Chain live in `src/lib/athena-graph-data.ts` with 17+
  bridge edges to civilian / energy / financial domains. Macro → Athena
  bridges added in PR #193 (Fed funds → GPU supply, DXY → GPU supply,
  IP → MILSATCOM) — closes the missing macro pathway.
- **Frontier Science** — truly empty. `hasData: false` in
  `DomainSelector.tsx`. Card exists, no nodes anywhere. Activation
  requires a teammate data drop covering: post-Standard Model physics,
  neutrino frontier, quantum gravity, dark sector detection. When data
  lands, follow the activation pattern from PR #115 / #129 — add nodes
  with `domain: "frontier-science"`, register in `DOMAIN_MAP` (already
  routes via `frontier-science` ID), add cross-domain edges where
  mechanisms are clear.
