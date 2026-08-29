"""What happens to an order when nobody intervenes.

This is the **baseline**, and it is the most consequential thing in the
package after the outcome model itself.

A recovery system is only worth what it adds. Some share of failed payments
recover on their own: the customer tries again and it works, or the merchant's
dunning schedule catches a mandate debit two days later once the salary has
landed. If the simulator did not model that, every recovery a policy achieved
would be counted as incremental, and the measured lift would be inflated by
however much the baseline would have recovered anyway -- silently, and by a
large factor.

So the world simulated here contains no Salvage at all. Two things recover
payments in it:

**Customer self-retry.** A share of customers try again after a failure, less
often each time, sometimes switching instrument. Whether the retry succeeds is
the same outcome model as before, evaluated later.

**Merchant dunning.** Recurring debits are retried on a fixed schedule, with
no regard for why they failed. This is what real subscription billing does,
and it means a fixed schedule recovers a genuine share of balance failures for
free -- the bar a policy has to clear on recurring traffic.

Everything downstream subtracts this. The Phase 5 headline metric is
incremental rupees: recovered under the policy, minus recovered here.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass

from salvage_sim.clock import SECONDS_PER_DAY, SECONDS_PER_MINUTE
from salvage_sim.latent.outcome import AttemptOutcome, Rail
from salvage_sim.latent.traffic import Order
from salvage_sim.latent.world import World


class AttemptTrigger(enum.StrEnum):
    """What caused this attempt to be made.

    Recorded because the evaluation has to be able to exclude attempts that
    were not the policy's doing, and because a dataset that cannot tell a
    customer's own retry from an intervention cannot support attribution.
    """

    CHECKOUT = "checkout"
    CUSTOMER_RETRY = "customer_retry"
    MERCHANT_DUNNING = "merchant_dunning"


@dataclass(frozen=True, slots=True)
class Attempt:
    payment_attempt_id: str
    order_id: str
    merchant_id: str
    customer_id: str | None
    sequence: int
    """1-based position within the order's journey."""

    at: float
    trigger: AttemptTrigger
    rail: Rail
    amount_paise: int
    mandate_id: str | None
    outcome: AttemptOutcome

    @property
    def is_recurring(self) -> bool:
        return self.mandate_id is not None


@dataclass(frozen=True, slots=True)
class OrderJourney:
    order: Order
    attempts: tuple[Attempt, ...]

    @property
    def failures(self) -> tuple[Attempt, ...]:
        return tuple(a for a in self.attempts if not a.outcome.succeeded)

    @property
    def succeeded(self) -> bool:
        return any(a.outcome.succeeded for a in self.attempts)

    @property
    def succeeded_at(self) -> float | None:
        for attempt in self.attempts:
            if attempt.outcome.succeeded:
                return attempt.at
        return None

    def recovered_naturally_within(self, failure: Attempt, window_seconds: float) -> bool:
        """Did this order succeed on its own within the window after ``failure``?

        The counterfactual that the incremental metric subtracts. Scoped to a
        window rather than "ever", because a success eleven days later is not
        something any recovery action can claim credit for, and counting it
        would make the baseline look stronger than it is in the same way that
        omitting it makes it look weaker.
        """
        success_at = self.succeeded_at
        if success_at is None:
            return False
        return failure.at < success_at <= failure.at + window_seconds


class JourneySimulator:
    """Runs orders forward through the no-intervention world."""

    def __init__(self, world: World) -> None:
        self._world = world
        self._retry = world.calibration.customers.self_retry
        self._dunning = world.calibration.mandates.dunning_retry_offsets_days

    def run(self, order: Order) -> OrderJourney:
        if order.is_recurring:
            return OrderJourney(order=order, attempts=self._recurring(order))
        return OrderJourney(order=order, attempts=self._checkout(order))

    def _attempt(
        self, order: Order, sequence: int, at: float, rail: Rail, trigger: AttemptTrigger
    ) -> Attempt:
        attempt_id = f"pay_{order.order_id}_{sequence:02d}"
        outcome = self._world.outcomes.evaluate(
            customer=order.customer,
            rail=rail,
            mandate=order.mandate,
            t=at,
            attempt_key=attempt_id,
        )
        return Attempt(
            payment_attempt_id=attempt_id,
            order_id=order.order_id,
            merchant_id=order.merchant_id,
            customer_id=order.customer.customer_id if order.customer else None,
            sequence=sequence,
            at=at,
            trigger=trigger,
            rail=rail,
            amount_paise=order.amount_paise,
            mandate_id=order.mandate.mandate_id if order.mandate else None,
            outcome=outcome,
        )

    def _checkout(self, order: Order) -> tuple[Attempt, ...]:
        rng = self._world.rng
        attempts: list[Attempt] = []
        rail = order.rail
        at = order.created_at

        for sequence in range(1, self._retry.max_attempts_per_order + 1):
            attempt = self._attempt(order, sequence, at, rail, self._trigger_for(sequence))
            attempts.append(attempt)
            if attempt.outcome.succeeded:
                break
            if sequence == self._retry.max_attempts_per_order:
                break

            # Retry propensity decays with each failure. A customer who has
            # been declined three times has usually gone somewhere else.
            probability = self._retry.probability_after_first_failure * (
                self._retry.decay_per_additional_failure ** (sequence - 1)
            )
            if not rng.bernoulli(probability, "latent.journey.retry", attempt.payment_attempt_id):
                break

            delay = rng.lognormal(
                self._retry.delay_minutes_median * SECONDS_PER_MINUTE,
                self._retry.delay_gsd,
                "latent.journey.delay",
                attempt.payment_attempt_id,
            )
            at = attempt.at + delay
            if at > self._world.horizon_seconds:
                # The retry falls outside the run. Truncating rather than
                # simulating past the horizon: an attempt after the end of the
                # window is not observable in the dataset, and inventing it
                # would put successes in the labels with no matching events.
                break

            if rng.bernoulli(
                self._retry.method_switch_rate,
                "latent.journey.switch",
                attempt.payment_attempt_id,
            ):
                # The customer reaches for a different instrument. The same
                # ranking the policy would use is reused here, because it
                # encodes the same fact: which other rails this payer can
                # actually reach. It is not a claim that customers optimise.
                alternatives = self._world.alternative_rails(rail, limit=1)
                if alternatives:
                    rail = alternatives[0]

        return tuple(attempts)

    @staticmethod
    def _trigger_for(sequence: int) -> AttemptTrigger:
        return AttemptTrigger.CHECKOUT if sequence == 1 else AttemptTrigger.CUSTOMER_RETRY

    def _recurring(self, order: Order) -> tuple[Attempt, ...]:
        """One scheduled debit, then the merchant's dunning schedule.

        The schedule is fixed and fires regardless of the failure cause, which
        is deliberate: dunning against an expired or revoked mandate is
        exactly the waste that a policy able to read the mandate state should
        be able to avoid, and it cannot be measured if the simulator quietly
        declines to make those attempts.
        """
        attempts = [self._attempt(order, 1, order.created_at, order.rail, AttemptTrigger.CHECKOUT)]
        if attempts[0].outcome.succeeded:
            return tuple(attempts)

        for index, offset_days in enumerate(self._dunning, start=2):
            at = order.created_at + offset_days * SECONDS_PER_DAY
            if at > self._world.horizon_seconds:
                break
            attempt = self._attempt(order, index, at, order.rail, AttemptTrigger.MERCHANT_DUNNING)
            attempts.append(attempt)
            if attempt.outcome.succeeded:
                break
        return tuple(attempts)
