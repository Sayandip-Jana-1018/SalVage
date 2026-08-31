"""Shared fixtures.

The important one here is the rail-tracker reset. ``default_rail_tracker`` is
a module-level singleton holding every outcome the process has observed, so
without this a test that ingests traffic on a second rail changes what a later
test's policy decision looks like -- the optimiser only offers ``SWITCH_RAIL``
when a healthy alternative has actually been observed.

That surfaced as a test which passed alone and failed in the suite, which is
the worst way for it to surface. Resetting between tests makes each one a
statement about the code rather than about the order pytest happened to
choose.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from salvage_brain.auth import reset_key_store
from salvage_brain.config import settings


@pytest.fixture(autouse=True)
def reset_rail_tracker() -> Iterator[None]:
    """Clear observed rail health before and after every test."""
    from salvage_brain.sensing.tracker import default_rail_tracker

    default_rail_tracker._events.clear()
    yield
    default_rail_tracker._events.clear()


@pytest.fixture(autouse=True)
def unauthenticated_by_default(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Most tests are about what a route computes, not about the gate in front of it.

    Switching authentication off here keeps those tests reading as statements
    about the handler. What stops that from hiding a route somebody forgot to
    protect is ``tests/test_auth.py::test_every_route_requires_authentication``,
    which walks the mounted application and fails on any endpoint that does not
    depend on ``authenticate`` and is not on an explicit allowlist. The tests
    that are about the gate switch it back on themselves.
    """
    monkeypatch.setattr(settings, "salvage_auth_required", False)
    monkeypatch.setattr(settings, "salvage_api_keys", "")
    reset_key_store()
    yield
    reset_key_store()
