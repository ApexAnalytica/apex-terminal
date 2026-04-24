"""Generate a real-data NLME fixture for the TypeScript port.

Uses the Indomethacin pharmacokinetics data from Kwan, Breault,
Umbenhauer, McMahon & Duggan (1976), "Kinetics of indomethacin
absorption, elimination, and enterohepatic circulation in man."
J. Pharmacokinet. Biopharm. 4(3): 255-280. Six healthy volunteers
received 25 mg indomethacin IV; plasma concentrations measured at
11 timepoints out to 8 h.

This is the canonical NLME teaching dataset — tabulated in Pinheiro
& Bates (2000) "Mixed-Effects Models in S and S-PLUS" §6.3, and
distributed with the R `nlme` package as `Indometh`. Public-domain
human clinical data, ~50 years of citations.

Model caveat: indomethacin IV is biphasic (two-compartment distribution
+ elimination). We restrict to the elimination phase (t ≥ 1.0 h), which
is well-approximated by a single exponential C = A·exp(−k·t) — the
functional form our NLME estimator fits. This is the same approach
Pinheiro & Bates take in §6.3 when demonstrating the nlsList / nlme
workflow on a single-exponential submodel.

The fixture captures the Python reference fit so the TypeScript port
can be validated to ~3-4 decimal places on population means μ (log
scale) and to within 15% on between-subject τ and within-subject σ
(standard NLME identifiability tolerance at this sample size).

Usage (from repo root):
    python3 research/validation/nlme_fixture_gen.py

Output:
    src/lib/__tests__/estimators/fixtures/nlme_reference.json
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]

# Import nlme.py directly to avoid research/estimators/__init__.py
# pulling in neighbours we don't need.
_nlme_path = ROOT / "research" / "estimators" / "nlme.py"
_spec = importlib.util.spec_from_file_location("nlme_module", _nlme_path)
assert _spec is not None and _spec.loader is not None
_nlme_mod = importlib.util.module_from_spec(_spec)
sys.modules["nlme_module"] = _nlme_mod
_spec.loader.exec_module(_nlme_mod)
NlmeSubject = _nlme_mod.NlmeSubject  # noqa: N816
nlme_fit = _nlme_mod.nlme_fit  # noqa: N816


# ─── Indomethacin IV plasma concentrations (Kwan 1976) ────────────
#
# Times (hours after 25 mg IV bolus):
TIMES = [0.25, 0.50, 0.75, 1.00, 1.25, 2.00, 3.00, 4.00, 5.00, 6.00, 8.00]

# Concentrations (μg/mL) — 6 subjects × 11 timepoints.
# Source: Pinheiro & Bates (2000) §6.3 Table 6.1 / R `nlme::Indometh`.
CONC = [
    [1.50, 0.94, 0.78, 0.48, 0.37, 0.19, 0.12, 0.11, 0.08, 0.07, 0.05],  # subj 1
    [2.03, 1.63, 0.71, 0.70, 0.64, 0.36, 0.32, 0.20, 0.25, 0.12, 0.08],  # subj 2
    [2.72, 1.49, 1.16, 0.80, 0.80, 0.39, 0.22, 0.12, 0.11, 0.08, 0.08],  # subj 3
    [1.85, 1.39, 1.02, 0.89, 0.59, 0.40, 0.16, 0.11, 0.10, 0.07, 0.07],  # subj 4
    [2.05, 1.04, 0.81, 0.39, 0.30, 0.23, 0.13, 0.11, 0.08, 0.10, 0.06],  # subj 5
    [2.31, 1.44, 1.03, 0.84, 0.64, 0.42, 0.24, 0.17, 0.13, 0.10, 0.09],  # subj 6
]

# Restrict to elimination phase — monoexponential regime.
T_CUTOFF = 1.0


def build_subjects():
    subjects = []
    t_arr = np.array(TIMES, dtype=float)
    mask = t_arr >= T_CUTOFF
    t_use = t_arr[mask]
    for row in CONC:
        y_full = np.array(row, dtype=float)
        subjects.append(NlmeSubject(t=t_use.copy(), y=y_full[mask].copy()))
    return subjects, t_use


def main() -> None:
    subjects, t_use = build_subjects()
    fit = nlme_fit(subjects)

    fixture = {
        "description": (
            "Indomethacin IV pharmacokinetics (Kwan et al. 1976; "
            "tabulated in Pinheiro & Bates 2000 §6.3). 6 healthy "
            "volunteers, 25 mg IV bolus, plasma concentrations at "
            "t = 1.0, 1.25, 2, 3, 4, 5, 6, 8 h (elimination phase — "
            "monoexponential regime). Reference fit by "
            "research/estimators/nlme.py (Laplace approximation, "
            "2D Newton inner + L-BFGS-B outer). Public-domain R "
            "nlme::Indometh. μ reported on log scale."
        ),
        "source": (
            "Kwan KC, Breault GO, Umbenhauer ER, McMahon FG, Duggan DE. "
            "J. Pharmacokinet. Biopharm. 4(3): 255-280 (1976). "
            "Tabulated in Pinheiro & Bates (2000) §6.3 / R nlme::Indometh."
        ),
        "t_cutoff_hours": T_CUTOFF,
        "n_subjects": len(subjects),
        "subjects": [
            {"t": s.t.tolist(), "y": s.y.tolist()} for s in subjects
        ],
        "expected": {
            "mu": fit.mu.tolist(),
            "tau": fit.tau.tolist(),
            "sigma": float(fit.sigma),
            "eta": fit.eta.tolist(),
            "log_likelihood": float(fit.log_likelihood),
            "converged": bool(fit.converged),
        },
    }

    out = ROOT / "src/lib/__tests__/estimators/fixtures/nlme_reference.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(fixture, f, indent=2)
    print(f"wrote {out}")
    print(f"  n_subjects = {len(subjects)},  n_obs/subj = {len(t_use)}")
    print(f"  t (h)      = {t_use.tolist()}")
    print(f"  μ̂ (log)    = {np.round(fit.mu, 4).tolist()}")
    print(f"  μ̂ (nat)    = A≈{np.exp(fit.mu[0]):.3f} μg/mL, "
          f"k≈{np.exp(fit.mu[1]):.3f} /h")
    print(f"  t½ (h)     = {np.log(2) / np.exp(fit.mu[1]):.3f}")
    print(f"  τ̂         = {np.round(fit.tau, 4).tolist()}")
    print(f"  σ̂         = {fit.sigma:.4f}")
    print(f"  log-lik    = {fit.log_likelihood:.4f}")
    print(f"  converged  = {fit.converged}")
    print("")
    print("  Published t½ range for indomethacin: 2-3 h "
          "(Helleberg 1981; Alván 1975). Ours should land in that window.")


if __name__ == "__main__":
    main()
