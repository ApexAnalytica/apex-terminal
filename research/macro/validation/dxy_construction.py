"""Validation for the synthetic DXY constructor.

The official ICE U.S. Dollar Index in early 2026 was approximately
99-105 (real value depends on the exact date you check). Our synthetic
DXY rebuilt off the public FX panel should land in that band on the
latest observation, and produce a clean monotonic series with no NaNs
in its valid range (1999-01 onward — pre-1999 the official index used
the Deutsche Mark proxy which we don't replicate).

If this validation breaks, either the FX panel changed format, the
basket weights are off, or the cache is stale.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets import fetch_dxy_monthly  # noqa: E402


CHECKS = [
    ("starts at or before 1999-02", lambda d: d.index.min().year <= 1999 and d.index.min().month <= 2),
    ("ends in 2025 or later", lambda d: d.index.max().year >= 2025),
    ("no NaN values in series", lambda d: not d["dxy"].isna().any()),
    ("latest value in plausible band [80, 130]", lambda d: 80.0 <= float(d["dxy"].iloc[-1]) <= 130.0),
    ("month-over-month vol < 8% (no glitches)", lambda d: float(np.log(d["dxy"]).diff().dropna().std()) < 0.08),
    ("strictly positive throughout", lambda d: bool((d["dxy"] > 0).all())),
]


def main() -> None:
    print("=== DXY construction validation ===\n")
    dxy = fetch_dxy_monthly()
    print(
        f"  series spans {dxy.index.min().date()} → {dxy.index.max().date()} "
        f"({len(dxy)} monthly obs)"
    )
    print(f"  latest value: {float(dxy['dxy'].iloc[-1]):.2f}\n")

    n_pass = 0
    for name, check in CHECKS:
        ok = bool(check(dxy))
        n_pass += ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")

    print(f"\n=== {n_pass} / {len(CHECKS)} passed ===")
    if n_pass != len(CHECKS):
        sys.exit(1)


if __name__ == "__main__":
    main()
