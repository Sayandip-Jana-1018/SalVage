"""Mandate lifecycle, and the permanence that makes it useful.

The mandate is where the dataset gets its "the right answer is to stop" rows.
Without them, a policy that retried everything would never be punished for it,
and cost per recovered rupee -- the metric that separates a useful system from
an expensive one -- would have nothing to bite on.
"""

from __future__ import annotations

import statistics

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_DAY
from salvage_sim.latent.mandate import MandateState
from salvage_sim.latent.outcome import FailureCause, Rail
from salvage_sim.latent.world import World


def mandate_holders(world: World, merchant_id: str, count: int) -> list[str]:
    return [
        f"{merchant_id}_cust_{i:07d}"
        for i in range(count)
        if world.mandates.holds_mandate(f"{merchant_id}_cust_{i:07d}")
    ]


def test_roughly_the_configured_share_of_customers_hold_a_mandate(
    world: World, calibration: Calibration
) -> None:
    sample = 4000
    holders = len(mandate_holders(world, "merchant_000", sample))
    expected = calibration.mandates.share_of_customers
    observed = holders / sample
    assert abs(observed - expected) < 0.02, (
        f"{observed:.4f} of customers hold a mandate, expected about {expected}"
    )


def test_mandates_predate_the_simulation_window(world: World) -> None:
    """Otherwise no mandate would ever expire inside a thirty-day run.

    With a mean lifetime of over a year, a book of freshly-created mandates
    produces zero expiries in any run short enough to be practical, and the
    permanent-failure rows would simply not exist.
    """
    holders = mandate_holders(world, "merchant_000", 2000)
    assert holders
    ages = []
    for customer_id in holders[:200]:
        index = int(customer_id.rsplit("_", 1)[-1])
        mandate = world.mandates.create_for(world.customers.customer("merchant_000", index))
        ages.append(-mandate.created_at / SECONDS_PER_DAY)

    assert all(age > 0 for age in ages), "some mandates were created after the run began"
    assert statistics.mean(ages) > 30.0


def test_some_mandates_die_inside_the_window(world: World) -> None:
    holders = mandate_holders(world, "merchant_000", 4000)
    horizon = world.horizon_seconds
    dead_at_end = 0
    alive_at_start = 0
    for customer_id in holders:
        index = int(customer_id.rsplit("_", 1)[-1])
        mandate = world.mandates.create_for(world.customers.customer("merchant_000", index))
        if mandate.state_at(0.0) is MandateState.ACTIVE:
            alive_at_start += 1
            if mandate.is_permanently_dead_at(horizon):
                dead_at_end += 1

    assert alive_at_start > 0
    assert dead_at_end > 0, (
        "no mandate that was alive at the start of the run had died by the end. "
        "The dataset would contain no permanent failures at all."
    )


def test_revocation_takes_precedence_over_expiry(world: World) -> None:
    """A customer who cancelled must be reported as having cancelled.

    Reporting it as an expiry would lose the one fact that matters: they
    actively said no, and contacting them again is not merely futile.
    """
    holders = mandate_holders(world, "merchant_000", 6000)
    checked = 0
    for customer_id in holders:
        index = int(customer_id.rsplit("_", 1)[-1])
        mandate = world.mandates.create_for(world.customers.customer("merchant_000", index))
        if mandate.revoked_at is None:
            continue
        checked += 1
        assert mandate.revoked_at < mandate.expires_at
        after_both = max(mandate.revoked_at, mandate.expires_at) + SECONDS_PER_DAY
        assert mandate.state_at(after_both) is MandateState.REVOKED
    assert checked > 0, "no revoked mandates in the sample"


def test_debits_are_scheduled_regardless_of_mandate_state(world: World) -> None:
    """The schedule and the mandate status are two different systems.

    Filtering debits by state here would delete the most instructive failures
    in the dataset -- the ones where a merchant charges a mandate that was
    cancelled last week.
    """
    holders = mandate_holders(world, "merchant_000", 6000)
    horizon = world.horizon_seconds
    found_dead_debit = False
    for customer_id in holders:
        index = int(customer_id.rsplit("_", 1)[-1])
        mandate = world.mandates.create_for(world.customers.customer("merchant_000", index))
        for t in mandate.debit_times(horizon):
            if mandate.is_permanently_dead_at(t):
                found_dead_debit = True
                break
        if found_dead_debit:
            break
    assert found_dead_debit, "no debit was ever attempted against a dead mandate"


def test_a_dead_mandate_fails_on_every_rail_at_every_time(world: World) -> None:
    """The permanence, asserted directly against the outcome model."""
    holders = mandate_holders(world, "merchant_000", 6000)
    horizon = world.horizon_seconds
    checked = 0
    for customer_id in holders:
        index = int(customer_id.rsplit("_", 1)[-1])
        customer = world.customers.customer("merchant_000", index)
        mandate = world.mandates.create_for(customer)
        if not mandate.is_permanently_dead_at(horizon):
            continue
        checked += 1
        expected = (
            FailureCause.MANDATE_REVOKED
            if mandate.state_at(horizon) is MandateState.REVOKED
            else FailureCause.MANDATE_EXPIRED
        )
        for issuer_id, method in world.calibration.rails():
            outcome = world.outcomes.evaluate(
                customer=customer,
                rail=Rail(issuer_id=issuer_id, method=method),
                mandate=mandate,
                t=horizon,
                attempt_key=f"probe_{customer_id}_{issuer_id}_{method}",
            )
            assert not outcome.succeeded
            assert outcome.cause is expected
        if checked >= 20:
            break
    assert checked > 0


def test_debit_days_are_spread_across_the_cycle(world: World) -> None:
    """A book that all fires on the same day would produce a sawtooth.

    Any daily aggregate over recurring traffic would then be dominated by that
    artefact rather than by anything the simulator is trying to model.
    """
    holders = mandate_holders(world, "merchant_000", 4000)
    first_debit_days = []
    for customer_id in holders[:500]:
        index = int(customer_id.rsplit("_", 1)[-1])
        mandate = world.mandates.create_for(world.customers.customer("merchant_000", index))
        first_debit_days.append(mandate.first_debit_at / SECONDS_PER_DAY)

    assert first_debit_days
    assert max(first_debit_days) - min(first_debit_days) > 20.0, (
        "mandate first debits span less than three weeks of a thirty-day cycle"
    )
