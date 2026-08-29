# salvage-brain

The decision service for Salvage. Python 3.12, FastAPI, Pydantic v2.

**This service never moves money.** It returns a recommended action and its
reasoning; `salvage-core` decides whether to execute it. That boundary is what
makes the "no LLM in the money path" claim checkable rather than aspirational.

## What exists today (Phase 0)

- `GET /healthz/liveness` — process is alive, touches nothing downstream.
- `GET /healthz/readiness` — round-trips PostgreSQL, Redis, and Kafka; returns
  `503` if any is unreachable. Reports exception *types*, never messages: the
  endpoint is unauthenticated and driver errors embed connection URLs, which
  embed credentials.
- `GET /v1/attempts/{merchant_id}/{payment_attempt_id}` — the read path over
  attempts and failures that `salvage-core` has ingested. Scoped by merchant;
  an attempt is not reachable through another merchant's id.

All three are declared in
[`contracts/openapi/brain.v1.yaml`](../../contracts/openapi/brain.v1.yaml),
and `scripts/check_contracts.py` fails CI if what the service serves diverges
from what the contract promises.

## What is coming

| Capability | Phase |
|---|---|
| Rail health monitoring, change-point detection (CUSUM / BOCPD) | 3 |
| Cross-tenant rail intelligence with cohort thresholds ([ADR-0007](../../docs/adr/0007-cross-tenant-rail-intelligence.md)) | 3 |
| Failure taxonomy and root-cause attribution | 3 |
| Point-in-time correct feature store | 3 |
| Calibrated recoverability scoring (LightGBM + isotonic regression) | 4 |
| Budget-constrained contextual bandit (Thompson sampling) | 4 |
| Model and policy registry with immutable versioning | 4 |

The ML dependencies are declared as the optional `ml` extra and are not
installed by default — nothing in Phase 0 imports them.

## Development

```bash
uv sync --all-extras --group dev   # uv fetches its own Python 3.12
uv run pytest tests -q             # integration tests need Docker
uv run pytest tests -q -m 'not integration'
uv run ruff check src tests
uv run mypy src                    # strict
```

`uv.lock` is committed. Builds and CI use `--frozen` so a stale lockfile fails
loudly instead of silently resolving something other than what was tested.
