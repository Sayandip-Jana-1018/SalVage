"""A scripted language model for the suite.

This is a test double, not a stub standing in for unbuilt code: the real
adapter is ``GeminiLanguageModel`` and it is what the service constructs. What
this replaces is the network, so that every validator in the package can be
exercised against a chosen response -- including the responses that must be
refused, which a live model would only produce by luck.

No test in this repository calls a language provider. A suite that needs a
third-party API and a billed key to pass is a suite that gets skipped.
"""

from __future__ import annotations

from salvage_brain.language.provider import (
    Completion,
    LanguageUnavailableError,
    prompt_digest,
)


class ScriptedModel:
    """Returns a fixed string and records what it was asked."""

    def __init__(self, response: str, *, model_id: str = "scripted-test-model") -> None:
        self._response = response
        self._model_id = model_id
        self.calls: list[tuple[str, str]] = []

    @property
    def model_id(self) -> str:
        return self._model_id

    def complete(self, *, instruction: str, payload: str, max_output_tokens: int) -> Completion:
        self.calls.append((instruction, payload))
        return Completion(
            text=self._response,
            model=self._model_id,
            prompt_sha256=prompt_digest(instruction, payload),
            finish_reason="STOP",
            latency_ms=1,
        )


class UnavailableModel:
    """Stands in for a provider that does not answer."""

    @property
    def model_id(self) -> str:
        return "unavailable-test-model"

    def complete(self, *, instruction: str, payload: str, max_output_tokens: int) -> Completion:
        raise LanguageUnavailableError("The language provider did not answer (test double).")
