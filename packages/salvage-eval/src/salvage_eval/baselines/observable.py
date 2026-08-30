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
    """Causes no retry and no rail switch can fix.

    A dead mandate or a dead instrument fails on every rail at every delay.
    Spending money retrying one is pure loss, which is why the policies below
    treat this as a hard stop rather than a low probability.
    """
    return cause in (ObservedCause.MANDATE_DEAD, ObservedCause.INSTRUMENT_DEAD)
