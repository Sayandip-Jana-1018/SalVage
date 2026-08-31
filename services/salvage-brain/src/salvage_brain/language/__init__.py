"""The language layer: where a language model is allowed, and where it is not.

Principle 4 of this project is that no LLM makes a money decision. That is not
a promise about prompt wording; it is a property of the code. Nothing in this
package is imported by ``policy``, ``diagnosis``, ``taxonomy`` or ``features``,
and ``tests/test_language_boundary.py`` fails the build if that ever changes.
No value produced here reaches a ``PaymentProvider`` call, because
``PaymentProvider`` lives in a different service which has no client for these
routes.

The reason for that boundary, stated plainly: you cannot bound a model's action
space in a prompt, and a payments system has to answer two questions about
every action it took -- replay it bit-identically six weeks later, and prove it
could not have happened more than N times. A sampled token stream answers
neither. ``BoundsEngine`` answers both, in code.

So the model is given the three jobs where the problem genuinely *is* language,
and each is constrained by a validator that runs on its output:

``triage``
    A gateway returns a decline code the deterministic mapper does not know.
    The model reads it and **proposes** a taxonomy mapping into a review queue.
    It is never applied. There is no code path from a proposal to
    ``_EXACT_CODE_MAP``; a human edits that table or it does not change.

``nudge``
    The *policy* decides to contact a customer. The model writes the sentence,
    in the customer's language, into a fixed template -- and is forbidden from
    writing any digit, so every number in the message that reaches a customer
    is formatted by this codebase from integer paise.

``narrate``
    Turn a decision chain that has already been computed into English for an
    operator. Read-only, over facts this service fetched itself, and every
    number in the output must appear in the input.

Each validator rejects rather than repairs. A model response that does not
satisfy the contract raises :class:`LanguageOutputRejectedError` and the caller gets
an error, because a silently repaired answer is indistinguishable from a
correct one at exactly the moment that distinction matters.
"""

from __future__ import annotations

from salvage_brain.language.provider import (
    Completion,
    GeminiLanguageModel,
    LanguageModel,
    LanguageOutputRejectedError,
    LanguageUnavailableError,
    resolve_language_model,
)

__all__ = [
    "Completion",
    "GeminiLanguageModel",
    "LanguageModel",
    "LanguageOutputRejectedError",
    "LanguageUnavailableError",
    "resolve_language_model",
]
