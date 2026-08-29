"""Every emitted event must satisfy the contract salvage-core enforces.

The simulator is not a toy attached to the side of the system: its output is
meant to be publishable straight onto ``salvage.payment-failed.v1`` and
ingested by the real consumer. If it drifts from the schema, that is not
discovered here -- it is discovered when a demo drops every message on the
floor with a validation error.

The schema is read from ``contracts/events/`` rather than copied, so the two
cannot diverge. The consumer validates against the same file at runtime, and
its ``additionalProperties: false`` means a field the simulator adds without
adding it to the contract fails here first.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from jsonschema.protocols import Validator

from salvage_sim.generate.events import PROVIDER
from salvage_sim.simulator import Simulation

SCHEMA_PATH = ("contracts", "events", "payment_failed.v1.schema.json")


@pytest.fixture(scope="module")
def validator(repo: pathlib.Path) -> Validator:
    path = repo.joinpath(*SCHEMA_PATH)
    assert path.is_file(), f"contract not found at {path}"
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


@pytest.fixture(scope="module")
def events(small_run: Simulation) -> list[dict[str, Any]]:
    return [event for event, _, _, _ in small_run.stream()]


def test_the_sweep_is_not_empty(events: list[dict[str, Any]]) -> None:
    assert len(events) >= 100, f"only {len(events)} events; the sweep proves little"


def test_every_event_validates(validator: Validator, events: list[dict[str, Any]]) -> None:
    failures: list[str] = []
    for event in events:
        errors = sorted(validator.iter_errors(event), key=lambda e: list(e.absolute_path))
        if errors:
            failures.append(
                f"{event.get('payment_attempt_id')}: "
                + "; ".join(f"{list(e.absolute_path)}: {e.message}" for e in errors)
            )
            if len(failures) >= 5:
                break
    assert not failures, "events violate payment_failed.v1:\n" + "\n".join(failures)


def test_events_are_json_serialisable_without_coercion(
    events: list[dict[str, Any]],
) -> None:
    """No ``default=`` fallback.

    ``json.dumps(..., default=str)`` would happily stringify a datetime or an
    enum and produce something that still validated, hiding the fact that the
    emitter is not returning plain types. The published stream has to be plain
    JSON values already.
    """
    for event in events[:200]:
        json.dumps(event, sort_keys=True)


def test_the_provider_is_marked_simulated(events: list[dict[str, Any]]) -> None:
    """No consumer should ever mistake this for real gateway traffic."""
    assert {event["provider"] for event in events} == {PROVIDER}


def test_error_codes_are_visibly_synthetic(events: list[dict[str, Any]]) -> None:
    """The ``SIM_`` prefix is load-bearing, not cosmetic.

    This repository has not verified any real provider's error taxonomy.
    Emitting codes that looked like a real gateway's would be an unsourced
    claim about that gateway, and worse, downstream code would come to depend
    on it.
    """
    codes = {event["provider_error_code"] for event in events}
    assert codes
    assert all(code.startswith("SIM_") for code in codes), sorted(codes)


def test_recurring_events_carry_a_mandate_and_others_do_not(
    events: list[dict[str, Any]],
) -> None:
    for event in events:
        if event["is_recurring"]:
            assert event["mandate_id"], event["payment_attempt_id"]
            assert event["payment_method"] == "emandate"
        else:
            assert event["mandate_id"] is None, event["payment_attempt_id"]


def test_guest_checkouts_carry_no_contact_hashes(events: list[dict[str, Any]]) -> None:
    """A guest has no customer id, so there is nothing to hash and no budget."""
    guests = [event for event in events if event["customer_id"] is None]
    assert guests, "no guest checkouts generated; that path is untested"
    for event in guests:
        assert event["customer_phone_hash"] is None
        assert event["customer_email_hash"] is None


def test_identified_customers_carry_stable_contact_hashes(
    events: list[dict[str, Any]],
) -> None:
    """One customer, one hash, across every order they place.

    Contact deduplication across orders depends on it: two failures from the
    same person must not look like two people to a contact budget.
    """
    by_customer: dict[str, set[str]] = {}
    for event in events:
        customer_id = event["customer_id"]
        if customer_id is None:
            continue
        assert len(event["customer_phone_hash"]) == 64
        by_customer.setdefault(customer_id, set()).add(event["customer_phone_hash"])

    inconsistent = {c: h for c, h in by_customer.items() if len(h) > 1}
    assert not inconsistent, f"customers with multiple phone hashes: {inconsistent}"


def test_amounts_are_positive_integers_in_paise(events: list[dict[str, Any]]) -> None:
    for event in events:
        amount = event["amount_paise"]
        assert isinstance(amount, int) and not isinstance(amount, bool)
        assert amount >= 1
