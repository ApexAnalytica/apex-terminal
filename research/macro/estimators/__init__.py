"""Macro causal-edge estimators.

- ``ardl`` — autoregressive distributed-lag regression with HAC SEs.
  Returns a long-run multiplier suitable for use as an edge weight,
  plus an AIC-selected lag and a HAC-bootstrapped 95% CI.

- ``event_study`` — facility-level event windows pulled from
  ``disruption_events.json`` measure abnormal log-return on a
  market-wide proxy in a tight ``[t-d, t+w]`` window.
"""
from .ardl import ardl_fit, ARDLResult
from .event_study import event_study, EventStudyResult

__all__ = ["ardl_fit", "ARDLResult", "event_study", "EventStudyResult"]
