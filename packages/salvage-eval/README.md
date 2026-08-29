# salvage-eval

**Not built yet. This is a Phase 5 deliverable.**

The evaluation harness. This is the component that turns the project from a
demo into engineering, and it is the phase most likely to be rushed.

## What it will contain

- Three baselines: never retry, blind retry up to three times, fixed-schedule
  retry.
- Off-policy evaluation: IPS, self-normalised IPS, the direct method, and
  doubly robust estimation — **all four reported**, so their disagreement is
  visible rather than hidden behind whichever one looks best.
- Bootstrap confidence intervals on every estimate. A point estimate without an
  interval is not a result.
- Diagnostics: effective sample size, propensity overlap, and a loud warning
  when the logging policy gives insufficient support for the evaluated policy.
- Ablation runner: rules vs. bandit vs. constrained bandit, identical held-out
  data, identical seeds.
- Regret accounting: achieved vs. hindsight-optimal value, with the gap
  decomposed into model error, bounds-gate refusal, budget exhaustion, and
  deliberate exploration.
- A frozen, versioned benchmark task a third party could run and compare
  against.

## The two things that must be true before any number here means anything

These are Phase 4 design commitments, not Phase 5 discoveries.

1. **The logging policy must be stochastic with logged propensities.** IPS,
   SNIPS, and DR are undefined for a deterministic logger: every propensity is
   0 or 1 and any target policy that deviates is unidentifiable. Deterministic
   strata are reported separately and labelled *not identifiable — direct
   method only*.
2. **`NO_ACTION` must be disambiguated.** A no-action the policy chose and a
   no-action the bounds gate forced are different events. Logged identically,
   they bias every estimate, because the evaluator treats a constrained
   observation as a free choice. Every decision records its feasible action
   set.

## The primary claim

Not "we recovered ₹X." On synthetic data that measures the simulator.

The primary claim is **estimator validation against known ground truth**: the
off-policy estimators recover the true policy value to within a reported margin
on held-out simulated data where truth is known. The recovery number is
reported second, framed explicitly as conditional on simulator fidelity.

See [EVALUATION.md](../../EVALUATION.md) for the report's required structure.
