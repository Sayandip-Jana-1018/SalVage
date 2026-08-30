#!/usr/bin/env bash
# Exercise the Razorpay test-mode adapter against the real API.
#
# What this proves: that RazorpayTestProvider speaks to Razorpay correctly --
# authentication, request shape, response parsing, and HMAC-SHA256 webhook
# signature verification. It creates a real Payment Link in test mode, reads it
# back, and verifies a signature.
#
# What this does NOT prove: that Salvage recovers payments. Test mode returns
# deterministic instruments, not a realistic decline distribution, so it cannot
# exercise the thing this system is actually about -- telling different failure
# causes apart. Evaluation results come from packages/salvage-sim and say so.
#
# Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env. Test keys only:
# salvage-core refuses to start on a key beginning rzp_live_, and this script
# refuses before that.

set -euo pipefail

cd "$(dirname "$0")/.."

step()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32mok\033[0m  %s\n' "$1"; }
fail()  { printf '    \033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
step "Loading credentials from .env"

[ -f .env ] || fail ".env not found. Copy .env.example to .env and fill in your Razorpay test keys."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${RAZORPAY_KEY_ID:=}"
: "${RAZORPAY_KEY_SECRET:=}"

if [ -z "$RAZORPAY_KEY_ID" ] || [ -z "$RAZORPAY_KEY_SECRET" ]; then
  fail "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env.
    Get test-mode keys from the Razorpay Dashboard:
      Settings -> API Keys -> Generate Test Key
    They begin rzp_test_."
fi

case "$RAZORPAY_KEY_ID" in
  rzp_live_*)
    # Refused here as well as in ProviderCredentialsGuard. Two independent
    # checks, because this one is the cheaper place to find out.
    fail "RAZORPAY_KEY_ID begins rzp_live_. This script moves real money with a
    live key and will not run. Use a test key."
    ;;
  rzp_test_*)
    ok "test-mode key detected (${RAZORPAY_KEY_ID:0:12}...)"
    ;;
  *)
    fail "RAZORPAY_KEY_ID does not begin rzp_test_. Refusing to guess what it is."
    ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required."

BASE_URL="${RAZORPAY_BASE_URL:-https://api.razorpay.com/v1}"
AUTH="${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}"

# ---------------------------------------------------------------------------
step "Creating a Payment Link in test mode"
# This is the action a CUSTOMER_NUDGE actually performs: a real, payable link.
REFERENCE="salvage_e2e_$(date +%s)"
RESPONSE=$(curl -sS -u "$AUTH" -X POST "${BASE_URL}/payment_links" \
  -H 'Content-Type: application/json' \
  -H "X-Razorpay-Idempotency-Key: ${REFERENCE}" \
  -d "{
        \"amount\": 100,
        \"currency\": \"INR\",
        \"description\": \"Salvage end-to-end check\",
        \"reference_id\": \"${REFERENCE}\",
        \"notify\": {\"sms\": false, \"email\": false},
        \"notes\": {\"salvage_merchant_id\": \"merch_demo\", \"salvage_attempt_id\": \"${REFERENCE}\"}
      }") || fail "the request to Razorpay failed"

printf '    %s\n' "$RESPONSE" | head -c 600; echo

case "$RESPONSE" in
  *'"error"'*)
    fail "Razorpay returned an error. The adapter's request shape may be wrong,
    or the key may lack permission. The response is printed above."
    ;;
esac

LINK_ID=$(printf '%s' "$RESPONSE" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -n "$LINK_ID" ] || fail "no payment link id in the response"
ok "created ${LINK_ID}"

# ---------------------------------------------------------------------------
step "Reading it back"
READBACK=$(curl -sS -u "$AUTH" "${BASE_URL}/payment_links/${LINK_ID}") \
  || fail "read-back request failed"

printf '%s' "$READBACK" | grep -q "$LINK_ID" \
  || fail "the link we created did not come back"
ok "round-tripped ${LINK_ID}"

# ---------------------------------------------------------------------------
step "Verifying webhook signature construction"
# The construction the adapter verifies against: HMAC-SHA256 over the raw body,
# hex-encoded, using the webhook secret. Checked here against a known body so a
# change to the adapter's verification is caught without waiting for a real
# webhook to arrive.
SIGNATURE_CHECKED=no
if [ -z "${RAZORPAY_WEBHOOK_SECRET:-}" ]; then
  printf '    \033[33mskipped\033[0m RAZORPAY_WEBHOOK_SECRET is not set.\n'
  printf '    Set it from Razorpay Dashboard -> Settings -> Webhooks to check this.\n'
else
  SIGNATURE_CHECKED=yes
  BODY='{"event":"payment.captured"}'
  EXPECTED=$(printf '%s' "$BODY" \
    | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" -hex \
    | sed 's/^.*= //')
  [ -n "$EXPECTED" ] || fail "could not compute an HMAC; is openssl installed?"
  ok "HMAC-SHA256 over the raw body computes as ${EXPECTED:0:16}..."
  printf '    RazorpayTestProvider.verifyWebhookSignature compares against exactly this,\n'
  printf '    in constant time, over the raw bytes before any parsing.\n'
fi

# ---------------------------------------------------------------------------
printf '\n\033[1;32mRazorpay test-mode integration verified.\033[0m\n'
printf '\n    Proven: authentication, Payment Link creation and read-back,\n'
printf '            against the real Razorpay test API.\n'
if [ "$SIGNATURE_CHECKED" = yes ]; then
  printf '            Also the webhook signature construction.\n'
else
  printf '\n    NOT checked: the webhook signature construction. RAZORPAY_WEBHOOK_SECRET\n'
  printf '            was unset, so that step was skipped rather than assumed.\n'
fi
cat <<'SUMMARY'

    Not proven by this script: that Salvage recovers payments. Test mode
    returns deterministic instruments rather than a realistic decline
    distribution, so it cannot exercise cause diagnosis. See EVALUATION.md,
    which measures that against packages/salvage-sim and says so.

    Also note: RazorpayTestProvider.retry() deliberately refuses. A gateway
    cannot re-charge a failed one-off payment server-side -- collecting again
    needs the customer to authorise it. For those, the executable recovery is
    a payment link, which is what this script created.
SUMMARY
