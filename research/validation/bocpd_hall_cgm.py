"""BOCPD validation on Hall et al 2018 real CGM data.

Runs BOCPD on a set of Hall subjects (diabetic and pre-diabetic), detects
change-points, and emits annotated plots to research/output/. Reports the
number of detected CPs per subject and basic stability metrics.

Note: Hall et al is T2D/pre-diabetic data. We use it as the best available
real public CGM substrate; T1D-specific validation will follow when
gated datasets (TEDDY, TrialNet individual-level, OpenAPS) are accessed.
"""
from __future__ import annotations

import os
import sys

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from datasets.hall_cgm import subject_trace, list_subjects  # noqa: E402
from estimators.bocpd import bocpd, detect_changepoints_from_map  # noqa: E402


def run_subject(subject_id: str, resample: str = "30min",
                out_dir: str = "research/output") -> dict:
    gl, meta = subject_trace(subject_id, resample=resample)
    x = gl.values.astype(float)
    times = gl.index

    prior_mu = float(np.median(x))
    prior_var = max(float(np.var(x)) * 0.5, 25.0)

    res = bocpd(
        x,
        hazard=1.0 / 96.0,       # ~1 CP per 48 hours at 30-min resolution
        mu0=prior_mu,
        kappa0=0.05,             # weak prior on mean: let the data move it
        alpha0=2.0,
        beta0=prior_var,
        cp_window=10,
    )
    detected = detect_changepoints_from_map(
        res.map_run_length, min_drop=6, refractory=8
    )

    fig, (ax1, ax2, ax3) = plt.subplots(
        3, 1, figsize=(14, 6), sharex=True,
        gridspec_kw={"height_ratios": [2, 2, 1]},
    )
    ax1.plot(times, x, lw=0.6, color="#0b1220")
    for d in detected:
        ax1.axvline(times[d], color="#e11d48", lw=0.6, alpha=0.7)
    ax1.set_ylabel("CGM (mg/dL)")
    ax1.set_title(
        f"Hall {subject_id} ({meta['diagnosis'].iloc[0]}) — "
        f"BOCPD @ {resample} resample"
    )
    ax1.axhline(140, color="#64748b", ls=":", lw=0.5, alpha=0.5)

    Rlog = np.log(np.clip(res.run_length_posterior, 1e-12, 1.0))
    ax2.imshow(Rlog.T, aspect="auto", origin="lower", cmap="viridis",
               vmin=-8, vmax=0, extent=[0, len(x), 0, res.run_length_posterior.shape[1]])
    ax2.plot(res.map_run_length, color="#fbbf24", lw=0.6, label="MAP r")
    for d in detected:
        ax2.axvline(d, color="#e11d48", lw=0.4, alpha=0.7)
    ax2.set_ylabel("run length r")
    ax2.legend(loc="upper left", fontsize=8)

    ax3.plot(res.new_run_prob, color="#0891b2", lw=0.6)
    for d in detected:
        ax3.axvline(d, color="#e11d48", lw=0.4, alpha=0.7)
    ax3.set_ylabel(f"P(r < {res.cp_window})")
    ax3.set_xlabel("sample")
    ax3.set_ylim(0, 1)

    plt.tight_layout()
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"bocpd_hall_{subject_id}.png")
    plt.savefig(out_path, dpi=140)
    plt.close(fig)

    return {
        "subject": subject_id,
        "diagnosis": meta["diagnosis"].iloc[0],
        "n_samples": len(x),
        "n_cps": len(detected),
        "gl_mean": float(np.mean(x)),
        "gl_std": float(np.std(x)),
        "plot": out_path,
    }


def main() -> None:
    subs = list_subjects()
    # Pick 3 diabetic + 3 pre-diabetic subjects at random (seeded).
    rng = np.random.default_rng(0)
    diabetic = subs[subs["diagnosis"] == "diabetic"]["id"].tolist()
    prediabetic = subs[subs["diagnosis"] == "pre-diabetic"]["id"].tolist()
    picks = (rng.choice(diabetic, size=3, replace=False).tolist() +
             rng.choice(prediabetic, size=3, replace=False).tolist())

    rows = [run_subject(sid) for sid in picks]
    summary = pd.DataFrame(rows)
    print(summary.to_string(index=False))

    summary_path = "research/output/bocpd_hall_summary.csv"
    summary.drop(columns=["plot"]).to_csv(summary_path, index=False)
    print(f"\nwrote {summary_path}")


if __name__ == "__main__":
    main()
