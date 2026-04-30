# Manifold — Macro / GCC-Energy Edge-Weight Research

Empirical backing for the edge weights in `claire_graph_data.json` — the
GCC energy + petrochem causal graph (Saudi Aramco, Ma'aden, QatarEnergy,
QAFCO; 65 nodes, 69 edges).

This subdirectory mirrors the layout of `research/` (T1D estimators) and
follows the same workflow: implement and validate in Python here, then
port the resulting fits into TypeScript engines / graph data once the
team reviews the methodology and numbers.

## Scope of this PR (PR-A)

**Done in this PR**: methodology, fit pipeline, event-study fits for the
9 highest-leverage price-impact edges, and capacity citations for 7
keystone facility-engineering edges. **Not done in this PR**: actually
updating `claire_graph_data.json`. Weight/lag/confidence updates land in
a follow-up (PR-B) once this work is reviewed.

The artifact PR-B will consume is `output/edge_fits.json` (per-edge
empirical evidence rows) plus `citations/capacity_citations.json`
(audit-grade nameplate citations).

## Why three fit methods, not one

A single statistical method does not fit all 69 edges:

| method | applies to | n edges | how the weight is empirically grounded |
|---|---|---|---|
| `event_study` | source -> price-sensitive target where a recorded disruption event exists | 9 | observed cumulative abnormal return (CAR) on the relevant Pink Sheet / EIA price series in a window around the event |
| `capacity_citation` | facility -> facility throughput edges | 53 | published nameplate capacity from a primary source (operator IR, EIA country brief, S&P Platts) |
| `expert_prior` | edges where neither method is feasible | 7 | retained domain prior; flagged for follow-up data acquisition |

The classifier is in [scripts/classify_edges.py](scripts/classify_edges.py)
and is overridden by the hand-curated mapping in
[citations/edge_event_map.json](citations/edge_event_map.json).

## Data — all free, no API keys

