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

| Estimator | Briefs citing | Status |
|-----------|---------------|--------|
| BOCPD (Adams & MacKay 2007) | Joslin, MtSinai, UBC, HIRN, nPOD, VX-880 | in progress |
| HTE learners (Causal Forest, BART) | MtSinai, UBC, DRIMiami, HIRN, nPOD | pending |
| Persistent homology (β₁ per-tick) | HIRN, nPOD | pending |
| GP regression (dose/protocol surfaces) | MtSinai, UBC, VX-880 | pending |
| Transfer entropy | HIRN, nPOD | pending |
| Survival (Cox / DeepSurv) | DRIMiami | pending |
| NLME C-peptide decay | Joslin, DRIMiami | pending |
| Spatial-transcriptomic coupling | nPOD | pending |
| Cross-species hierarchical | UBC | pending |

## Public data sources

- **HPAP** (HIRN) — scRNA-seq, spatial transcriptomics, flow, ephys: https://hpap.pmacs.upenn.edu/
- **OpenAPS Data Commons** — community CGM + insulin + carbs (Zenodo releases).
- **D1NAMO** (Dubosson 2018, Zenodo) — CGM + insulin + HR + meals for 9 T1D patients.
- **JAEB / T1D Exchange** — Replace-BG, DIAMOND, CITY (public tier).
- **TrialNet** — autoantibody + HLA + progression summary cohorts + teplizumab patient-level data in NEJM supplements.
- **TEDDY** — open tier via dbGaP.
