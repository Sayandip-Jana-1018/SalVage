#!/usr/bin/env python3
"""Load and latency harness for Salvage.

Two measurements, both of running code:

1. **Schema validation cost.** How long ``jsonschema`` takes to validate one
   ``payment_failed.v1`` event, which is the per-event overhead ADR-0002
   accepts in exchange for a versioned contract. This runs in-process and
   needs nothing else.

2. **Decision latency.** End-to-end wall time of ``POST /v1/decide`` against a
   running ``salvage-brain``: feature extraction, rail sensing, diagnosis and
   the expected-net-value optimiser, over a real HTTP connection and a real
   database. This needs the stack up.

**What this does not do.** It does not benchmark ingestion throughput, the
ledger, the outbox, or anything in ``salvage-core``. It measures the decision
path only, and reports latency of that path only.

An earlier version of this file reported a "full Sense -> Diagnose -> Decide
-> Bounds pipeline" P99 that was three ``asyncio.sleep`` calls totalling 1.5ms
behind a 50-way ``asyncio.Queue``. It called none of those stages. The number
it produced -- quoted in README.md as a verified sub-100ms SLA -- was the
latency of the asyncio event loop. Measuring the real endpoint gives a worse
number and a true one.

Usage::

    python scripts/stress_test.py --schema-only          # no stack needed
    python scripts/stress_test.py --merchant merch_demo  # needs `make up`
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime

import jsonschema

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contracts", "events", "payment_failed.v1.schema.json"
)
with open(SCHEMA_PATH, encoding="utf-8") as f:
    EVENT_SCHEMA = json.load(f)

VALIDATOR = jsonschema.Draft202012Validator(EVENT_SCHEMA)

# Synthetic issuer identities, matching packages/salvage-sim/calibration.yaml.
# Naming a real bank here would attach this file's invented error codes to a
# real institution, which docs/adr/0006-numbers-policy.md forbids.
ISSUERS = ("issuer_alpha", "issuer_beta", "issuer_gamma", "issuer_delta")
METHODS = ("upi", "card", "netbanking")



def _auth_headers() -> dict[str, str]:
    """The key this harness authenticates with, if one is configured.

    Both services require a bearer key on every route except the health probes.
    A harness without one measures the latency of a 401, which is a real number
    about nothing anyone cares about -- so an unauthenticated run stops with a
    message rather than reporting it.
    """
    key = os.environ.get("SALVAGE_API_KEY", "")
    return {"Authorization": f"Bearer {key}"} if key else {}

def generate_synthetic_event(idx: int, merchant_id: str) -> dict:
    """One schema-valid ``payment_failed.v1`` payload."""
    issuer = ISSUERS[idx % len(ISSUERS)]
    method = METHODS[(idx // len(ISSUERS)) % len(METHODS)]
    return {
        "event_id": f"evt_load_{idx:08d}",
        "event_version": 1,
        "event_timestamp": datetime.now(UTC).isoformat(),
        "merchant_id": merchant_id,
        "order_id": f"order_load_{idx:08d}",
        "payment_attempt_id": f"pay_load_{idx:08d}",
        "amount_paise": int(10000 + (idx * 137) % 500000),
        "currency": "INR",
        "payment_method": method,
        "provider": "razorpay",
        "provider_error_code": "BAD_REQUEST_ERROR",
        "provider_error_description": "Payment processing failed at the issuer",
        "issuer": issuer,
        "customer_id": f"cust_{idx % 500:06d}",
        "is_recurring": False,
    }


def _percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile.

    Hand-rolled rather than pulled from numpy so that ``--schema-only`` runs
    with nothing but the standard library plus jsonschema.
    """
    if not values:
        raise ValueError("no samples")
    ordered = sorted(values)
    rank = max(1, min(len(ordered), int(round(pct / 100.0 * len(ordered)))))
    return ordered[rank - 1]


def _report(samples_ms: list[float], unit: str = "ms") -> None:
    print(f"    n                     : {len(samples_ms):,}")
    print(f"    mean                  : {statistics.fmean(samples_ms):.3f} {unit}")
    print(f"    p50                   : {_percentile(samples_ms, 50):.3f} {unit}")
    print(f"    p90                   : {_percentile(samples_ms, 90):.3f} {unit}")
    print(f"    p95                   : {_percentile(samples_ms, 95):.3f} {unit}")
    print(f"    p99                   : {_percentile(samples_ms, 99):.3f} {unit}")
    print(f"    max                   : {max(samples_ms):.3f} {unit}")


