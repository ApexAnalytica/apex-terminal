"""β₁ sliding-window persistent homology on Hall 2018 CGM traces.

For each of a few randomly selected Hall subjects we:
  1. Resample the 5-min CGM series to hourly to reduce noise,
  2. Takens-embed (dim=3, delay=3) a sliding window of 48 hours,
  3. Count β₁ at fixed ε (scale-adaptive per subject), and
  4. Plot: raw glucose + β₁(t) + max-persistence(t).

The expected qualitative pattern: diabetic subjects — whose CGM traces
spend extended time at near-ceiling values with reduced oscillatory
structure — should show lower β₁ and shorter H₁ bars than pre-diabetic
subjects, whose postprandial excursions preserve more loop structure
in the delay embedding.

This is a qualitative demo, not a diagnostic claim. The β₁ feature is
wired into the criticality layer as a per-tick regime descriptor; the
goal here is to confirm the estimator produces a non-trivial, signal-
tracking trajectory on real CGM data.
"""
from __future__ import annotations

import os
import sys

import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from datasets.hall_cgm import list_subjects, subject_trace  # noqa: E402
from estimators.persistent_homology import sliding_betti1  # noqa: E402


def run_subject(subject_id: str, diagnosis: str, out_dir: str) -> dict:
    gl, _meta = subject_trace(subject_id, resample="1h")
    x = gl.values.astype(float)
    if len(x) < 80:
        return {"id": subject_id, "status": "too-short", "n": len(x)}

    # 48-hour window at 1-hour resolution, stepped 2h.
    window = 48
    step = 2
    traj = sliding_betti1(
        x,
        window=window,
        step=step,
        embed_dim=3,
        embed_delay=3,
        epsilon=None,  # median pairwise dist of the first window
    )

    fig, axes = plt.subplots(3, 1, figsize=(10, 7), sharex=True)
    axes[0].plot(np.arange(len(x)), x, color="#333", lw=0.8)
    axes[0].set_ylabel("glucose (mg/dL)")
    axes[0].set_title(f"{subject_id} — {diagnosis}")

    axes[1].step(traj.t, traj.beta1, where="mid", color="#c03a3a")
    axes[1].set_ylabel(f"β₁  (ε={traj.epsilon:.1f})")
    axes[1].set_ylim(-0.3, max(3, traj.beta1.max() + 0.5))

    axes[2].plot(traj.t, traj.max_persistence, color="#2a6a8a")
    axes[2].set_ylabel("max H₁ persistence")
    axes[2].set_xlabel("time (hours)")

    fig.tight_layout()
    dst = os.path.join(out_dir, f"ph_{subject_id}.png")
    fig.savefig(dst, dpi=130)
    plt.close(fig)

    return {
        "id": subject_id,
        "diagnosis": diagnosis,
        "n": len(x),
        "window_h": window,
        "epsilon": float(traj.epsilon),
        "beta1_mean": float(traj.beta1.mean()),
        "beta1_frac_ge1": float((traj.beta1 >= 1).mean()),
        "max_pers_mean": float(traj.max_persistence.mean()),
        "plot": dst,
    }


def main() -> None:
    subs = list_subjects().sort_values("id")
    rng = np.random.default_rng(7)
    diabetic = subs[subs["diagnosis"].str.lower() == "diabetic"]
    pre = subs[subs["diagnosis"].str.lower().str.startswith("pre")]

    picks = []
    if len(diabetic) >= 2:
        picks += list(rng.choice(diabetic["id"].values, size=2, replace=False))
    if len(pre) >= 2:
        picks += list(rng.choice(pre["id"].values, size=2, replace=False))

    out_dir = "research/output"
    os.makedirs(out_dir, exist_ok=True)

    results = []
    for sid in picks:
        dx = subs.loc[subs["id"] == sid, "diagnosis"].iloc[0]
        r = run_subject(sid, dx, out_dir)
        results.append(r)
        print(r)

    print("\nβ₁ by diagnosis (exact match):")
    by_dx: dict[str, list[float]] = {}
    for r in results:
        if "beta1_mean" not in r:
            continue
        by_dx.setdefault(r["diagnosis"], []).append(r["beta1_mean"])
    for dx, vals in sorted(by_dx.items()):
        print(f"  {dx}: mean={np.mean(vals):.3f} (n={len(vals)})")


if __name__ == "__main__":
    main()
