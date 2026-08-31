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
.PHONY: help preflight up down clean ps logs \
        test test-java test-python test-python-unit test-sim-slow \
        test-mcp test-console build-console \
        lint lint-java lint-python lint-node contracts-check \
        format eval demo razorpay-e2e gemini-e2e

COMPOSE   := docker compose
CORE_DIR  := services/salvage-core
BRAIN_DIR := services/salvage-brain
SIM_DIR   := packages/salvage-sim
EVAL_DIR  := packages/salvage-eval

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

MCP_DIR     := services/salvage-mcp
CONSOLE_DIR := apps/salvage-console

# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------
#
# Every `uv run` below passes --frozen. It fails the build when uv.lock is
# stale rather than silently resolving something other than what was tested.
# The flag was dropped from every invocation somewhere after Phase 0; a lock
# file that nothing enforces is decoration.

test: test-java test-python test-mcp test-console ## Run every test

test-java: ## salvage-core tests (starts its own containers via Testcontainers)
	cd $(CORE_DIR) && $(GRADLE) test

test-python: ## salvage-brain, salvage-sim and salvage-eval
	cd $(BRAIN_DIR) && uv run --frozen pytest tests -q
	cd $(SIM_DIR) && uv run --frozen pytest tests -q
	cd $(EVAL_DIR) && uv run --frozen pytest tests -q

test-python-unit: ## The Python tests that do not need Docker
	cd $(BRAIN_DIR) && uv run --frozen pytest tests -q -m 'not integration'
	cd $(SIM_DIR) && uv run --frozen pytest tests -q -m 'not slow'
	cd $(EVAL_DIR) && uv run --frozen pytest tests -q

test-sim-slow: ## The salvage-sim performance acceptance check (100k events)
	cd $(SIM_DIR) && uv run --frozen pytest tests -q -m slow -s

test-mcp: ## salvage-mcp tests (Vitest)
	cd $(MCP_DIR) && npm test

test-console: ## salvage-console tests (Vitest)
	cd $(CONSOLE_DIR) && npm test

build-console: ## salvage-console production build (also type-checks every route)
	cd $(CONSOLE_DIR) && npm run build

# ---------------------------------------------------------------------------
# Lint
# ---------------------------------------------------------------------------

lint: lint-java lint-python lint-node contracts-check ## Run every linter

lint-java: ## Spotless + compile warnings
	cd $(CORE_DIR) && $(GRADLE) spotlessCheck

lint-python: ## ruff + mypy (strict)
	cd $(BRAIN_DIR) && uv run --frozen ruff check src tests
	cd $(BRAIN_DIR) && uv run --frozen mypy src
	cd $(SIM_DIR) && uv run --frozen ruff check src tests
	cd $(SIM_DIR) && uv run --frozen mypy src
	cd $(EVAL_DIR) && uv run --frozen ruff check src tests
	cd $(EVAL_DIR) && uv run --frozen mypy src

lint-node: ## TypeScript, strict, for the MCP server and the console
	cd $(MCP_DIR) && npm run typecheck
	cd $(CONSOLE_DIR) && npx --no-install tsc --noEmit

format: ## Apply formatting fixes
	cd $(CORE_DIR) && $(GRADLE) spotlessApply
	cd $(BRAIN_DIR) && uv run --frozen ruff check --fix src tests
	cd $(SIM_DIR) && uv run --frozen ruff check --fix src tests
	cd $(EVAL_DIR) && uv run --frozen ruff check --fix src tests

contracts-check: ## Validate the contracts and prove nothing has drifted from them
# Through the wrapper, which is also what CI runs. The Makefile previously
# called `python scripts/check_contracts.py` directly: a second entry point
# that can diverge from CI, invoking a bare `python` that on most systems is
# either absent or Python 2.
	bash scripts/check-contracts.sh

# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

eval: ## Run the off-policy evaluation harness; writes EVALUATION.md and JSON
# The JSON is what the console's sandbox page reads, so that it displays
# measured results rather than a transcription of them.
	cd $(EVAL_DIR) && uv run --frozen salvage-eval report 	  --output ../../EVALUATION.md --json ../../docs/evaluation-results.json

# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

demo: ## End-to-end round trip: Kafka -> core -> PostgreSQL -> brain -> HTTP
	bash scripts/demo.sh

gemini-e2e: ## Exercise the language layer against the real Gemini API (needs GEMINI_API_KEY)
# The only target in this repository that makes a billable outbound call. The
# language layer is off by default and nothing in the money path reads it; this
# verifies the wire format the adapter was written against, which no test can.
	@bash scripts/gemini_e2e.sh

razorpay-e2e: ## Exercise the Razorpay test-mode adapter (needs rzp_test_ credentials)
# Reads .env rather than taking credentials on the command line, so they do
# not land in shell history. The process refuses to start on an rzp_live_ key
# whatever this target does; see ProviderCredentialsGuard.
	@bash scripts/razorpay_e2e.sh
