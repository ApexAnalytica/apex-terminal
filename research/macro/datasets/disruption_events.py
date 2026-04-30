"""Disruption-event panel for facility-level event studies.

Sourced from ``public/datasets/claire/disruption_events.json``. Each
event carries a start/end date, affected assets, peak disruption
percentage, and a confidence label.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

PATH = (
    Path(__file__).resolve().parents[3]
    / "public"
    / "datasets"
    / "claire"
    / "disruption_events.json"
)


def load_disruption_events() -> pd.DataFrame:
    with open(PATH) as f:
        events = json.load(f)
    df = pd.DataFrame(events)
    df["date_start"] = pd.to_datetime(df["date_start"])
    df["date_end"] = pd.to_datetime(df["date_end"], errors="coerce")
    return df.sort_values("date_start").reset_index(drop=True)
