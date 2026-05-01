"""Run event studies for the cross-product of disruption events and
relevant commodity price series.

For each (event, series) pair we record:
  - CAR_peak with 95% bootstrap CI
  - Patell t
  - peak offset (days/months from event start to peak |CAR|)
  - frequency (daily / monthly)
  - notes (e.g., truncation for events that post-date the data)

Result lands in research/macro/output/events_x_series.json. Edges then
pull from this table at the next stage.

Caveats this script makes explicit but does not "solve":

  - Three of the six events (Qatar blockade, Ma'aden ramp delay,
    fertilizer export restrictions) are *regime shifts* spanning
    months-to-years rather than discrete events. We use the start date
    as the event date and report the same CAR statistics, but a proper
    treatment would also report a pre-vs-during mean shift.
  - Pink Sheet monthly data ends 2024-12. Events later than that (Ras
    Laffan 2026-03) only get daily-frequency studies.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from research.macro.datasets import commodity_prices, fred, pinksheet
from research.macro.estimators.event_study import event_study

ROOT = Path(__file__).resolve().parents[3]
EVENTS = ROOT / "public" / "datasets" / "claire" / "disruption_events.json"
OUT = ROOT / "research" / "macro" / "output" / "events_x_series.json"

# Daily event windows are conventional [-5, +20] with [-120, -20] estimation.
# Monthly windows are [-1, +12] with [-30, -3] estimation, capturing
# slow-moving fertilizer / food responses.
DAILY_EST = (-120, -20)
DAILY_EVT = (-5, 20)
MONTHLY_EST = (-30, -3)
MONTHLY_EVT = (-1, 12)

# Per-event series sets. Each tuple is (frequency, series_name, loader_callable).
def _daily_loader(name: str):
    return lambda: commodity_prices.load(name)

def _monthly_loader(name: str):
    return lambda: pinksheet.load()[name].dropna()

DAILY_SERIES = ["brent", "wti", "natgas"]

MONTHLY_SERIES_BY_EVENT = {
    "evt_abqaiq_khurais_2019": [
        "crude_oil_brent", "crude_oil_wti", "natural_gas_us",
    ],
    "evt_hormuz_tanker_incidents_2019": [
        "crude_oil_brent", "crude_oil_wti", "liquefied_natural_gas_japan",
    ],
    "evt_qatar_blockade_2017_2021": [
        "urea", "natural_gas_us", "liquefied_natural_gas_japan",
        "wheat_us_srw",
    ],
    "evt_maaden_waad_al_shamal_ramp_delay": [
        "dap", "phosphate_rock", "urea",
    ],
    "evt_ras_laffan_lng_outage_2026": [],   # post-dates Pink Sheet cache
    "evt_fertilizer_export_restrictions_2022": [
        "urea", "dap", "wheat_us_srw", "maize", "rice_thai_5",
    ],
}

DAILY_SERIES_BY_EVENT = {
    "evt_abqaiq_khurais_2019": ["brent", "wti", "natgas"],
    "evt_hormuz_tanker_incidents_2019": ["brent", "wti", "natgas"],
    "evt_qatar_blockade_2017_2021": ["brent", "wti", "natgas"],
    "evt_maaden_waad_al_shamal_ramp_delay": ["brent"],
    "evt_ras_laffan_lng_outage_2026": ["brent", "wti", "natgas"],
    "evt_fertilizer_export_restrictions_2022": ["brent", "wti", "natgas"],
}

# FRED macro series for pass-through edges added in graph PR #115.
# Empty lists mean no usable macro evidence: events near the end of
# FRED's coverage (Ras Laffan 2026-03 vs FRED end 2026-03-31) leave
# no post-event window for a monthly study.
MACRO_SERIES_BY_EVENT: dict[str, list[str]] = {
    "evt_abqaiq_khurais_2019": [
        "ip_cpi_energy", "ip_ppi_energy", "ip_ppi_all_commodities",
    ],
    "evt_hormuz_tanker_incidents_2019": [
        "ip_cpi_energy", "ip_ppi_energy", "ip_ppi_all_commodities",
    ],
    "evt_qatar_blockade_2017_2021": [
        "ip_cpi_energy", "ip_ppi_energy",
    ],
    "evt_maaden_waad_al_shamal_ramp_delay": [
        "ip_cpi_food", "ip_ppi_all_commodities",
    ],
    "evt_ras_laffan_lng_outage_2026": [],
    "evt_fertilizer_export_restrictions_2022": [
        "ip_cpi_food", "ip_cpi_goods", "ip_ppi_all_commodities",
    ],
}


def _significant(lo: float, hi: float) -> bool:
    return lo > 0 or hi < 0


def main() -> None:
    rng = np.random.default_rng(42)
    events = json.loads(EVENTS.read_text())

    monthly_df = pinksheet.load()
    print(f"Pink Sheet coverage: {monthly_df.index.min().date()} -> {monthly_df.index.max().date()}")

    rows = []
    for ev in events:
        evid = ev["event_id"]
        evdate = pd.Timestamp(ev["date_start"])
        print(f"\n=== {evid}  start={evdate.date()}  {ev['name']}")

        # daily
        for s in DAILY_SERIES_BY_EVENT.get(evid, []):
            try:
                price = commodity_prices.load(s)
                res = event_study(
                    price, evdate, estimation_window=DAILY_EST,
                    event_window=DAILY_EVT, n_boot=2000, rng=rng,
                )
                row = dict(
                    event_id=evid, frequency="daily", series=s,
                    car_immediate=res.car_immediate,
                    car_short=res.car_short, short_offset=res.short_offset,
                    car_peak=res.car_peak, peak_offset=res.peak_offset,
                    ci_low_short=res.boot_ci_low_short,
                    ci_high_short=res.boot_ci_high_short,
                    ci_low_peak=res.boot_ci_low,
                    ci_high_peak=res.boot_ci_high,
                    patell_t=res.patell_t,
                    significant_short=_significant(res.boot_ci_low_short, res.boot_ci_high_short),
                    significant_peak=_significant(res.boot_ci_low, res.boot_ci_high),
                    n_estimation=res.n_estimation,
                    note=None,
                )
                print(f"  daily   {s:<8} short={res.car_short:+.4f}@{res.short_offset}d "
                      f"CI=[{res.boot_ci_low_short:+.4f},{res.boot_ci_high_short:+.4f}]  "
                      f"peak={res.car_peak:+.4f}@{res.peak_offset}d")
            except Exception as e:
                row = dict(event_id=evid, frequency="daily", series=s,
                           note=f"failed: {e}")
                print(f"  daily   {s:<8} ERR: {e}")
            rows.append(row)

        # monthly
        for s in MONTHLY_SERIES_BY_EVENT.get(evid, []):
            if s not in monthly_df.columns:
                rows.append(dict(event_id=evid, frequency="monthly", series=s,
                                 note="series not in pink sheet"))
                print(f"  monthly {s:<24} (missing)")
                continue
            series = monthly_df[s].dropna()
            try:
                res = event_study(
                    series, evdate, estimation_window=MONTHLY_EST,
                    event_window=MONTHLY_EVT, n_boot=2000, block_len=3, rng=rng,
                )
                row = dict(
                    event_id=evid, frequency="monthly", series=s,
                    car_immediate=res.car_immediate,
                    car_short=res.car_short, short_offset=res.short_offset,
                    car_peak=res.car_peak, peak_offset=res.peak_offset,
                    ci_low_short=res.boot_ci_low_short,
                    ci_high_short=res.boot_ci_high_short,
                    ci_low_peak=res.boot_ci_low,
                    ci_high_peak=res.boot_ci_high,
                    patell_t=res.patell_t,
                    significant_short=_significant(res.boot_ci_low_short, res.boot_ci_high_short),
                    significant_peak=_significant(res.boot_ci_low, res.boot_ci_high),
                    n_estimation=res.n_estimation,
                    note=None,
                )
                print(f"  monthly {s:<24} short={res.car_short:+.4f}@{res.short_offset}m "
                      f"CI=[{res.boot_ci_low_short:+.4f},{res.boot_ci_high_short:+.4f}]  "
                      f"peak={res.car_peak:+.4f}@{res.peak_offset}m")
            except Exception as e:
                row = dict(event_id=evid, frequency="monthly", series=s,
                           note=f"failed: {e}")
                print(f"  monthly {s:<24} ERR: {e}")
            rows.append(row)

        # macro (FRED CPI/PPI/IP/etc., monthly frequency)
        for node_id in MACRO_SERIES_BY_EVENT.get(evid, []):
            try:
                series = fred.load_node(node_id)
                res = event_study(
                    series, evdate, estimation_window=MONTHLY_EST,
                    event_window=MONTHLY_EVT, n_boot=2000, block_len=3, rng=rng,
                )
                row = dict(
                    event_id=evid, frequency="macro", series=node_id,
                    fred_id=fred.NODE_TO_FRED[node_id],
                    car_immediate=res.car_immediate,
                    car_short=res.car_short, short_offset=res.short_offset,
                    car_peak=res.car_peak, peak_offset=res.peak_offset,
                    ci_low_short=res.boot_ci_low_short,
                    ci_high_short=res.boot_ci_high_short,
                    ci_low_peak=res.boot_ci_low,
                    ci_high_peak=res.boot_ci_high,
                    patell_t=res.patell_t,
                    significant_short=_significant(res.boot_ci_low_short, res.boot_ci_high_short),
                    significant_peak=_significant(res.boot_ci_low, res.boot_ci_high),
                    n_estimation=res.n_estimation,
                    note=None,
                )
                print(f"  macro   {node_id:<28} short={res.car_short:+.4f}@{res.short_offset}m "
                      f"CI=[{res.boot_ci_low_short:+.4f},{res.boot_ci_high_short:+.4f}]  "
                      f"peak={res.car_peak:+.4f}@{res.peak_offset}m")
            except Exception as e:
                row = dict(event_id=evid, frequency="macro", series=node_id,
                           note=f"failed: {e}")
                print(f"  macro   {node_id:<28} ERR: {e}")
            rows.append(row)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "windows": dict(daily_estimation=DAILY_EST, daily_event=DAILY_EVT,
                        monthly_estimation=MONTHLY_EST, monthly_event=MONTHLY_EVT),
        "results": rows,
    }, indent=2, default=float))
    print(f"\nwrote {OUT.relative_to(ROOT)}  ({len(rows)} rows)")


if __name__ == "__main__":
    main()
