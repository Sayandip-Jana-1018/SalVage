"""API key authentication and tenant binding.

Until this file existed, every endpoint in this service was open. The tenant
was a path parameter and nothing checked whether the caller was entitled to it,
so any client that could reach the port could read any merchant's payment
attempts by editing a URL. That is not a hardening gap to schedule; it is the
difference between a demonstration and a product, and no amount of hash-chained
ledger integrity means anything if the read side is anonymous.

The model
---------

A key belongs to a scope, and a scope decides what it can address:

``MERCHANT``
    Bound to exactly one ``merchant_id``. A request for any other tenant is
    answered **404, not 403** -- the same choice the read path already made for
    a missing record, and for the same reason. A 403 confirms that the other
    tenant exists, which is information the caller is not entitled to.

``OPERATOR``
    May address any tenant. This is what an internal console runs as, because
    an operator switching merchants during an incident is a real workflow. It
    is a separate scope so that it can be granted deliberately, never issued to
    a merchant, and told apart in a log.

Keys are never stored. Configuration carries the SHA-256 of each key, so a leak
of the configuration does not leak a credential -- the same reason a password
file holds hashes. The plaintext exists once, in the output of
``scripts/generate_api_key.sh``, and whoever runs it is responsible for handing
it over.

Fail closed
-----------

``SALVAGE_AUTH_REQUIRED`` defaults to **true**, and a service with no keys
configured refuses to start rather than starting open. Running without
authentication is possible -- the quickstart needs it -- but it takes an
explicit environment variable, and the process says loudly at startup that it
is unauthenticated.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from salvage_brain.config import settings

_BEARER = "Bearer "


class Scope(StrEnum):
    """What a key is allowed to address."""

    MERCHANT = "merchant"
    OPERATOR = "operator"


class KeyConfigurationError(RuntimeError):
    """The configured key material is unusable. Raised at startup, never later."""


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is calling, resolved from a key. Never carries the key."""

    scope: Scope
    merchant_id: str | None
    """The tenant a MERCHANT key is bound to. None for OPERATOR."""

    key_id: str
    """First eight characters of the key's digest. Safe to log; identifies the
    key in an audit trail without being usable to authenticate as it."""

    def may_address(self, merchant_id: str) -> bool:
        if self.scope is Scope.OPERATOR:
            return True
        return self.merchant_id == merchant_id


