"""What happens when a payment is attempted. The causal core of the simulator.

Everything else in this package feeds this function, and both the real event
stream and the counterfactual labels are produced by calling it. That is not
code reuse for its own sake -- it is the definition of a counterfactual. "Would
a retry have succeeded at 14:20 on a different rail?" means "run the same
mechanism, with the same world, under a different intervention." If the labels
were produced by separate logic they would be answering a different question,
and the evaluation built on them would be measuring nothing.

The four causal structures
--------------------------

The simulator is arranged so that the four common failure types each have a
*different* correct response. This is the whole point; a dataset where retrying
is always right, or always wrong, cannot distinguish a good policy from a
stubborn one.

===========================  ==============  ==============  ==============
Failure                      Wait helps?     Switch rail?    Ever recovers?
===========================  ==============  ==============  ==============
Insufficient funds           yes, after pay  no              yes
Issuer unavailable           yes, minutes    yes             yes
Instrument expired           no              yes             yes
Mandate expired or revoked   no              no              no
===========================  ==============  ==============  ==============

Order of evaluation
-------------------

The checks below run in the order a real authorisation request meets them, and
the order determines which cause is *reported* when more than one applies:

1. **Mandate status** -- validated by the gateway before anything leaves it.
2. **Instrument validity** -- an expired card is rejected at the network.
3. **Rail health** -- the request has to reach the issuer to be judged at all;
   if the issuer is not answering, the balance is never consulted.
4. **Balance** -- the issuer's own decision.
5. **Residual decline** -- risk rules, velocity limits, and everything else an
   issuer declines for. This is the baseline failure rate of a healthy rail.

Reversing 3 and 4 would be the tempting mistake, and it would corrupt the
dataset in a specific way: during an outage, insufficient-funds declines would
be over-reported, and a model would learn that outages cause empty accounts.
"""

from __future__ import annotations

import enum
import math
from dataclasses import dataclass

from salvage_sim.calibration import Calibration, PaymentMethod
from salvage_sim.clock import SECONDS_PER_HOUR
from salvage_sim.latent.customer import Customer, CustomerPopulation
from salvage_sim.latent.health import RailHealth, RailState
from salvage_sim.latent.mandate import Mandate, MandateState
from salvage_sim.rng import KeyedRandom


class FailureCause(enum.StrEnum):
    """The true reason an attempt failed.

    These are the simulator's own names. They are **not** a claim about the
    error codes any real gateway emits: this repository has not verified any
    provider's taxonomy, and inventing one here would be exactly the kind of
    unsourced assertion ADR-0006 forbids. Phase 3 builds the normaliser that
    maps real provider codes onto a taxonomy, and Phase 4 checks that mapping
    against provider documentation. Until then these stand alone, and the
    ``provider`` field on every emitted event says ``simulated`` so that no
    consumer can mistake them for the real thing.
    """

    MANDATE_EXPIRED = "mandate_expired"
    MANDATE_REVOKED = "mandate_revoked"
    INSTRUMENT_EXPIRED = "instrument_expired"
    INSUFFICIENT_FUNDS = "insufficient_funds"
    ISSUER_UNAVAILABLE = "issuer_unavailable"
    ISSUER_DEGRADED = "issuer_degraded"
    DECLINED_BY_ISSUER = "declined_by_issuer"

    @property
    def is_permanent(self) -> bool:
        """True if no amount of waiting or rail-switching can ever help.

        Instrument expiry is deliberately excluded: the card is dead, but the
        customer is not, and another method will work. Only the mandate cases
        are terminal for the order.
        """
        return self in (FailureCause.MANDATE_EXPIRED, FailureCause.MANDATE_REVOKED)

    @property
    def is_rail_specific(self) -> bool:
        """True if the failure is a property of the rail rather than the payer.

        Determines whether switching rails is even in principle useful. Used
        by the tests to assert that the four causal structures above hold in
        the generated data, not just in this docstring.
        """
        return self in (
            FailureCause.ISSUER_UNAVAILABLE,
            FailureCause.ISSUER_DEGRADED,
            FailureCause.DECLINED_BY_ISSUER,
            FailureCause.INSTRUMENT_EXPIRED,
        )


@dataclass(frozen=True, slots=True)
class Rail:
    """An (issuer, method) pair: the unit of health and of routing.

    Matches ``PaymentFailedEvent.railId()`` in salvage-core, which composes
    the same two fields plus the provider. The provider is constant across a
    simulator run, so it is omitted here and added at emission.
    """

    issuer_id: str
    method: PaymentMethod

    def __str__(self) -> str:
        return f"{self.issuer_id}|{self.method}"


@dataclass(frozen=True, slots=True)
class AttemptOutcome:
    succeeded: bool
    cause: FailureCause | None

    def __post_init__(self) -> None:
        if self.succeeded != (self.cause is None):
            raise ValueError("an outcome has a cause if and only if it failed")


