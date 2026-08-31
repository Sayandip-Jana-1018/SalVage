"""Authentication, tenant binding, and the test that no route escapes them.

The load-bearing test here is ``test_a_merchant_key_cannot_read_another_tenant``.
Everything else supports it. Before this file existed, every endpoint in this
service was anonymous and the tenant was a path parameter, so reading another
merchant's payment attempts was a matter of editing a URL. The multi-tenant
isolation the repository claims was enforced at the repository layer and then
handed to whoever asked.

``test_every_route_requires_authentication`` is the one that keeps this true
next month. It walks the mounted application and fails on any endpoint that
does not depend on ``authenticate``, with an allowlist of exactly the two
health probes. A route added without a principal fails the build rather than
shipping open.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import HTTPException, routing
from fastapi.testclient import TestClient

from salvage_brain.auth import (
    KeyConfigurationError,
    KeyStore,
    Principal,
    Scope,
    authenticate,
    digest,
    key_store,
    require_tenant,
    reset_key_store,
    verify_startup_configuration,
)
from salvage_brain.config import Settings, settings
from salvage_brain.main import create_app

OPERATOR_KEY = "svg_test_operator_key_not_a_real_credential"
ACME_KEY = "svg_test_acme_key_not_a_real_credential"
OTHER_KEY = "svg_test_other_key_not_a_real_credential"

CONFIGURED = ",".join(
    [
        f"operator:*:{digest(OPERATOR_KEY)}",
        f"merchant:merch_acme:{digest(ACME_KEY)}",
        f"merchant:merch_other:{digest(OTHER_KEY)}",
    ]
)

# The only endpoints allowed to answer without a key. Both are probed by a load
# balancer that has no credential, and neither returns tenant data -- the
# readiness probe deliberately reports a dependency's exception *type* and not
# its message, because driver messages embed connection URLs.
UNAUTHENTICATED = frozenset({"/healthz/liveness", "/healthz/readiness"})


@pytest.fixture
def authenticated(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """An app with authentication genuinely switched on."""
    monkeypatch.setattr(settings, "salvage_auth_required", True)
    monkeypatch.setattr(settings, "salvage_api_keys", CONFIGURED)
    reset_key_store()
    with TestClient(create_app()) as client:
        yield client
    reset_key_store()


def bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def api_routes(app: object) -> list[routing.APIRoute]:
    """Every mounted APIRoute, following deferred router inclusion.

    This FastAPI version does not flatten ``include_router`` immediately --
    ``app.routes`` holds ``_IncludedRouter`` placeholders that keep the real
    router on ``original_router``. Walking only the top level found zero
    APIRoutes, which made the guarantee below pass by finding nothing to check.
    That is why ``test_the_allowlist_is_not_vacuous`` exists, and it is the
    reason it earned its place on the first run.
    """
    found: list[routing.APIRoute] = []

    def walk(routes: object) -> None:
        for route in routes:  # type: ignore[attr-defined]
            if isinstance(route, routing.APIRoute):
                found.append(route)
                continue
            inner = getattr(route, "original_router", None)
            if inner is not None:
                walk(inner.routes)
            elif hasattr(route, "routes"):
                walk(route.routes)

    walk(app.routes)  # type: ignore[attr-defined]
    return found


# ---------------------------------------------------------------------------
# The property this whole phase exists for
# ---------------------------------------------------------------------------


def test_a_merchant_key_cannot_read_another_tenant(authenticated: TestClient) -> None:
    """A key bound to merch_acme reaching for merch_other gets nothing.

    404 rather than 403, and that is deliberate. A 403 would confirm that
    merch_other exists, which is exactly the fact somebody enumerating merchant
    ids is trying to establish. The refusal is indistinguishable from the
    answer for a tenant that was never provisioned.

    No database is involved: the tenant check runs before the query, so this
    holds even if the database is down, and it holds in the unit tier where it
    will actually be run. The permitted path is asserted separately, in
    ``test_a_key_may_address_its_own_tenant_and_no_other``, because *that* one
    does reach a query and a test needing PostgreSQL to prove an authorisation
    rule is a test that gets skipped.
    """
    theirs = authenticated.get("/v1/attempts/merch_other", headers=bearer(ACME_KEY))
    assert theirs.status_code == 404
    assert "merch_other" not in theirs.text, "the refusal must not echo the tenant back"


def test_the_same_holds_on_every_tenant_addressed_route(authenticated: TestClient) -> None:
    """One route protected and the next one not is the usual shape of this bug."""
    for method, path, body in (
        ("get", "/v1/attempts/merch_other", None),
        ("get", "/v1/attempts/merch_other/pay_1", None),
        ("post", "/v1/diagnose", {"merchant_id": "merch_other", "payment_attempt_id": "pay_1"}),
        ("post", "/v1/decide", {"merchant_id": "merch_other", "payment_attempt_id": "pay_1"}),
        (
            "post",
            "/v1/language/narrate",
            {"merchant_id": "merch_other", "payment_attempt_id": "pay_1"},
        ),
    ):
        response = authenticated.request(method, path, headers=bearer(ACME_KEY), json=body)
        assert response.status_code == 404, (path, response.status_code, response.text)


def test_a_key_may_address_its_own_tenant_and_no_other() -> None:
    """The permit side of the rule, tested where it can be tested without a database.

    The HTTP tests around this one assert refusals, and a refusal never reaches
    a query -- ``require_tenant`` runs first. Asserting the *permitted* path
    over HTTP would need PostgreSQL up, and an authorisation rule whose proof
    depends on infrastructure is a rule nobody checks on a laptop.
    ``require_tenant`` is the rule; this is it, directly.
    """
    store = KeyStore.parse(CONFIGURED)
    acme = store.resolve(ACME_KEY)
    operator = store.resolve(OPERATOR_KEY)
    assert acme is not None and operator is not None

    # None of these raise.
    require_tenant("merch_acme", acme)
    require_tenant("merch_acme", operator)
    require_tenant("merch_other", operator)

    with pytest.raises(HTTPException) as refused:
        require_tenant("merch_other", acme)
    assert refused.value.status_code == 404
    assert "merch_other" not in str(refused.value.detail)


def test_a_merchant_key_cannot_read_the_cross_tenant_rail_matrix(
    authenticated: TestClient,
) -> None:
    """403, not 404, and the difference is not pedantry.

    The rail matrix is built from every tenant's ingested traffic. Serving it to
    a merchant hands them another merchant's failure patterns. There is nothing
    secret about the endpoint's existence, so the honest refusal names the
    reason rather than pretending the resource is absent.
    """
    refused = authenticated.get("/v1/sensing/rails", headers=bearer(ACME_KEY))
    assert refused.status_code == 403
    assert "operator key" in refused.json()["detail"]

    allowed = authenticated.get("/v1/sensing/rails", headers=bearer(OPERATOR_KEY))
    assert allowed.status_code == 200


def test_triage_is_operator_only(authenticated: TestClient) -> None:
    """It proposes changes to a taxonomy table every tenant is classified by."""
    refused = authenticated.post(
        "/v1/language/triage", headers=bearer(ACME_KEY), json={"provider_error_code": "ZZ42"}
    )
    assert refused.status_code == 403


# ---------------------------------------------------------------------------
# The gate itself
# ---------------------------------------------------------------------------


def test_no_key_is_refused(authenticated: TestClient) -> None:
    response = authenticated.get("/v1/attempts/merch_acme")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    [
        {},
        {"Authorization": "Bearer "},
        {"Authorization": "Bearer wrong-key"},
        {"Authorization": ACME_KEY},  # no scheme
        {"Authorization": f"Basic {ACME_KEY}"},
        {"Authorization": f"bearer {ACME_KEY}"},  # scheme is case-sensitive here
    ],
)
def test_a_key_that_is_not_configured_is_refused(
    authenticated: TestClient, header: dict[str, str]
) -> None:
    assert authenticated.get("/v1/attempts/merch_acme", headers=header).status_code == 401


def test_the_health_probes_stay_open(authenticated: TestClient) -> None:
    """A load balancer has no credential, and liveness must not need one."""
    assert authenticated.get("/healthz/liveness").status_code == 200


def test_every_route_requires_authentication() -> None:
    """The test that keeps this true after everyone has forgotten about it.

    Walks the mounted application rather than a list somebody maintains by
    hand. A new route added without a principal fails here, which is the only
    place that failure is cheap.
    """
    app = create_app()
    unprotected: list[str] = []

    for route in api_routes(app):
        if route.path in UNAUTHENTICATED or route.path.startswith(("/docs", "/redoc", "/openapi")):
            continue
        depends_on_auth = any(
            dependency.call is authenticate
            for dependency in route.dependant.dependencies
        ) or any(
            sub.call is authenticate
            for dependency in route.dependant.dependencies
            for sub in dependency.dependencies
        )
        if not depends_on_auth:
            unprotected.append(f"{sorted(route.methods)} {route.path}")

    assert not unprotected, (
        f"these routes serve any caller: {unprotected}. Every endpoint that is not a health "
        "probe must depend on salvage_brain.auth.authenticate. If one genuinely should be "
        "open, add it to UNAUTHENTICATED here and say why in the commit."
    )


def test_the_allowlist_is_not_vacuous() -> None:
    """Guard against the walk above passing because it found no routes."""
    app = create_app()
    paths = {route.path for route in api_routes(app)}
    assert len(paths) >= 10, paths
    assert paths >= UNAUTHENTICATED, "the allowlist names routes that do not exist"


# ---------------------------------------------------------------------------
# Key material
# ---------------------------------------------------------------------------


def test_configuration_holds_hashes_and_never_keys() -> None:
    store = KeyStore.parse(CONFIGURED)
    assert len(store) == 3
    assert ACME_KEY not in CONFIGURED
    assert digest(ACME_KEY) in CONFIGURED

    principal = store.resolve(ACME_KEY)
    assert principal == Principal(
        scope=Scope.MERCHANT, merchant_id="merch_acme", key_id=digest(ACME_KEY)[:8]
    )
    assert store.resolve("not-a-key") is None


def test_a_principal_never_carries_the_key() -> None:
    """It is logged, so it must be safe to log."""
    principal = KeyStore.parse(CONFIGURED).resolve(ACME_KEY)
    assert principal is not None
    rendered = repr(principal)
    assert ACME_KEY not in rendered
    assert digest(ACME_KEY) not in rendered, "a full digest is enough to forge a config entry"


@pytest.mark.parametrize(
    ("configured", "because"),
    [
        ("merchant:merch_acme", "too few fields"),
        ("merchant:merch_acme:abc:def", "too many fields"),
        (f"admin:merch_acme:{digest(ACME_KEY)}", "unknown scope"),
        ("merchant:merch_acme:not-a-digest", "not a sha-256"),
        (f"merchant:{digest(ACME_KEY)}", "no merchant id"),
        (f"merchant::{digest(ACME_KEY)}", "empty merchant id"),
        (f"operator:merch_acme:{digest(ACME_KEY)}", "an operator bound to one tenant"),
        (f"merchant:a:{digest(ACME_KEY)},merchant:b:{digest(ACME_KEY)}", "duplicate digest"),
    ],
)
def test_malformed_key_configuration_is_refused_at_startup(
    configured: str, because: str
) -> None:
    """No entry is skipped and none is guessed at.

    A store that silently dropped a bad entry would deny a real caller with no
    explanation; one that silently accepted it might match nothing, or match
    more than its author intended.
    """
    with pytest.raises(KeyConfigurationError):
        KeyStore.parse(configured)


def test_an_empty_configuration_refuses_to_start(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail closed. The failure this module exists to prevent is starting open."""
    monkeypatch.setattr(settings, "salvage_auth_required", True)
    monkeypatch.setattr(settings, "salvage_api_keys", "")
    reset_key_store()

    with pytest.raises(KeyConfigurationError, match="would serve any caller"):
        verify_startup_configuration()


def test_running_open_takes_an_explicit_decision(monkeypatch: pytest.MonkeyPatch) -> None:
    """Possible, because the quickstart needs it. Never the default."""
    monkeypatch.setattr(settings, "salvage_auth_required", False)
    monkeypatch.setattr(settings, "salvage_api_keys", "")
    reset_key_store()

    verify_startup_configuration()

    with TestClient(create_app()) as client:
        assert client.get("/v1/sensing/rails").status_code == 200


def test_the_default_is_to_require_authentication() -> None:
    """Asserted against the field default, not the running settings object.

    The autouse fixture in conftest switches this off for the rest of the
    suite, so reading `settings` here would test the fixture. This reads what a
    process gets when nobody sets the variable.
    """
    field = Settings.model_fields["salvage_auth_required"]
    assert field.default is True


def test_the_store_is_parsed_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "salvage_api_keys", CONFIGURED)
    reset_key_store()
    assert key_store() is key_store()
