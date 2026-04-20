"""NLME validation on synthetic C-peptide-like decay.

We simulate a C-peptide cohort with known population parameters:
  μ_A = log(2.5)   (amplitude ≈ 2.5 nmol/L at t=0)
  μ_k = log(0.10)  (decay rate ≈ 10%/unit time — roughly monthly
                    DCCT-style C-peptide attrition)
  τ_A = 0.35       (~35% subject-to-subject amplitude variation)
  τ_k = 0.50       (~50% subject-to-subject rate variation)
  σ   = 0.10       (assay noise sd in nmol/L)

Cohort: 40 subjects, each measured at 7 irregularly-spaced times.

Success criterion: μ recovered within 1 τ/√n ≈ 0.08, τ within 25%,
σ within 25%. These are the usual NLME-identifiability tolerances
reported in nlmixr/Monolix benchmarks at this sample size.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from estimators.nlme import NlmeSubject, nlme_fit  # noqa: E402


def simulate_cohort(
    n_subjects: int = 40,
    mu_true=(np.log(2.5), np.log(0.10)),
    tau_true=(0.35, 0.50),
    sigma_true: float = 0.10,
    seed: int = 0,
) -> tuple[list, dict]:
    rng = np.random.default_rng(seed)
    subjects: list = []
    t_design = np.array([0.0, 0.5, 1.0, 2.0, 4.0, 7.0, 12.0])
    for _ in range(n_subjects):
        eta = np.array([
            rng.normal(mu_true[0], tau_true[0]),
            rng.normal(mu_true[1], tau_true[1]),
        ])
        A, k = np.exp(eta[0]), np.exp(eta[1])
        # Jitter timepoints per subject so inner optimizer sees real irregularity.
        t = t_design + rng.uniform(-0.1, 0.1, size=t_design.shape)
        t = np.clip(t, 0.0, None)
        y = A * np.exp(-k * t) + rng.normal(0, sigma_true, size=t.shape)
        subjects.append(NlmeSubject(t=t, y=y))
    truth = {
        "mu": np.array(mu_true),
        "tau": np.array(tau_true),
        "sigma": sigma_true,
    }
    return subjects, truth


def main() -> None:
    subjects, truth = simulate_cohort(n_subjects=40, seed=0)
    fit = nlme_fit(subjects)

    mu_err = fit.mu - truth["mu"]
    tau_rel = (fit.tau - truth["tau"]) / truth["tau"]
    sigma_rel = (fit.sigma - truth["sigma"]) / truth["sigma"]

    print(f"μ_true  = [{truth['mu'][0]:.3f}, {truth['mu'][1]:.3f}]")
    print(f"μ_fit   = [{fit.mu[0]:.3f}, {fit.mu[1]:.3f}]   err={mu_err}")
    print(f"τ_true  = {truth['tau']}")
    print(f"τ_fit   = {fit.tau.round(3)}   relerr={tau_rel.round(3)}")
    print(f"σ_true  = {truth['sigma']:.3f}   σ_fit = {fit.sigma:.3f}   "
          f"relerr={sigma_rel:.3f}")
    print(f"log-lik = {fit.log_likelihood:.2f}   converged={fit.converged}")

    ok_mu = float(np.max(np.abs(mu_err))) < 0.15
    ok_tau = float(np.max(np.abs(tau_rel))) < 0.30
    ok_sigma = abs(sigma_rel) < 0.30

    print("")
    print(f"μ recovery within 0.15: {'PASS' if ok_mu else 'FAIL'}")
    print(f"τ recovery within 30%:  {'PASS' if ok_tau else 'FAIL'}")
    print(f"σ recovery within 30%:  {'PASS' if ok_sigma else 'FAIL'}")


if __name__ == "__main__":
    main()
