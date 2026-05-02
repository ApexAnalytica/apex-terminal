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
| statsmodels.macrodata   | US GDP, CPI, unemp, fed funds              | quarter | 1959Q1 → 2009Q3  |
| timeseries.json         | PWT China + Brazil GDP / employment / TFP  | annual  | 1979 → recent    |
| disruption_events.json  | 6 facility shock events (Abqaiq, Hormuz, …)| event   | 2017 → 2026      |

All sources are public, free, no API key. Sandboxed runs use only
`raw.githubusercontent.com` + bundled `statsmodels` + repo files; no FRED
or BLS endpoint is required.

### Known data gaps

The sandbox blocks every government endpoint (FRED, BLS, BEA, EIA
direct, World Bank). Where US-specific monthly CPI / PPI components or
labor data would be the ideal target, we use the IMF global counterpart
as a proxy. The mapping is disclosed in `output/edge_fits.json` per row
under `target_proxy`. A follow-on with FRED access can re-fit with
`CPIENGSL`, `PPIACO`, `MANEMP`, `NAPM`, `INDPRO`, etc. and tighten the
elasticities.

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
│   └── dxy_fits.py         4 DXY edges (PR #134)
├── validation/             synthetic-data correctness tests
│   ├── ardl_synthetic.py
│   ├── event_study_synthetic.py
│   └── dxy_construction.py
├── output/
│   ├── _cache/             gitignored
│   ├── edge_fits.json      cross-domain fit results
│   └── dxy_fits.json       DXY edge fit results
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

Each estimator has a synthetic-data validation that generates a series
with known parameters and asserts recovery within tolerance. Mirrors
`research/validation/` (T1D side).

| suite                          | cases | tolerance                              |
|--------------------------------|-------|----------------------------------------|
| ARDL synthetic                 | 5     | ±0.15 on long-run β; CI-contains-0 in zero regime |
| Event-study synthetic          | 3     | ±2.0 percentage points abnormal return; sign + significance |
| DXY construction               | 6     | latest in [80, 130]; no NaNs; ≥1999-02 start |

The event-study suite caught a real bug in the original
implementation: inclusive `.loc[:event_date]` slicing on the pre
window double-counted the event-day return when the source series had
an observation exactly at ``event_date`` (daily data). Fixed in this
PR; the existing monthly fits were unaffected because Brent / DXY
log-changes don't land on the event day.

## Channel-fit summary

| channel                                 | long-run multiplier | 95% CI               | n   | sample        |
|-----------------------------------------|---------------------|----------------------|-----|---------------|
| Brent → IMF Fuel Energy                 |  0.918              | [0.839, 0.996]       | 303 | 1992 – 2017+  |
| Wheat → IMF Food Price Index            |  0.184              | (see fits.json)      | 316 | 1980 – 2017   |
| Industrial Inputs → All Commodity Idx   |  ~0.79              | (see fits.json)      | 446 | 1980 – 2017   |
| China Iron-Ore → Industrial Inputs      |  0.193              | (see fits.json)      | 446 | 1980 – 2017   |

Cross-check: Abqaiq-Khurais 2019 attack drove +23% abnormal cumulative
return on Brent in the 90 days post (t=2.26, p≈0.02) — consistent with
the channel elasticity of 0.918 applied to a 57.6% peak Saudi
production disruption.

## Follow-ons

1. **FRED access** — refit with US-specific monthly CPI/PPI series; tightens elasticities.
2. **Baltic Dry / Drewry WCI** — replace the partial-proxy P3 fits.
3. **DXY / USD-strength node** — required for FX → import-price loop edges (deferred from PR #115).
4. **Defense-ISR / frontier-science domains** — same audit pattern when data lands.
