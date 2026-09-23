// Static metadata for each criticality estimator. The runtime (ParetoPanel)
// reads this to build the tab strip and CriticalityCard content — the
// DomainProfile's `criticalityEstimators: EstimatorId[]` array controls which
// entries render, and the runtime decides whether each one can compute on
// the currently-available data ("ready") or must show a placeholder:
//
//   - "awaiting-data": TS implementation exists (src/lib/estimators/*) but
//     the required input series (e.g. CGM trace, C-peptide AUC) isn't wired
//     into the store yet. Card renders with full methodology + an explicit
//     "inputs" notice, suppresses time series + confidence.
//
//   - "pending-port": Python reference is canonical (research/estimators/*)
//     and a TS port is deferred (typically because a linalg dep is needed).
//     Card renders with methodology + pointer to the Python reference.

import type { EstimatorId } from "./domain-profiles";

export type EstimatorAvailability = "ready" | "awaiting-data" | "pending-port";

export interface EstimatorMeta {
  id: EstimatorId;
  abbrev: string;
  fullName: string;
  shortDesc: string;
  color: string;
  /** Prose paragraphs describing the method. Rendered verbatim in the card. */
  methodology: string[];
  /** One-line symbolic formula shown in the formula panel. */
  formula: string;
  /**
   * When the runtime hasn't computed a live result, this describes what the
   * estimator is doing so the card still reads as content rather than
   * an empty skeleton. For "ready" estimators the runtime replaces this
   * with a live assessment string.
   */
  placeholderAssessment: string;
  /**
   * Availability outside of live graph data. "ready" estimators like CSD
   * always have something to compute on; data-hungry estimators are
   * "awaiting-data" until their input source is wired.
   */
  defaultAvailability: EstimatorAvailability;
  /** Required input description — rendered on "awaiting-data" cards. */
  requiredInputs?: string;
  /** Python reference path — rendered on "pending-port" cards. */
  pythonReference?: string;
}

