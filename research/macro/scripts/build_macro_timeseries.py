"""Build macro_timeseries.json from sandbox-reachable historical sources.

The macro pillar (ip_* nodes for CPI/PPI/rates, mi_* for labor) is the
last remaining slice of the geopolitical graph that has zero historical
sparkline coverage in `public/datasets/claire/timeseries.json`. The FRED
*live* feed already drives current values via labelPattern matching
(see src/lib/feeds/fred.ts), but live ticks roll forward only 24-60
observations — they don't anchor the time-scrubber / TemporalDataset
replay system.

This builder fills the historical gap for the **inflation/prices (ip_*)**
pillar using the same GitHub-mirrored sources we already use for
econometric fits. BLS labor (mi_*) needs FRED API access and isn't
mirrored on GitHub at usable granularity, so it stays on FRED-live-only
until we run this with FRED_API_KEY.

Output schema matches the existing claire/timeseries.json pattern:
  {
    "macro_fred_proxy": [
      { "date": "...", "metric_name": "cpi_yoy", "metric_value": ...,
        "unit": "%", "source": "Shiller / IMF / etc." },
      ...
    ]
  }

Run:  python -m research.macro.scripts.build_macro_timeseries
"""
from __future__ import annotations

import io
import json
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

OUTPUT = (
    Path(__file__).resolve().parents[3]
    / "public"
    / "datasets"
    / "claire"
    / "macro_timeseries.json"
)

# ── Source URLs (all sandbox-reachable mirrors) ──
SHILLER_SP500 = "https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv"
BRENT = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-monthly.csv"
WTI = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-monthly.csv"
NATGAS = "https://raw.githubusercontent.com/datasets/natural-gas/main/data/monthly.csv"
US10Y = "https://raw.githubusercontent.com/datasets/bond-yields-us-10y/main/data/monthly.csv"
IMF_PINK = "https://raw.githubusercontent.com/datasets/commodity-prices/main/data/commodity-prices.csv"


def _fetch_csv(url: str) -> pd.DataFrame:
    """Single-shot CSV fetch — keep this self-contained so the script is
    runnable without the research package on PYTHONPATH."""
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return pd.read_csv(io.BytesIO(r.content))


# Trim historical depth to keep the JSON payload small. Pre-1980 obs are
# valuable for econometrics but not for sparklines / time-scrubber context;
# 1980 is also the start of IMF Pink Sheet, so all series share the floor.
TRIM_FROM = pd.Timestamp("1980-01-01")


def _records(
    series: pd.Series, *, metric_name: str, unit: str, source: str
) -> list[dict]:
    """Convert a date-indexed numeric Series → list of timeseries records."""
    out: list[dict] = []
    for ts, val in series.dropna().items():
        if not isinstance(ts, pd.Timestamp):
            ts = pd.to_datetime(ts)
        if ts < TRIM_FROM:
            continue
        out.append(
            {
                "date": ts.strftime("%Y-%m-%d"),
                "metric_name": metric_name,
                "metric_value": round(float(val), 4),
                "unit": unit,
                "source": source,
            }
        )
    return out


