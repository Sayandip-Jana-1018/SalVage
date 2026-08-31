"""The language-model port and its Gemini adapter.

What has actually been executed against Google's API
----------------------------------------------------

**Nothing, from this repository.** The request body, the endpoint shape, the
authentication header and the response field names below are transcribed from
Google's published Generative Language API and have not been exercised by a run
recorded here. ``scripts/gemini_e2e.sh`` exists to close that gap: it lists the
models the configured key can actually reach and then round-trips one
completion, so nobody has to take this file's word for it.

That distinction is kept deliberately, in the same way
``RazorpayTestProvider`` separates the calls a run has verified from the ones
transcribed from documentation. Code that is written but unrun is not the same
as code that works, and labelling it accurately is cheaper than discovering the
difference during a demonstration.

Determinism
-----------

``temperature=0`` reduces variation. It does not make a hosted model
reproducible: the weights, the tokeniser and the serving stack can all change
under a stable model id, and nothing here can pin them. Every artifact this
package produces therefore records the model id, a SHA-256 of the exact prompt,
and the time -- enough to say *what produced this*, which is the honest
substitute for replay. It is also why nothing in the money path calls this: a
recovery decision must replay bit-identically, and this cannot.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

import httpx

from salvage_brain.config import settings


class LanguageUnavailableError(RuntimeError):
    """The language layer is off, misconfigured, or the provider did not answer.

    Deliberately the same exception for "switched off" and "provider down". A
    caller has to handle both by not having an answer, and the message says
    which one happened.
    """


class LanguageOutputRejectedError(ValueError):
    """The model answered, and the answer failed its validator.

    Raised rather than repaired. A response that has been quietly coerced into
    the expected shape is indistinguishable from one that arrived correct, and
    the difference is the whole point of validating it.
    """


@dataclass(frozen=True, slots=True)
class Completion:
    """One model response, with the provenance needed to attribute it later."""

    text: str
    model: str
    prompt_sha256: str
    finish_reason: str
    latency_ms: int


@runtime_checkable
class LanguageModel(Protocol):
    """The port. Two implementations: Gemini, and a test double in the suite."""

    @property
    def model_id(self) -> str:
        """The provider's identifier for the model, recorded on every artifact."""
        ...

    def complete(self, *, instruction: str, payload: str, max_output_tokens: int) -> Completion:
        """Run one completion, or raise :class:`LanguageUnavailableError`."""
        ...


def prompt_digest(instruction: str, payload: str) -> str:
    """SHA-256 over the exact bytes sent, so an artifact names its own input."""
    digest = hashlib.sha256()
    digest.update(instruction.encode("utf-8"))
    digest.update(b"\x00")
    digest.update(payload.encode("utf-8"))
    return digest.hexdigest()


class GeminiLanguageModel:
    """Google Generative Language API adapter.

    The key travels in the ``x-goog-api-key`` header rather than as a ``?key=``
    query parameter, which the same API also accepts. Query strings end up in
    proxy logs, browser histories and error reports; headers do not.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise LanguageUnavailableError("No API key was supplied for the language model.")
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._client = client

    @property
    def model_id(self) -> str:
        return self._model

    def complete(self, *, instruction: str, payload: str, max_output_tokens: int) -> Completion:
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": payload}]}],
            "generationConfig": {
                "temperature": 0,
                "candidateCount": 1,
                "maxOutputTokens": max_output_tokens,
            },
        }
        url = f"{self._base_url}/models/{self._model}:generateContent"
        headers = {"x-goog-api-key": self._api_key, "Content-Type": "application/json"}

        started = time.perf_counter()
        client = self._client or httpx.Client(timeout=self._timeout)
        try:
            response = client.post(url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            # The exception carries the request URL, which carries no secret
            # because the key is a header. The message is still kept short:
            # this text can reach an operator console.
            raise LanguageUnavailableError(
                f"The language provider did not answer ({type(exc).__name__})."
            ) from exc
        finally:
            if self._client is None:
                client.close()
        elapsed_ms = int((time.perf_counter() - started) * 1000)

        if response.status_code != 200:
            # The body is not echoed. A 4xx from this API repeats the request,
            # and the request contains the prompt.
            raise LanguageUnavailableError(
                f"The language provider returned HTTP {response.status_code}."
            )

        try:
            document = response.json()
        except ValueError as exc:
            raise LanguageUnavailableError("The language provider returned non-JSON.") from exc

        return Completion(
            text=_extract_text(document),
            model=self._model,
            prompt_sha256=prompt_digest(instruction, payload),
            finish_reason=_extract_finish_reason(document),
            latency_ms=elapsed_ms,
        )


def _extract_text(document: Any) -> str:
    """Pull the generated text out of a ``generateContent`` response.

    Every unexpected shape is an error rather than an empty string. An empty
    string would flow onward and be validated as "the model said nothing",
    which is a different fact from "this service could not read the response".
    """
    if not isinstance(document, dict):
        raise LanguageUnavailableError("The language provider returned a non-object response.")
    candidates = document.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        blocked = document.get("promptFeedback", {})
        reason = blocked.get("blockReason") if isinstance(blocked, dict) else None
        if reason:
            raise LanguageUnavailableError(f"The provider refused the prompt ({reason}).")
        raise LanguageUnavailableError("The language provider returned no candidates.")

    first = candidates[0]
    parts = first.get("content", {}).get("parts") if isinstance(first, dict) else None
    if not isinstance(parts, list) or not parts:
        raise LanguageUnavailableError("The language provider returned a candidate with no text.")

    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    if not text.strip():
        raise LanguageUnavailableError("The language provider returned empty text.")
    return text


def _extract_finish_reason(document: Any) -> str:
    if isinstance(document, dict):
        candidates = document.get("candidates")
        if isinstance(candidates, list) and candidates and isinstance(candidates[0], dict):
            reason = candidates[0].get("finishReason")
            if isinstance(reason, str):
                return reason
    return "UNSPECIFIED"


def resolve_language_model() -> LanguageModel:
    """Build the configured model, or refuse and say which piece is missing.

    Fails closed twice over: the feature flag defaults to false, and a key on
    its own does not switch anything on. ``.env`` may well hold a Gemini key
    from some other purpose; finding one is not consent to start calling out.
    """
    if not settings.language_enabled:
        raise LanguageUnavailableError(
            "The language layer is disabled. Set SALVAGE_LANGUAGE_ENABLED=true to switch it on; "
            "it is off by default because it makes outbound calls to a third party."
        )
    key = settings.gemini_api_key
    if key is None or not key.get_secret_value():
        raise LanguageUnavailableError(
            "The language layer is enabled but GEMINI_API_KEY is not set."
        )
    return GeminiLanguageModel(
        api_key=key.get_secret_value(),
        model=settings.gemini_model,
        base_url=settings.gemini_base_url,
        timeout_seconds=settings.language_timeout_seconds,
    )
