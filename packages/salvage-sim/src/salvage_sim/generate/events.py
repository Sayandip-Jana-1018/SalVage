"""The observation layer: turning latent failures into the events a merchant sees.

Everything in :mod:`salvage_sim.latent` is what is true. This module is what is
*reported*, and the difference between the two is the whole difficulty of the
problem. A gateway's event stream is late, incomplete, and often wrong about
the reason. A system built against a clean stream will not survive contact
with a real one.

Three distortions are applied, all controlled by the ``observation`` block of
``calibration.yaml``:

**Delay.** The event carries the time the provider observed the failure, which
trails the failure itself. Anything computing a rate over a recent window has
to cope with a partially-filled tail.

**Error-code corruption.** A share of events report a generic code instead of
the specific one. This is the single most important distortion here. The
latent-to-code mapping below is far cleaner than reality -- one cause, one code
-- and without corruption a model could recover the true cause exactly by
reading one string, which would make the diagnosis problem trivial and the
evaluation meaningless. ``generic_error_code_rate`` is the dial that makes the
problem real.

**Missing fields.** The issuer is sometimes not identified; instrument details
are sometimes absent. Features have to degrade rather than fail.

None of these may touch a label. They are the parameters
``tests/test_leakage_invariance.py`` perturbs.

On the error codes themselves
-----------------------------

``provider`` is always ``simulated`` and every code is prefixed ``SIM_``. This
repository has not verified any real gateway's error taxonomy, and emitting
codes that looked like Razorpay's or anyone else's would be an unsourced claim
about a real system dressed up as data -- and worse, one that downstream code
might come to depend on. Phase 3 builds the normaliser that maps real provider
codes onto a taxonomy; Phase 4 checks that mapping against provider
documentation. Until then these stand alone and are obviously synthetic.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any, Final

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SimClock
from salvage_sim.latent.journey import Attempt
from salvage_sim.latent.outcome import FailureCause
from salvage_sim.rng import KeyedRandom

EVENT_VERSION: Final = 1
PROVIDER: Final = "simulated"
UNKNOWN_ISSUER: Final = "unknown"
GENERIC_ERROR_CODE: Final = "SIM_PAYMENT_FAILED"
GENERIC_ERROR_DESCRIPTION: Final = "Payment failed"

# Derived from a fixed name rather than written out as a literal, so the value
# is reproducible from something legible instead of being a magic constant
# nobody can check.
_EVENT_NAMESPACE: Final = uuid.uuid5(uuid.NAMESPACE_DNS, "salvage.dev")

_ERROR_CODES: Final[dict[FailureCause, tuple[str, str]]] = {
    FailureCause.MANDATE_EXPIRED: (
        "SIM_MANDATE_EXPIRED",
        "The mandate has passed its registered end date",
    ),
    FailureCause.MANDATE_REVOKED: (
        "SIM_MANDATE_REVOKED",
        "The customer has cancelled this mandate",
    ),
    FailureCause.INSTRUMENT_EXPIRED: (
        "SIM_INSTRUMENT_EXPIRED",
        "The payment instrument has expired",
    ),
    FailureCause.INSUFFICIENT_FUNDS: (
        "SIM_INSUFFICIENT_FUNDS",
        "The account does not hold sufficient balance",
    ),
    FailureCause.ISSUER_UNAVAILABLE: (
        "SIM_ISSUER_UNAVAILABLE",
        "The issuing bank did not respond",
    ),
    FailureCause.ISSUER_DEGRADED: (
        "SIM_ISSUER_TIMEOUT",
        "The issuing bank timed out",
    ),
    FailureCause.DECLINED_BY_ISSUER: (
        "SIM_DECLINED_BY_ISSUER",
        "The issuing bank declined the transaction",
    ),
}

# Chosen uniformly, and that is a deliberate refusal rather than an oversight.
# The real market share of card networks and UPI apps in India is a fact about
# the world that this repository has no source for, so putting weights in
# calibration.yaml would mean inventing one. Uniform makes no claim. The
# instrument fields exist here so that consumers exercise the shape of the
# data; nothing in the simulator's causal model reads them.
#
# UPI app names are synthetic for the same reason the issuers are: naming real
# apps and attaching behaviour to them would assert something about them.
_UPI_APPS: Final = ("app_one", "app_two", "app_three", "app_four")
_CARD_NETWORKS: Final = ("visa", "mastercard", "rupay", "amex")
_CARD_TYPES: Final = ("credit", "debit", "prepaid")


def event_id_for(seed: int, payment_attempt_id: str) -> str:
    """A deterministic UUID for an attempt.

    UUIDv5 rather than v4 so a rerun with the same seed produces the same ids,
    which is what makes the whole dataset comparable run to run. The seed is
    part of the name so that two runs with different seeds cannot collide in
    a database that has ingested both -- which would surface as a spurious
    duplicate-event rejection in salvage-core rather than as anything
    recognisable.
    """
    return str(uuid.uuid5(_EVENT_NAMESPACE, f"{seed}:{payment_attempt_id}"))


def _hash_contact(kind: str, customer_id: str) -> str:
    """SHA-256 hex of a synthetic contact detail.

    The simulator never generates a real phone number or address to hash, and
    the hash is over a derived string rather than over anything resembling
    one. The point is to exercise the shape of the field -- 64 hex characters,
    stable per customer, usable for contact deduplication -- not to model
    contact details.
    """
    return hashlib.sha256(f"{kind}:{customer_id}".encode()).hexdigest()


class EventEmitter:
    """Renders latent failures as ``payment_failed.v1`` events.

    Output is a plain ``dict`` matching the committed JSON Schema, ready to be
    serialised to JSONL or published to Kafka. The schema is not loaded here:
    validating on every emit would double the cost of generation, and
    ``tests/test_contract_conformance.py`` validates the output instead, which
    catches the same drift at a time when someone is watching.
    """

    def __init__(self, calibration: Calibration, clock: SimClock, rng: KeyedRandom) -> None:
        self._calibration = calibration
        self._clock = clock
        self._rng = rng
        self._observation = calibration.observation
        self._currency = calibration.simulation.currency

    def emit(self, attempt: Attempt) -> dict[str, Any]:
        cause = attempt.outcome.cause
        if cause is None:
            raise ValueError(
                f"{attempt.payment_attempt_id} succeeded; only failures produce events"
            )

        key = attempt.payment_attempt_id
        observed_at = attempt.at + self._rng.exponential(
            self._observation.event_delay_seconds_mean, "observe.delay", key
        )
        code, description = self._error_code(cause, key)

        event: dict[str, Any] = {
            "event_id": event_id_for(self._rng.seed, key),
            "event_version": EVENT_VERSION,
            "event_timestamp": self._clock.iso(observed_at),
            "merchant_id": attempt.merchant_id,
            "order_id": attempt.order_id,
            "payment_attempt_id": key,
            "amount_paise": attempt.amount_paise,
            "currency": self._currency,
            "payment_method": attempt.rail.method,
            "provider": PROVIDER,
            "provider_error_code": code,
            "provider_error_description": description,
            "issuer": self._issuer(attempt, key),
            "customer_id": attempt.customer_id,
            "is_recurring": attempt.is_recurring,
            "mandate_id": attempt.mandate_id,
            "metadata": {
                # Passed through opaquely by salvage-core and never used in
                # decision logic. Carrying the attempt's position in its
                # journey here makes a generated dataset self-describing
                # without adding a field to the contract.
                "sim_attempt_sequence": str(attempt.sequence),
                "sim_trigger": attempt.trigger.value,
            },
        }

        if attempt.customer_id is not None:
            event["customer_phone_hash"] = _hash_contact("phone", attempt.customer_id)
            event["customer_email_hash"] = _hash_contact("email", attempt.customer_id)
        else:
            event["customer_phone_hash"] = None
            event["customer_email_hash"] = None

        event.update(self._instrument_details(attempt, key))
        return event

    def _error_code(self, cause: FailureCause, key: str) -> tuple[str, str]:
        if self._rng.bernoulli(
            self._observation.generic_error_code_rate, "observe.generic_code", key
        ):
            return GENERIC_ERROR_CODE, GENERIC_ERROR_DESCRIPTION
        return _ERROR_CODES[cause]

    def _issuer(self, attempt: Attempt, key: str) -> str:
        if self._rng.bernoulli(
            self._observation.issuer_unknown_rate, "observe.issuer_missing", key
        ):
            # A string rather than null: the contract requires a non-empty
            # issuer, and the real-world equivalent is a gateway reporting an
            # unrecognised BIN, not omitting the field.
            return UNKNOWN_ISSUER
        return attempt.rail.issuer_id

    def _instrument_details(self, attempt: Attempt, key: str) -> dict[str, Any]:
        """Card and UPI details, sometimes absent.

        The three fields are always present as keys, null when not applicable
        or not reported. Emitting the key with a null is what the contract
        describes and what a gateway does; omitting it entirely would make a
        consumer unable to distinguish "not a card" from "field not sent".
        """
        details: dict[str, Any] = {"card_network": None, "card_type": None, "upi_app": None}
        missing = self._rng.bernoulli(
            self._observation.instrument_detail_missing_rate, "observe.instrument", key
        )
        if missing:
            return details

        method = attempt.rail.method
        if method == "card":
            details["card_network"] = _CARD_NETWORKS[
                self._rng.choice_index((1.0,) * len(_CARD_NETWORKS), "observe.card_network", key)
            ]
            details["card_type"] = _CARD_TYPES[
                self._rng.choice_index((1.0,) * len(_CARD_TYPES), "observe.card_type", key)
            ]
        elif method == "upi":
            details["upi_app"] = _UPI_APPS[
                self._rng.choice_index((1.0,) * len(_UPI_APPS), "observe.upi_app", key)
            ]
        return details
