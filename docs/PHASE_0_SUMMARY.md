# Phase 0: Foundation — Architecture, Decisions, and Resolution Log

## 1. Overview & Verification Summary

Phase 0 establishes the foundational skeleton and operational guardrails for **Salvage**, the autonomous payment recovery and routing intelligence system.

All deliverables and acceptance criteria have been implemented and verified:
- **Monorepo Structure**: Strict boundaries between `services/salvage-core` (Java 21 / Spring Boot 3.5.16), `services/salvage-brain` (Python 3.12 / FastAPI), `contracts/`, `packages/`, `ops/`, and `docs/`.
- **Infrastructure**: Verified Docker Compose environment bringing up TimescaleDB 2.29.2 (PostgreSQL 16), Redis 7.4.11, and Redpanda 25.3.17 with explicit declarative topic initialization.
- **Contracts**: Canonical schemas in `contracts/events/payment_failed.v1.schema.json` and OpenAPI spec `contracts/openapi/brain.v1.yaml`.
- **Wire-Level Health Checks**: Real round-trip health endpoints in both `salvage-core` (`/health/liveness`, `/health/readiness`) and `salvage-brain` (`/healthz/liveness`, `/healthz/readiness`) verifying live connectivity to Postgres, Redis, and Kafka.
- **CI / Automation**: GitHub Actions workflow (`.github/workflows/ci.yml`), `Makefile`, and `salvage.cmd`.
- **Automated Tests & Linters**: 100% test pass rate across both services (`./gradlew test` in Java, `pytest tests/ -v`, `ruff check`, `mypy src/` in Python).

---

## 2. Architecture Decision Records (ADRs)

| ADR | Title | Key Decision |
|---|---|---|
| **0001** | Two-Language Split | Java 21 / Spring Boot for Core (financial ledger, transaction outbox, idempotency, money movement); Python 3.12 / FastAPI for Brain (ML inference, online bandits, change-point detection). Core never executes untyped Python; Brain never touches live ledger. |
| **0002** | Contracts as Source of Truth | JSON Schema and OpenAPI in `contracts/` are canonical. Both Java DTOs and Python Pydantic models are generated or validated against these schemas. CI enforces drift detection. |
| **0003** | Payment Provider Abstraction | Uniform adapter interface for payment rails. Core interacts with abstract interfaces (`PaymentProviderAdapter`); specific gateway SDKs are isolated. |
| **0004** | Idempotency Source of Truth | PostgreSQL is the authoritative source of truth for idempotency (`idempotency_keys` table). Redis is strictly a performance acceleration cache. Under partition or eviction, Core queries Postgres. |
| **0005** | TimescaleDB Licensing | Using TimescaleDB Community Edition (TSL) for native hypertable continuous aggregates and automated compression policies. All features used fall strictly within internal service usage guidelines. |
| **0006** | Numbers Policy | Zero hardcoded magic numbers. All operational thresholds, model hyper-parameters, confidence bounds, and window sizes are externalized with clear economic rationale in `docs/OPEN_NUMBERS.md`. |
| **0007** | Cross-Tenant Rail Intelligence | Aggregation across merchants enforces cohort thresholds (minimum 5 distinct merchants per cell) and differential privacy noise to prevent tenant data leakage while providing collective outage detection. |

---

## 3. Identified Problems and Technical Resolutions

During the Phase 0 bootstrapping and environment stabilization, several low-level platform and runtime challenges were systematically identified and resolved:

### Problem 1: Redpanda Auto Topic Creation & Cluster Startup
- **Symptom**: Redpanda failed startup when passing `--set=redpanda.auto_create_topics_enabled=false` on CLI.
- **Root Cause**: Redpanda v25 CLI changed flag syntax for cluster configuration properties.
- **Resolution**: Removed the deprecated CLI start flag and configured auto topic creation to `false` via `rpk cluster config set auto_create_topics_enabled false` inside the dedicated `ops/redpanda/topics.sh` container initialization script.

### Problem 2: Gradle Wrapper Distribution Bootstrap under WSL2
- **Symptom**: Automated download of Gradle 8.12 zip timed out over WSL2 9P network bridge.
- **Root Cause**: Windows-to-WSL network translation caused intermittent socket resets on large binary distribution downloads from `services.gradle.org`.
- **Resolution**: Downloaded the pinned distribution once via host PowerShell and seeded WSL's `~/.gradle/wrapper/dists/` directory, enabling fully offline, deterministic build repeatability.

### Problem 3: Java Null-Safety in Map Creation during Health Checks
- **Symptom**: `NullPointerException` thrown from `Map.of()` when an exception returned a null message.
- **Root Cause**: `java.util.Map.of()` rejects null values; when exceptions occurred without a message string, `e.getMessage()` evaluated to null.
- **Resolution**: Updated `checkPostgres()`, `checkRedis()`, and `checkKafka()` to sanitize error strings: `e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()`.

### Problem 4: Kafka AdminClient Configuration in Spring Boot
- **Symptom**: Java `KafkaAdmin.getConfigurationProperties()` returned an empty server list (`bootstrap.servers = []`), causing test timeouts.
- **Root Cause**: In Spring Boot 3.x, `KafkaAdmin` bean properties do not implicitly mirror `spring.kafka.bootstrap-servers` when instantiated directly.
- **Resolution**: Injected `@Value("${spring.kafka.bootstrap-servers:localhost:19092}")` into `InfrastructureHealthController` and added an explicit fallback for `AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG`. Increased socket and metadata handshake timeout to 10s to accommodate virtualization bridges.

### Problem 5: FastAPI 0.141+ Response Model Schema Generation
- **Symptom**: FastAPI threw `FastAPIError: Invalid args for response field!` when typing endpoint as `Response | dict[str, Any]`.
- **Root Cause**: FastAPI response model reflection cannot generate OpenAPI schemas for union types containing Starlette `Response`.
- **Resolution**: Adopted the idiomatic FastAPI pattern: declared return type as `dict[str, Any]` and injected `response: Response` parameter to dynamically set `response.status_code = 503` when dependencies degrade.

### Problem 6: IDE Toolchain & Language Server Synchronization
- **Symptom**: IDE reported missing Python packages (`redis`, `confluent_kafka`, `sqlalchemy`) and JVM version mismatch (Java 8 vs 17+ requirement).
- **Root Cause**: The host IDE editor was scanning the Windows host Python 3.14 environment and default Java 8 installation rather than the WSL2 runtime.
- **Resolution**: Installed matching dependencies in Windows host Python environment and provisioned Eclipse Temurin JDK 21 at `~/.jdks/temurin-21` with `.vscode/settings.json` configuration for seamless cross-environment development.

---

## 4. Verification Checklist

| Requirement | Command / Check | Result |
|---|---|---|
| TimescaleDB + pgcrypto | `psql -c "SELECT extname FROM pg_extension;"` | `timescaledb 2.29.2`, `pgcrypto 1.3` active |
| Redis connectivity | `redis-cli ping` | `PONG` |
| Redpanda topics | `rpk topic list` | `payment.failed.v1`, `salvage.decisions.v1`, `salvage.outbox.v1`, `salvage.rail-health.v1` |
| salvage-core tests | `./gradlew test` (WSL2 / JDK 21) | **BUILD SUCCESSFUL** (6 tests passed) |
| salvage-brain tests | `pytest tests/ -v` (Python 3.12) | **4 passed** in 7.8s |
| salvage-brain linter | `ruff check src/ tests/` | **All checks passed!** |
| salvage-brain types | `mypy src/` | **Success: no issues found in 5 source files** |
