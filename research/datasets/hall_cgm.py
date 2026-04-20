"""Hall et al 2018 CGM dataset loader.

Published alongside: "Glucotypes reveal new patterns of glucose dysregulation"
(Hall et al., PLoS Biology 2018). 19 subjects (14 pre-diabetic, 5 diabetic),
~1800 CGM samples each at 5-min resolution, collected while subjects ate
standardized meals and performed standardized exercise tests.

This is T2D/pre-diabetic data, not T1D. We use it as a publicly-available
real CGM substrate for validating BOCPD's change-point detection. The
meal-and-exercise events generate large variance regime changes that are
an appropriate test of the detector's real-world behavior.

Upstream: the iglu R package ships the data as `example_data_hall.rda` at
https://raw.githubusercontent.com/irinagain/iglu/master/data/example_data_hall.rda
"""
from __future__ import annotations

import os
from typing import Optional

import pandas as pd

_CACHE = os.path.join(os.path.dirname(__file__), "_cache", "hall_cgm.csv")


def load_hall_cgm() -> pd.DataFrame:
    """Load cached Hall CGM DataFrame: columns [id, time, gl, diagnosis]."""
    if not os.path.exists(_CACHE):
        raise FileNotFoundError(
            f"{_CACHE} missing — run research/scripts/fetch_hall_cgm.py to populate"
        )
    df = pd.read_csv(_CACHE, parse_dates=["time"])
    return df


def subject_trace(subject_id: str,
                   resample: Optional[str] = None) -> tuple[pd.Series, pd.DataFrame]:
    """Return glucose trace for a single subject.

    Parameters
    ----------
    subject_id : Hall subject ID (e.g. '1636-69-001').
    resample : optional pandas offset alias for temporal downsampling
        (e.g. '15min', '1H'). None preserves native 5-min resolution.

    Returns
    -------
    gl : pd.Series indexed by time, values in mg/dL.
    meta : one-row DataFrame with subject metadata.
    """
    df = load_hall_cgm()
    sub = df[df["id"] == subject_id].copy()
    if sub.empty:
        raise KeyError(f"subject {subject_id} not found")
    sub = sub.sort_values("time")
    gl = pd.Series(sub["gl"].values, index=pd.DatetimeIndex(sub["time"]))
    if resample is not None:
        gl = gl.resample(resample).mean().dropna()
    meta = sub[["id", "diagnosis"]].iloc[[0]].reset_index(drop=True)
    return gl, meta


def list_subjects() -> pd.DataFrame:
    """Per-subject summary (id, diagnosis, n_samples)."""
    df = load_hall_cgm()
    summary = (df.groupby(["id", "diagnosis"])
                 .size()
                 .rename("n_samples")
                 .reset_index())
    return summary