def build_cpi_series(shiller: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Shiller CPI level → CPI Y/Y % growth. Series ends ~2023-09 because
    Shiller's free public mirror stops backfilling Earnings/Dividend
    (which is gated by his quarterly update cycle), but CPI is filled
    through the same point. Older obs back to 1871 are valuable historical
    context."""
    df = shiller.copy()
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.set_index("Date").sort_index()
    cpi = pd.to_numeric(df["Consumer Price Index"], errors="coerce")
    cpi = cpi[cpi > 0]  # zero rows are sentinel-filled
    cpi_yoy = (cpi / cpi.shift(12) - 1) * 100
    return cpi, cpi_yoy.dropna()


def build_yoy(series: pd.Series) -> pd.Series:
    """Generic 12-month % change. Used for oil, natgas, IMF indices."""
    s = series.dropna()
    s = s[s > 0]
    return ((s / s.shift(12)) - 1).dropna() * 100


def build_real_rate_proxy(us10y: pd.Series, cpi_yoy: pd.Series) -> pd.Series:
    """Real rate proxy = nominal 10y − CPI YoY. Quick-and-dirty (the proper
    construction uses TIPS = DFII10), but for sparkline context the
    Fisher-decomposition proxy is informative through every recession."""
    us10y_aligned = us10y.copy()
    us10y_aligned.index = pd.to_datetime(us10y_aligned.index).to_period("M").to_timestamp("M")
    cpi_aligned = cpi_yoy.copy()
    cpi_aligned.index = pd.to_datetime(cpi_aligned.index).to_period("M").to_timestamp("M")
    common = us10y_aligned.index.intersection(cpi_aligned.index)
    return (us10y_aligned.loc[common] - cpi_aligned.loc[common]).dropna()


def main() -> None:
    print(f"Fetching sources …")
    shiller = _fetch_csv(SHILLER_SP500)
    brent = _fetch_csv(BRENT)
    wti = _fetch_csv(WTI)
    natgas = _fetch_csv(NATGAS)
    us10y_raw = _fetch_csv(US10Y)
    imf = _fetch_csv(IMF_PINK)

    # ── Shape each source into a date-indexed Series ──
    cpi_level, cpi_yoy = build_cpi_series(shiller)

    long_rate = pd.to_numeric(shiller["Long Interest Rate"], errors="coerce")
    long_rate.index = pd.to_datetime(shiller["Date"])
    long_rate = long_rate[long_rate > 0].dropna()

    brent_s = pd.Series(
        brent["Price"].values,
        index=pd.to_datetime(brent["Date"]),
        name="brent",
    ).sort_index()
    wti_s = pd.Series(
        wti["Price"].values,
        index=pd.to_datetime(wti["Date"]),
        name="wti",
    ).sort_index()
    natgas_s = pd.Series(
        natgas["Price"].values,
        index=pd.to_datetime(natgas["Month"], format="%Y-%m"),
        name="natgas",
    ).sort_index()
    us10y_s = pd.Series(
        us10y_raw["Rate"].values,
        index=pd.to_datetime(us10y_raw["Date"]),
        name="us10y",
    ).sort_index()

    imf.columns = [c.strip() for c in imf.columns]
    imf["Date"] = pd.to_datetime(imf["Date"])
    imf = imf.set_index("Date").sort_index().apply(pd.to_numeric, errors="coerce")

    # ── Compute derived series ──
    brent_yoy = build_yoy(brent_s)
    natgas_yoy = build_yoy(natgas_s)
    imf_all_commodity = imf["All Commodity Price Index"].dropna()
    imf_food = imf["Food Price Index"].dropna()
    imf_fuel_energy = imf["Fuel Energy Index"].dropna()
    imf_industrial = imf["Industrial Inputs Price Index"].dropna()
    imf_metals = imf["Metals Price Index"].dropna()

    real_rate = build_real_rate_proxy(us10y_s, cpi_yoy)

    # ── Pack into the unified record schema ──
    records: list[dict] = []
    records += _records(
        cpi_level, metric_name="cpi_level", unit="index",
        source="Shiller (Consumer Price Index, datasets/s-and-p-500)",
    )
    records += _records(
        cpi_yoy, metric_name="cpi_yoy", unit="%",
        source="Shiller CPI Y/Y (computed)",
    )
    records += _records(
        long_rate, metric_name="long_rate_10y", unit="%",
        source="Shiller (Long Interest Rate, 10y nominal)",
    )
    records += _records(
        brent_s, metric_name="brent_oil", unit="USD/bbl",
        source="EIA Brent monthly (datasets/oil-prices)",
    )
    records += _records(
        brent_yoy, metric_name="brent_yoy", unit="%",
        source="EIA Brent Y/Y (computed)",
    )
    records += _records(
        wti_s, metric_name="wti_oil", unit="USD/bbl",
        source="EIA WTI monthly (datasets/oil-prices)",
    )
    records += _records(
        natgas_s, metric_name="natgas_henry_hub", unit="USD/mmBtu",
        source="EIA Henry Hub monthly (datasets/natural-gas)",
    )
    records += _records(
        natgas_yoy, metric_name="natgas_yoy", unit="%",
        source="EIA Henry Hub Y/Y (computed)",
    )
    records += _records(
        us10y_s, metric_name="us10y_nominal", unit="%",
        source="US Treasury 10y monthly (datasets/bond-yields-us-10y)",
    )
    records += _records(
        real_rate, metric_name="real_rate_10y_proxy", unit="%",
        source="US 10y - Shiller CPI Y/Y (Fisher proxy)",
    )
    records += _records(
        imf_all_commodity, metric_name="imf_all_commodity", unit="index",
        source="IMF Pink Sheet (datasets/commodity-prices)",
    )
    records += _records(
        imf_food, metric_name="imf_food_index", unit="index",
        source="IMF Pink Sheet Food",
    )
    records += _records(
        imf_fuel_energy, metric_name="imf_fuel_energy", unit="index",
        source="IMF Pink Sheet Fuel/Energy",
    )
    records += _records(
        imf_industrial, metric_name="imf_industrial_inputs", unit="index",
        source="IMF Pink Sheet Industrial Inputs",
    )
    records += _records(
        imf_metals, metric_name="imf_metals", unit="index",
        source="IMF Pink Sheet Metals",
    )

    # ── Stamp & write ──
    payload = {
        "macro_fred_proxy": records,
        "_meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "record_count": len(records),
            "metric_names": sorted({r["metric_name"] for r in records}),
            "earliest_date": min(r["date"] for r in records),
            "latest_date": max(r["date"] for r in records),
            "sources": [
                "datasets/s-and-p-500 (Shiller CPI, Long Rate)",
                "datasets/oil-prices (Brent, WTI)",
                "datasets/natural-gas (Henry Hub)",
                "datasets/bond-yields-us-10y (US 10y)",
                "datasets/commodity-prices (IMF Pink Sheet)",
            ],
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUTPUT}  ({len(records):,} records)")
    print(f"  metrics: {payload['_meta']['metric_names']}")
    print(f"  range:   {payload['_meta']['earliest_date']} → {payload['_meta']['latest_date']}")


if __name__ == "__main__":
    main()
