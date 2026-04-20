"""Bayesian Online Change-Point Detection.

Adams & MacKay 2007 (https://arxiv.org/abs/0710.3742) with a Student-t
predictive distribution induced by a Normal-Inverse-Gamma conjugate prior
on (mean, variance) of Gaussian observations.

Change-point signal
-------------------
With constant hazard H, the posterior P(r_t = 0 | x_{1:t}) is identically
H (a normalization tautology), so it is *not* a useful change-point score.
The informative signal is the collapse of the run-length posterior toward
small r following a change-point. We expose:

- `run_length_posterior`: the full P(r_t = k | x_{1:t}) matrix.
- `map_run_length`: the MAP trajectory. At change-points, this either
  drops to 0 / small values or continues to track the new run from zero.
- `new_run_prob`: P(r_t < cp_window | x_{1:t}) — mass concentrated in
  runs younger than `cp_window` observations. High at change-points,
  near-zero during stationary stretches. This is the trace to threshold.

The NIG → Student-t predictive follows Murphy 2007 §3.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass
class BocpdResult:
    run_length_posterior: np.ndarray  # (T, T+1)
    map_run_length: np.ndarray  # (T,)
    new_run_prob: np.ndarray  # (T,) mass in r < cp_window
    predictive_mean: np.ndarray  # (T,)
    log_evidence: np.ndarray  # (T,) log P(x_t | x_{1:t-1})
    cp_window: int


def _student_t_logpdf(x: float, mu: np.ndarray, kappa: np.ndarray,
                      alpha: np.ndarray, beta: np.ndarray) -> np.ndarray:
    """Log posterior-predictive density under NIG(mu, kappa, alpha, beta).

    df    = 2α
    loc   = μ
    scale = sqrt(β(κ+1)/(ακ))
    """
    df = 2.0 * alpha
    scale = np.sqrt(beta * (kappa + 1.0) / (alpha * kappa))
    return stats.t.logpdf(x, df=df, loc=mu, scale=scale)


def bocpd(
    x: np.ndarray,
    hazard: float = 1.0 / 250.0,
    mu0: float = 0.0,
    kappa0: float = 1.0,
    alpha0: float = 1.0,
    beta0: float = 1.0,
    cp_window: int = 20,
) -> BocpdResult:
    """Run Adams & MacKay BOCPD on 1-D data `x`.

    Parameters
    ----------
    x : (T,) array of observations.
    hazard : constant hazard H ∈ (0, 1); higher = more frequent CPs expected.
    mu0, kappa0, alpha0, beta0 : NIG prior hyperparameters (Murphy 2007).
    cp_window : run-length window whose cumulative mass becomes the CP score.
        3 is a safe default; larger values smooth the score.
    """
    x = np.asarray(x, dtype=float).ravel()
    T = x.shape[0]

    # Log-domain run-length posterior for numerical stability on long series.
    log_R = np.full((T + 1, T + 1), -np.inf)
    log_R[0, 0] = 0.0

    mu = np.array([mu0])
    kappa = np.array([kappa0])
    alpha = np.array([alpha0])
    beta = np.array([beta0])

    predictive_mean = np.zeros(T)
    log_evidence = np.zeros(T)
    log_h = np.log(hazard)
    log_1mh = np.log1p(-hazard)

    for t in range(T):
        xt = x[t]
        log_pred = _student_t_logpdf(xt, mu, kappa, alpha, beta)

        prev = log_R[t, : t + 1]
        # joint log P(r_t = r+1, x_{1:t}) = log_R[t, r] + log_pred[r] + log(1-h)
        log_growth = prev + log_pred + log_1mh
        # joint log P(r_t = 0, x_{1:t}) = logsumexp_r(log_R[t, r] + log_pred[r]) + log(h)
        log_cp = _logsumexp(prev + log_pred) + log_h

        log_R[t + 1, 0] = log_cp
        log_R[t + 1, 1 : t + 2] = log_growth

        # Log evidence for this step = logsumexp over the joint row.
        log_ev = _logsumexp(log_R[t + 1, : t + 2])
        log_evidence[t] = log_ev

        # Normalize to posterior.
        log_R[t + 1, : t + 2] -= log_ev

        # Predictive mean weighted by posterior run-length.
        weights = np.exp(log_R[t + 1, : t + 2])
        mu_ext = np.concatenate([[mu0], mu])
        predictive_mean[t] = np.sum(weights * mu_ext)

        # NIG sufficient-statistic updates (Murphy 2007 §3).
        kappa_new = kappa + 1.0
        mu_new = (kappa * mu + xt) / kappa_new
        alpha_new = alpha + 0.5
        beta_new = beta + kappa * (xt - mu) ** 2 / (2.0 * kappa_new)

        mu = np.concatenate([[mu0], mu_new])
        kappa = np.concatenate([[kappa0], kappa_new])
        alpha = np.concatenate([[alpha0], alpha_new])
        beta = np.concatenate([[beta0], beta_new])

    run_length_posterior = np.exp(log_R[1 : T + 1, :])
    map_run_length = run_length_posterior.argmax(axis=1)
    new_run_prob = run_length_posterior[:, :cp_window].sum(axis=1)

    return BocpdResult(
        run_length_posterior=run_length_posterior,
        map_run_length=map_run_length,
        new_run_prob=new_run_prob,
        predictive_mean=predictive_mean,
        log_evidence=log_evidence,
        cp_window=cp_window,
    )


def _logsumexp(a: np.ndarray) -> float:
    a = np.asarray(a)
    m = a.max()
    if not np.isfinite(m):
        return m
    return float(m + np.log(np.sum(np.exp(a - m))))


def detect_changepoints_from_map(
    map_run_length: np.ndarray,
    min_drop: int = 10,
    refractory: int = 10,
) -> list[int]:
    """Locate change-points by detecting MAP run-length resets.

    During a stationary run BOCPD's MAP run-length grows by ~1 per step.
    A change-point manifests as a sharp drop (Δ < 0) once the posterior
    commits to the new regime. We report the FIRST index of each such
    drop and enforce a `refractory` window to avoid double-counting.
    """
    map_rl = np.asarray(map_run_length)
    drops = np.flatnonzero(np.diff(map_rl) < -min_drop) + 1
    out: list[int] = []
    last = -refractory - 1
    for d in drops:
        if d - last >= refractory:
            out.append(int(d))
            last = d
    return out
