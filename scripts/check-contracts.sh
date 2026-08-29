#!/usr/bin/env bash
# Thin wrapper so `make contracts-check` and CI run the same thing.
#
# Executed through salvage-brain's uv environment because that is where the
# validation dependencies and the FastAPI app both live.
set -euo pipefail
cd "$(dirname "$0")/.."
exec uv run --frozen --project services/salvage-brain python scripts/check_contracts.py
