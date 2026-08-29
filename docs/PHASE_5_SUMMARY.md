# Phase 5 Summary: Off-Policy Evaluation Harness (`salvage-eval`)

## 1. Overview
Phase 5 implements the statistical off-policy evaluation harness (`packages/salvage-eval`). It allows counterfactual evaluation of candidate payment recovery policies against simulated ground-truth failure streams without risking real funds.

The harness implements four classical off-policy estimators (**Inverse Propensity Scoring**, **Self-Normalized IPS**, **Direct Method**, and **Doubly Robust**), calculates non-parametric bootstrap confidence intervals, enforces diagnostic guardrails (Kish Effective Sample Size, common support overlap), models probabilistic calibration, and decomposes hindsight policy regret.

---

## 2. Key Components Built

### 1. Classical Statistical Off-Policy Estimators (`salvage_eval.estimators`)
- **Direct Method (`direct_method.py`)**: Fits stratified conditional mean reward regression models $\hat{\mu}(X, A)$ across taxonomy strata and candidate actions.
- **Inverse Propensity Scoring (`ips.py`)**: Horvitz-Thompson importance-weighted estimator with configurable weight clipping ($w_{\max} = 50.0$) and Kish's Effective Sample Size computation $\text{ESS} = (\sum w_i)^2 / \sum w_i^2$.
- **Self-Normalized IPS (`snips.py`)**: Hajek self-normalized estimator providing variance reduction while retaining asymptotic consistency.
- **Doubly Robust (`doubly_robust.py`)**: Blends Direct Method regression with importance-weighted residual correction. Unbiased if either the reward model OR the propensity model is correctly specified.

### 2. Diagnostic Monitors & Guardrails (`salvage_eval.diagnostics`)
- **Effective Sample Size (`effective_sample_size.py`)**: Monitors $\text{ESS} / N$ and fires warnings when support variance threatens estimator reliability.
- **Propensity Overlap (`propensity_overlap.py`)**: Inspects support bounds and flags deterministic strata as *"not identifiable — direct method only"*.
- **Probabilistic Calibration (`calibration.py`)**: Generates reliability diagrams, Expected Calibration Error (ECE), and Brier score metrics across deciles.
- **Regret Accounting (`regret.py`)**: Decomposes total regret gap ($V^* - V^\pi$) into:
  - **Model Prediction Error**: Regret from suboptimal probability ranking within the feasible action set.
  - **Safety Bounds Refusal**: Value willingly sacrificed to enforce Quiet Hours (22:00–08:00 IST), Attempt Caps $\le 3$, and Customer Opt-Outs.
  - **Budget Exhaustion** and **Exploration Cost**.

### 3. Policy Baselines & Benchmarks (`salvage_eval.baselines`)
- `NeverRetryPolicy`: Zero-action lower bound ($V = 0$).
- `BlindRetryPolicy`: Uninformed immediate retry up to 3 attempts.
- `FixedSchedulePolicy`: Static delay schedule (+15m, +1h, +24h).
- `RulesBaselinePolicy`: Heuristic taxonomy-based mapping.
- `ContextualBanditPolicy`: Unconstrained and safety-constrained (Salvage Production Policy) softmax contextual bandits.

### 4. Non-Parametric Bootstrap & Markdown Reporter (`salvage_eval.benchmark`)
- **Bootstrap Engine (`bootstrap.py`)**: 200–1000 resamples computing empirical standard errors and 95% confidence intervals `[ci_lower, ci_upper]`.
- **Automated Reporter (`reporter.py`)**: Generates the complete, standardized `EVALUATION.md` containing all 7 required sections with real, measured numbers.
- **CLI (`cli.py`)**: `salvage-eval report --output EVALUATION.md --episodes 5000 --seed 42`.
- **Makefile**: Integrated via `make eval`.

---

## 3. Measured Benchmark Results (`EVALUATION.md`)

*Evaluated on 5,000 held-out synthetic episodes (seed 42):*

| Policy Candidate | True Recovery Rate | Ground Truth Mean Payoff | Doubly Robust Estimate (Paise) [95% CI] |
|---|---|---|---|
| **Never Retry** | 0.0% | 0.0 paise | 0.0 [0.0, 0.0] |
| **Blind Immediate Retry (<=3x)** | 9.2% | 35,046.6 paise | 32,887.3 [25,899.5, 40,426.0] |
| **Fixed Schedule Retry** | 35.6% | 136,733.3 paise | 140,823.9 [124,785.8, 156,888.2] |
| **Rules Baseline** | 42.0% | 161,975.3 paise | 168,770.0 [154,783.1, 183,732.2] |
| **Contextual Bandit (Unconstrained)** | 66.7% | 255,018.6 paise | 249,808.8 [234,227.7, 266,092.8] |
| **Constrained Bandit (Salvage Policy)** | **53.0%** | **203,051.8 paise** | **197,972.1 [184,835.0, 211,290.0]** |

### Estimator Agreement on Salvage Production Policy:
- **Ground Truth Target**: `203,051.8` paise
- **Direct Method (DM)**: `193,562.4` paise (error: -4.7%)
- **Inverse Propensity (IPS)**: `198,907.3` paise (error: -2.0%)
- **Self-Normalized IPS (SNIPS)**: `200,306.6` paise (error: -1.3%)
- **Doubly Robust (DR)**: `197,972.1` paise (error: -2.5%)

### Regret Decomposition:
- **Hindsight Optimal Value**: `₹16,234,064.95`
- **Achieved Salvage Policy Value**: `₹10,152,589.60`
- **Model Error**: `₹1,777,270.40`
- **Safety Bounds Refusal**: `₹4,304,204.95` (Quiet Hours, Attempt Caps, Opt-Outs)

---

## 4. Test & Verification Summary

| Suite | Component | Tests Passed | Status |
|---|---|---|---|
| Off-Policy Evaluation | `salvage-eval` (pytest) | 8/8 Tests | **PASS** |
| Simulator & Counterfactuals | `salvage-sim` (pytest) | 87/87 Tests | **PASS** |
| Sense, Diagnose & Decide | `salvage-brain` (pytest) | 61/61 Tests | **PASS** |
| Financial Core & Bounds | `salvage-core` (Gradle) | 46/46 Tests | **PASS** |
| Contract Conformance | `scripts/check_contracts.py` | 6/6 Paths | **PASS** |
| Static Typing | Python (`mypy --strict`) | 30/30 Source Files | **CLEAN** |
| Code Formatting | Python & Java (`ruff`, `spotless`) | All Files | **CLEAN** |
