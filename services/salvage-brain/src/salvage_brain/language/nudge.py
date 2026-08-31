"""Multilingual nudge copy: the model writes the words, this file writes the numbers.

The *policy* decides whether to contact a customer at all -- that is
``RecoveryActionType.CUSTOMER_NUDGE``, chosen by expected value and then gated
by the bounds engine for quiet hours, contact budgets and opt-outs. None of
that is negotiable by anything here. By the time this module runs, the decision
to send has already been made and bounded.

What remains is a language problem, and a real one: a message to a customer in
Chennai reads better in Tamil, and a system that only speaks English quietly
converts a recoverable payment into an ignored SMS.

The constraint that makes this safe is small and mechanical: **the model may
not write a digit.** It writes a sentence containing ``{amount}`` and
``{merchant}``, and this code substitutes them -- the amount formatted from
integer paise by ``formatting.format_paise_inr``. So a model that hallucinates
₹18,500 instead of ₹1,850 cannot: it has no way to write either. Combined with
the placeholder check (exactly the expected slots, each exactly once, nothing
else in braces) the worst a bad generation can do is produce a sentence that
reads oddly, which a human reviewing the copy will see.

The banned-phrase check is a backstop, not a guarantee. It refuses copy that
asks for an OTP, a PIN, a CVV or a password, because a payment message asking
for a credential is a phishing message whoever wrote it. It is a short list in
four scripts and it will not catch every phrasing; it is here because the cost
of missing this class of output is a customer defrauded in the merchant's name.
"""

from __future__ import annotations

import datetime as dt
import re
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from salvage_brain.language.formatting import format_paise_inr
from salvage_brain.language.provider import LanguageModel, LanguageOutputRejectedError
from salvage_brain.policy.models import CommunicationChannel

MAX_OUTPUT_TOKENS = 400


class NudgeLanguage(StrEnum):
    """The languages this layer will generate. Bounded on purpose.

    Adding one is a deliberate act: somebody has to be able to read the output
    before it is sent to a customer, and an unbounded language list means
    shipping text nobody in the room can check.
    """

    EN = "en"
    HI = "hi"
    TA = "ta"
    BN = "bn"
    MR = "mr"


_LANGUAGE_NAMES = {
    NudgeLanguage.EN: "English",
    NudgeLanguage.HI: "Hindi",
    NudgeLanguage.TA: "Tamil",
    NudgeLanguage.BN: "Bengali",
    NudgeLanguage.MR: "Marathi",
}

# The rendered message is what reaches a customer, so the cap is applied after
# substitution. SMS is the tight one; the others are generous but finite.
_LENGTH_CAP = {
    CommunicationChannel.SMS: 320,
    CommunicationChannel.WHATSAPP: 1024,
    CommunicationChannel.EMAIL: 2000,
}

_AMOUNT = "{amount}"
_MERCHANT = "{merchant}"
_LINK = "{link}"

# Unicode-aware, so Devanagari and Tamil digits count as digits too.
_ANY_DIGIT = re.compile(r"\d")
_ANY_PLACEHOLDER = re.compile(r"\{[^}]*\}")
# Deliberately not case-insensitive on the domain half: "payment failed.In your
# app" would otherwise read as a link to a .in domain. The scheme and www forms
# are matched either way.
_URLISH = re.compile(r"(?i:https?://|www\.)|[a-z0-9-]{2,}\.(?:com|in|net|org|io|co)\b")

_CREDENTIAL_WORDS = (
    "otp",
    "cvv",
    "pin",
    "password",
    "passcode",
    "ओटीपी",
    "पिन",
    "पासवर्ड",
    "ஓடிபி",
    "கடவுச்சொல்",
    "ওটিপি",
    "পাসওয়ার্ড",
)
# Word boundaries, because "pin" is a substring of "shopping" and copy that
# mentions shopping is not a phishing message.
_CREDENTIAL_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(word) for word in _CREDENTIAL_WORDS) + r")\b",
    re.I | re.U,
)

INSTRUCTION = """\
You write one short message to a customer whose payment did not go through.

Rules, all of them hard:
  - Write in the language named in the input, and only that language.
  - Write NO digits at all. Not in any script. The amount is inserted for you.
  - Use the placeholder tokens exactly as given in the input, each exactly
    once, spelled exactly as shown including the braces. Do not invent others.
  - Never ask for an OTP, PIN, CVV, password, or any other credential.
  - Do not include a URL, a phone number, or an email address.
  - Do not promise a refund, a discount, or a timeline.
  - Be plain and courteous. One or two sentences.

Reply with the message text only. No quotes around it, no explanation, no
translation back into English.
"""


