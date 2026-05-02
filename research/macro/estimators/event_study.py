"""Event-study estimator for facility-level disruption shocks.

For an event with start date ``t``, we measure the abnormal log return on a
target series ``y`` over a tight ``[t-pre, t+post]`` window, normalized by
the in-sample mean log change. Returns the abnormal cumulative percent
change (signed) along with a t-statistic against the null of zero
abnormal return.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class EventStudyResult:
    edge: str
    event_id: str
    event_date: pd.Timestamp
    pre_window_days: int
    post_window_days: int
    pre_mean_log_chg: float
    abnormal_cum_log_return: float
    abnormal_pct: float           # 100 × (exp(abnormal_log_return) − 1)
    t_stat: float
    n_calendar_obs: int


def event_study(
    *,
    edge: str,
    event_id: str,
    event_date: pd.Timestamp,
    target: pd.Series,
    pre_window_days: int = 90,
    post_window_days: int = 30,
) -> EventStudyResult:
    """Compute abnormal cumulative log return around ``event_date``."""
    target = target.sort_index()
    if not isinstance(target.index, pd.DatetimeIndex):
        raise TypeError("event_study target must have a DatetimeIndex")

    pre_start = event_date - pd.Timedelta(days=pre_window_days)
    post_end = event_date + pd.Timedelta(days=post_window_days)
    window = target.loc[pre_start:post_end]
    if len(window) < 4:
        raise ValueError(f"event window for {event_id} too sparse: {len(window)} obs")

    log_chg = np.log(window.where(window > 0)).diff().dropna()
    # Strictly-before pre-window: the event-day return belongs to ``post``
    # (it captures the day-zero impulse). Including it in pre would
    # double-count and bias pre_mean upward by a fraction of the event,
    # mechanically shrinking the abnormal return.
    pre = log_chg.loc[log_chg.index < event_date]
    post = log_chg.loc[log_chg.index >= event_date]
    if pre.empty or post.empty:
        raise ValueError(f"event {event_id}: pre or post window empty")

    pre_mean = float(pre.mean())
    post_cum = float(post.sum())
    abnormal = post_cum - pre_mean * len(post)
    sd = float(pre.std(ddof=1))
    se = sd * np.sqrt(len(post)) if sd > 0 else float("nan")
    t = abnormal / se if se and not np.isnan(se) else float("nan")

    return EventStudyResult(
        edge=edge,
        event_id=event_id,
        event_date=pd.Timestamp(event_date),
        pre_window_days=pre_window_days,
        post_window_days=post_window_days,
        pre_mean_log_chg=pre_mean,
        abnormal_cum_log_return=float(abnormal),
        abnormal_pct=100.0 * (np.exp(abnormal) - 1.0),
        t_stat=float(t),
        n_calendar_obs=int(len(window)),
    )
