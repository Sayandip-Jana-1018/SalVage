"""The observation layer: what a merchant's event stream actually contains.

This package reads :mod:`salvage_sim.latent` and distorts it. Nothing in
:mod:`salvage_sim.labels` may import from here, directly or transitively --
that is the no-leakage property, and it is enforced by
``tests/test_leakage_architecture.py``.
"""

from salvage_sim.generate.events import (
    EVENT_VERSION,
    GENERIC_ERROR_CODE,
    PROVIDER,
    UNKNOWN_ISSUER,
    EventEmitter,
    event_id_for,
)

__all__ = [
    "EVENT_VERSION",
    "GENERIC_ERROR_CODE",
    "PROVIDER",
    "UNKNOWN_ISSUER",
    "EventEmitter",
    "event_id_for",
]
