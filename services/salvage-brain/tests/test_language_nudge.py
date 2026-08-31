"""The model writes the words; this codebase writes the numbers.

The load-bearing test in this file is ``test_a_message_containing_a_digit_is_rejected``.
Everything else follows from it. If the model cannot write a digit, then no
amount that reaches a customer was hallucinated -- it was formatted from an
integer number of paise by code with tests on it, and a model that wants to
mislead someone about what they are being asked to pay has no channel to do it
through.

The rest pin the other ways generated customer copy goes wrong: a placeholder
the sender will not fill, a link, a request for a credential, and copy that is
too long for the channel it was written for.
"""

from __future__ import annotations

import pytest

from language_doubles import ScriptedModel, UnavailableModel
from salvage_brain.language.formatting import format_paise_inr, group_indian
from salvage_brain.language.nudge import (
    NudgeLanguage,
    NudgeRequest,
    render,
    validate_template,
    write_nudge_copy,
)
from salvage_brain.language.provider import LanguageOutputRejectedError, LanguageUnavailableError
from salvage_brain.policy.models import CommunicationChannel

GOOD = "Namaste, your payment of {amount} to {merchant} did not go through. Please try again."


def request_for(
    *,
    language: NudgeLanguage = NudgeLanguage.EN,
    channel: CommunicationChannel = CommunicationChannel.SMS,
    amount_paise: int = 185000,
    include_payment_link: bool = False,
) -> NudgeRequest:
    return NudgeRequest(
        merchant_display_name="Demo Merchant",
        amount_paise=amount_paise,
        language=language,
        channel=channel,
        taxonomy_code="INSUFFICIENT_FUNDS",
        include_payment_link=include_payment_link,
    )


# ---------------------------------------------------------------------------
# Money, rendered from integers
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("paise", "expected"),
    [
        (0, "₹0.00"),
        (1, "₹0.01"),
        (99, "₹0.99"),
        (100, "₹1.00"),
        (185000, "₹1,850.00"),
        (123456789, "₹12,34,567.89"),
        (100000000000, "₹1,00,00,00,000.00"),  # one hundred crore rupees
        (-500, "-₹5.00"),
    ],
)
def test_amounts_render_from_integer_paise(paise: int, expected: str) -> None:
    assert format_paise_inr(paise) == expected


def test_grouping_is_indian() -> None:
    """Lakhs and crores, because the person reading this is in India."""
    assert group_indian(1234567) == "12,34,567"
    assert group_indian(999) == "999"
    assert group_indian(1000) == "1,000"


def test_rendering_never_divides_by_a_hundred() -> None:
    """The exact case that motivates integer arithmetic.

    ``1999 / 100`` is not 19.99 in binary floating point, and formatting the
    result to two places gets away with it only because rounding happens to
    hide the error. Money is an integer count of paise here, all the way to
    the string.
    """
    assert format_paise_inr(1999) == "₹19.99"
    assert format_paise_inr(2 * 1999) == "₹39.98"


# ---------------------------------------------------------------------------
# What generated copy is allowed to be
# ---------------------------------------------------------------------------


def test_a_well_formed_template_is_accepted_and_rendered() -> None:
    request = request_for()
    template = validate_template(GOOD, request)
    rendered = render(template, request)
    assert "₹1,850.00" in rendered
    assert "Demo Merchant" in rendered
    assert "{" not in rendered


def test_a_message_containing_a_digit_is_rejected() -> None:
    """The property everything else in this file rests on."""
    with pytest.raises(LanguageOutputRejectedError, match="contains a digit"):
        validate_template(
            "Your payment of 1850 rupees to {merchant} failed. {amount}", request_for()
        )


def test_a_digit_in_any_script_is_rejected() -> None:
    """``\\d`` is Unicode-aware, so Devanagari and Tamil digits are digits too.

    A check that only caught 0-9 would pass a Hindi message quoting ₹१८५० and
    let a hallucinated amount through in the one language the check was added
    for.
    """
    with pytest.raises(LanguageOutputRejectedError, match="contains a digit"):
        validate_template("{merchant} से आपका ₹१८५० का भुगतान विफल रहा। {amount}", request_for())


def test_a_missing_placeholder_is_rejected() -> None:
    with pytest.raises(LanguageOutputRejectedError, match=r"\{amount\} exactly once"):
        validate_template("Your payment to {merchant} did not go through.", request_for())


def test_a_repeated_placeholder_is_rejected() -> None:
    with pytest.raises(LanguageOutputRejectedError, match="exactly once"):
        validate_template("{amount} to {merchant}, again {amount}.", request_for())