def digest(key: str) -> str:
    """SHA-256 of a key, hex encoded. The only form ever stored."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


class KeyStore:
    """The configured keys, indexed by digest.

    Lookup is by digest rather than by scanning and comparing, so the cost does
    not depend on how many keys are configured. ``compare_digest`` still guards
    the final comparison: a dictionary hit is not by itself proof that the two
    strings are equal, and this is cheap.
    """

    def __init__(self, records: dict[str, Principal]) -> None:
        self._records = records

    def __len__(self) -> int:
        return len(self._records)

    @classmethod
    def parse(cls, configured: str) -> KeyStore:
        """Read ``scope:merchant_id:sha256`` entries, one per line or comma.

        Every malformed entry is an error at startup. There is no "skip the bad
        ones and carry on": a key store that silently dropped an entry would
        deny a real caller with no explanation, and one that silently accepted a
        malformed entry might match nothing or everything.
        """
        records: dict[str, Principal] = {}
        raw = configured.replace("\n", ",")

        for index, entry in enumerate(part.strip() for part in raw.split(",")):
            if not entry:
                continue
            fields = entry.split(":")
            if len(fields) != 3:
                raise KeyConfigurationError(
                    f"key entry {index} is not scope:merchant_id:sha256 (got {len(fields)} fields)"
                )
            scope_text, merchant_id, key_hash = (field.strip() for field in fields)

            try:
                scope = Scope(scope_text.lower())
            except ValueError as exc:
                raise KeyConfigurationError(
                    f"key entry {index} has scope {scope_text!r}; "
                    f"expected one of {[s.value for s in Scope]}"
                ) from exc

            if len(key_hash) != 64 or not all(c in "0123456789abcdef" for c in key_hash.lower()):
                raise KeyConfigurationError(
                    f"key entry {index} does not carry a SHA-256 hex digest. "
                    "Configuration holds hashes, never keys -- run scripts/generate_api_key.sh."
                )

            if scope is Scope.MERCHANT and not merchant_id:
                raise KeyConfigurationError(
                    f"key entry {index} has scope merchant but no merchant_id to bind to"
                )
            if scope is Scope.OPERATOR and merchant_id not in ("", "*"):
                raise KeyConfigurationError(
                    f"key entry {index} has scope operator and a merchant_id ({merchant_id!r}). "
                    "An operator key addresses every tenant; binding it to one is a "
                    "contradiction that would read as a restriction it does not apply."
                )

            normalized = key_hash.lower()
            if normalized in records:
                raise KeyConfigurationError(
                    f"key entry {index} repeats a digest already configured. "
                    "Two entries for one key means one of them is not doing what its author thinks."
                )

            records[normalized] = Principal(
                scope=scope,
                merchant_id=merchant_id if scope is Scope.MERCHANT else None,
                key_id=normalized[:8],
            )

        return cls(records)

    def resolve(self, key: str) -> Principal | None:
        candidate = digest(key)
        record = self._records.get(candidate)
        if record is None:
            return None
        # Belt and braces: a dictionary hit means the digests are equal by
        # Python's own comparison, and this makes the final check constant time
        # regardless of how the mapping is implemented underneath.
        if not hmac.compare_digest(candidate, digest(key)):  # pragma: no cover - defensive
            return None
        return record


_store: KeyStore | None = None


def key_store() -> KeyStore:
    """The process-wide store, parsed once."""
    global _store
    if _store is None:
        _store = KeyStore.parse(settings.salvage_api_keys)
    return _store


def reset_key_store() -> None:
    """Drop the cached store. For tests and for a configuration reload."""
    global _store
    _store = None


def verify_startup_configuration() -> None:
    """Refuse to start unauthenticated unless somebody said so out loud.

    Called from the application factory. A service that quietly starts open
    because its key configuration was empty is the failure this whole module
    exists to prevent, and an environment variable is a cheap place to make
    that choice visible.
    """
    if not settings.salvage_auth_required:
        return
    if len(key_store()) == 0:
        raise KeyConfigurationError(
            "SALVAGE_AUTH_REQUIRED is true and SALVAGE_API_KEYS is empty, so every endpoint "
            "would serve any caller. Generate a key with scripts/generate_api_key.sh, or set "
            "SALVAGE_AUTH_REQUIRED=false to run this service without authentication on purpose."
        )


def authenticate(request: Request) -> Principal:
    """FastAPI dependency: resolve the caller, or refuse the request.

    When authentication is switched off this returns an operator principal with
    a key id that says what it is, so that anything logging the principal
    records that the request was unauthenticated rather than recording nothing.
    """
    if not settings.salvage_auth_required:
        return Principal(scope=Scope.OPERATOR, merchant_id=None, key_id="noauth")

    header = request.headers.get("authorization", "")
    if not header.startswith(_BEARER):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization: Bearer <api key> is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    principal = key_store().resolve(header[len(_BEARER) :].strip())
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That API key is not recognised.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


AuthenticatedPrincipal = Depends(authenticate)


def require_tenant(merchant_id: str, principal: Principal) -> None:
    """Refuse a caller reaching for a tenant that is not theirs.

    404 rather than 403, deliberately, matching what the read path already does
    for a record that does not exist. A 403 would confirm that the other tenant
    exists, which is exactly the fact a caller probing merchant ids is trying to
    establish.
    """
    if not principal.may_address(merchant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No such attempt for this merchant",
        )


def require_operator(principal: Principal, resource: str) -> None:
    """Refuse a merchant-scoped key on a resource that spans tenants.

    403 here rather than 404, and the difference from :func:`require_tenant` is
    the point. A tenant-addressed resource must not confirm that another tenant
    exists. A cross-tenant aggregate has no such secret to keep -- the caller
    already knows the resource exists, they are simply not entitled to it -- and
    telling them plainly is more useful than a lie.
    """
    if principal.scope is not Scope.OPERATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{resource} aggregates across every tenant, so it needs an operator key. "
                "A per-merchant view of it does not exist yet; see "
                "docs/adr/0007-cross-tenant-rail-intelligence.md."
            ),
        )


def operator_scope(resource: str) -> Callable[[Principal], None]:
    """Build a route dependency that admits operator keys only.

    Used in a route decorator's ``dependencies=[...]`` rather than as a handler
    parameter, and that placement is the point: FastAPI resolves decorator
    dependencies **before** parameter ones, so authorisation is settled before
    the handler's other dependencies run.

    That ordering is not cosmetic. Decline-code triage resolves a language model
    as a parameter dependency, which answers 503 when the layer is switched off.
    With the scope check in the handler body, an unauthorised merchant asking
    for triage learned whether the feature was enabled before being told they
    could not use it. Small, but it is information they are not entitled to, and
    the fix costs nothing.
    """

    def dependency(principal: Annotated[Principal, Depends(authenticate)]) -> None:
        require_operator(principal, resource)

    return dependency
