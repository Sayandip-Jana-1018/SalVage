"""The calibration file is validated, and a bad one stops the run before it starts.

ADR-0006 makes ``calibration.yaml`` the single home for every calibration
number. That only holds if the loader is strict: a silently-ignored typo means
a value someone believes they set is not the value the run used, and every
result afterwards describes a configuration that never existed.

So the loader fails closed on everything -- unknown keys, missing keys, shares
that do not add up, probabilities out of range, an issuer referencing a method
that does not exist. Each of those is a test here.
"""

from __future__ import annotations

import copy
import pathlib
from typing import Any

import pytest
import yaml
from pydantic import ValidationError

from salvage_sim.calibration import (
    CALIBRATION_PATH_ENV,
    Calibration,
    find_calibration_file,
    load_calibration,
)


@pytest.fixture(scope="module")
def raw() -> dict[str, Any]:
    return yaml.safe_load(find_calibration_file().read_bytes())


def load_variant(tmp_path: pathlib.Path, raw: dict[str, Any], mutate: Any) -> Calibration:
    variant = copy.deepcopy(raw)
    mutate(variant)
    path = tmp_path / "variant.yaml"
    path.write_text(yaml.safe_dump(variant, sort_keys=True), encoding="utf-8")
    return load_calibration(path)


def test_the_shipped_calibration_loads(calibration: Calibration) -> None:
    assert calibration.schema_version == 1
    assert calibration.issuers
    assert calibration.rails()


def test_the_digest_is_over_the_file_bytes(calibration: Calibration) -> None:
    """A digest of a re-serialised parse would change with the YAML library.

    The manifest records this so a result can be traced to the parameters that
    produced it; that only works if it identifies the file a human edited.
    """
    import hashlib

    expected = hashlib.sha256(calibration.source_path.read_bytes()).hexdigest()
    assert calibration.source_digest == expected


def test_unknown_keys_are_rejected(tmp_path: pathlib.Path, raw: dict[str, Any]) -> None:
    """A typo must not be silently ignored.

    ``observatoin: {...}`` next to a real ``observation`` block would leave the
    intended change unapplied, and the run would report a calibration digest
    for a file whose contents it partly did not use.
    """
    with pytest.raises(ValidationError, match=r"[Ee]xtra"):
        load_variant(
            tmp_path, raw, lambda v: v.update({"unexpected_section": {"a": 1}})
        )


def test_method_shares_must_sum_to_one(tmp_path: pathlib.Path, raw: dict[str, Any]) -> None:
    def mutate(variant: dict[str, Any]) -> None:
        variant["payment_methods"]["upi"]["traffic_share"] = 0.90

    with pytest.raises(ValidationError, match="sums to"):
        load_variant(tmp_path, raw, mutate)


def test_issuer_shares_must_sum_to_one(tmp_path: pathlib.Path, raw: dict[str, Any]) -> None:
    def mutate(variant: dict[str, Any]) -> None:
        variant["issuers"][0]["traffic_share"] = 0.99

    with pytest.raises(ValidationError, match="sums to"):
        load_variant(tmp_path, raw, mutate)