const REGISTRY: Record<EstimatorId, EstimatorMeta> = {
  // ── Criticality engines (current geopolitical cards) ──────────────
  csd: {
    id: "csd",
    abbrev: "CSD",
    fullName: "CRITICAL SLOWING DOWN",
    shortDesc:
      "Recovery rate decay — epochs until perturbation recovery time diverges to infinity",
    color: "#ff1744",
    methodology: [],
    formula: "",
    placeholderAssessment: "",
    defaultAvailability: "ready",
  },
  ph: {
    id: "ph",
    abbrev: "PH",
    fullName: "PERSISTENT HOMOLOGY",
    shortDesc:
      "Topological fragility holes — epochs until high-Ω cluster boundaries collapse",
    color: "#ff1744",
    methodology: [],
    formula: "",
    placeholderAssessment: "",
    defaultAvailability: "ready",
  },
  lppls: {
    id: "lppls",
    abbrev: "LPPLS",
    fullName: "LOG-PERIODIC POWER LAW SINGULARITY",
    shortDesc:
      "Super-exponential fragility growth — epochs until singularity (tc) is reached",
    color: "#ff1744",
    methodology: [],
    formula: "",
    placeholderAssessment: "",
    defaultAvailability: "ready",
  },

  // ── BOCPD: live on the scoped Ω trajectory (same source as CSD/LPPLS).
  // Was previously gated to T1D-node series (rarely > 5 points each); now
  // runs on whatever trajectory the active scope produces, which is the
  // same substrate the rest of the criticality cards already use.
  bocpd: {
    id: "bocpd",
    abbrev: "BOCPD",
    fullName: "BAYESIAN ONLINE CHANGE-POINT DETECTION",
    shortDesc:
      "Run-length posterior on the scoped Ω trajectory — flags regime shifts via P(new run)",
    color: "#00e5ff",
    methodology: [
      "Adams & MacKay (2007) run-length posterior with a Normal-Inverse-Gamma conjugate prior on a Gaussian observation model. For each time step we track P(r_t = k), the probability that the current run began k steps ago.",
      "Signal of interest is P(r_t < cpWindow) — the probability that a change-point has occurred in the last `cpWindow` observations. The Pareto card surfaces the trailing-window peak of this trace as the criticality readout; F·E·G·S·M's regime gate then weighs it against (1) recent peak above floor and (2) variability of the full posterior so a flat trace does not score as criticality.",
      "TS implementation at src/lib/estimators/bocpd.ts with a parity test against the Python reference. Same kernel that runs on D1NAMO CGM in the SPIRTES bocpd-hypo-calibration tab (AUROC 0.679 vs hypoglycemic events).",
    ],
    formula:
      "P(r_t | x_{1:t}) ∝ Σ P(x_t | r_{t-1}, x_past) · P(r_t | r_{t-1}) · P(r_{t-1} | x_{1:t-1})",
    placeholderAssessment:
      "STABLE REGIME — posterior is concentrated on the current run; no recent change-point activity above floor.",
    defaultAvailability: "ready",
  },

  // ── Distributionally-robust risk (Ghauri 2025 Ω-Robustness, from-spec) ──
  "cvar-w1": {
    id: "cvar-w1",
    abbrev: "CVAR-W₁",
    fullName: "CVaR — WASSERSTEIN-1 AMBIGUITY",
    shortDesc:
      "Distributionally-robust α-CVaR over a W₁ ball — quantifies tail loss with a calibrated ambiguity premium",
    color: "#7B68EE",
    methodology: [
      "Conditional Value-at-Risk (CVaR_α) is the standard coherent risk measure for the upper-α tail of a loss distribution: the expected loss conditional on being in the worst (1−α) fraction of outcomes. For a sorted sample {x_(1) ≤ … ≤ x_(n)} and k = ⌈αn⌉ the empirical estimator is CVaR_α = (1 / ((1−α)n)) · [(k − αn) · x_(k) + Σ_{i>k} x_(i)]. The (k − αn) factor redistributes the boundary order statistic when αn isn't an integer.",
      "Wasserstein-1 ambiguity hedges against the empirical distribution being wrong. Define a W₁-ball B_ε(P̂_n) of radius ε around the empirical measure; the worst-case CVaR over that ball admits a closed form (Mohajerin Esfahani & Kuhn 2018, Theorem 6.3, specialised to the ReLU envelope (·)_+ that defines CVaR via Rockafellar-Uryasev): sup_{Q ∈ B_ε} CVaR_α(ℓ; Q) = CVaR_α(ℓ; P̂_n) + (L_ℓ · ε) / (1−α). The ambiguity term is a deterministic premium proportional to ε and inversely proportional to (1−α) — it grows as you demand more tail confidence.",
      "Implementation at src/lib/estimators/cvar-w1.ts. From-spec, derived directly from Ghauri 2025 (D.Eng., Ch. 4 §3 — Ω-Robustness framework). No Python reference exists because the dissertation closed form is the canonical specification. Calibration of ε is domain-specific — typical practice is ε = c · n^{−1/d} where d is the loss dimensionality and c is tuned by cross-validation on a held-out window.",
    ],
    formula: "CVaR_α^{W₁}(X) = CVaR_α(X̂) + L · ε / (1 − α)",
    placeholderAssessment:
      "READY — operates on per-node ΩF composite values across the live filtered graph. α = 0.9 standard. W₁ ambiguity radius ε = 0 until a calibrated value is wired per profile.",
    defaultAvailability: "ready",
  },

  // ── Topology-aware criticality (Ghauri 2025 χ★ artefact, from-spec) ──
  "chi-star": {
    id: "chi-star",
    abbrev: "χ★",
    fullName: "χ★ — BRIDGE SETS",
    shortDesc:
      "Topological load-bearing skeleton — strict bridges + top Bridge-Edge Strength edges that gate the graph's cascade pathways",
    color: "#7B68EE",
    methodology: [
      "Strict bridges via Tarjan (1974): an edge (u, v) is a bridge iff low[v] > disc[u] in the DFS tree — i.e. v's subtree has no back-edge climbing above u. Removing a bridge disconnects the (undirected) graph, so every cascade path between the two resulting components must traverse it. Iterative DFS with parent-edge bookkeeping handles multi-edges correctly (parallel edges between the same pair are NOT bridges since one provides the alternate path). O(V + E).",
      "Bridge-Edge Strength (BES) is edge betweenness centrality (Brandes 2008) normalised to [0, 1] by the graph's max. Per-source BFS + reverse-order dependency accumulation, divided by 2 to correct the undirected double-count. High BES = high information-flow funnel — the edge participates in many shortest paths even if removing it doesn't formally disconnect the graph. The dissertation's GAT attention head reads BES to bias the replay buffer toward high-bridge edges (Ch. 8 §6, topology-aware rehearsal). O(V · E).",
      "χ★ = strict bridges ∪ top-k BES edges. The default top-k is max(1, ⌊0.1 · |E|⌋). Implementation at src/lib/estimators/chi-star.ts. From-spec, derived directly from Ghauri 2025 (D.Eng., Ch. 5–8). The artefact is the canonical 'edges most worth hardening, monitoring, or preserving in replay against catastrophic forgetting' set.",
    ],
    formula:
      "χ★(G) = bridges(G) ∪ topK_BES(G);  BES(e) = betweenness(e) / max_betweenness",
    placeholderAssessment:
      "READY — operates on the live graph topology. Surfaces strict bridges and the BES distribution; runtime renders the χ★ set highlighted on the graph plus the descending-BES ranking.",
    defaultAvailability: "ready",
  },

  "transfer-entropy": {
    id: "transfer-entropy",
    abbrev: "TE",
    fullName: "TRANSFER ENTROPY",
    shortDesc:
      "Directed information flow between physiological signals — quantifies which variable drives which",
    color: "#ffab00",
    methodology: [
      "Schreiber (2000) transfer entropy TE(X→Y) = H(Y_fut, Y_past) + H(Y_past, X_past) − H(Y_past) − H(Y_fut, Y_past, X_past). Measures how much the past of X reduces uncertainty about Y's future beyond Y's own past — a directed, non-parametric generalisation of Granger causality.",
      "Binning-based plug-in estimator with Miller-Madow bias correction (TS port at src/lib/estimators/transfer-entropy.ts). On T1D traces the natural pairs are insulin → glucose, stress biomarker → glucose variability, sleep fragmentation → dawn-phenomenon amplitude, and C-peptide → exogenous-insulin demand.",
      "Asymmetry TE(X→Y) − TE(Y→X) indicates drive direction. A well-behaved basal-bolus regime shows strong insulin → glucose and near-zero reverse flow; loss of asymmetry flags closed-loop malfunction or physiological decoupling.",
    ],
    formula:
      "TE(X → Y) = H(Y_t+1, Y_t) + H(Y_t, X_t) − H(Y_t) − H(Y_t+1, Y_t, X_t)",
    placeholderAssessment:
      "AWAITING DATA — paired physiological traces not yet wired. Once two aligned series are available (e.g. CGM + insulin dose log), the card reports TE(X→Y), TE(Y→X), and the asymmetry score.",
    defaultAvailability: "awaiting-data",
    requiredInputs:
      "Two aligned scalar time series sharing a common clock (CGM + insulin log, glucose + stress biomarker, HR + CGM, etc.). Minimum ~200 points for the binning estimator to be stable.",
  },
  moran: {
    id: "moran",
    abbrev: "MORAN",
    fullName: "MORAN'S I — SPATIAL AUTOCORRELATION",
    shortDesc:
      "Islet-level spatial clustering — detects focal autoimmune attack vs. diffuse β-cell loss",
    color: "#b388ff",
    methodology: [
      "Moran's I = (n / W) · Σ_ij w_ij (x_i − x̄)(x_j − x̄) / Σ_i (x_i − x̄)². Positive values indicate spatial clustering of the variable x across a weight graph w; near-zero indicates random spatial distribution; negative indicates dispersion.",
      "Applied to pancreas histology or spatial transcriptomics this distinguishes focal insulitis (high I — lymphocyte infiltration clustered at specific islets) from diffuse β-cell dysfunction (I ≈ 0 — uniform decline). k-NN weight matrix built from islet centroid coordinates.",
      "TS port at src/lib/estimators/moran.ts. Awaiting spatial data source — islet coordinates + a per-islet scalar (insulin staining intensity, CD8+ count, GAD65 autoantibody titer).",
    ],
    formula: "I = (n / W) · Σ w_ij (x_i − x̄)(x_j − x̄) / Σ (x_i − x̄)²",
    placeholderAssessment:
      "AWAITING DATA — pancreas spatial data not yet wired. Needs islet centroids and a per-islet scalar (staining intensity, immune cell count, or functional readout) to compute.",
    defaultAvailability: "awaiting-data",
    requiredInputs:
      "Islet 2D/3D centroid coordinates plus a per-islet scalar. k-NN weight matrix built on coordinates.",
  },
  takens: {
    id: "takens",
    abbrev: "TAKENS",
    fullName: "TAKENS EMBEDDING + PERSISTENT HOMOLOGY",
    shortDesc:
      "Reconstructs the phase-space attractor of a patient trace and measures its topological complexity",
    color: "#69f0ae",
    methodology: [
      "Takens (1981) delay-embedding reconstructs the latent dynamical attractor from a single scalar trace: X(t) = [x(t), x(t−τ), …, x(t−(d−1)τ)]. For a generic embedding dimension d ≥ 2·D_attractor + 1, the reconstructed trajectory is diffeomorphic to the true state space.",
      "Persistent homology on the embedded point cloud (src/lib/estimators/persistent-homology.ts) returns β₁ persistence bars — the lifespans of topological cycles. Long-lived β₁ features correspond to stable limit cycles (e.g. circadian glucose rhythm); short-lived features are noise.",
      "Change in β₁ persistence over rolling windows flags dynamical regime shifts the magnitude-based estimators miss — e.g. loss of circadian structure under hypoglycemia unawareness, or emergence of new oscillatory modes during honeymoon phase.",
    ],
    formula: "X(t) = [x(t), x(t−τ), x(t−2τ), …, x(t−(d−1)τ)]",
    placeholderAssessment:
      "AWAITING DATA — long-horizon patient trace not yet wired. Needs a dense scalar series (CGM 5-min cadence over weeks) to reconstruct the phase-space attractor.",
    defaultAvailability: "awaiting-data",
    requiredInputs:
      "Dense univariate time series (e.g. CGM at 5-min cadence, ≥2 weeks). Delay τ selected via mutual-information minimum; embedding dimension via false-nearest-neighbors.",
  },

  // ── Medical estimators pending TS port (Python reference is canon) ──
  "hte-meta": {
    id: "hte-meta",
    abbrev: "HTE",
    fullName: "HETEROGENEOUS TREATMENT EFFECT META-LEARNER",
    shortDesc:
      "CATE estimation across subgroups — which patient profile responds to which intervention",
    color: "#ffab00",
    methodology: [
      "Künzel et al. (2019) X-learner meta-algorithm for conditional average treatment effect (CATE) estimation from observational or RCT data. Estimates τ(x) = E[Y(1) − Y(0) | X = x] by fitting separate response surfaces on treated and control arms, then combining with propensity-weighted imputation.",
      "On T1D data the natural target is C-peptide preservation at 12 months conditional on baseline covariates: age at diagnosis, autoantibody profile (IAA, GAD, IA-2, ZnT8), HLA haplotype, BMI, residual β-cell mass proxy. The output tells you which patient profile benefits most from teplizumab vs. placebo vs. verapamil vs. ATG.",
      "Python reference at research/estimators/hte_meta.py uses scikit-learn's GradientBoostingRegressor as the base learner. Not yet TS-ported — gradient boosting without a linalg dependency is impractical at this scale.",
    ],
    formula: "τ̂(x) = ê(x) · τ̂₀(x) + (1 − ê(x)) · τ̂₁(x)",
    placeholderAssessment:
      "PENDING TS PORT — X-learner requires gradient boosting, deferred until a linalg dep is added. Python reference is canonical. Awaiting RCT/registry covariate + outcome data (TrialNet TN-10, PROTECT, DEFEND-1) before TS porting is worthwhile.",
    defaultAvailability: "pending-port",
    pythonReference: "research/estimators/hte_meta.py",
  },
  "cox-ph": {
    id: "cox-ph",
    abbrev: "COX-PH",
    fullName: "COX PROPORTIONAL HAZARDS",
    shortDesc:
      "Time-to-event hazard modelling — predicts DKA, hypoglycemia, and complication onset",
    color: "#ff5252",
    methodology: [
      "Cox (1972) proportional hazards regression: h(t | x) = h₀(t) · exp(βᵀx). Partial-likelihood estimation of β gives event-time hazard ratios conditional on covariates, without assuming a parametric baseline hazard h₀.",
      "On T1D the targets are time-to-DKA, time-to-severe-hypoglycemia, time-to-first-microvascular-complication, and time-to-insulin-independence (honeymoon duration). Covariates span HbA1c trajectory, TIR, autoantibody titers, socioeconomic access, pump/CGM adoption.",
      "Python reference uses lifelines.CoxPHFitter. Not yet TS-ported — partial-likelihood Newton-Raphson with ties handling is ~500 LoC and benefits from numpy broadcasting.",
    ],
    formula: "h(t | x) = h₀(t) · exp(β₁x₁ + β₂x₂ + … + β_k x_k)",
    placeholderAssessment:
      "PENDING TS PORT — Python reference is canonical. Awaiting longitudinal registry data (e.g. T1D Exchange, SEARCH) with event times and covariates before TS porting moves up the queue.",
    defaultAvailability: "pending-port",
    pythonReference: "research/estimators/cox_ph.py",
  },
  nlme: {
    id: "nlme",
    abbrev: "NLME",
    fullName: "NONLINEAR MIXED-EFFECTS — C-PEPTIDE DECAY",
    shortDesc:
      "Exponential C-peptide decay with patient-specific random effects — decomposes trial response",
    color: "#00e676",
    methodology: [
      "C-peptide AUC(t) = θ₀ · exp(−θ₁ · t) + ε, with (θ₀, θ₁) drawn from a patient-level random-effects distribution. Estimates population-average decay rate and between-patient heterogeneity jointly.",
      "Wherry/Greenbaum-style model used across TrialNet trials. Random effects on both the intercept (residual C-peptide at enrollment) and the decay rate allow separation of pre-trial β-cell reserve from the intervention's effect on the decay constant.",
      "Python reference uses statsmodels.mixedlm with nonlinear link. Not yet TS-ported — nonlinear MLE with random effects requires Laplace approximation or MCMC, both impractical without numpy/scipy.",
    ],
    formula: "C(t)_ij = (θ₀ + b₀ᵢ) · exp(−(θ₁ + b₁ᵢ) · t) + ε_ij",
    placeholderAssessment:
      "PENDING TS PORT — Python reference is canonical. Awaiting TrialNet-shaped longitudinal C-peptide data (MMTT-stimulated AUC across visits) before porting is justified.",
    defaultAvailability: "pending-port",
    pythonReference: "research/estimators/nlme_cpeptide.py",
  },
  "gp-regression": {
    id: "gp-regression",
    abbrev: "GP",
    fullName: "GAUSSIAN PROCESS REGRESSION",
    shortDesc:
      "Nonparametric time-series smoothing with calibrated uncertainty — CGM trajectory + predictive band",
    color: "#90caf9",
    methodology: [
      "Rasmussen & Williams GP regression with a Matern 5/2 kernel — delivers a nonparametric fit with calibrated 95% predictive intervals. Hyperparameters (length-scale, signal variance, noise variance) fit by Type-II MLE on the marginal likelihood.",
      "On CGM data this gives a smooth trajectory + uncertainty band without assuming any parametric dynamics — the kernel adapts to circadian structure, meal excursions, and basal drift. Natural input to downstream BOCPD / TE pipelines.",
      "Python reference uses scikit-learn's GaussianProcessRegressor. Not yet TS-ported — requires Cholesky factorisation of the N×N gram matrix, which scales as O(N³) and benefits strongly from a tuned linalg backend.",
    ],
    formula: "f(t) ~ GP(0, k(t, t')), k(t, t') = σ²_f · Matern_{5/2}(|t − t'| / ℓ)",
    placeholderAssessment:
      "PENDING TS PORT — Python reference is canonical. Would be TS-ported once a linalg dep is introduced; on that path GP-smoothed CGM becomes the default input for BOCPD and Takens cards.",
    defaultAvailability: "pending-port",
    pythonReference: "research/estimators/gp_cgm.py",
  },
  "hlm-cross-species": {
    id: "hlm-cross-species",
    abbrev: "HLM",
    fullName: "HIERARCHICAL LINEAR MODEL — CROSS-SPECIES",
    shortDesc:
      "Pools mouse, rat, NHP, and human β-cell regeneration priors with species-level random effects",
    color: "#ce93d8",
    methodology: [
      "Two-level hierarchical model: observation y_ij = β_species[i] + ε_ij, with species-level effects β_species ~ N(μ, τ²). Partial pooling shrinks each species estimate toward the cross-species mean in proportion to within-species noise, giving more stable priors for human extrapolation.",
      "Applied to β-cell proliferation rates, insulitis kinetics, and regeneration latency across mouse (NOD, ob/ob), rat (BB-DP), non-human primate, and human data. The shrunk human estimate is more defensible than a single-study human prior when N_human is small.",
      "Python reference uses statsmodels.MixedLM. Not yet TS-ported — see NLME note, same linalg story.",
    ],
    formula: "y_ij = β_species[i] + ε_ij,  β_s ~ N(μ, τ²)",
    placeholderAssessment:
      "PENDING TS PORT — Python reference is canonical. Species priors are curated manually in research/ until the HLM port lands.",
    defaultAvailability: "pending-port",
    pythonReference: "research/estimators/hlm_cross_species.py",
  },
};

export function getEstimatorMeta(id: EstimatorId): EstimatorMeta {
  return REGISTRY[id];
}

export function getAllEstimatorMeta(): EstimatorMeta[] {
  return Object.values(REGISTRY);
}
