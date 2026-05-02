"""Validation scripts for the macro channel estimators.

Each script generates synthetic data with known parameters, runs the
estimator, and asserts recovery within a documented tolerance. Mirrors
the pattern in ``research/validation/`` (T1D side).

Run all:
    python -m research.macro.validation
"""
from . import ardl_synthetic, event_study_synthetic, dxy_construction

__all__ = ["ardl_synthetic", "event_study_synthetic", "dxy_construction"]