def benchmark_schema_validation(n_samples: int, merchant_id: str) -> list[float]:
    """Per-event validation cost, in microseconds."""
    events = [generate_synthetic_event(i, merchant_id) for i in range(min(n_samples, 1000))]
    latencies_us: list[float] = []
    for i in range(n_samples):
        event = events[i % len(events)]
        started = time.perf_counter()
        VALIDATOR.validate(event)
        latencies_us.append((time.perf_counter() - started) * 1_000_000.0)
    return latencies_us


def benchmark_decision_endpoint(
    base_url: str,
    merchant_id: str,
    attempt_ids: list[str],
    n_requests: int,
) -> tuple[list[float], int]:
    """Wall time of ``POST /v1/decide``, in milliseconds.

    Returns ``(latencies_ms, not_found_count)``. A 404 means the attempt is
    not in the database; it is counted and reported rather than silently
    dropped, because a run where most requests 404 is measuring the error
    path and the reader needs to know that.
    """
    url = f"{base_url.rstrip('/')}/v1/decide"
    latencies_ms: list[float] = []
    not_found = 0

    for i in range(n_requests):
        payload = json.dumps(
            {
                "merchant_id": merchant_id,
                "payment_attempt_id": attempt_ids[i % len(attempt_ids)],
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json", **_auth_headers()},
            method="POST",
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                response.read()
            latencies_ms.append((time.perf_counter() - started) * 1000.0)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                not_found += 1
                continue
            if e.code in (401, 403):
                # Not a load result. Reporting a latency distribution over
                # rejected requests would measure how fast the service says no.
                raise SystemExit(
                    f"salvage-brain refused this harness with HTTP {e.code}. Set SALVAGE_API_KEY "
                    "to a key that may address this merchant, or run the stack with "
                    "SALVAGE_AUTH_REQUIRED=false. See scripts/generate_api_key.sh."
                ) from e
            raise

    return latencies_ms, not_found


def fetch_attempt_ids(base_url: str, merchant_id: str, limit: int) -> list[str]:
    """Attempt ids that actually exist for this merchant.

    Load-testing ``/v1/decide`` with invented ids would measure the 404 path,
    which returns before doing any of the work this is meant to time.
    """
    url = f"{base_url.rstrip('/')}/v1/attempts/{merchant_id}?limit={limit}"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Cannot reach salvage-brain at {base_url}: {e}\n"
            "Start the stack with `make up` (or run with --schema-only)."
        ) from e

    if isinstance(body, dict):
        rows = body.get("attempts", [])
    else:
        rows = body
    return [str(row["payment_attempt_id"]) for row in rows if "payment_attempt_id" in row]


def main() -> None:
    parser = argparse.ArgumentParser(description="Salvage load and latency harness")
    parser.add_argument("--requests", type=int, default=500, help="Decision requests to issue")
    parser.add_argument("--schema-samples", type=int, default=5000)
    parser.add_argument("--merchant", default="merch_demo")
    parser.add_argument("--base-url", default=os.environ.get("BRAIN_URL", "http://localhost:8000"))
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="Only benchmark schema validation; do not contact salvage-brain",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("SALVAGE LOAD AND LATENCY HARNESS")
    print("=" * 70)

    print(f"\n==> Schema validation ({args.schema_samples:,} events, in-process)")
    schema_us = benchmark_schema_validation(args.schema_samples, args.merchant)
    _report(schema_us, unit="us")

    if args.schema_only:
        print("\n--schema-only: the decision endpoint was not measured.")
        return

    print(f"\n==> Decision endpoint (POST {args.base_url}/v1/decide)")
    attempt_ids = fetch_attempt_ids(args.base_url, args.merchant, limit=200)
    if not attempt_ids:
        raise SystemExit(
            f"No payment attempts exist for merchant '{args.merchant}'.\n"
            "Run `make demo` first to ingest at least one, or pass --merchant."
        )
    print(f"    replaying over {len(attempt_ids)} real attempt(s)")

    decision_ms, not_found = benchmark_decision_endpoint(
        args.base_url, args.merchant, attempt_ids, args.requests
    )
    if not decision_ms:
        raise SystemExit("Every decision request returned 404; nothing was measured.")

    _report(decision_ms)
    if not_found:
        print(f"    404s (excluded)       : {not_found}")

    print()
    print("Measured: schema validation and the salvage-brain decision path.")
    print("Not measured: ingestion, ledger, outbox, or anything in salvage-core.")


if __name__ == "__main__":
    main()
