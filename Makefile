# Salvage
#
# Primary targets: up, down, test, lint, demo
#
# Prerequisites
#   make up / make demo   Docker and Docker Compose. Nothing else.
#   make test / lint      additionally a JDK 21 and uv (which fetches its own
#                         Python 3.12). Run `make preflight` to check.
#
# Environment: developed and verified on WSL2 / Linux. `make` is not present
# on Windows by default; run these from a WSL2 shell. See README.md.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

.DEFAULT_GOAL := help
.PHONY: help preflight up down clean ps logs wait \
        test test-java test-python lint lint-java lint-python \
        format demo razorpay-e2e contracts-check

COMPOSE   := docker compose
CORE_DIR  := services/salvage-core
BRAIN_DIR := services/salvage-brain

# Gradle's file hasher uses IO that the WSL2 9p driver serving /mnt/c does not
# support; a build from a Windows-hosted path fails with
# "java.io.IOException: Input/output error". Moving only the project cache onto
# a Linux-native path fixes it and costs nothing elsewhere.
#
# Written with Make's own conditionals rather than $(shell case ... esac): Make
# counts parentheses inside $(...), so the `)` closing a shell case pattern
# terminates the function early and the rest of the line leaks into the command.
ifneq (,$(findstring /mnt/,$(CURDIR)))
GRADLE_CACHE := --project-cache-dir=/tmp/salvage-gradle-cache
else
GRADLE_CACHE :=
endif

GRADLE := ./gradlew --no-daemon --console=plain $(GRADLE_CACHE)

help: ## Show available targets
	@grep -hE '^[a-z][a-zA-Z0-9_-]*:.*?## ' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

preflight: ## Check that the toolchain this repo needs is present
	@missing=0; \
	check() { \
	  if command -v "$$1" >/dev/null 2>&1; then printf '  \033[32mok\033[0m   %-8s %s\n' "$$1" "$$($$2 2>&1 | head -1)"; \
	  else printf '  \033[31mMISS\033[0m %-8s %s\n' "$$1" "$$3"; missing=1; fi; }; \
	check docker  'docker --version'  'https://docs.docker.com/get-docker/'; \
	check java    'java -version'     'JDK 21 - https://adoptium.net (or let Gradle provision it)'; \
	check uv      'uv --version'      'curl -LsSf https://astral.sh/uv/install.sh | sh'; \
	if ! docker info >/dev/null 2>&1; then \
	  printf '  \033[31mMISS\033[0m %-8s %s\n' 'daemon' 'Docker is installed but not reachable (start Docker Desktop; enable WSL integration)'; missing=1; \
	fi; \
	exit $$missing

# ---------------------------------------------------------------------------
# Infrastructure
# ---------------------------------------------------------------------------

up: ## Start infrastructure (PostgreSQL, Redis, Redpanda) and create topics
	$(COMPOSE) up -d --wait postgres redis redpanda
	$(COMPOSE) up --exit-code-from redpanda-init redpanda-init
	@echo ""
	@echo "Infrastructure ready."
	@echo "  PostgreSQL  localhost:$${POSTGRES_PORT:-5433}"
	@echo "  Redis       localhost:$${REDIS_PORT:-6379}"
	@echo "  Redpanda    localhost:$${KAFKA_EXTERNAL_PORT:-19092}"

down: ## Stop containers, keep data
	$(COMPOSE) --profile apps down

clean: ## Stop containers and delete all data
	$(COMPOSE) --profile apps down -v --remove-orphans
	cd $(CORE_DIR) && $(GRADLE) clean
	rm -rf $(BRAIN_DIR)/.venv
	@echo "Cleaned."

ps: ## Show container status
	$(COMPOSE) --profile apps ps

logs: ## Tail container logs
	$(COMPOSE) --profile apps logs -f

# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

test: test-java test-python ## Run every test

test-java: ## salvage-core tests (starts its own containers via Testcontainers)
	cd $(CORE_DIR) && $(GRADLE) test

test-python: ## Run all Python test suites (salvage-brain, salvage-sim, salvage-eval)
	cd $(BRAIN_DIR) && uv run pytest tests -q
	uv run --project packages/salvage-sim pytest packages/salvage-sim/tests -q
	uv run --project packages/salvage-eval pytest packages/salvage-eval/tests -q

test-python-unit: ## salvage-brain tests that do not need Docker
	cd $(BRAIN_DIR) && uv run pytest tests -q -m 'not integration'

# ---------------------------------------------------------------------------
# Lint
# ---------------------------------------------------------------------------

lint: lint-java lint-python contracts-check ## Run every linter

lint-java: ## Spotless + compile warnings
	cd $(CORE_DIR) && $(GRADLE) spotlessCheck

lint-python: ## ruff + mypy (strict)
	cd $(BRAIN_DIR) && uv run ruff check src tests
	cd $(BRAIN_DIR) && uv run mypy src
	uv run --project packages/salvage-sim ruff check packages/salvage-sim/src packages/salvage-sim/tests
	uv run --project packages/salvage-sim mypy packages/salvage-sim/src
	uv run --project packages/salvage-eval ruff check packages/salvage-eval/src packages/salvage-eval/tests
	uv run --project packages/salvage-eval mypy packages/salvage-eval/src

format: ## Apply formatting fixes
	cd $(CORE_DIR) && $(GRADLE) spotlessApply
	cd $(BRAIN_DIR) && uv run ruff check --fix src tests
	uv run --project packages/salvage-sim ruff check --fix packages/salvage-sim/src packages/salvage-sim/tests
	uv run --project packages/salvage-eval ruff check --fix packages/salvage-eval/src packages/salvage-eval/tests

contracts-check: ## Validate the contracts and prove nothing has drifted from them
	python scripts/check_contracts.py

# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

eval: ## Run Phase 5 Off-Policy Evaluation harness and generate EVALUATION.md
	uv run --project packages/salvage-eval salvage-eval report --output EVALUATION.md

# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

demo: ## End-to-end round trip: Kafka -> core -> PostgreSQL -> brain -> HTTP
	bash scripts/demo.sh

razorpay-e2e: ## Not built yet - the Razorpay adapter lands in Phase 4
	@echo "Not built yet. The PaymentProvider port and the Razorpay test-mode"
	@echo "adapter are Phase 4 deliverables (docs/adr/0003)."
	@exit 1
