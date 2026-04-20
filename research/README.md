# Manifold — T1D Estimator Research

Python research code backing the estimators promised in the M-T1D-02 briefs
(Joslin, Mt Sinai Stewart, VX-880, HIRN, DRI Miami, UBC, nPOD).

**Workflow**: implement and validate each estimator here in Python against
public data, then port to TypeScript under `src/lib/engines/` once validated.

## Layout

- `estimators/` — reference implementations (BOCPD, HTE, PH, GP, TE, survival, NLME, …).
- `datasets/` — loaders for public data sources (HPAP, OpenAPS, D1NAMO, TrialNet public tables, TEDDY open tier).
- `validation/` — validation scripts producing plots + pass/fail metrics per estimator.
- `scripts/` — ad-hoc data-pull and exploration scripts.
- `output/` — generated artifacts (gitignored; plots, cached datasets).

## Setup

```bash
python3 -m venv research/.venv
source research/.venv/bin/activate
pip install -r research/requirements.txt
```

## Estimator status

| Estimator | Briefs citing | Validation | Status |
|-----------|---------------|------------|--------|
| BOCPD (Adams & MacKay 2007) | Joslin, MtSinai, UBC, HIRN, nPOD, VX-880 | synthetic 3/3 + 2/2 CPs, Hall 2018 CGM 11–22 CPs/subject | done |
| HTE meta-learners (S / T / X, Künzel 2019) | MtSinai, UBC, DRIMiami, HIRN, nPOD | IHDP median test PEHE 0.81 / 0.81 / 0.94 (Künzel range 0.8–1.0) | done |
| Persistent homology (β₁ per-tick) | HIRN, nPOD | periodic β₁≈1.0, noise 0.23, AM outer 0.72 / middle 0.00; Hall CGM β₁ ∈ [0.03, 0.73] | done |
| GP regression (dose/protocol surfaces) | MtSinai, UBC, VX-880 | Friedman #1 test RMSE 1.12 vs Ridge 2.59; 95% band coverage 0.95 | done |
| Transfer entropy (Schreiber 2000, binning) | HIRN, nPOD | coupled-AR asymmetry 150×; bidirectional strong > weak direction | done |
| Cox PH (Breslow ties, from scratch) | DRIMiami | Rossi: coefs match lifelines-Efron to <0.009; c-index to <0.004 | done |
| NLME C-peptide decay (Laplace) | Joslin, DRIMiami | synthetic recovery at n=40×7: μ within 0.03, τ within 7%, σ within 3% | done |
| Spatial coupling (Moran's I, bivariate) | nPOD | univariate noise ≈ 0, bump 0.96, checker −0.90; bivariate coupled 0.88, anti −0.87 | done |
| Cross-species HLM (random slopes) | UBC | 20-seed MSE on n=5 human species: HLM 0.40 vs no-pooling 0.77 (−48%) | done |

## Public data sources

- **HPAP** (HIRN) — scRNA-seq, spatial transcriptomics, flow, ephys: https://hpap.pmacs.upenn.edu/
- **OpenAPS Data Commons** — community CGM + insulin + carbs (Zenodo releases).
- **D1NAMO** (Dubosson 2018, Zenodo) — CGM + insulin + HR + meals for 9 T1D patients.
- **JAEB / T1D Exchange** — Replace-BG, DIAMOND, CITY (public tier).
- **TrialNet** — autoantibody + HLA + progression summary cohorts + teplizumab patient-level data in NEJM supplements.
- **TEDDY** — open tier via dbGaP.
