"""Incident narration: a decision chain, in English, for whoever is on call.

An operator at 3am does not want six panels. They want a paragraph: what
failed, what the system concluded, what it decided to do, and what it was
allowed to do. Every one of those facts has already been computed by the
deterministic path -- this turns them into prose and adds nothing.

"Adds nothing" is enforced rather than asked for. **Every number in the
narration must already appear in the prompt.** The check is a set difference
over numeric tokens, it runs on every response, and a violation is a rejection
rather than a correction. This repository has previously shipped invented
figures dressed as measurements; a narration layer is exactly where that would
happen again, so the one thing the model is structurally prevented from doing
is introducing a number.

The facts are fetched by this service from its own read path, not accepted from
the caller. A narration endpoint that narrates whatever JSON it is handed
produces official-looking prose about events that never happened, which is a
worse artifact than no narration at all.
"""

from __future__ import annotations

import datetime as dt
import re

from pydantic import BaseModel

from salvage_brain.attempts import AttemptView
from salvage_brain.diagnosis.models import DiagnosisResponse
from salvage_brain.language.formatting import format_paise_inr
from salvage_brain.language.provider import LanguageModel, LanguageOutputRejectedError
from salvage_brain.policy.models import PolicyDecisionResponse

MAX_OUTPUT_TOKENS = 700

INSTRUCTION = """\
You write short operational summaries for a payments on-call engineer.

You are given the facts a recovery system recorded about one failed payment:
the attempt, the failures observed on it, the classification the diagnosis
engine produced, and the action the policy engine chose.

Write two short paragraphs, plain English, no markdown, no bullet points, no
heading. First paragraph: what failed and what the system concluded. Second:
what it decided to do and why that follows.

Hard rules:
  - Use ONLY numbers that appear in the input. Do not compute new ones, do not
    convert units, do not estimate, do not round to a different figure.
  - Do not state a rate, a percentage or an amount that is not in the input.
  - Do not name a bank, a company, or any institution. The issuer identifiers
    in the input are the only names you may use, exactly as written.
  - Do not speculate about causes beyond the classification you were given.
  - If the input says a stage produced nothing, say that plainly.
"""

# "1,850.00", "0.92", "3". Commas inside, optional decimal tail.
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


class Narration(BaseModel):
    """The prose, and the provenance to attribute it."""

    payment_attempt_id: str
    narration: str
    model: str
    prompt_sha256: str
    generated_at: dt.datetime


