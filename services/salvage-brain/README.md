# salvage-brain

The decision service for Salvage.

## Responsibilities
- Rail health monitoring with change-point detection (CUSUM/BOCPD)
- Cross-tenant rail intelligence with cohort threshold and privacy preservation
- Failure taxonomy classification and root-cause attribution
- Calibrated recoverability scoring (LightGBM + isotonic regression)
- Budget-constrained contextual bandit policy selection (Thompson sampling)
- Point-in-time correct feature store with verified anti-leakage guarantees

This service never moves money. It returns a recommended action and its reasoning.
salvage-core decides whether to execute it.
