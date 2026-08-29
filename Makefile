# Salvage Makefile
#
# Primary targets: up, down, test, lint, demo
# Auxiliary: logs, ps, clean, bootstrap
#
# Prerequisites:
#   - Docker and Docker Compose
#   - Java 21 (JDK) on PATH
#   - Python 3.12+ on PATH
#   - Node.js 20+ on PATH (Phase 7 only)
#
# On Windows, either install make (e.g. via scoop: `scoop install make`)
# or use the equivalent commands shown in each target's comment.

.PHONY: up down test lint demo logs ps clean bootstrap \
        test-java test-python lint-java lint-python \
        razorpay-e2e

COMPOSE := docker compose
CORE_DIR := services/salvage-core
BRAIN_DIR := services/salvage-brain

# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------

## Start infrastructure (PostgreSQL, Redis, Redpanda)
up:
	$(COMPOSE) up -d postgres redis redpanda redpanda-init
	@echo "Waiting for services to be healthy..."
	$(COMPOSE) run --rm redpanda-init || true
	@echo ""
	@echo "Infrastructure ready."
	@echo "  PostgreSQL: localhost:5432"
	@echo "  Redis:      localhost:6379"
	@echo "  Redpanda:   localhost:19092"

## Stop all services and remove containers
down:
	$(COMPOSE) down

## Stop and remove volumes (full reset)
clean:
	$(COMPOSE) down -v --remove-orphans
	cd $(CORE_DIR) && ./gradlew clean 2>/dev/null || true
	@echo "Cleaned."

## Show container status
ps:
	$(COMPOSE) ps

## Tail container logs
logs:
	$(COMPOSE) logs -f

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

## Install toolchain dependencies (Gradle wrapper, Python venv)
bootstrap:
	@echo "==> Bootstrapping Gradle wrapper..."
	@if [ ! -f $(CORE_DIR)/gradle/wrapper/gradle-wrapper.jar ]; then \
		bash scripts/bootstrap-gradle.sh; \
	fi
	@echo "==> Setting up Python venv for salvage-brain..."
	@cd $(BRAIN_DIR) && python3 -m venv .venv && \
		.venv/bin/pip install -q -e ".[dev]" 2>&1 | tail -3
	@echo "==> Bootstrap complete."

# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

## Run all tests
test: test-java test-python

## Run salvage-core tests (requires Docker for Testcontainers)
test-java:
	cd $(CORE_DIR) && ./gradlew test --no-daemon

## Run salvage-brain tests
test-python:
	cd $(BRAIN_DIR) && python -m pytest tests/ -v

# ---------------------------------------------------------------------------
# Lint
# ---------------------------------------------------------------------------

## Run all linters
lint: lint-java lint-python

## Lint Java (Spotless)
lint-java:
	cd $(CORE_DIR) && ./gradlew spotlessCheck --no-daemon 2>/dev/null || \
		echo "Spotless not yet configured (Phase 2)"

## Lint Python (ruff + mypy)
lint-python:
	cd $(BRAIN_DIR) && python -m ruff check src/ tests/
	cd $(BRAIN_DIR) && python -m mypy src/ --ignore-missing-imports || true

# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

## Run the end-to-end demo with simulated provider
demo:
	@echo "Demo target will be wired in Phase 4."
	@echo "For now, verify with: make up && make test"

## Run end-to-end against Razorpay test mode (requires credentials in .env)
razorpay-e2e:
	@echo "Razorpay E2E target will be wired in Phase 4."
