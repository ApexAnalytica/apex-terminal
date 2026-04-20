"""Cox PH validation against lifelines on the Rossi recidivism dataset.

Compares our from-scratch Breslow-ties Cox against lifelines' CoxPHFitter
(which uses Efron ties by default). We expect small per-coefficient
differences on datasets with heavy ties (Rossi has weekly resolution,
432 subjects in 52 weeks), so the tolerance is 1.5e-2 on coefficients
and 5e-3 on concordance.

Rossi ships with lifelines — 432 subjects, 7 covariates, event = arrest.
Public-domain data (Fox 2002; Rossi, Berk & Lenihan 1980).
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter
from lifelines.datasets import load_rossi

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.cox import cox_fit  # noqa: E402


def main() -> None:
    # Rossi recidivism dataset is lifelines' canonical CoxPH example —
    # 432 subjects, 7 covariates, event = arrest. Shipped with the
    # library so no external fetch required.
    df = load_rossi()
    feature_cols = [c for c in df.columns if c not in ("week", "arrest")]
    X = df[feature_cols].values.astype(float)
    times = df["week"].values.astype(float)
    events = df["arrest"].values.astype(int)

    print(f"Rossi: n={len(df)}, d={len(feature_cols)}, events={events.sum()}")

    # Our implementation
    ours = cox_fit(X, times, events, l2=1e-6)
    # lifelines benchmark
    cph = CoxPHFitter()
    cph.fit(df, duration_col="week", event_col="arrest")
    ll_beta = cph.params_.values
    ll_c = cph.concordance_index_

    # Compare
    bd = pd.DataFrame({
        "feature": feature_cols,
        "ours":    ours.beta.round(4),
        "lifelines": ll_beta.round(4),
        "abs_diff": np.abs(ours.beta - ll_beta).round(5),
    })
    print(bd.to_string(index=False))
    print(f"\nours c-index   = {ours.concordance:.4f}   "
          f"lifelines c-index = {ll_c:.4f}")
    print(f"ours log-PL    = {ours.log_partial_likelihood:.3f}   "
          f"converged={ours.converged} in {ours.iters} iters")

    # Breslow (ours) vs Efron (lifelines default): small residual
    # differences expected on datasets with heavy ties.
    coef_ok = float(np.abs(ours.beta - ll_beta).max()) < 1.5e-2
    c_ok = abs(ours.concordance - ll_c) < 5e-3
    print("")
    print(f"coef-match check (Breslow vs Efron, tol=1.5e-2): "
          f"{'PASS' if coef_ok else 'FAIL'}")
    print(f"c-index check:    {'PASS' if c_ok else 'FAIL'}")


if __name__ == "__main__":
    main()