class NudgeRequest(BaseModel):
    """What the copy generator is allowed to know.

    There is no field for a customer name, phone number, email address or id,
    and that is the point: this is the only part of Salvage that sends text to
    a third-party API, so it is given the least it can do the job with. The
    identity of the person being messaged is not needed to write a sentence.
    """

    model_config = ConfigDict(extra="forbid")

    merchant_display_name: str = Field(min_length=1, max_length=80)
    amount_paise: int = Field(gt=0)
    language: NudgeLanguage
    channel: CommunicationChannel
    # Free text is refused here on purpose; the reason must come from the
    # taxonomy so the copy cannot describe a cause the system did not diagnose.
    taxonomy_code: str = Field(min_length=1, max_length=40)
    include_payment_link: bool = False


class NudgeCopy(BaseModel):
    """The generated template and the message it renders to."""

    template: str
    rendered: str
    language: NudgeLanguage
    channel: CommunicationChannel
    amount_paise: int
    rendered_amount: str
    placeholders: list[str]
    model: str
    prompt_sha256: str
    generated_at: dt.datetime
    # Copy is generated, reviewed by a human, and only then sent. Nothing in
    # this service sends anything; salvage-core owns every outbound effect.
    sent: bool = False


def required_placeholders(request: NudgeRequest) -> list[str]:
    slots = [_MERCHANT, _AMOUNT]
    if request.include_payment_link:
        slots.append(_LINK)
    return slots


def validate_template(template: str, request: NudgeRequest) -> str:
    """Refuse anything that is not a well-formed, digit-free template."""
    text = template.strip().strip('"').strip()
    if not text:
        raise LanguageOutputRejectedError("The model returned an empty message.")

    if _ANY_DIGIT.search(text):
        raise LanguageOutputRejectedError(
            "The message contains a digit. Numbers in customer copy are rendered "
            "from integer paise by this service, never written by the model."
        )

    found = _ANY_PLACEHOLDER.findall(text)
    expected = required_placeholders(request)
    for slot in expected:
        if found.count(slot) != 1:
            raise LanguageOutputRejectedError(
                f"The message must contain {slot} exactly once; "
                f"it appeared {found.count(slot)} times."
            )
    unexpected = [slot for slot in found if slot not in expected]
    if unexpected:
        raise LanguageOutputRejectedError(
            "The message contains placeholders this service will not fill: "
            f"{sorted(set(unexpected))}."
        )

    if _URLISH.search(text):
        raise LanguageOutputRejectedError(
            "The message contains a URL. Links are inserted by the sender."
        )

    credential = _CREDENTIAL_PATTERN.search(text)
    if credential:
        raise LanguageOutputRejectedError(
            f"The message mentions a credential ({credential.group(0)!r}). A payment message "
            "that asks for one is a phishing message regardless of who wrote it."
        )
    return text


def render(template: str, request: NudgeRequest, payment_link: str | None = None) -> str:
    """Substitute the bounded slots. This is where every number enters."""
    rendered = template.replace(_MERCHANT, request.merchant_display_name)
    rendered = rendered.replace(_AMOUNT, format_paise_inr(request.amount_paise))
    if request.include_payment_link:
        if not payment_link:
            raise LanguageOutputRejectedError(
                "A payment link was requested but none was supplied to render into the copy."
            )
        rendered = rendered.replace(_LINK, payment_link)

    cap = _LENGTH_CAP[request.channel]
    if len(rendered) > cap:
        raise LanguageOutputRejectedError(
            f"The rendered message is {len(rendered)} characters; the cap for "
            f"{request.channel.value} is {cap}."
        )
    return rendered


def write_nudge_copy(
    *,
    request: NudgeRequest,
    model: LanguageModel,
    payment_link: str | None = None,
    now: dt.datetime | None = None,
) -> NudgeCopy:
    """Generate one message. Raises rather than returning unusable copy."""
    payload = _render_payload(request)
    completion = model.complete(
        instruction=INSTRUCTION,
        payload=payload,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    template = validate_template(completion.text, request)
    rendered = render(template, request, payment_link)

    return NudgeCopy(
        template=template,
        rendered=rendered,
        language=request.language,
        channel=request.channel,
        amount_paise=request.amount_paise,
        rendered_amount=format_paise_inr(request.amount_paise),
        placeholders=required_placeholders(request),
        model=completion.model,
        prompt_sha256=completion.prompt_sha256,
        generated_at=now or dt.datetime.now(dt.UTC),
    )


def _render_payload(request: NudgeRequest) -> str:
    slots = ", ".join(required_placeholders(request))
    return "\n".join(
        [
            f"language: {_LANGUAGE_NAMES[request.language]}",
            f"channel: {request.channel.value}",
            f"failure_reason_taxonomy_code: {request.taxonomy_code}",
            f"placeholders_to_use: {slots}",
            "The merchant's name goes in {merchant} and the amount in {amount}."
            + (" A payment link goes in {link}." if request.include_payment_link else ""),
        ]
    )