| series | source | frequency | range |
|---|---|---|---|
| Brent, WTI, Henry Hub natgas | EIA via `github.com/datasets` mirrors | daily | 1986/1987/1997 -> present |
| Urea, DAP, phosphate rock, wheat, maize, rice, LNG-Japan, EU/US natgas | World Bank Pink Sheet (CMO Historical Data Monthly) | monthly | 1960 -> 2024-12 |
| Disruption events (Abqaiq 2019, Hormuz 2019, Qatar blockade 2017-21, Ma'aden ramp delay, Ras Laffan 2026, fertilizer restrictions 2022) | `public/datasets/claire/disruption_events.json` (already in repo) | event log | 6 events |

Loaders cache to `datasets/_cache/` (gitignored). Re-runs are
network-free.

## Estimator: event study (constant-mean abnormal returns)

[estimators/event_study.py](estimators/event_study.py)

Reference: MacKinlay (1997), "Event Studies in Economics and Finance,"
*Journal of Economic Literature* 35(1).

We use a **constant-mean** normal-returns model rather than the market
model — there is no obvious benchmark factor for commodity prices
analogous to a stock-market index. The estimation-window mean and
variance of log returns serve as the null distribution.

### Why constant-mean rather than market model

This is the most likely place for reviewer pushback, so the reasoning
explicitly: market-model variance reduction would matter for *small*
effects where signal is borderline, but most of the events here move
prices well outside any plausible "normal" envelope (Abqaiq +12% on
day 0, Ras Laffan 2026 +36% over six trading days, Ma'aden ramp +52%
on monthly urea over four months) — variance reduction is not the
binding constraint. Where the marginal events sit (Hormuz tankers,
2022 fertilizer monthly), the noise comes from regime shifts and
partial anticipation, not from missing benchmark covariance.

The market-model alternative also doesn't *resolve* a methodology
choice; it *opens* a benchmark-selection one, with no clean answer for
any of our target series:

- **Crude (Brent / WTI)**: SPX, DXY, oil-services equity, Bloomberg
  Commodity Index — each gives a different answer, and crude is so
  large in any commodity index that the "benchmark" is largely the
  asset itself.
- **Fertilizer (urea / DAP)**: the only available index covering these
  is the Pink Sheet food-and-beverage index, which *contains* urea and
  DAP. Regressing the asset on an index that includes itself is
  econometrically broken.
- **Natural gas / LNG**: candidates (coal, power-gen index, oil)
  reflect substitution effects that are themselves the object of
  study, not a clean benchmark.

If a customer pushes back with a specific benchmark request — say,
"use Bloomberg Commodity Index ex-energy for the crude edges" — the
estimator generalizes cleanly (replace the constant `mu` with the
fitted regression on the benchmark return). Building it pre-emptively
without that signal would mean picking the benchmark on a guess, which
just relocates the methodology debate.

### Test statistics

- **Patell standardized t** (parametric) at the peak-|magnitude| offset.
- **Moving-block bootstrap** percentile CI on CAR, which preserves the
  volatility clustering present in the estimation window. Block length 5
  trading days for daily series, 3 months for monthly. Results
  insensitive in the [3, 10] / [2, 4] ranges.

Each call returns CARs at three horizons: `immediate` (offset 0),
`short` (~1/3 into the post-event window), and `peak` (absolute peak
within the window). Reporting all three matters because of a real
methodological pitfall: **for slow-price-discovery series (fertilizer,
food, monthly data) the absolute-peak CAR often picks up an unrelated
later trend** — e.g., the Abqaiq 2019 monthly Brent CAR_peak at month +7
catches the COVID-2020 demand crash, not the Abqaiq event itself.
Consumers should use `short` for slow markets and `immediate` or
`short` for fast markets; `peak` is informational only.

## Validation

[validation/event_study_abqaiq.py](validation/event_study_abqaiq.py) —
the textbook case. The 2019-09-14 Abqaiq-Khurais attack removed
~5.7 mb/d of Saudi crude (~5% of global supply); Brent gapped up ~15%
on 2019-09-16, the largest single-day jump since 1991.

Acceptance criteria (all must pass):

```
[PASS]  brent CAR & sig: CAR_peak=+0.1182  lag= 0d  CI=[+0.0432, +0.2441]  patell_t=+2.23
[PASS]    wti CAR & sig: CAR_peak=+0.1160  lag= 0d  CI=[+0.0111, +0.2325]  patell_t=+2.08
       day-0 ARs: brent=+0.1120 wti=+0.1425 natgas=+0.0545
[PASS] brent day-0 > natgas day-0
[PASS] wti day-0 > natgas day-0
```

Brent log-CAR of +0.118 corresponds to a ~12.5% simple price move on
day 0; matches the contemporaneous market reaction documented by EIA.

Run with: `research/.venv/bin/python -m research.macro.validation.event_study_abqaiq`

## Headline empirical results

The 6 disruption events x relevant commodity series produce 34
event-study rows in [output/events_x_series.json](output/events_x_series.json).
The cleanest signals (significant CI excluding zero, sign matching the
expected mechanism):

| Event | Series | Frequency | CAR_short | CI 95% | n_est |
|---|---|---|---|---|---|
| Abqaiq 2019 | Brent | daily | +11.8% @ 0d (peak=immediate) | [+4.3%, +24.4%] | 100 |
| Abqaiq 2019 | WTI | daily | +11.6% @ 0d | [+1.1%, +23.3%] | 100 |
| Ma'aden ramp delay 2017 | Urea | monthly | +52% @ +4m | [+14%, +94%] | 27 |
| Ma'aden ramp delay 2017 | DAP | monthly | +16% @ +4m, peaks at +39% @ +12m | overlaps zero short / [+9%, +84%] peak | 27 |
| Fertilizer restrictions 2022 | Urea | monthly | -47% @ +4m (post-spike crash) | [-92%, -3%] | 27 |
| Fertilizer restrictions 2022 | Brent | daily | +21% @ +6d, peak +28% @ +8d | [+9%, +39%] | 100 |
| Ras Laffan LNG 2026 | Brent | daily | +36% @ +6d, peak +57% @ +19d | [+24%, +47%] | 100 |
| Ras Laffan LNG 2026 | WTI | daily | +38% @ +6d, peak +47% @ +18d | [+27%, +48%] | 100 |
| Hormuz tankers 2019 | LNG-Japan | monthly | -21% @ +4m | [-35%, -5%] | 27 |

(Magnitudes are log returns; for crude/gas the ~5-15% range is large.
The Ras Laffan 2026 daily CARs are notable — the recent event drove the
biggest crude move in the dataset since the 2022 invasion.)

The full per-edge mapping with which event/series/horizon backs which
graph edge lives in [output/edge_fits.json](output/edge_fits.json).

## Honest caveats

These are not "the model is rough"-style hedges; these are scope limits
that reviewers should know:

1. **Three of the six events are regime shifts**, not discrete events:
   Qatar blockade (3.5 years), Ma'aden ramp (2.5 years), fertilizer
   restrictions (10 months). Classical event-study methodology assumes
   discrete unanticipated shocks. We use the start date and report the
   same CARs, but a proper treatment would also report a pre-vs-during
   regime mean shift. Follow-up: implement structural-break tests
   (Bai-Perron / quasi-likelihood-ratio) and report alongside CAR.

2. **The 2022 fertilizer event is partially anticipated.** Pre-event
   urea was already elevated from the late-2021 European gas crisis;
   the estimation-window variance is therefore inflated and the
   "abnormal" return looks small relative to the run-up. This is
   why several 2022 monthly CARs come back negative — the event
   marks the *peak* and the post-event period reverts.

3. **Pink Sheet ends 2024-12.** The 2026 Ras Laffan LNG outage
   (started 2026-03-04) only has daily-frequency studies; monthly
   fertilizer/LNG response is not yet observable in the cached data.
   Re-run after the next Pink Sheet release.

4. **n_supporting_events is small** for most edges (1-2 events).
   Bootstrap CIs come from the estimation-window vol (n_est = 100 daily
   or 27 monthly), so significance is meaningful even at n_event=1.
   But cross-event aggregation (`evidence_summary.mean_abs_car`) at
   n=1 is not a real average — read it as the single observation.

5. **Capacity-citation seed is intentionally small (7 of 53 edges).**
   The schema in
   [citations/capacity_citations.json](citations/capacity_citations.json)
   is stable and additive. Filling out the remaining 46 facility-engineering
   edges is straightforward but mechanical; better as a follow-up data
   task than as part of this methodology PR.

6. **Graph anomalies surfaced during citation work** (orphan Qatar
   nodes with zero edges, thin edge set on Ras Al Khair phosphate hub)
   are recorded in `capacity_citations.json` under `graph_anomalies`
   for PR-B to address.

## Reproducing the results

```bash
python3 -m venv research/.venv
source research/.venv/bin/activate
pip install -r research/requirements.txt openpyxl

# end-to-end (each step is also runnable independently)
python -m research.macro.validation.event_study_abqaiq    # methodology check
python -m research.macro.scripts.classify_edges            # rule-based classification
python -m research.macro.scripts.run_events_x_series       # 34 event-study fits
python -m research.macro.scripts.build_edge_fits           # join into per-edge evidence
```

All outputs land in `research/macro/output/` (gitignored).

## Layout

```
research/macro/
  README.md                          (this file)
  estimators/
    event_study.py                   (constant-mean CAR + block-bootstrap CI)
  datasets/
    commodity_prices.py              (Brent, WTI, Henry Hub daily)
    pinksheet.py                     (World Bank monthly commodities)
  validation/
    event_study_abqaiq.py            (textbook validation)
  scripts/
    classify_edges.py                (rule-based fit-method classifier)
    run_events_x_series.py           (event x series fit harness)
    build_edge_fits.py               (join into per-edge evidence)
  citations/
    edge_classification.json         (auto-generated; method per edge)
    edge_event_map.json              (curated; which event/series backs which edge)
    capacity_citations.json          (curated; primary-source nameplate citations)
  output/                            (gitignored)
    events_x_series.json
    edge_fits.json
```

## Path to PR-B

PR-B reads `output/edge_fits.json` and `citations/capacity_citations.json`
and updates `claire_graph_data.json` with three changes per touched edge:

- `weight`: from capacity citation (where applicable) or empirical
  CAR magnitude transformed to a [0,1] strength scale (transformation
  to be agreed in PR-B).
- `lag`: from `offset` field for event-study edges (kept in source-data
  units — days for daily, months for monthly), or `lag_days` from
  capacity citation.
- `confidence`: explicit function of (CI excludes zero) AND (estimation
  n) for event-study edges, or `confidence` field for capacity
  citations. Specific function to be agreed in PR-B.

The `physicalMechanism` text on each edge is left intact; the citation
schema lets us optionally add a `provenance` pointer next to it
without touching the existing copy.
