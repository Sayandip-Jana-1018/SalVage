"""Typed, validated access to ``calibration.yaml``.

ADR-0006 makes ``calibration.yaml`` the single home for every calibration
number in the simulator. This module is the only thing that reads it. Two
properties follow, and both are enforced here rather than by convention:

1. **Nothing outside the YAML file is a calibration value.** Every field below
   is required. There are no defaults in this module, because a default here
   would be a calibration value living in Python, which is the thing the ADR
   forbids. A missing key is an error, not a fallback.

2. **A bad calibration file fails at load, not mid-run.** Shares that do not
   sum to one, probabilities outside [0, 1], negative rates, a method
   referenced by an issuer that does not exist -- all rejected before a single
   event is generated. Fail closed.

The models are frozen. A simulation run must not be able to mutate its own
calibration halfway through, or the manifest's calibration hash would describe
something that did not happen.
"""

from __future__ import annotations

import hashlib
import os
import pathlib
from datetime import datetime
from typing import Annotated, Any, Literal, Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

CALIBRATION_FILENAME = "calibration.yaml"
CALIBRATION_PATH_ENV = "SALVAGE_SIM_CALIBRATION"

# The tolerance on "these shares sum to one". Tight enough to catch a typo,
# loose enough to accept values a human wrote out to two decimal places.
_SHARE_SUM_TOLERANCE = 1e-9

Probability = Annotated[float, Field(ge=0.0, le=1.0)]
PositiveRate = Annotated[float, Field(gt=0.0)]
NonNegative = Annotated[float, Field(ge=0.0)]

PaymentMethod = Literal["upi", "card", "netbanking", "wallet", "emandate"]


