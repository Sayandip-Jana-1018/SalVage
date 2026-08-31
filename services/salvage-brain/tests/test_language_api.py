"""The HTTP surface, with the provider replaced by a double.

Overriding ``language_model_dependency`` is what lets these run with no key, no
network and no bill, while still exercising the real routes, the real request
validation and the real status mapping. Nothing else is stubbed: the triage
guard, the copy validators and the response models are the shipped ones.

The status codes are the point. A model that answers with something unusable is
a *bad gateway*, not a bad request from the caller and not an internal error --
the caller did nothing wrong and neither did this service.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from language_doubles import ScriptedModel, UnavailableModel
from salvage_brain.language.routes import language_model_dependency
from salvage_brain.main import create_app

VALID_PROPOSAL = {
    "proposed_taxonomy_code": "ISSUER_OUTAGE",
    "is_retryable_same_rail": False,
    "is_retryable_alternative_rail": True,
    "rationale": "The description says the beneficiary institution is unreachable.",
    "specification_to_check": "NPCI UPI Procedural Guidelines",
}

GOOD_COPY = "Your payment of {amount} to {merchant} did not go through. Please try again."

NUDGE_BODY = {
    "merchant_display_name": "Demo Merchant",
    "amount_paise": 185000,
    "language": "ta",
    "channel": "SMS",
    "taxonomy_code": "INSUFFICIENT_FUNDS",
}


def client_with(model: object) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[language_model_dependency] = lambda: model
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def triage_client() -> Iterator[TestClient]:
    yield from client_with(ScriptedModel(json.dumps(VALID_PROPOSAL)))


def test_triage_returns_a_proposal_that_says_it_is_not_applied(
    triage_client: TestClient,
) -> None:
    response = triage_client.post(
        "/v1/language/triage",
        json={"provider_error_code": "ZZ42", "provider_error_description": None},
    )
    assert response.status_code == 200

    body = response.json()
    assert body["applied"] is False
    assert body["status"] == "PROPOSED_PENDING_HUMAN_REVIEW"
    assert body["current_mapping"] == "UNKNOWN"
    assert body["proposal"]["proposed_taxonomy_code"] == "ISSUER_OUTAGE"


def test_triage_refuses_a_code_the_mapper_already_resolves(triage_client: TestClient) -> None:
    response = triage_client.post(
        "/v1/language/triage", json={"provider_error_code": "SIM_ISSUER_TIMEOUT"}
    )
    assert response.status_code == 409
    assert "already maps" in response.json()["detail"]


def test_triage_rejects_an_unknown_request_field(triage_client: TestClient) -> None:
    """`extra="forbid"`: a field this service does not read is a caller bug."""
    response = triage_client.post(
        "/v1/language/triage",
        json={"provider_error_code": "ZZ42", "apply": True},
    )
    assert response.status_code == 422


def test_a_model_answering_with_rubbish_is_a_bad_gateway() -> None:
    for client in client_with(ScriptedModel("I think it's probably a timeout?")):
        response = client.post("/v1/language/triage", json={"provider_error_code": "ZZ42"})
        assert response.status_code == 502
        assert "did not return JSON" in response.json()["detail"]


def test_a_provider_that_does_not_answer_is_unavailable() -> None:
    for client in client_with(UnavailableModel()):
        response = client.post("/v1/language/triage", json={"provider_error_code": "ZZ42"})
        assert response.status_code == 503


def test_nudge_copy_renders_the_amount_this_service_formatted() -> None:
    for client in client_with(ScriptedModel(GOOD_COPY)):
        response = client.post("/v1/language/nudge-copy", json=NUDGE_BODY)
        assert response.status_code == 200

        body = response.json()
        assert body["rendered_amount"] == "₹1,850.00"
        assert "₹1,850.00" in body["rendered"]
        assert body["sent"] is False


def test_nudge_copy_containing_a_digit_is_refused_at_the_edge() -> None:
    for client in client_with(ScriptedModel("Pay 1850 to {merchant} now. {amount}")):
        response = client.post("/v1/language/nudge-copy", json=NUDGE_BODY)
        assert response.status_code == 502
        assert "contains a digit" in response.json()["detail"]


def test_an_unsupported_language_is_rejected_before_any_call() -> None:
    """The language set is bounded, and the boundary is enforced by the request model."""
    for client in client_with(ScriptedModel(GOOD_COPY)):
        response = client.post("/v1/language/nudge-copy", json={**NUDGE_BODY, "language": "fr"})
        assert response.status_code == 422
