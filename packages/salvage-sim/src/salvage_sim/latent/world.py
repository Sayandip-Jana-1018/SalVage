"""The latent world: everything that is true, whether or not anyone observes it.

This is the boundary that the no-leakage property is built on. Everything in
this package is ground truth. Nothing in it knows what an event looks like,
what fields a feature reads, or that an observation layer exists at all.

Both consumers hang off this object:

- :mod:`salvage_sim.generate` reads the world, applies the observation layer,
  and emits the noisy, delayed, partial event stream a merchant would actually
  receive.
- :mod:`salvage_sim.labels` reads the world directly and emits counterfactual
  labels.

Dependence therefore flows ``latent -> {features, labels}`` and never
``features -> labels``. ``tests/test_leakage_architecture.py`` enforces that as
an import-graph property rather than trusting this comment.
"""

from __future__ import annotations

from dataclasses import dataclass

from salvage_sim.calibration import Calibration, PaymentMethod
from salvage_sim.clock import SECONDS_PER_DAY, SimClock
from salvage_sim.latent.customer import Customer, CustomerPopulation
from salvage_sim.latent.health import RailHealth
from salvage_sim.latent.mandate import Mandate, MandateBook
from salvage_sim.latent.outcome import OutcomeModel, Rail
from salvage_sim.rng import KeyedRandom


@dataclass(frozen=True, slots=True)
class Merchant:
    merchant_id: str
    volume_multiplier: float
    """Scales this merchant's share of ``base_attempts_per_merchant_per_day``.

    Merchant volume is heavily skewed in reality, and a run where every
    merchant is the same size would make the cross-tenant pooling of ADR-0007
    look better than it is: pooling helps most precisely when some tenants are
    too small to see an outage on their own traffic.
    """


class World:
    """Composed latent state for one simulation run.

    Construction does all the sequential work -- running the Markov chains --
    after which every query is a pure lookup or a keyed draw, at any time, in
    any order.
    """

    def __init__(
        self,
        calibration: Calibration,
        clock: SimClock,
        rng: KeyedRandom,
        horizon_days: float,
        merchant_count: int,
    ) -> None:
        if horizon_days <= 0.0:
            raise ValueError("horizon_days must be positive")
        if merchant_count < 1:
            raise ValueError("merchant_count must be at least 1")

        self.calibration = calibration
        self.clock = clock
        self.rng = rng
        self.horizon_seconds = horizon_days * SECONDS_PER_DAY

        # The health chains run past the horizon by the longest counterfactual
        # offset. Without the margin, a label asking about a retry three days
        # after a failure near the end of the run would fall off the end of the
        # trajectory and silently read the final state instead of a simulated
        # one, biasing the last three days of every dataset.
        longest_offset_seconds = max(calibration.counterfactual.offsets_minutes) * 60.0
        self.health = RailHealth(calibration, rng, self.horizon_seconds + longest_offset_seconds)

        self.customers = CustomerPopulation(calibration, clock, rng)
        self.mandates = MandateBook(calibration, clock, rng, self.horizon_seconds)
        self.outcomes = OutcomeModel(calibration, self.health, self.customers, rng)

        self.merchants = tuple(
            Merchant(
                merchant_id=f"merchant_{index:03d}",
                volume_multiplier=rng.lognormal(
                    1.0,
                    calibration.traffic.merchant_volume_gsd,
                    "latent.merchant.volume",
                    index,
                ),
            )
            for index in range(merchant_count)
        )

    def merchant(self, merchant_id: str) -> Merchant:
        for merchant in self.merchants:
            if merchant.merchant_id == merchant_id:
                return merchant
        raise KeyError(f"no merchant {merchant_id!r}")

    def mandate_for(self, customer: Customer) -> Mandate | None:
        if not self.mandates.holds_mandate(customer.customer_id):
            return None
        return self.mandates.create_for(customer)

    def customers_per_merchant(self, merchant: Merchant) -> int:
        """Customer base size, scaled with the merchant's volume.

        A fixed base size across merchants would give a small merchant the
        same twelve thousand customers as a large one over a fraction of the
        orders, so its repeat-purchase rate would be near zero while the large
        merchant's was high -- an artefact of the simulator, not of anything
        real. Scaling with volume keeps orders-per-customer roughly constant,
        which is the quantity that ought to be comparable.
        """
        base = self.calibration.customers.per_merchant
        return max(1, round(base * merchant.volume_multiplier))

    def alternative_rails(self, rail: Rail, limit: int) -> tuple[Rail, ...]:
        """Rails a policy could plausibly switch to, best first.

        "Best" here means most likely to carry the traffic, approximated by
        the issuer's share, with two constraints that reflect what a real
        router can and cannot do:

        - A different **method** on the same issuer is a genuine alternative:
          the customer has a UPI handle and a card at the same bank.
        - A different **issuer** on the same method is only an alternative for
          methods where the payer picks the rail at authorisation time. For a
          card, the issuer is fixed by the card in the customer's hand; no
          amount of routing changes which bank issued it. Offering
          "same method, different issuer" for cards would be a fiction, and a
          policy trained on it would learn an action that does not exist.

        Ordering is deterministic, so the same failure always yields the same
        alternatives and labels indexed by position stay meaningful.
        """
        if limit <= 0:
            return ()

        payer_chooses_issuer = rail.method in ("upi", "netbanking", "wallet")
        candidates: list[tuple[float, Rail]] = []

        for issuer in self.calibration.issuers:
            for method in sorted(issuer.supported_methods):
                candidate = Rail(issuer_id=issuer.id, method=method)
                if candidate == rail:
                    continue
                if method == "emandate":
                    # A mandate debit is not something a recovery action can
                    # switch *to*: it requires a registered mandate, which the
                    # customer either has or does not.
                    continue
                same_issuer = issuer.id == rail.issuer_id
                if not same_issuer and method == rail.method and not payer_chooses_issuer:
                    continue
                # Same-issuer alternatives rank above cross-issuer ones: the
                # customer is known to bank there.
                score = issuer.traffic_share + (1.0 if same_issuer else 0.0)
                candidates.append((score, candidate))

        candidates.sort(key=lambda pair: (-pair[0], str(pair[1])))
        return tuple(candidate for _, candidate in candidates[:limit])

    def supports(self, issuer_id: str, method: PaymentMethod) -> bool:
        return self.health.carries(issuer_id, method)
