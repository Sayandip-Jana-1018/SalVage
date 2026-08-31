"""The Gemini adapter, exercised against a mock transport rather than Google.

Two things are being checked here, and neither of them is "does Gemini work".

The first is the request this code *would* send: the endpoint, the key
travelling as a header rather than in the query string, and the body shape. The
adapter has never been run against the live API from this repository -- see the
module docstring on ``language/provider.py`` and ``scripts/gemini_e2e.sh``,
which exists to close that gap -- so a test that pins the request is the only
standing evidence of what it does.

The second is every way a response can be unusable: a non-200, a blocked
prompt, no candidates, empty text, a transport failure. All of them raise. None
of them return an empty string, because an empty string flows onward and gets
validated as "the model said nothing", which is a different fact from "this
service could not read the answer".
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from salvage_brain.language.provider import (
    GeminiLanguageModel,
    LanguageUnavailableError,
    prompt_digest,
    resolve_language_model,
)

KEY = "test-key-not-a-real-credential"


def model_with(handler: Any) -> GeminiLanguageModel:
    return GeminiLanguageModel(
        api_key=KEY,
        model="gemini-test",
        base_url="https://generativelanguage.example/v1beta",
        timeout_seconds=1.0,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def ok_response(text: str = "hello") -> dict[str, Any]:
    return {
        "candidates": [
            {"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}
        ]
    }


def test_the_request_is_shaped_the_way_the_api_expects() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = request.read().decode("utf-8")
        return httpx.Response(200, json=ok_response())

    completion = model_with(handler).complete(
        instruction="be brief", payload="a payload", max_output_tokens=64
    )

    assert seen["url"] == (
        "https://generativelanguage.example/v1beta/models/gemini-test:generateContent"
    )
    assert seen["headers"]["x-goog-api-key"] == KEY
    assert "be brief" in seen["body"] and "a payload" in seen["body"]
    assert '"temperature": 0' in seen["body"] or '"temperature":0' in seen["body"]
    assert completion.text == "hello"
    assert completion.model == "gemini-test"
    assert completion.finish_reason == "STOP"


def test_the_key_never_appears_in_the_url() -> None:
    """Query strings reach proxy logs, browser histories and error reports.

    The same API accepts ``?key=``. This adapter uses the header form, and this
    test is what stops someone "simplifying" it back.
    """
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json=ok_response())

    model_with(handler).complete(instruction="i", payload="p", max_output_tokens=8)
    assert KEY not in seen["url"]
    assert "?" not in seen["url"]


def test_a_non_200_raises_and_does_not_echo_the_body() -> None:
    """A 4xx from this API repeats the request, and the request is the prompt."""

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "API key not valid: sk-secret"}})

    with pytest.raises(LanguageUnavailableError) as caught:
        model_with(handler).complete(instruction="i", payload="p", max_output_tokens=8)

    assert "HTTP 400" in str(caught.value)
    assert "sk-secret" not in str(caught.value)


def test_a_blocked_prompt_says_so() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})

    with pytest.raises(LanguageUnavailableError, match="SAFETY"):
        model_with(handler).complete(instruction="i", payload="p", max_output_tokens=8)


@pytest.mark.parametrize(
    "document",
    [
        {},
        {"candidates": []},
        {"candidates": [{"content": {"parts": []}}]},
        {"candidates": [{"content": {"parts": [{"text": "   "}]}}]},
    ],
)
def test_an_unusable_response_raises_rather_than_returning_empty(document: dict[str, Any]) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=document)

    with pytest.raises(LanguageUnavailableError):
        model_with(handler).complete(instruction="i", payload="p", max_output_tokens=8)


def test_a_transport_failure_surfaces_as_unavailable() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    with pytest.raises(LanguageUnavailableError, match="did not answer"):
        model_with(handler).complete(instruction="i", payload="p", max_output_tokens=8)


def test_a_missing_key_is_refused_at_construction() -> None:
    with pytest.raises(LanguageUnavailableError, match="No API key"):
        GeminiLanguageModel(
            api_key="", model="m", base_url="https://example.test", timeout_seconds=1.0
        )


def test_the_prompt_digest_identifies_the_exact_input() -> None:
    """Provenance, not integrity: a hosted model cannot be replayed, so an
    artifact records what it was asked instead of pretending it can be rerun."""
    a = prompt_digest("instruction", "payload")
    assert len(a) == 64
    assert a == prompt_digest("instruction", "payload")
    assert a != prompt_digest("instruction", "payload ")
    # The separator matters: without it, ("ab", "c") and ("a", "bc") would hash
    # to the same value and two different prompts would share provenance.
    assert prompt_digest("ab", "c") != prompt_digest("a", "bc")


def test_the_factory_refuses_while_the_flag_is_off() -> None:
    """The default state of a fresh clone, asserted."""
    with pytest.raises(LanguageUnavailableError, match="disabled"):
        resolve_language_model()