class _Frozen(BaseModel):
    """Base for every calibration model.

    ``extra="forbid"`` is the important part. A key the loader does not know
    about is almost always a typo or a parameter someone added to the YAML and
    then wired up nowhere, and either way silently ignoring it means the file
    no longer describes the run.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")


class SimulationSettings(_Frozen):
    timezone: str
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    default_start: datetime

    @model_validator(mode="after")
    def _start_must_be_absolute(self) -> Self:
        if self.default_start.tzinfo is None:
            raise ValueError("simulation.default_start must carry an explicit UTC offset")
        return self


class AttributionSettings(_Frozen):
    window_hours: PositiveRate
    max_attributed_actions_per_order: int = Field(ge=1)


class ObservationSettings(_Frozen):
    """Feature-only nuisance. See the header of this section in the YAML.

    Nothing in :mod:`salvage_sim.labels` may read this model. The import
    whitelist in ``tests/test_leakage_architecture.py`` permits the labels
    package to import :mod:`salvage_sim.calibration` as a whole, so that test
    alone would not catch a violation here -- which is exactly why the
    invariance test exists as well.
    """

    event_delay_seconds_mean: PositiveRate
    generic_error_code_rate: Probability
    issuer_unknown_rate: Probability
    instrument_detail_missing_rate: Probability


class FestivalWindow(_Frozen):
    name: str
    start_month: int = Field(ge=1, le=12)
    start_day: int = Field(ge=1, le=31)
    duration_days: int = Field(ge=1)
    peak_multiplier: float = Field(ge=1.0)


class TrafficSettings(_Frozen):
    base_attempts_per_merchant_per_day: PositiveRate
    merchant_volume_gsd: float = Field(gt=1.0)
    hour_of_day_weights: list[NonNegative] = Field(min_length=24, max_length=24)
    day_of_week_weights: list[NonNegative] = Field(min_length=7, max_length=7)
    festival_windows: list[FestivalWindow]

    @model_validator(mode="after")
    def _weights_must_not_be_all_zero(self) -> Self:
        # Normalisation divides by the mean, so an all-zero curve is a
        # division by zero at load rather than a mysterious NaN at hour 3.
        for name, weights in (
            ("hour_of_day_weights", self.hour_of_day_weights),
            ("day_of_week_weights", self.day_of_week_weights),
        ):
            if sum(weights) <= 0.0:
                raise ValueError(f"traffic.{name} must contain at least one non-zero weight")
        return self

    def normalised_hour_weights(self) -> tuple[float, ...]:
        """Hour weights scaled to mean 1.0, so shape and volume are separable."""
        mean = sum(self.hour_of_day_weights) / 24.0
        return tuple(w / mean for w in self.hour_of_day_weights)

    def normalised_day_weights(self) -> tuple[float, ...]:
        mean = sum(self.day_of_week_weights) / 7.0
        return tuple(w / mean for w in self.day_of_week_weights)


class MethodSettings(_Frozen):
    traffic_share: Probability
    base_failure_rate: Probability
    amount_median_rupees: PositiveRate
    # Geometric standard deviation of a lognormal. Must exceed 1.0; at exactly
    # 1.0 the distribution collapses to a point mass and log(gsd) is zero.
    amount_gsd: float = Field(gt=1.0)


class IssuerSettings(_Frozen):
    id: str = Field(min_length=1, max_length=128)
    archetype: str = Field(min_length=1)
    traffic_share: Probability
    reliability_multiplier: PositiveRate
    supported_methods: list[PaymentMethod] = Field(min_length=1)

    @model_validator(mode="after")
    def _methods_must_be_distinct(self) -> Self:
        if len(set(self.supported_methods)) != len(self.supported_methods):
            raise ValueError(f"issuer {self.id} lists a supported method twice")
        return self


class IssuerStressSettings(_Frozen):
    onset_per_day: PositiveRate
    recovery_per_hour: PositiveRate
    stress_rate_multiplier: float = Field(ge=1.0)


class RailTransitionSettings(_Frozen):
    healthy_to_degraded_per_day: PositiveRate
    degraded_to_down_per_hour: PositiveRate
    degraded_to_healthy_per_hour: PositiveRate
    down_to_degraded_per_hour: PositiveRate


class SuccessMultiplierSettings(_Frozen):
    healthy: Probability
    degraded: Probability
    down: Probability

    @model_validator(mode="after")
    def _must_be_monotone(self) -> Self:
        # A degraded rail that succeeds more often than a healthy one is not a
        # calibration choice, it is a mistake. Catching it here saves a long
        # afternoon wondering why the policy learned to prefer outages.
        if not self.healthy >= self.degraded >= self.down:
            raise ValueError(
                "rail_health.success_multiplier must be non-increasing "
                "from healthy through degraded to down"
            )
        return self


class RailHealthSettings(_Frozen):
    issuer_stress: IssuerStressSettings
    rail: RailTransitionSettings
    success_multiplier: SuccessMultiplierSettings


class SalaryCycleSettings(_Frozen):
    payday_weights: dict[int, NonNegative]
    trough_rate: Probability
    peak_rate: Probability
    days_before_payday_at_peak: int = Field(ge=0, le=28)
    per_customer_gsd: float = Field(gt=1.0)
    balance_state_hours: PositiveRate

    @model_validator(mode="after")
    def _check(self) -> Self:
        if not self.payday_weights:
            raise ValueError("customers.salary_cycle.payday_weights must not be empty")
        for day in self.payday_weights:
            # Day 29 to 31 are excluded deliberately: a payday on the 31st
            # does not exist in most months, and the "which day did it
            # actually fall on" logic that would need is complexity in the
            # simulator that buys nothing the 28th does not already buy.
            if not 1 <= day <= 28:
                raise ValueError(
                    f"payday {day} is outside 1-28; days 29-31 do not occur in every month"
                )
        if sum(self.payday_weights.values()) <= 0.0:
            raise ValueError("customers.salary_cycle.payday_weights must not be all zero")
        if self.peak_rate < self.trough_rate:
            raise ValueError(
                "customers.salary_cycle.peak_rate must be at least trough_rate; "
                "the peak is the leanest point of the cycle"
            )
        return self

    def normalised_payday_weights(self) -> dict[int, float]:
        total = sum(self.payday_weights.values())
        return {day: weight / total for day, weight in self.payday_weights.items()}


class SelfRetrySettings(_Frozen):
    probability_after_first_failure: Probability
    decay_per_additional_failure: Probability
    delay_minutes_median: PositiveRate
    delay_gsd: float = Field(gt=1.0)
    max_attempts_per_order: int = Field(ge=1)
    method_switch_rate: Probability


class CustomerSettings(_Frozen):
    per_merchant: int = Field(ge=1)
    guest_checkout_rate: Probability
    opt_out_rate: Probability
    instrument_expired_rate: Probability
    salary_cycle: SalaryCycleSettings
    self_retry: SelfRetrySettings


class MandateSettings(_Frozen):
    share_of_customers: Probability
    mean_lifetime_days: PositiveRate
    monthly_revocation_rate: Probability
    debit_interval_days: PositiveRate
    debit_day_spread: Probability
    dunning_retry_offsets_days: list[PositiveRate]

    @model_validator(mode="after")
    def _dunning_must_be_sorted_and_distinct(self) -> Self:
        offsets = self.dunning_retry_offsets_days
        if len(set(offsets)) != len(offsets):
            raise ValueError("mandates.dunning_retry_offsets_days contains a duplicate")
        if list(offsets) != sorted(offsets):
            raise ValueError("mandates.dunning_retry_offsets_days must be in ascending order")
        return self


class CounterfactualSettings(_Frozen):
    offsets_minutes: list[NonNegative] = Field(min_length=1)
    alternative_rails_per_failure: int = Field(ge=0)

    @model_validator(mode="after")
    def _offsets_must_be_sorted_and_distinct(self) -> Self:
        # Downstream code indexes labels by position in this list, and the
        # evaluation harness reads them as a time series. Unsorted or
        # duplicated offsets would make both wrong in ways that are hard to
        # see in a JSONL file.
        offsets = self.offsets_minutes
        if len(set(offsets)) != len(offsets):
            raise ValueError("counterfactual.offsets_minutes contains a duplicate")
        if list(offsets) != sorted(offsets):
            raise ValueError("counterfactual.offsets_minutes must be in ascending order")
        return self


class ActionCostSettings(_Frozen):
    """Paise charged for taking an action, recovered or not."""

    retry_immediate: int = Field(ge=0)
    retry_scheduled: int = Field(ge=0)
    switch_rail: int = Field(ge=0)


class ScheduledOffsetSettings(_Frozen):
    """Which counterfactual offset a scheduled retry is scored at."""

    default: float = Field(ge=0)
    issuer_outage: float = Field(ge=0)
    pre_payday_insufficient_funds: float = Field(ge=0)

    def all_offsets(self) -> tuple[float, ...]:
        return (self.default, self.issuer_outage, self.pre_payday_insufficient_funds)


class RecoveryActionSettings(_Frozen):
    """How the evaluation harness scores a counterfactual.

    Read by ``salvage-eval``. The simulator does not consult this block: it
    changes no label, only how a label is turned into a payoff.
    """

    cost_paise: ActionCostSettings
    scheduled_offset_minutes: ScheduledOffsetSettings


class Calibration(_Frozen):
    """The whole calibration file, validated.

    ``source_digest`` is the SHA-256 of the exact bytes this was loaded from.
    Every run manifest records it, so a result can be traced to the parameters
    that produced it even if the file has since been edited.
    """

    schema_version: Literal[1]
    simulation: SimulationSettings
    attribution: AttributionSettings
    observation: ObservationSettings
    traffic: TrafficSettings
    payment_methods: dict[PaymentMethod, MethodSettings]
    issuers: list[IssuerSettings] = Field(min_length=1)
    rail_health: RailHealthSettings
    customers: CustomerSettings
    mandates: MandateSettings
    counterfactual: CounterfactualSettings
    recovery_actions: RecoveryActionSettings

    source_digest: str = Field(min_length=64, max_length=64)
    source_path: pathlib.Path

    @model_validator(mode="after")
    def _cross_field_checks(self) -> Self:
        self._check_method_shares()
        self._check_issuer_shares()
        self._check_every_method_is_reachable()
        self._check_scheduled_offsets_are_labelled()
        return self

    def _check_scheduled_offsets_are_labelled(self) -> None:
        """A scheduled retry can only be scored at an offset that was labelled.

        The simulator evaluates counterfactuals on the grid in
        ``counterfactual.offsets_minutes`` and nowhere else. Naming an offset
        here that is not on that grid would leave the harness with no ground
        truth for the action, and the failure would surface as a missing key
        deep inside an estimator rather than as a bad configuration file.
        """
        labelled = set(self.counterfactual.offsets_minutes)
        for offset in self.recovery_actions.scheduled_offset_minutes.all_offsets():
            if offset not in labelled:
                raise ValueError(
                    f"recovery_actions.scheduled_offset_minutes contains {offset!r}, "
                    f"which is not in counterfactual.offsets_minutes "
                    f"({sorted(labelled)}). A scheduled retry can only be scored at "
                    "an offset the simulator actually labelled."
                )

    def _check_method_shares(self) -> None:
        total = sum(m.traffic_share for m in self.payment_methods.values())
        if abs(total - 1.0) > _SHARE_SUM_TOLERANCE:
            raise ValueError(
                f"payment_methods traffic_share sums to {total!r}, must sum to 1.0. "
                "The loader will not renormalise: a share that does not add up is a "
                "typo, and quietly rescaling it would hide the typo in every result."
            )
        emandate = self.payment_methods.get("emandate")
        if emandate is not None and emandate.traffic_share != 0.0:
            raise ValueError(
                "payment_methods.emandate.traffic_share must be 0.0. Recurring debits "
                "are scheduled by the mandate book, not drawn from the traffic process; "
                "a non-zero share here would double-count them."
            )

    def _check_issuer_shares(self) -> None:
        ids = [issuer.id for issuer in self.issuers]
        if len(set(ids)) != len(ids):
            raise ValueError("issuers contains a duplicate id")
        total = sum(issuer.traffic_share for issuer in self.issuers)
        if abs(total - 1.0) > _SHARE_SUM_TOLERANCE:
            raise ValueError(f"issuers traffic_share sums to {total!r}, must sum to 1.0")

    def _check_every_method_is_reachable(self) -> None:
        """No method may have traffic but no issuer able to carry it.

        Without this the generator would pick a method, find no issuer
        supporting it, and either loop forever or silently skew the mix.
        """
        supported = {m for issuer in self.issuers for m in issuer.supported_methods}
        for method, settings in self.payment_methods.items():
            if settings.traffic_share > 0.0 and method not in supported:
                raise ValueError(
                    f"payment method {method!r} has traffic_share "
                    f"{settings.traffic_share} but no issuer supports it"
                )
        unknown = supported - set(self.payment_methods)
        if unknown:
            raise ValueError(f"issuers reference undefined payment methods: {sorted(unknown)}")

    def issuer(self, issuer_id: str) -> IssuerSettings:
        for issuer in self.issuers:
            if issuer.id == issuer_id:
                return issuer
        raise KeyError(f"no issuer with id {issuer_id!r}")

    def rails(self) -> tuple[tuple[str, PaymentMethod], ...]:
        """Every (issuer, method) pair that can carry traffic.

        This is the unit of health monitoring, matching ``railId()`` in
        salvage-core. Ordering is deterministic so that anything keyed by rail
        index is stable across runs.
        """
        return tuple(
            (issuer.id, method)
            for issuer in self.issuers
            for method in sorted(issuer.supported_methods)
        )


def find_calibration_file(start: pathlib.Path | None = None) -> pathlib.Path:
    """Locate ``calibration.yaml``.

    Resolution order, most explicit first:

    1. ``SALVAGE_SIM_CALIBRATION``, so a run can be pointed at an alternative
       file without editing anything. The tests use this.
    2. Alongside this module, which is where the wheel puts it.
    3. Upward from this module, which is where it sits in the repository: the
       ADR fixes the canonical path at the package root, one level above
       ``src/``. Walking up rather than counting ``parents[n]`` because a
       hardcoded index breaks silently the moment the layout changes -- which
       is a mistake this repository has already made once, in salvage-brain.
    """
    override = os.environ.get(CALIBRATION_PATH_ENV)
    if override:
        path = pathlib.Path(override)
        if not path.is_file():
            raise FileNotFoundError(
                f"{CALIBRATION_PATH_ENV} is set to {override!r} but that is not a file"
            )
        return path

    here = (start or pathlib.Path(__file__)).resolve()
    packaged = here.parent / CALIBRATION_FILENAME
    if packaged.is_file():
        return packaged

    for directory in here.parents:
        candidate = directory / CALIBRATION_FILENAME
        if candidate.is_file():
            return candidate

    raise FileNotFoundError(
        f"could not find {CALIBRATION_FILENAME} beside {here} or in any parent directory; "
        f"set {CALIBRATION_PATH_ENV} to point at it"
    )


def load_calibration(path: pathlib.Path | None = None) -> Calibration:
    """Read, hash, and validate the calibration file.

    The digest is taken over the raw bytes before parsing, so it is a digest
    of what the human wrote rather than of a re-serialised interpretation of
    it. Two runs with the same digest read exactly the same file.
    """
    resolved = path or find_calibration_file()
    raw = resolved.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()

    parsed: Any = yaml.safe_load(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{resolved} does not contain a YAML mapping at the top level")

    return Calibration.model_validate(
        {**parsed, "source_digest": digest, "source_path": resolved},
    )
