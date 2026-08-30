#!/usr/bin/env bash
# Salvage Phase 0 demo: proves the substrate works end to end.
#
#   host -> Redpanda -> salvage-core (Java)  -> PostgreSQL
#                                             -> salvage-brain (Python) -> host
#
# A JSON event is produced to Kafka. salvage-core consumes it, validates it
# against contracts/events/payment_failed.v1.schema.json, and writes the
# attempt and failure rows in one transaction. salvage-brain then reads those
# rows back over its own database connection and serves them, and this script
# asserts the values that come out are the values that went in.
#
# Everything runs inside containers. The host needs Docker and bash, nothing
# else -- no JDK, no Python, no curl.
#
# What this does NOT do: move money, make a decision, or execute a recovery.
# None of those exist yet. This proves the plumbing, and says so.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose"
MERCHANT_ID="merch_demo"
ORDER_ID="order_demo_$(date +%s)"
ATTEMPT_ID="pay_demo_$(date +%s)"
EVENT_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null \
            || python -c 'import uuid;print(uuid.uuid4())')"
AMOUNT_PAISE=249900
TOPIC="salvage.payment-failed.v1"

step()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32mok\033[0m  %s\n' "$1"; }
fail()  { printf '    \033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
step "Starting infrastructure and services"
$COMPOSE --profile apps up -d --build

# ---------------------------------------------------------------------------
step "Waiting for both services to report ready"
wait_healthy() {
  local service="$1" attempts=90
  for _ in $(seq 1 $attempts); do
    local state
    state=$($COMPOSE ps --format '{{.Health}}' "$service" 2>/dev/null | head -1)
    if [ "$state" = "healthy" ]; then
      ok "$service is healthy"
      return 0
    fi
    sleep 2
  done
  $COMPOSE logs --tail 40 "$service" >&2
  fail "$service did not become healthy in time"
}
wait_healthy salvage-core
wait_healthy salvage-brain

# ---------------------------------------------------------------------------
step "Provisioning the demo merchant"
# Tenants are provisioned by an administrative action. salvage-core rejects
# events naming an unknown merchant rather than creating tenants implicitly,
# so this row has to exist before the event is published.
$COMPOSE exec -T postgres psql -q -U "${POSTGRES_USER:-salvage}" \
  -d "${POSTGRES_DB:-salvage}" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO salvage.merchants (merchant_id, name)
   VALUES ('${MERCHANT_ID}', 'Demo Merchant')
   ON CONFLICT (merchant_id) DO NOTHING;"
ok "merchant ${MERCHANT_ID} exists"

# ---------------------------------------------------------------------------
step "Publishing a payment_failed.v1 event"
EVENT=$(cat <<JSON
{"event_id":"${EVENT_ID}","event_version":1,"event_timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","merchant_id":"${MERCHANT_ID}","order_id":"${ORDER_ID}","payment_attempt_id":"${ATTEMPT_ID}","amount_paise":${AMOUNT_PAISE},"currency":"INR","payment_method":"upi","provider":"razorpay","provider_error_code":"BAD_REQUEST_ERROR","provider_error_description":"Payment processing failed at the issuer","issuer":"issuer_alpha","customer_id":"cust_demo_0001","is_recurring":false}
JSON
)
printf '%s\n' "$EVENT" | $COMPOSE exec -T redpanda \
  rpk topic produce "$TOPIC" --brokers redpanda:9092
ok "published event_id=${EVENT_ID}"

# ---------------------------------------------------------------------------
step "Reading it back through salvage-brain"
# curl runs inside the core container so the host needs no HTTP client.
RESPONSE=""
for _ in $(seq 1 45); do
  if RESPONSE=$($COMPOSE exec -T salvage-core \
        curl -fsS "http://salvage-brain:8000/v1/attempts/${MERCHANT_ID}/${ATTEMPT_ID}" \
        2>/dev/null); then
    break
  fi
  RESPONSE=""
  sleep 2
done
[ -n "$RESPONSE" ] || fail "salvage-brain never returned the attempt (core did not ingest it)"

printf '    %s\n' "$RESPONSE"

# ---------------------------------------------------------------------------
step "Verifying the values that came out are the values that went in"
assert_contains() {
  grep -q "$1" <<<"$RESPONSE" || fail "$2"
  ok "$2"
}
assert_contains "\"payment_attempt_id\":\"${ATTEMPT_ID}\"" "attempt id round-tripped"
assert_contains "\"order_id\":\"${ORDER_ID}\""             "order id round-tripped"
assert_contains "\"amount_paise\":${AMOUNT_PAISE}"         "amount round-tripped exactly"
assert_contains "\"issuer\":\"issuer_alpha\""                      "issuer round-tripped"
assert_contains "\"rail_id\":\"issuer_alpha|upi|razorpay\""        "rail derived as issuer|method|provider"
assert_contains "\"taxonomy_code\":null"                   "failure is unclassified (taxonomy is Phase 3)"

# ---------------------------------------------------------------------------
step "Verifying redelivery does not duplicate"
BEFORE=$($COMPOSE exec -T postgres psql -tAq -U "${POSTGRES_USER:-salvage}" \
  -d "${POSTGRES_DB:-salvage}" -c \
  "SELECT count(*) FROM salvage.failure_events WHERE merchant_id='${MERCHANT_ID}';")
printf '%s\n' "$EVENT" | $COMPOSE exec -T redpanda \
  rpk topic produce "$TOPIC" --brokers redpanda:9092
sleep 5
AFTER=$($COMPOSE exec -T postgres psql -tAq -U "${POSTGRES_USER:-salvage}" \
  -d "${POSTGRES_DB:-salvage}" -c \
  "SELECT count(*) FROM salvage.failure_events WHERE merchant_id='${MERCHANT_ID}';")
[ "$(tr -d '[:space:]' <<<"$BEFORE")" = "$(tr -d '[:space:]' <<<"$AFTER")" ] \
  || fail "redelivering the same event created a second row (${BEFORE} -> ${AFTER})"
ok "same event published twice, still one failure row"

# ---------------------------------------------------------------------------
printf '\n\033[1;32mIngest demo passed.\033[0m\n'
cat <<'SUMMARY'

    Proven: Kafka -> Java consumer -> schema validation -> PostgreSQL
            -> Python read path -> HTTP, with event-level deduplication.

    Built since, and not exercised by this script: the hash-chained ledger,
    idempotency, the transactional outbox, the bounds engine, the saga
    coordinator, the diagnosis and policy engines, the core read API, the
    MCP server and the operator console. `make test` covers those.

    Still not built: any code that moves money. salvage-core has no
    PaymentProvider port, so nothing in this repository reaches a payment
    gateway. See docs/adr/0003-payment-provider-abstraction.md.
SUMMARY
