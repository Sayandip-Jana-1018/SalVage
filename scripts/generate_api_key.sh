#!/usr/bin/env bash
# Generate a Salvage API key and the configuration entry for it.
#
# The key is printed once, here, and never stored anywhere by this repository.
# What goes into configuration is its SHA-256, so a leak of the configuration --
# an environment dump, a container inspect, a log line that should not have
# existed -- does not leak a usable credential.
#
#   ./scripts/generate_api_key.sh operator
#   ./scripts/generate_api_key.sh merchant merch_acme
#
# Both services read the same format, so one key works against salvage-core and
# salvage-brain. Append the printed entry to SALVAGE_API_KEYS on both.

set -euo pipefail

scope="${1:-}"
merchant="${2:-}"

die() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

case "$scope" in
  operator)
    [ -z "$merchant" ] || die "An operator key addresses every tenant. Do not bind it to one."
    merchant='*'
    ;;
  merchant)
    [ -n "$merchant" ] || die "Usage: $0 merchant <merchant_id>"
    ;;
  *)
    cat >&2 <<'USAGE'
Usage:
  generate_api_key.sh operator             a key that may address every tenant
  generate_api_key.sh merchant <id>        a key bound to exactly one tenant

Scope matters. A merchant key reaching for another tenant is answered 404, and
that is enforced in code on every tenant-addressed route in both services. An
operator key is what an internal console runs as; it should never be issued to
a customer.
USAGE
    exit 2
    ;;
esac

command -v openssl >/dev/null 2>&1 || die "openssl is required."

# 32 bytes of CSPRNG output, base64url, no padding. The prefix is there so that
# a key found in a log or a paste is recognisable as ours and can be revoked
# rather than puzzled over.
secret="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
key="svg_${scope}_${secret}"
hash="$(printf '%s' "$key" | openssl dgst -sha256 | sed 's/^.*= //')"

cat <<OUTPUT

  Key (shown once, store it in a password manager and hand it over securely):

    ${key}

  Configuration entry (append to SALVAGE_API_KEYS on salvage-core AND salvage-brain):

    ${scope}:${merchant}:${hash}

  Callers authenticate with:

    Authorization: Bearer ${key}

  This key cannot be recovered from the configuration entry. If it is lost,
  generate another and remove the old entry -- which is also how you revoke one.

OUTPUT
