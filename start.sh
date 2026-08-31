#!/usr/bin/env bash
# Salvage — start everything, for development. The Unix twin of start.ps1.
#
#   ./start.sh              bring the stack up and run the console
#   ./start.sh --stop       stop the containers
#   ./start.sh --no-build   skip the image build
#   ./start.sh --backend    stack only, no console
#
# ─────────────────────────────────────────────────────────────────────────────
# THIS IS NOT A DEPLOYMENT SCRIPT, AND IT MUST NOT BECOME ONE.
#
# It runs docker-compose.yml, which sets SALVAGE_AUTH_REQUIRED=false. Every API
# endpoint on both services will answer any caller for any tenant, the database
# password is the one checked into the repository, and every port is published
# on 0.0.0.0. Correct for a laptop, catastrophic on a host anybody else reaches.
#
# Production is docker-compose.prod.yml, where no secret has a default and
# authentication cannot be switched off by accident. See docs/DEPLOYMENT.md.
# The two files are separate on purpose: one file with a "prod" flag is one
# typo away from serving a real merchant's ledger to the internet.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")"

BUILD=--build
CONSOLE=yes

for arg in "$@"; do
  case "$arg" in
    --stop)
      printf '\n\033[36m==> Stopping containers\033[0m\n'
      docker compose --profile apps down
      printf '    \033[32mok\033[0m   stopped. Data is kept.\n'
      exit 0
      ;;
    --no-build) BUILD="" ;;
    --backend)  CONSOLE=no ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32mok\033[0m   %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m    %s\n' "$1"; }

printf '\n  \033[1mSalvage — development stack\033[0m\n'
printf '  \033[33mUnauthenticated by design. Do not run this on a shared host.\033[0m\n'
printf '  \033[90mProduction: docker-compose.prod.yml, see docs/DEPLOYMENT.md\033[0m\n'

step "Checking Docker"
if ! docker info >/dev/null 2>&1; then
  printf '\n\033[31mDocker is not reachable. Start it and try again.\033[0m\n' >&2
  exit 1
fi
ok "docker is running"

step "Starting infrastructure (PostgreSQL, Redis, Redpanda)"
docker compose up -d --wait postgres redis redpanda
ok "postgres, redis, redpanda healthy"

step "Creating Kafka topics"
# ops/redpanda/topics.sh, the same script docker-compose.prod.yml runs. Topic
# names, partition counts and retention have one definition.
docker compose up --exit-code-from redpanda-init redpanda-init
ok "topics ready"

step "Starting salvage-core and salvage-brain"
printf '    \033[90mThe first build compiles the Java service and takes a few minutes.\033[0m\n'
# shellcheck disable=SC2086
docker compose --profile apps up -d $BUILD --wait salvage-core salvage-brain
ok "salvage-core and salvage-brain healthy"

step "Checking the read path"
# A healthy container means its own probe passed. This asks the two endpoints
# the console actually reads, which is the question that decides whether the
# screens have anything on them.
CORE_PORT="${CORE_HOST_PORT:-8081}"
BRAIN_PORT="${BRAIN_HOST_PORT:-8001}"

if curl -fsS "http://localhost:${CORE_PORT}/health/readiness" >/dev/null 2>&1; then
  ok "salvage-core answering on ${CORE_PORT}"
else
  warn "salvage-core is up but not answering on ${CORE_PORT} yet; it may still be migrating"
fi

if curl -fsS "http://localhost:${BRAIN_PORT}/v1/sensing/rails" >/dev/null 2>&1; then
  ok "salvage-brain answering on ${BRAIN_PORT}"
else
  warn "salvage-brain is up but not answering on ${BRAIN_PORT} yet"
fi

if [ "$CONSOLE" = no ]; then
  printf '\n\033[32mBackend is up.\033[0m Console not started (--backend).\n'
  printf '  core   http://localhost:%s\n  brain  http://localhost:%s\n' "$CORE_PORT" "$BRAIN_PORT"
  exit 0
fi

step "Preparing the console"
cd apps/salvage-console
if [ ! -d node_modules ]; then
  printf '    \033[90mInstalling dependencies (first run only)...\033[0m\n'
  npm ci
fi
ok "dependencies present"

cat <<'NEXT'

  Everything is up.

  The console starts below. Open the URL it prints — usually
  http://localhost:3000, or the next free port if 3000 is taken.

  There will be no data until a payment fails. To create one:
  open the Checkout page and press 'Publish failure event'.

  Ctrl-C stops the console. Containers keep running.
  Stop them with: ./start.sh --stop

NEXT

npm run dev