def render_prompt(
    attempt: AttemptView,
    diagnosis: DiagnosisResponse | None,
    decision: PolicyDecisionResponse | None,
) -> str:
    """Serialise the facts the narrator is allowed to see.

    Amounts appear in both paise and rendered rupees, and probabilities in both
    fractional and percentage form, because a narrator will reach for whichever
    reads better -- and a form that is not in the prompt is a form the
    validator will reject.
    """
    lines = [
        "ATTEMPT",
        f"  payment_attempt_id: {attempt.payment_attempt_id}",
        f"  order_id: {attempt.order_id}",
        f"  amount_paise: {attempt.amount_paise}",
        f"  amount_rendered: {format_paise_inr(attempt.amount_paise)}",
        f"  payment_method: {attempt.payment_method}",
        f"  issuer: {attempt.issuer}",
        f"  provider: {attempt.provider}",
        f"  is_recurring: {attempt.is_recurring}",
        f"  created_at: {attempt.created_at.isoformat()}",
        f"  failures_observed: {len(attempt.failures)}",
    ]
    for index, failure in enumerate(attempt.failures, start=1):
        lines.extend(
            [
                f"  failure {index}:",
                f"    provider_error_code: {failure.provider_error_code}",
                f"    rail_id: {failure.rail_id}",
                f"    taxonomy_code: {failure.taxonomy_code or 'unclassified'}",
                f"    event_timestamp: {failure.event_timestamp.isoformat()}",
            ]
        )

    lines.append("")
    if diagnosis is None:
        lines.append("DIAGNOSIS\n  The diagnosis engine produced nothing for this attempt.")
    else:
        lines.extend(
            [
                "DIAGNOSIS",
                f"  taxonomy_code: {diagnosis.taxonomy_code.value}",
                f"  confidence: {diagnosis.confidence} ({_percent(diagnosis.confidence)})",
                f"  root_cause: {diagnosis.root_cause}",
                f"  rail_id: {diagnosis.rail_id}",
                f"  rail_state: {diagnosis.rail_state}",
                f"  explainability_tokens: {', '.join(diagnosis.explainability_tokens) or 'none'}",
            ]
        )

    lines.append("")
    if decision is None:
        lines.append("DECISION\n  The policy engine produced no decision for this attempt.")
    else:
        lines.extend(
            [
                "DECISION",
                f"  chosen_action: {decision.chosen_action.value}",
                f"  recovery_probability: {decision.recovery_probability}"
                f" ({_percent(decision.recovery_probability)})",
                f"  expected_net_value_paise: {decision.expected_net_value_paise}",
                "  expected_net_value_rendered: "
                f"{format_paise_inr(decision.expected_net_value_paise)}",
                f"  target_rail_id: {decision.target_rail_id or 'none'}",
                f"  reasoning_tokens: {', '.join(decision.reasoning_tokens) or 'none'}",
                "  candidate actions considered:",
            ]
        )
        for valuation in decision.candidate_valuations:
            lines.append(
                f"    {valuation.action.value}: "
                f"p_recovery={valuation.recovery_probability} "
                f"({_percent(valuation.recovery_probability)}), "
                f"net_paise={valuation.net_expected_value_paise} "
                f"({format_paise_inr(valuation.net_expected_value_paise)})"
            )

    lines.extend(
        [
            "",
            "BOUNDS",
            "  Whether this action was permitted is decided by the bounds engine in",
            "  salvage-core, which this service cannot see. Do not state that the action",
            "  was executed, refused, or delivered.",
        ]
    )
    return "\n".join(lines)


def _percent(fraction: float) -> str:
    return f"{fraction * 100:.1f}%"


def validate_narration(text: str, prompt: str) -> str:
    """Refuse a narration that introduces a number the facts did not contain."""
    narration = text.strip()
    if not narration:
        raise LanguageOutputRejectedError("The model returned an empty narration.")

    allowed = _numeric_tokens(prompt)
    invented = sorted(_numeric_tokens(narration) - allowed)
    if invented:
        raise LanguageOutputRejectedError(
            "The narration contains numbers that are not in the facts it was given: "
            f"{invented}. Nothing may add a figure to a decision record."
        )
    return narration


def _numeric_tokens(text: str) -> set[str]:
    return {_canonical(token) for token in _NUMBER.findall(text)}


def _canonical(token: str) -> str:
    """Normalise formatting, not value.

    ``1,850.00`` and ``1850`` are the same figure written two ways, and a
    narrator may legitimately choose either. ``1850`` and ``18500`` are not, and
    no normalisation here brings them together.
    """
    value = token.replace(",", "")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value or "0"


def narrate_decision(
    *,
    attempt: AttemptView,
    diagnosis: DiagnosisResponse | None,
    decision: PolicyDecisionResponse | None,
    model: LanguageModel,
    now: dt.datetime | None = None,
) -> Narration:
    """Narrate one decision chain, or raise."""
    prompt = render_prompt(attempt, diagnosis, decision)
    completion = model.complete(
        instruction=INSTRUCTION,
        payload=prompt,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    # Validated against the payload only. The instruction carries no facts, so
    # a number that appears there and not in the payload is still an invention.
    narration = validate_narration(completion.text, prompt)
    return Narration(
        payment_attempt_id=attempt.payment_attempt_id,
        narration=narration,
        model=completion.model,
        prompt_sha256=completion.prompt_sha256,
        generated_at=now or dt.datetime.now(dt.UTC),
    )