def test_emandate_may_not_take_checkout_traffic(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """Recurring debits come from the mandate book, not the arrival process."""

    def mutate(variant: dict[str, Any]) -> None:
        # Taken from upi rather than set to a literal, so the shares still sum
        # to one and this test fails on the emandate rule rather than tripping
        # the sum check first. A literal here would silently start testing the
        # wrong thing the next time a share in calibration.yaml is edited.
        variant["payment_methods"]["emandate"]["traffic_share"] = 0.05
        variant["payment_methods"]["upi"]["traffic_share"] -= 0.05

    with pytest.raises(ValidationError, match="emandate"):
        load_variant(tmp_path, raw, mutate)


def test_a_method_with_traffic_needs_an_issuer(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """Otherwise the generator picks a method nothing can carry."""

    def mutate(variant: dict[str, Any]) -> None:
        for issuer in variant["issuers"]:
            issuer["supported_methods"] = [
                m for m in issuer["supported_methods"] if m != "card"
            ]

    with pytest.raises(ValidationError, match="no issuer supports it"):
        load_variant(tmp_path, raw, mutate)


def test_issuers_may_not_reference_undefined_methods(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    def mutate(variant: dict[str, Any]) -> None:
        variant["issuers"][0]["supported_methods"].append("crypto")

    with pytest.raises(ValidationError):
        load_variant(tmp_path, raw, mutate)


def test_success_multipliers_must_not_reward_outages(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """A degraded rail succeeding more often than a healthy one is a mistake.

    Caught at load because the alternative is a long afternoon wondering why
    the policy learned to prefer broken issuers.
    """

    def mutate(variant: dict[str, Any]) -> None:
        variant["rail_health"]["success_multiplier"]["degraded"] = 1.0
        variant["rail_health"]["success_multiplier"]["healthy"] = 0.5

    with pytest.raises(ValidationError, match="non-increasing"):
        load_variant(tmp_path, raw, mutate)


def test_probabilities_outside_zero_to_one_are_rejected(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    def mutate(variant: dict[str, Any]) -> None:
        variant["observation"]["generic_error_code_rate"] = 1.4

    with pytest.raises(ValidationError):
        load_variant(tmp_path, raw, mutate)


def test_paydays_outside_one_to_twentyeight_are_rejected(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """Day 31 does not occur in every month, and pretending it does is worse
    than refusing it."""

    def mutate(variant: dict[str, Any]) -> None:
        variant["customers"]["salary_cycle"]["payday_weights"][31] = 0.1

    with pytest.raises(ValidationError, match="1-28"):
        load_variant(tmp_path, raw, mutate)


def test_counterfactual_offsets_must_be_sorted_and_distinct(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """Labels are read positionally and as a time series downstream."""

    def mutate(variant: dict[str, Any]) -> None:
        variant["counterfactual"]["offsets_minutes"] = [60, 5, 5]

    with pytest.raises(ValidationError):
        load_variant(tmp_path, raw, mutate)


def test_a_missing_required_key_is_an_error_not_a_default(
    tmp_path: pathlib.Path, raw: dict[str, Any]
) -> None:
    """No calibration value may have a default in Python.

    A default here would be a calibration number living outside
    ``calibration.yaml``, which is precisely what ADR-0006 forbids.
    """

    def mutate(variant: dict[str, Any]) -> None:
        del variant["attribution"]["window_hours"]

    with pytest.raises(ValidationError, match="window_hours"):
        load_variant(tmp_path, raw, mutate)


def test_weights_normalise_to_mean_one(calibration: Calibration) -> None:
    """Shape and volume must be separable.

    Otherwise editing the hour-of-day curve would silently change total
    traffic, and two runs meant to differ only in shape would not be
    comparable.
    """
    hours = calibration.traffic.normalised_hour_weights()
    days = calibration.traffic.normalised_day_weights()
    assert sum(hours) / len(hours) == pytest.approx(1.0)
    assert sum(days) / len(days) == pytest.approx(1.0)


def test_the_env_override_is_honoured(
    tmp_path: pathlib.Path, raw: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "elsewhere.yaml"
    path.write_text(yaml.safe_dump(raw, sort_keys=True), encoding="utf-8")
    monkeypatch.setenv(CALIBRATION_PATH_ENV, str(path))
    assert find_calibration_file() == path


def test_a_bad_env_override_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    """Falling back to the default would run with parameters the operator did
    not ask for and did not know about."""
    monkeypatch.setenv(CALIBRATION_PATH_ENV, "/nonexistent/calibration.yaml")
    with pytest.raises(FileNotFoundError, match=CALIBRATION_PATH_ENV):
        find_calibration_file()


def test_calibration_is_immutable(calibration: Calibration) -> None:
    """A run must not be able to edit its own parameters halfway through.

    The manifest records a digest of the file; if the values could change
    after loading, that digest would describe something that did not happen.
    """
    with pytest.raises(ValidationError):
        calibration.attribution.window_hours = 999.0  # type: ignore[misc]
