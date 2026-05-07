// CVaR-W₁ — Conditional Value-at-Risk under Wasserstein-1 ambiguity.
// Canonical Tail Depth pillar estimator for the Ω-Robustness framework
// (Ghauri 2025, D.Eng. dissertation, Ch. 4 §3).
//
// Empirical α-CVaR of a loss sample {x_1, …, x_n} (sorted ascending,
// k = ⌈αn⌉):
//
//   CVaR_α(X̂) = (1 / ((1−α) n)) · [(k − αn) · x_(k) + Σ_{i=k+1}^n x_(i)]
//
// Robust CVaR over a W₁ ambiguity ball of radius ε around the empirical
// distribution — Mohajerin Esfahani & Kuhn (2018), Theorem 6.3 closed
// form, specialised to the ReLU envelope (·)_+ that defines CVaR. For a
// loss with Lipschitz constant L_ℓ:
//
//   sup_{Q ∈ B_ε^{W₁}(P̂_n)} CVaR_α(ℓ; Q)
//     = CVaR_α(ℓ; P̂_n) + (L_ℓ · ε) / (1 − α)
//
// Identity loss (L_ℓ = 1) is the default — caller passes in samples that
// already have the loss applied. For non-identity ℓ, pass `lipschitz` so
// the ambiguity term scales correctly. Setting `radius = 0` reduces to
// the empirical estimator.
//
// Why it sits at the Tail Depth pillar: ΩF's T pillar measures
// adversarial / worst-case loss in the tail, and CVaR is the standard
// coherent risk measure for that. The W₁ ball is the canonical way to
// hedge against the empirical distribution being wrong by a bounded
// amount in transport cost — the ε term is the "ambiguity premium" that
// converts a sample-CVaR into a distributionally-robust one.
//
// No external deps. O(n log n) from the sort.

export interface CvarW1Options {
  /**
   * Confidence level α ∈ (0, 1). Conventional choices: 0.95 (95% tail),
   * 0.99 (deeper / more conservative).
   */
  alpha: number;
  /**
   * W₁ ambiguity-ball radius ε ≥ 0. Set to 0 to recover the pure
   * empirical CVaR. Calibration is domain-specific — typical practice
   * is ε = c · n^{-1/d} where d is sample dimension and c is tuned by
   * cross-validation on a held-out window.
   */
  radius?: number;
  /**
   * Lipschitz constant L_ℓ of the loss function applied to raw samples.
   * Defaults to 1 (identity loss — caller has already applied any
   * transform). Only affects the ambiguity term; empirical CVaR is
   * computed on the samples as given.
   */
  lipschitz?: number;
}

export interface CvarW1Result {
  /** Empirical α-CVaR of the input sample. */
  empirical: number;
  /**
   * Distributionally-robust α-CVaR under a W₁ ambiguity ball of radius
   * `options.radius`. Equals `empirical + lipschitz · radius / (1 − α)`.
   */
  robust: number;
  /**
   * Empirical α-VaR — the α-quantile of the sample. Returned alongside
   * for downstream callers that want both quantile and tail mean.
   */
  varEmpirical: number;
  /** Echo of the resolved options after defaulting. */
  alpha: number;
  radius: number;
  lipschitz: number;
  /** Sample size used. */
  n: number;
}

/**
 * Compute the empirical α-CVaR of a sample, plus its W₁-robust
 * counterpart under an ambiguity ball of the given radius.
 *
 * Throws on degenerate inputs (empty sample, α outside (0, 1), negative
 * radius, non-positive Lipschitz) — the caller should validate upstream
 * rather than swallow a silent NaN.
 */
export function cvarW1(
  samples: ArrayLike<number>,
  options: CvarW1Options,
): CvarW1Result {
  const { alpha } = options;
  const radius = options.radius ?? 0;
  const lipschitz = options.lipschitz ?? 1;
  const n = samples.length;

  if (n === 0) {
    throw new Error("cvarW1: sample is empty");
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new Error(`cvarW1: alpha must be in (0, 1), got ${alpha}`);
  }
  if (!(radius >= 0)) {
    throw new Error(`cvarW1: radius must be ≥ 0, got ${radius}`);
  }
  if (!(lipschitz > 0)) {
    throw new Error(`cvarW1: lipschitz must be > 0, got ${lipschitz}`);
  }

  // Sort ascending. Copy into a typed array — keeps callers free to
  // pass plain arrays without us mutating their input.
  const sorted = new Float64Array(n);
  for (let i = 0; i < n; i++) sorted[i] = samples[i] as number;
  sorted.sort();

  // Reject NaN — would silently sort to the end and corrupt the tail.
  if (Number.isNaN(sorted[n - 1])) {
    throw new Error("cvarW1: sample contains NaN");
  }

  // k = ⌈α n⌉, clamped so 1 ≤ k ≤ n.
  const aN = alpha * n;
  let k = Math.ceil(aN);
  if (k < 1) k = 1;
  if (k > n) k = n;

  // VaR — the α-quantile, taken at the k-th order statistic (1-indexed).
  const varEmpirical = sorted[k - 1];

  // CVaR via the canonical interpolated formula:
  //   CVaR = (1 / ((1-α) n)) · [(k - αn) · x_(k) + Σ_{i=k+1}^n x_(i)]
  // The leading (k - αn) term redistributes the boundary mass when αn
  // isn't an integer; the second term is the strict upper tail.
  let tailSum = 0;
  for (let i = k; i < n; i++) tailSum += sorted[i];
  const denom = (1 - alpha) * n;
  // (k - αn) is in [0, 1) by construction unless k was clamped to n;
  // when k = n the first term carries the entire tail mass.
  const empirical =
    ((k - aN) * varEmpirical + tailSum) / Math.max(denom, Number.EPSILON);

  // Robust CVaR: closed-form W₁ adjustment.
  const robust = empirical + (lipschitz * radius) / (1 - alpha);

  return {
    empirical,
    robust,
    varEmpirical,
    alpha,
    radius,
    lipschitz,
    n,
  };
}

/**
 * Pillar-T scoring helper. Maps a robust CVaR value into the [0, 10]
 * pillar scale used by the ΩF composite, given a domain-specific
 * reference scale `floor` (CVaR considered low-risk, scored 0) and
 * `ceiling` (CVaR considered saturating, scored 10). Linear in the
 * interior, clamped at the endpoints.
 *
 * Calibration belongs in the DomainProfile, not here — this is just
 * the deterministic mapping.
 */
export function tailDepthScore(
  robustCvar: number,
  floor: number,
  ceiling: number,
): number {
  if (!(ceiling > floor)) {
    throw new Error(
      `tailDepthScore: ceiling (${ceiling}) must be > floor (${floor})`,
    );
  }
  const t = (robustCvar - floor) / (ceiling - floor);
  if (t <= 0) return 0;
  if (t >= 1) return 10;
  return 10 * t;
}