def test_a_placeholder_the_sender_will_not_fill_is_rejected() -> None:
    """A slot nobody substitutes ships to a customer as literal braces."""
    with pytest.raises(LanguageOutputRejectedError, match="will not fill"):
        validate_template(
            "Hello {customer_name}, your payment of {amount} to {merchant} failed.",
            request_for(),
        )


def test_a_link_placeholder_is_accepted_only_when_requested() -> None:
    with_link = "Your payment of {amount} to {merchant} failed. Pay here: {link}"
    assert validate_template(with_link, request_for(include_payment_link=True))
    with pytest.raises(LanguageOutputRejectedError, match="will not fill"):
        validate_template(with_link, request_for(include_payment_link=False))


def test_rendering_a_link_template_without_a_link_is_refused() -> None:
    """Better to fail than to send a customer a message with a hole in it."""
    request = request_for(include_payment_link=True)
    template = validate_template(
        "Your payment of {amount} to {merchant} failed. Pay here: {link}", request
    )
    with pytest.raises(LanguageOutputRejectedError, match="payment link was requested"):
        render(template, request, payment_link=None)

    assert "https://example.test/pay" in render(
        template, request, payment_link="https://example.test/pay"
    )


def test_a_url_in_generated_copy_is_rejected() -> None:
    """Links are inserted by the sender, never written by the model."""
    with pytest.raises(LanguageOutputRejectedError, match="contains a URL"):
        validate_template(
            "Your payment of {amount} to {merchant} failed. Retry at https://pay.example",
            request_for(),
        )


@pytest.mark.parametrize(
    "text",
    [
        "Your payment of {amount} to {merchant} failed. Share the OTP to retry.",
        "{merchant} को {amount} का भुगतान विफल। कृपया अपना पिन बताएं।",
    ],
)
def test_copy_that_asks_for_a_credential_is_rejected(text: str) -> None:
    """A payment message asking for a credential is a phishing message.

    A backstop rather than a guarantee -- the list is short and will not catch
    every phrasing -- and worth having because the failure mode is a customer
    defrauded in the merchant's name.
    """
    with pytest.raises(LanguageOutputRejectedError, match="credential"):
        validate_template(text, request_for())


def test_an_ordinary_word_containing_a_banned_substring_is_allowed() -> None:
    """"shopping" contains "pin". Word boundaries, not substrings."""
    text = "Thanks for shopping with {merchant}. Your payment of {amount} did not go through."
    assert validate_template(text, request_for())


def test_copy_longer_than_the_channel_allows_is_rejected() -> None:
    """The cap applies after substitution, because that is what gets sent."""
    padding = "very " * 80
    template = f"Your payment of {{amount}} to {{merchant}} {padding}failed."
    request = request_for(channel=CommunicationChannel.SMS)
    with pytest.raises(LanguageOutputRejectedError, match="cap for SMS"):
        render(validate_template(template, request), request)

    # The identical copy is inside WhatsApp's limit, so the cap is per channel
    # rather than a single global number.
    whatsapp = request_for(channel=CommunicationChannel.WHATSAPP)
    assert render(validate_template(template, whatsapp), whatsapp)


# ---------------------------------------------------------------------------
# End to end through the generator
# ---------------------------------------------------------------------------


def test_generated_copy_carries_its_provenance() -> None:
    model = ScriptedModel(GOOD)
    copy = write_nudge_copy(request=request_for(), model=model)

    assert copy.rendered_amount == "₹1,850.00"
    assert copy.rendered.startswith("Namaste")
    assert copy.model == "scripted-test-model"
    assert len(copy.prompt_sha256) == 64
    assert copy.sent is False, "generating copy is not sending it"


def test_the_prompt_carries_no_customer_identity() -> None:
    """The request type has no field for one, and the prompt shows it.

    This is the only part of Salvage that sends text to a third party. What it
    is given is the least it can do the job with: a language, a channel, a
    taxonomy code and the merchant's display name. Who is being messaged is not
    needed to write a sentence, so it is never sent.
    """
    model = ScriptedModel(GOOD)
    write_nudge_copy(request=request_for(), model=model)
    _instruction, payload = model.calls[0]

    for leaked in ("cust_", "@", "+91", "9876543210"):
        assert leaked not in payload
    assert "Demo Merchant" not in payload, "the merchant name is substituted, not prompted"


def test_a_provider_that_does_not_answer_surfaces_as_unavailable() -> None:
    with pytest.raises(LanguageUnavailableError):
        write_nudge_copy(request=request_for(), model=UnavailableModel())
