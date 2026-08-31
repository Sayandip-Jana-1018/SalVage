"""Unknown decline-code triage: the model proposes, a human disposes.

The problem this attacks is the top entry in ``docs/OPEN_NUMBERS.md``. Gateways
return free-text error codes, the deterministic mapper knows the ones somebody
wrote down, and everything else lands in ``TaxonomyCode.UNKNOWN`` at confidence
0.20 -- which fails closed, correctly, and tells nobody anything.

A language model is genuinely good at the shape of this problem: read a code
and a scrap of vendor prose, and say which of eight buckets it belongs in. So
it is asked, under three constraints.

**It is only asked about codes the deterministic mapper cannot resolve.** A
code that already maps is not sent; the request is refused. Consulting a model
about an answer you already have is how a verified mapping gets quietly
overwritten by a plausible one.

**It is never asked for a confidence.** ADR-0006 kind three forbids writing
claims about the outside world, and a number attached to "U69 means X" is
exactly that -- worse, it is a number in the shape that gets pasted straight
into the mapper table. The proposal carries a rationale and the name of the
specification that would settle the question. A human who checks the
specification sets the confidence.

**Nothing is applied.** There is no import of this module anywhere in the
taxonomy package, no writer for ``_EXACT_CODE_MAP``, and the response type
carries ``applied: Literal[False]`` so the wire format itself cannot claim
otherwise.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from salvage_brain.language.provider import (
    Completion,
    LanguageModel,
    LanguageOutputRejectedError,
)
from salvage_brain.language.queue import append_proposal
from salvage_brain.taxonomy.codes import TaxonomyCode
from salvage_brain.taxonomy.mapper import FailureTaxonomyMapper

MAX_OUTPUT_TOKENS = 512

# Only the codes a real classification can land in. UNKNOWN is excluded on
# purpose: "I could not tell" is already what the deterministic mapper said, and
# a model echoing it back as a proposal would file a review item with nothing
# in it to review.
_PROPOSABLE = tuple(code.value for code in TaxonomyCode if code is not TaxonomyCode.UNKNOWN)

INSTRUCTION = f"""\
You classify payment decline codes for an Indian payments system.

You are given one provider error code that our deterministic mapper does not
recognise, and optionally the provider's own description of it.

Reply with a single JSON object and nothing else. No markdown, no prose around
it. Exactly these five keys:

  "proposed_taxonomy_code": one of {list(_PROPOSABLE)}
  "is_retryable_same_rail": boolean - would retrying the identical payment
      method and issuer plausibly succeed later?
  "is_retryable_alternative_rail": boolean - would a different method or issuer
      plausibly succeed?
  "rationale": one or two sentences, under 400 characters, saying what the code
      appears to mean and why it maps where you put it.
  "specification_to_check": the name of the document that would settle this,
      for example "NPCI UPI Procedural Guidelines" or "ISO 8583 response
      codes". Name the document; do not quote from it.

Hard rules:
  - Do not state any statistic, percentage, rate, or confidence value. If you
    are unsure, say so in words.
  - Do not invent a code that was not given to you.
  - If the code is genuinely ambiguous, choose the mapping that fails safe:
    prefer a classification that does not authorise retrying the same rail.