SUCCESS = AttemptOutcome(succeeded=True, cause=None)


class OutcomeModel:
    """Evaluates an attempt against the latent world.

    Pure with respect to the world: calling it never advances or mutates
    anything, so a counterfactual query at a future time is free of side
    effects. Every random decision is a keyed draw, so the same question
    always gets the same answer.
    """

    def __init__(
        self,
        calibration: Calibration,
        health: RailHealth,
        customers: CustomerPopulation,
        rng: KeyedRandom,
    ) -> None:
        self._calibration = calibration
        self._health = health
        self._customers = customers
        self._rng = rng
        self._balance_bucket_seconds = (
            calibration.customers.salary_cycle.balance_state_hours * SECONDS_PER_HOUR
        )

    def evaluate(
        self,
        *,
        customer: Customer | None,
        rail: Rail,
        mandate: Mandate | None,
        t: float,
        attempt_key: str,
    ) -> AttemptOutcome:
        """Run one attempt. See the module docstring for the ordering.

        ``customer`` is ``None`` for a guest checkout. Guests have no balance
        history and no mandate, so they skip straight to the rail and residual
        checks -- which is also true of the real thing: the merchant knows
        nothing about them either.
        """
        if mandate is not None:
            match mandate.state_at(t):
                case MandateState.EXPIRED:
                    return AttemptOutcome(False, FailureCause.MANDATE_EXPIRED)
                case MandateState.REVOKED:
                    return AttemptOutcome(False, FailureCause.MANDATE_REVOKED)
                case MandateState.ACTIVE:
                    pass

        if customer is not None and self._instrument_expired(customer, rail):
            return AttemptOutcome(False, FailureCause.INSTRUMENT_EXPIRED)

        rail_outcome = self._rail_check(rail, t, attempt_key)
        if rail_outcome is not None:
            return rail_outcome

        if customer is not None and self._balance_short(customer, t):
            return AttemptOutcome(False, FailureCause.INSUFFICIENT_FUNDS)

        return SUCCESS

    def _instrument_expired(self, customer: Customer, rail: Rail) -> bool:
        """Expired cards only.

        Keyed by customer alone, not by attempt or time, because a dead card
        is dead for the whole run. Keying it by attempt would produce a card
        that failed at 10:00 and worked at 10:05, which is not a thing.
        """
        if rail.method != "card":
            return False
        return self._rng.bernoulli(
            self._calibration.customers.instrument_expired_rate,
            "latent.outcome.instrument",
            customer.customer_id,
        )

    def _rail_check(self, rail: Rail, t: float, attempt_key: str) -> AttemptOutcome | None:
        """Rail health and the residual decline rate, in one draw.

        Combining them is not a shortcut. The rail's success probability is
        the healthy probability scaled by the health multiplier, so a single
        Bernoulli against the scaled value is the correct composition. Drawing
        twice would compound the two and understate success on a healthy rail.

        The reported cause depends on the state the rail was in, which is how
        an outage becomes visible in the error stream at all.
        """
        method = self._calibration.payment_methods[rail.method]
        state = self._health.rail_state(rail.issuer_id, rail.method, t)
        multiplier = self._health.success_multiplier(rail.issuer_id, rail.method, t)
        probability_of_success = (1.0 - method.base_failure_rate) * multiplier

        if self._rng.bernoulli(probability_of_success, "latent.outcome.rail", attempt_key):
            return None

        match state:
            case RailState.DOWN:
                return AttemptOutcome(False, FailureCause.ISSUER_UNAVAILABLE)
            case RailState.DEGRADED:
                return AttemptOutcome(False, FailureCause.ISSUER_DEGRADED)
            case RailState.HEALTHY:
                return AttemptOutcome(False, FailureCause.DECLINED_BY_ISSUER)

    def _balance_short(self, customer: Customer, t: float) -> bool:
        """Does the account cover this debit at time ``t``?

        Keyed by ``(customer, balance bucket)``, deliberately not by attempt.
        Balance is a property of the account at a moment, so two attempts
        close together must get the same answer, and two attempts on
        *different rails* at the same moment must also get the same answer.
        Keying by attempt would break both: an immediate retry would clear a
        decline six times in seven, and switching rails would appear to
        conjure money into the account, which would teach a policy the single
        most expensive wrong lesson available.

        The bucket is a step function, so a retry that crosses a boundary gets
        a fresh draw. That is the intended behaviour -- balances do move -- and
        ``balance_state_hours`` sets how fast.
        """
        bucket = math.floor(t / self._balance_bucket_seconds)
        probability = self._customers.insufficient_funds_probability(customer, t)
        return self._rng.bernoulli(
            probability, "latent.outcome.funds", customer.customer_id, bucket
        )
