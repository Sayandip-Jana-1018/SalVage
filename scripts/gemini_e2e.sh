#!/usr/bin/env bash
# Exercise the language layer against the real Gemini API.
#
# Why this exists: services/salvage-brain/src/salvage_brain/language/provider.py
# is transcribed from Google's published API and has never been run against it
# from this repository. Everything else in the language layer is covered by 75
# tests, but those use a scripted double, so they prove the validators and not
# the wire format. This script is the only thing that proves the wire format.
#
# What it does NOT prove: that a model's answers are correct. The proposals it
# produces are suggestions for a human to check against a specification, which
# is the whole point of the review queue. A run that succeeds means the request
# shape and the response parsing are right, nothing more.
#
# Requires GEMINI_API_KEY in .env. This makes billable outbound calls to a
# third party; nothing else in this repository does.

set -euo pipefail

cd "$(dirname "$0")/.."

step()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32mok\033[0m  %s\n' "$1"; }
fail()  { printf '    \033[31mFAIL\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
step "Loading credentials from .env"

[ -f .env ] || fail ".env not found. Copy .env.example to .env and add GEMINI_API_KEY."

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${GEMINI_API_KEY:=}"
[ -n "$GEMINI_API_KEY" ] || fail "GEMINI_API_KEY is not set in .env.
    Get a key from https://aistudio.google.com/apikey
    This is the only credential in Salvage that is used for outbound calls."

command -v curl >/dev/null 2>&1 || fail "curl is required."

BASE_URL="${GEMINI_BASE_URL:-https://generativelanguage.googleapis.com/v1beta}"
ok "key loaded (${GEMINI_API_KEY:0:6}...), base ${BASE_URL}"

# ---------------------------------------------------------------------------
step "Listing the models this key can actually reach"
# Discovery rather than assertion. No file in this repository claims a
# particular model id exists; GEMINI_MODEL defaults to one and this prints what
# is really available so nobody has to guess.
MODELS=$(curl -sS -H "x-goog-api-key: ${GEMINI_API_KEY}" "${BASE_URL}/models") \
  || fail "the request to Google failed"

case "$MODELS" in
  *'"error"'*)
    printf '    %s\n' "$MODELS" | head -c 600; echo
    fail "Google returned an error. The key may be invalid or the API not enabled."
    ;;
esac

printf '%s' "$MODELS" \
  | tr ',' '\n' \
  | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"models\/\([^"]*\)".*/    \1/p' \
  | sort -u | head -40

WANTED="${GEMINI_MODEL:-gemini-2.0-flash}"
if printf '%s' "$MODELS" | grep -q "\"models/${WANTED}\""; then
  ok "GEMINI_MODEL=${WANTED} is available"
else
  fail "GEMINI_MODEL=${WANTED} is not in the list above.
    Set GEMINI_MODEL in .env to one of them. The default in config.py is a
    starting point, not a promise about your account."
fi

# ---------------------------------------------------------------------------
step "Round-tripping one completion"
# The exact request GeminiLanguageModel.complete builds: systemInstruction,
# one user turn, temperature 0, and the key in a header rather than the query
# string. If this succeeds, the adapter's wire format is right.
RESPONSE=$(curl -sS -X POST \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' \
  "${BASE_URL}/models/${WANTED}:generateContent" \
  -d '{
        "systemInstruction": {"parts": [{"text": "Reply with exactly the word: ready"}]},
        "contents": [{"role": "user", "parts": [{"text": "respond now"}]}],
        "generationConfig": {"temperature": 0, "candidateCount": 1, "maxOutputTokens": 16}
      }') || fail "the completion request failed"

case "$RESPONSE" in
  *'"error"'*)
    printf '    %s\n' "$RESPONSE" | head -c 600; echo
    fail "Google returned an error on generateContent."
    ;;
esac

TEXT=$(printf '%s' "$RESPONSE" \
  | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -n "$TEXT" ] || {
  printf '    %s\n' "$RESPONSE" | head -c 600; echo
  fail "no text in the response. _extract_text in provider.py parses this path."
}
ok "model replied: ${TEXT}"

# ---------------------------------------------------------------------------
printf '\n\033[1;32mGemini wire format verified.\033[0m\n'
cat <<'SUMMARY'

    Proven: the endpoint, the x-goog-api-key header, the systemInstruction /
            contents / generationConfig request body, and the
            candidates[0].content.parts[].text response path that
            GeminiLanguageModel parses.

    Not proven: that any proposal, nudge or narration the layer produces is
            correct. That is what the validators and the human review queue
            are for. A triage proposal is a suggestion to check against a
            specification, never a mapping.

    To switch the layer on for a running service:
        SALVAGE_LANGUAGE_ENABLED=true
    It is off by default. Nothing in the money path reads it either way.
SUMMARY
