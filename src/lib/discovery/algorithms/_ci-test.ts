// ─── Shared CI-test result shape ──────────────────────────────────────
//
// Both `partialCorrelation` (linear-Gaussian) and `cmiKnnTest`
// (nonparametric k-NN) produce a triple of (statistic, p-value, n).
// The statistic interpretation differs per test:
//   - partial correlation: `r` is the Pearson partial-correlation
//     coefficient in [-1, 1]; sign carries direction of association.
//   - CMI-knn: `r` is the CMI estimate in nats, ≥ 0 — larger = more
//     dependence; sign-less by construction.
//
// FCI uses `p` for its independence decision (drop edge when p > α)
// and `r` only as a strength annotation on the surviving edges.

export interface CITestResult {
  /** Test statistic — meaning depends on the test (see file docs). */
  r: number;
  /** Two-sided p-value under H0: X ⊥ Y | Z. */
  p: number;
  /** Effective sample size used (after NaN-drop). */
  n: number;
}
