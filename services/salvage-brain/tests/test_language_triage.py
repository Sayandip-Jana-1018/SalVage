"""Triage proposes. It does not apply, and it does not get to be creative.

Every test here is about a refusal. The happy path is one test; the rest pin
the ways a model response can be wrong -- a taxonomy code outside the enum, an
extra field, a rationale carrying an invented statistic, a proposal for a code
that is already mapped -- and assert each is rejected rather than repaired.

That balance is deliberate. The value of this feature is not that it produces a
mapping; it is that it cannot produce a *wrong* mapping quietly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from language_doubles import ScriptedModel
from salvage_brain.language.provider import LanguageOutputRejectedError
from salvage_brain.language.triage import (
    AlreadyMappedError,
    parse_proposal,
    triage_unknown_code,
)
from salvage_brain.taxonomy.codes import TaxonomyCode
from salvage_brain.taxonomy.mapper import _EXACT_CODE_MAP, FailureTaxonomyMapper

VALID = {
    "proposed_taxonomy_code": "INSUFFICIENT_FUNDS",
    "is_retryable_same_rail": True,
    "is_retryable_alternative_rail": False,
    "rationale": "The description says the account balance was too low for the debit.",
    "specification_to_check": "NPCI UPI Procedural Guidelines",
}


def scripted(document: object) -> ScriptedModel:
    return ScriptedModel(json.dumps(document) if not isinstance(document, str) else document)


def test_a_well_formed_proposal_parses() -> None:
    proposal = parse_proposal(json.dumps(VALID))
    assert proposal.proposed_taxonomy_code is TaxonomyCode.INSUFFICIENT_FUNDS
    assert proposal.is_retryable_same_rail is True


def test_fenced_json_is_accepted() -> None:
    """Models wrap JSON in markdown. That is a formatting habit, not a wrong answer."""
    fenced = f"```json\n{json.dumps(VALID)}\n```"
    assert parse_proposal(fenced).proposed_taxonomy_code is TaxonomyCode.INSUFFICIENT_FUNDS


def test_prose_is_rejected() -> None:
    with pytest.raises(LanguageOutputRejectedError, match="did not return JSON"):
        parse_proposal("I think this is probably an insufficient funds decline.")


def test_a_taxonomy_code_outside_the_enum_is_rejected() -> None:
    """The one failure mode that would put an unknown value into the pipeline."""
    bad = {**VALID, "proposed_taxonomy_code": "BANK_HAVING_A_BAD_DAY"}
    with pytest.raises(LanguageOutputRejectedError, match="did not validate"):
        parse_proposal(json.dumps(bad))


def test_an_extra_field_is_rejected() -> None:
    """`extra="forbid"`. A field nobody expected is a response nobody validated."""
    bad = {**VALID, "confidence": 0.93}
    with pytest.raises(LanguageOutputRejectedError, match="did not validate"):
        parse_proposal(json.dumps(bad))


def test_a_missing_field_is_rejected() -> None:
    bad = {key: value for key, value in VALID.items() if key != "specification_to_check"}
    with pytest.raises(LanguageOutputRejectedError, match="did not validate"):
        parse_proposal(json.dumps(bad))


def test_a_proposal_of_unknown_is_rejected() -> None:
    """UNKNOWN is what the deterministic mapper already said; it is not a proposal."""
    bad = {**VALID, "proposed_taxonomy_code": "UNKNOWN"}
    with pytest.raises(LanguageOutputRejectedError, match="already said"):
        parse_proposal(json.dumps(bad))


@pytest.mark.parametrize(
    "rationale",
    [
        "This code accounts for roughly 12% of UPI declines in India.",
        "Observed success on retry is about 0.4 for this class of failure.",
    ],
)
def test_a_rationale_carrying_a_statistic_is_rejected(rationale: str) -> None:
    """ADR-0006 kind three, enforced on generated text.

    A model asked about Indian decline codes will happily volunteer a failure
    rate. This repository has already shipped invented figures once; the
    cheapest place to stop the next one is the shape of the string.
    """
    with pytest.raises(LanguageOutputRejectedError, match="percentage or decimal"):
        parse_proposal(json.dumps({**VALID, "rationale": rationale}))


def test_a_rationale_may_still_name_codes() -> None:
    """Digits are legitimate in prose about ISO 8583 and U69. Only statistics are not."""
    fine = "Reads like the ISO 8583 code 51 family rather than a timeout."
    assert parse_proposal(json.dumps({**VALID, "rationale": fine})).rationale == fine


def test_a_code_the_mapper_already_knows_is_refused() -> None:
    """Consulting a model about an answer you already have is how you lose the answer."""
    model = scripted(VALID)
    with pytest.raises(AlreadyMappedError, match="already maps"):
        triage_unknown_code(
            provider_error_code="SIM_INSUFFICIENT_FUNDS",
            provider_error_description=None,
            model=model,
            queue_path=None,
        )
    assert model.calls == [], "the model was consulted about a code that is already mapped"


def test_an_unknown_code_produces_an_unapplied_proposal() -> None:
    model = scripted(VALID)
    response = triage_unknown_code(
        provider_error_code="ZZ42",
        provider_error_description="Beneficiary institution returned an unmapped response",
        model=model,
        queue_path=None,
    )

    assert response.current_mapping is TaxonomyCode.UNKNOWN
    assert response.applied is False
    assert response.status == "PROPOSED_PENDING_HUMAN_REVIEW"
    assert response.queued_to is None
    assert response.prompt_sha256 and len(response.prompt_sha256) == 64
    assert model.calls, "the model should have been consulted for an unmapped code"


def test_the_proposal_does_not_change_the_mapper() -> None:
    """The property the whole feature rests on, asserted directly.

    Not "no code path applies it" as a claim in a docstring: the mapper table
    is compared before and after, and the code is re-mapped afterwards to show
    it still resolves to UNKNOWN. If someone later wires a proposal into the
    table, this fails.
    """
    before = dict(_EXACT_CODE_MAP)

    triage_unknown_code(
        provider_error_code="ZZ42",
        provider_error_description=None,
        model=scripted(VALID),
        queue_path=None,
    )

    assert before == _EXACT_CODE_MAP
    assert (
        FailureTaxonomyMapper.map_failure("ZZ42", None).taxonomy_code is TaxonomyCode.UNKNOWN
    )


def test_an_accepted_proposal_is_appended_to_the_review_queue(tmp_path: Path) -> None:
    queue = tmp_path / "nested" / "triage.jsonl"

    first = triage_unknown_code(
        provider_error_code="ZZ42",
        provider_error_description=None,
        model=scripted(VALID),
        queue_path=queue,
    )
    triage_unknown_code(
        provider_error_code="ZZ43",
        provider_error_description=None,
        model=scripted(VALID),
        queue_path=queue,
    )

    assert first.queued_to == str(queue)
    lines = queue.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2, "the queue must append rather than overwrite"

    record = json.loads(lines[0])
    assert record["applied"] is False
    assert record["status"] == "PROPOSED_PENDING_HUMAN_REVIEW"
    assert record["model"] == "scripted-test-model"
    assert len(record["prompt_sha256"]) == 64


def test_a_rejected_proposal_is_not_queued(tmp_path: Path) -> None:
    """Nothing that failed validation reaches the file a human will read."""
    queue = tmp_path / "triage.jsonl"
    with pytest.raises(LanguageOutputRejectedError):
        triage_unknown_code(
            provider_error_code="ZZ42",
            provider_error_description=None,
            model=scripted({**VALID, "proposed_taxonomy_code": "NOT_A_CODE"}),
            queue_path=queue,
        )
    assert not queue.exists()
