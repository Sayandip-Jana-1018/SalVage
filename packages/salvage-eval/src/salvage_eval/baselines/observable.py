"""Reading the failure cause off the event, the way a real policy must.

A policy sees the gateway's error code, not the truth. The simulator's emitter
replaces a share of specific codes with a generic one, so some fraction of
episodes arrive saying only "payment failed". A policy that assumes it always
knows the cause is not solving the problem this system exists to solve.

The codes below are the simulator's own (``SIM_``-prefixed, defined in
``salvage_sim.generate.events``), not any real provider's. This repository has
not verified any gateway's error taxonomy; see
``docs/adr/0006-numbers-policy.md``.
"""

from __future__ import annotations

import enum
from typing import Any


class ObservedCause(enum.StrEnum):
    """What the event's error code suggests, including that it suggests nothing."""

    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    ISSUER_TROUBLE = "ISSUER_TROUBLE"
    DECLINED = "DECLINED"
    INSTRUMENT_DEAD = "INSTRUMENT_DEAD"
    MANDATE_DEAD = "MANDATE_DEAD"
    UNKNOWN = "UNKNOWN"
    """The gateway reported a generic code. Not a cause -- an absence of one."""


_CODE_TO_CAUSE: dict[str, ObservedCause] = {
    "SIM_INSUFFICIENT_FUNDS": ObservedCause.INSUFFICIENT_FUNDS,
    "SIM_ISSUER_UNAVAILABLE": ObservedCause.ISSUER_TROUBLE,
    "SIM_ISSUER_TIMEOUT": ObservedCause.ISSUER_TROUBLE,
    "SIM_DECLINED_BY_ISSUER": ObservedCause.DECLINED,
    "SIM_INSTRUMENT_EXPIRED": ObservedCause.INSTRUMENT_DEAD,
    "SIM_MANDATE_EXPIRED": ObservedCause.MANDATE_DEAD,
    "SIM_MANDATE_REVOKED": ObservedCause.MANDATE_DEAD,
}


def observed_cause(context: dict[str, Any]) -> ObservedCause:
    """Map the event's error code to a coarse cause, or UNKNOWN."""
    return _CODE_TO_CAUSE.get(str(context.get("provider_error_code", "")), ObservedCause.UNKNOWN)


def is_permanent(cause: ObservedCause) -> bool:
    """Causes that no retry and no rail switch can fix.

    Only a dead mandate. The order is terminated; nothing collects on it.

    **This used to include INSTRUMENT_DEAD, and that was wrong.** The fitted
    model found it: over 25 held-out episodes, switching rails after an
    expired-instrument failure recovered 72% of the time, while this function
    was forcing every policy's estimate for that case to 0.0 -- so no policy
    ever switched, and all of that money was left on the table. The simulator
    says so explicitly too, in ``FailureCause.is_permanent``: "the card is
    dead, but the customer is not, and another method will work."

    A hand-written assumption, contradicted by measurement, corrected. That is
    what the fitted model is for.
    """
    return cause is ObservedCause.MANDATE_DEAD


def is_instrument_bound(cause: ObservedCause) -> bool:
    """Causes tied to the instrument rather than to the payer or the rail.

    An expired card will not start working because it was asked twice, so
    retrying the same rail is futile. Moving the payment to a different method
    is precisely the fix -- the customer still has money and still wants to
    pay. Retry and switch therefore need opposite treatment here, which is why
    this is a separate question from :func:`is_permanent` rather than another
    entry in it.
    """
    return cause is ObservedCause.INSTRUMENT_DEAD
