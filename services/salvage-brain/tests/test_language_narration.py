"""A narration may rearrange the facts. It may not add to them.

The rule is mechanical: every number in the output must appear in the prompt.
It is checked as a set difference over numeric tokens, normalised for
formatting only -- ``1,850.00`` and ``1850`` are the same figure written two
ways, ``1850`` and ``18500`` are not.

This is the narrowest useful version of "do not fabricate", and it is the one
that can actually be enforced. A model asked to summarise a payment incident
will otherwise reach for "roughly a third of attempts" or "about ₹2 lakh at
risk" unprompted, and prose is exactly where an invented figure is hardest to
notice: it reads like context rather than like a measurement.
"""

from __future__ import annotations

import datetime as dt

import pytest

from language_doubles import ScriptedModel
from salvage_brain.attempts import AttemptView, FailureSummary
from salvage_brain.diagnosis.models import DiagnosisResponse, SuggestedAction
from salvage_brain.language.narrate import narrate_decision, render_prompt, validate_narration
from salvage_brain.language.provider import LanguageOutputRejectedError
from salvage_brain.policy.models import (
    ActionValuation,
    PolicyDecisionResponse,
    RecoveryActionType,
)
from salvage_brain.taxonomy.codes import TaxonomyCode

WHEN = dt.datetime(2026, 8, 31, 9, 30, tzinfo=dt.UTC)


def attempt() -> AttemptView:
    return AttemptView(
        merchant_id="merch_demo",
        order_id="ord_console_ab12cd34",
        payment_attempt_id="pay_console_ab12cd34",
        amount_paise=185000,
        currency="INR",
        payment_method="upi",
        provider="simulated",
        issuer="issuer_gamma",
        is_recurring=False,
        created_at=WHEN,
        failures=[
            FailureSummary(
                event_id="11111111-1111-4111-8111-111111111111",
                provider_error_code="SIM_ISSUER_UNAVAILABLE",
                rail_id="issuer_gamma|upi|simulated",
                event_timestamp=WHEN,
                taxonomy_code="ISSUER_OUTAGE",
            )
        ],
    )


def diagnosis() -> DiagnosisResponse:
    return DiagnosisResponse(
        payment_attempt_id="pay_console_ab12cd34",
        taxonomy_code=TaxonomyCode.ISSUER_OUTAGE,
        confidence=0.95,
        root_cause="The issuing bank did not respond and the rail is sensed unhealthy.",
        rail_id="issuer_gamma|upi|simulated",
        rail_state="DOWN",
        explainability_tokens=["rail_state:DOWN", "taxonomy:ISSUER_OUTAGE"],
        suggested_action=SuggestedAction.SWITCH_RAIL,
        diagnosed_at=WHEN,
    )


def decision() -> PolicyDecisionResponse:
    return PolicyDecisionResponse(
        payment_attempt_id="pay_console_ab12cd34",
        chosen_action=RecoveryActionType.SWITCH_RAIL,
        recovery_probability=0.72,
        expected_net_value_paise=120000,
        target_rail_id="issuer_alpha|card|simulated",
        scheduled_delay_seconds=None,
        nudge_channel=None,
        reasoning_tokens=["healthy_alternative_rail_available"],
        candidate_valuations=[
            ActionValuation(
                action=RecoveryActionType.SWITCH_RAIL,
                recovery_probability=0.72,
                gross_expected_value_paise=133200,
                estimated_cost_paise=13200,
                net_expected_value_paise=120000,
            ),
            ActionValuation(
                action=RecoveryActionType.NO_ACTION,
                recovery_probability=0.0,
                gross_expected_value_paise=0,
                estimated_cost_paise=0,
                net_expected_value_paise=0,
            ),
        ],
        decided_at=WHEN,
    )


def test_the_prompt_carries_every_form_a_narrator_would_reach_for() -> None:
    """Both paise and rendered rupees, both fraction and percentage.

    Not decoration: the validator rejects any number not in the prompt, so a
    form the prompt omits is a form the narrator cannot use without being
    refused for it.
    """
    prompt = render_prompt(attempt(), diagnosis(), decision())
    assert "185000" in prompt
    assert "₹1,850.00" in prompt
    assert "0.95" in prompt and "95.0%" in prompt
    assert "0.72" in prompt and "72.0%" in prompt
    assert "SWITCH_RAIL" in prompt


def test_a_narration_using_only_given_numbers_is_accepted() -> None:
    prompt = render_prompt(attempt(), diagnosis(), decision())
    good = (
        "A UPI payment of ₹1,850.00 on issuer_gamma failed once with "
        "SIM_ISSUER_UNAVAILABLE. The rail is sensed DOWN and the failure was "
        "classified ISSUER_OUTAGE at 95.0% confidence.\n\n"
        "The policy engine chose SWITCH_RAIL, valuing it at 120000 paise against a "
        "recovery probability of 0.72."
    )
    assert validate_narration(good, prompt) == good


def test_a_narration_that_invents_a_number_is_rejected() -> None:
    """The failure this whole module exists to prevent."""
    prompt = render_prompt(attempt(), diagnosis(), decision())
    invented = (
        "A payment of ₹1,850.00 failed. Roughly 34% of UPI attempts on this issuer "
        "are failing right now, putting ₹3,40,000 at risk across 27 merchants."
    )
    with pytest.raises(LanguageOutputRejectedError, match="not in the facts"):
        validate_narration(invented, prompt)


def test_a_rescaled_amount_is_rejected() -> None:
    """₹18,500 instead of ₹1,850 is a plausible typo and a serious one."""
    prompt = render_prompt(attempt(), diagnosis(), decision())
    with pytest.raises(LanguageOutputRejectedError, match="not in the facts"):
        validate_narration("The customer was asked for ₹18,500.00.", prompt)


def test_formatting_differences_are_not_inventions() -> None:
    """``1850`` and ``1,850.00`` are one figure written two ways."""
    prompt = render_prompt(attempt(), diagnosis(), decision())
    assert validate_narration("The amount was 1850 rupees, or 1,850.00.", prompt)


def test_an_empty_narration_is_rejected() -> None:
    with pytest.raises(LanguageOutputRejectedError, match="empty"):
        validate_narration("   ", render_prompt(attempt(), diagnosis(), decision()))


def test_a_missing_stage_is_stated_rather_than_filled_in() -> None:
    """No diagnosis and no decision is a fact worth narrating, not a gap to cover."""
    prompt = render_prompt(attempt(), None, None)
    assert "The diagnosis engine produced nothing" in prompt
    assert "The policy engine produced no decision" in prompt


def test_the_prompt_refuses_to_speak_for_the_bounds_engine() -> None:
    """salvage-brain cannot see the bounds verdict, so the narrator is told not to claim one.

    The decision to act is recorded in salvage-core after the bounds engine
    runs. A narration that said "the retry was executed" would be describing an
    outcome this service has no access to.
    """
    prompt = render_prompt(attempt(), diagnosis(), decision())
    assert "Do not state that the action" in prompt


def test_narration_carries_provenance() -> None:
    model = ScriptedModel("A payment of ₹1,850.00 failed and SWITCH_RAIL was chosen.")
    narration = narrate_decision(
        attempt=attempt(), diagnosis=diagnosis(), decision=decision(), model=model
    )
    assert narration.payment_attempt_id == "pay_console_ab12cd34"
    assert narration.model == "scripted-test-model"
    assert len(narration.prompt_sha256) == 64