"""

# A rationale is prose about a code, so digits are legitimate ("U69", "8583").
# What is not legitimate is the shape a fabricated statistic takes: a percent
# sign, or a decimal number. Both are refused.
_STATISTIC_SHAPE = re.compile(r"%|\d+\.\d")


class AlreadyMappedError(ValueError):
    """The deterministic mapper resolves this code. It is not a triage case."""


class TriageProposal(BaseModel):
    """What the model proposed. Not a mapping; a suggestion that one be made."""

    model_config = ConfigDict(extra="forbid")

    proposed_taxonomy_code: TaxonomyCode
    is_retryable_same_rail: bool
    is_retryable_alternative_rail: bool
    rationale: str = Field(min_length=1, max_length=400)
    specification_to_check: str = Field(min_length=1, max_length=200)


class TriageResponse(BaseModel):
    """The full artifact, carrying enough provenance to audit it later."""

    provider_error_code: str
    provider_error_description: str | None
    current_mapping: TaxonomyCode
    proposal: TriageProposal
    status: Literal["PROPOSED_PENDING_HUMAN_REVIEW"] = "PROPOSED_PENDING_HUMAN_REVIEW"
    # Not a bool. This field can only ever serialise as false, which is a
    # stronger statement than a bool that happens to be false today.
    applied: Literal[False] = False
    model: str
    prompt_sha256: str
    generated_at: dt.datetime
    queued_to: str | None


def parse_proposal(text: str) -> TriageProposal:
    """Parse and validate a model response, or refuse it.

    Fenced JSON is unwrapped because every model emits it sometimes and that is
    a formatting habit rather than a wrong answer. Everything else -- a missing
    key, an extra key, a taxonomy code outside the enum, a rationale carrying a
    statistic -- is a rejection. There is no coercion step and no default:
    a proposal nobody can trust is worth less than no proposal.
    """
    cleaned = _strip_code_fence(text).strip()
    try:
        document = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LanguageOutputRejectedError(f"The model did not return JSON: {exc.msg}") from exc

    if not isinstance(document, dict):
        raise LanguageOutputRejectedError("The model returned JSON that is not an object.")

    try:
        proposal = TriageProposal.model_validate(document)
    except Exception as exc:  # pydantic ValidationError
        raise LanguageOutputRejectedError(f"The proposal did not validate: {exc}") from exc

    if proposal.proposed_taxonomy_code is TaxonomyCode.UNKNOWN:
        raise LanguageOutputRejectedError(
            "The model proposed UNKNOWN, which is what the deterministic mapper already said."
        )
    if _STATISTIC_SHAPE.search(proposal.rationale):
        raise LanguageOutputRejectedError(
            "The rationale contains a percentage or decimal figure. "
            "See docs/adr/0006-numbers-policy.md."
        )
    return proposal


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    # Drop the opening fence (with or without a language tag) and the closing
    # one if present. A fence that was opened and never closed is left to the
    # JSON parser to reject.
    body = lines[1:]
    if body and body[-1].strip().startswith("```"):
        body = body[:-1]
    return "\n".join(body)


def triage_unknown_code(
    *,
    provider_error_code: str,
    provider_error_description: str | None,
    model: LanguageModel,
    queue_path: Path | None,
    now: dt.datetime | None = None,
) -> TriageResponse:
    """Ask for a proposed mapping for one unrecognised code.

    Raises :class:`AlreadyMappedError` when the deterministic mapper resolves the
    code, :class:`LanguageUnavailableError` when the provider does not answer,
    and :class:`LanguageOutputRejectedError` when it answers with something that
    does not validate.
    """
    current = FailureTaxonomyMapper.map_failure(provider_error_code, provider_error_description)
    if current.taxonomy_code is not TaxonomyCode.UNKNOWN:
        raise AlreadyMappedError(
            f"{provider_error_code} already maps to {current.taxonomy_code.value} "
            f"by rule {current.rule_matched}. Triage is for codes with no mapping."
        )

    payload = _render_payload(provider_error_code, provider_error_description)
    completion: Completion = model.complete(
        instruction=INSTRUCTION,
        payload=payload,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    proposal = parse_proposal(completion.text)

    generated_at = now or dt.datetime.now(dt.UTC)
    queued_to: str | None = None
    if queue_path is not None:
        append_proposal(
            queue_path,
            {
                "provider_error_code": provider_error_code,
                "provider_error_description": provider_error_description,
                "proposal": proposal.model_dump(mode="json"),
                "model": completion.model,
                "prompt_sha256": completion.prompt_sha256,
                "generated_at": generated_at.isoformat(),
                "status": "PROPOSED_PENDING_HUMAN_REVIEW",
                "applied": False,
            },
        )
        queued_to = str(queue_path)

    return TriageResponse(
        provider_error_code=provider_error_code,
        provider_error_description=provider_error_description,
        current_mapping=current.taxonomy_code,
        proposal=proposal,
        model=completion.model,
        prompt_sha256=completion.prompt_sha256,
        generated_at=generated_at,
        queued_to=queued_to,
    )


def _render_payload(code: str, description: str | None) -> str:
    lines = [f"provider_error_code: {code}"]
    if description:
        lines.append(f"provider_error_description: {description}")
    else:
        lines.append("provider_error_description: (the gateway sent none)")
    return "\n".join(lines)
