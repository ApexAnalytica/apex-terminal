"""Nonlinear mixed-effects model for C-peptide-style exponential decay.

Model (per subject i, observation j):

    C_ij = A_i · exp(−k_i · t_ij) + ε_ij,  ε_ij ~ N(0, σ²)

Random effects on the log scale — A_i, k_i are strictly positive:

    log A_i ~ N(μ_A, τ_A²)
    log k_i ~ N(μ_k, τ_k²)

Fit by Laplace approximation of the marginal likelihood: for each
subject we optimize η_i = (log A_i, log k_i) given the current
population parameters, then Laplace-approximate ∫ p(y_i | η_i) p(η_i).
The population parameters θ = (μ_A, μ_k, τ_A, τ_k, σ) are fit by
numerical optimization of the approximated marginal log-likelihood.

This is the core of NONMEM / Monolix / nlmixr for a single nonlinear
function. We hold the functional form (A · exp(−k·t)) fixed because
that's the pharmacologic shape the T1D restoration briefs actually
use for C-peptide and β-cell-stimulation assays — the extension to
other decay shapes is a one-line change.

The per-subject inner solve uses scipy's BFGS; the outer fit uses
L-BFGS-B. Pure Python, portable to TS via `ml-matrix` + a numerical
gradient (all the machinery is standard Gaussian + exp).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
from scipy.optimize import minimize


@dataclass
class NlmeSubject:
    t: np.ndarray
    y: np.ndarray


@dataclass
class NlmeFit:
    mu: np.ndarray       # (2,) — [μ_A, μ_k] on log scale
    tau: np.ndarray      # (2,) — sqrt between-subject variances
    sigma: float         # within-subject sd
    eta: np.ndarray      # (n_subjects, 2) per-subject random effects
    log_likelihood: float
    converged: bool


def _predict_subject(eta: np.ndarray, t: np.ndarray) -> np.ndarray:
    A, k = np.exp(eta[0]), np.exp(eta[1])
    return A * np.exp(-k * t)


def _subject_neg_logpost(
    eta: np.ndarray,
    subj: NlmeSubject,
    mu: np.ndarray,
    tau: np.ndarray,
    sigma: float,
) -> float:
    resid = subj.y - _predict_subject(eta, subj.t)
    ll = -0.5 * np.sum((resid / sigma) ** 2) - len(resid) * np.log(sigma)
    lp = -0.5 * np.sum(((eta - mu) / tau) ** 2) - np.sum(np.log(tau))
    return -(ll + lp)


def _laplace_marginal(
    subj: NlmeSubject,
    mu: np.ndarray,
    tau: np.ndarray,
    sigma: float,
) -> tuple[float, np.ndarray]:
    """Laplace-approximate log marginal likelihood for a single subject.

    Returns (log marginal, eta_mode) so the outer fit can cache
    per-subject modes between iterations.
    """
    res = minimize(
        _subject_neg_logpost,
        x0=mu,
        args=(subj, mu, tau, sigma),
        method="BFGS",
        options={"maxiter": 50, "gtol": 1e-5},
    )
    eta_hat = res.x
    # Numerical Hessian (2x2 is cheap).
    eps = 1e-4
    H = np.zeros((2, 2))
    f0 = _subject_neg_logpost(eta_hat, subj, mu, tau, sigma)
    for i in range(2):
        for j in range(2):
            dei = np.zeros(2); dei[i] = eps
            dej = np.zeros(2); dej[j] = eps
            fpp = _subject_neg_logpost(eta_hat + dei + dej, subj, mu, tau, sigma)
            fpn = _subject_neg_logpost(eta_hat + dei - dej, subj, mu, tau, sigma)
            fnp = _subject_neg_logpost(eta_hat - dei + dej, subj, mu, tau, sigma)
            fnn = _subject_neg_logpost(eta_hat - dei - dej, subj, mu, tau, sigma)
            H[i, j] = (fpp - fpn - fnp + fnn) / (4 * eps * eps)
    H = 0.5 * (H + H.T)
    sign, logdet = np.linalg.slogdet(H)
    # log marginal ≈ -f0 + log(2π) - 0.5 log det H
    log_marg = -f0 + np.log(2 * np.pi) - 0.5 * logdet
    return float(log_marg), eta_hat


def nlme_fit(
    subjects: List[NlmeSubject],
    init_mu: np.ndarray | None = None,
    init_tau: np.ndarray | None = None,
    init_sigma: float = 1.0,
) -> NlmeFit:
    if init_mu is None:
        # Crude starting guess: per-subject log-linear fit, then pool.
        eta_init = []
        for s in subjects:
            mask = s.y > 0
            if mask.sum() >= 2:
                b, a = np.polyfit(s.t[mask], np.log(s.y[mask]), 1)
                eta_init.append([a, -b] if b < 0 else [a, 0.01])
            else:
                eta_init.append([np.log(max(s.y.mean(), 1e-3)), 0.01])
        eta_init = np.asarray(eta_init)
        init_mu = eta_init.mean(axis=0)
        init_tau = np.maximum(eta_init.std(axis=0), 0.1)

    def neg_marginal(params):
        mu = params[:2]
        tau = np.exp(params[2:4])   # positivity via log-parameterization
        sigma = np.exp(params[4])
        total = 0.0
        for s in subjects:
            lm, _ = _laplace_marginal(s, mu, tau, sigma)
            total += lm
        return -total

    x0 = np.concatenate([init_mu, np.log(init_tau), [np.log(init_sigma)]])
    res = minimize(
        neg_marginal, x0, method="L-BFGS-B",
        options={"maxiter": 60, "ftol": 1e-6},
    )
    mu = res.x[:2]
    tau = np.exp(res.x[2:4])
    sigma = float(np.exp(res.x[4]))
    eta = np.zeros((len(subjects), 2))
    for i, s in enumerate(subjects):
        _, eta_hat = _laplace_marginal(s, mu, tau, sigma)
        eta[i] = eta_hat

    return NlmeFit(
        mu=mu, tau=tau, sigma=sigma, eta=eta,
        log_likelihood=float(-res.fun), converged=bool(res.success),
    )
