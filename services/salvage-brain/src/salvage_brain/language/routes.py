"""HTTP surface for the language layer.

Every route here is read-only with respect to money and to the database. None
of them can cause an effect: the only write in the package appends a proposal
to a review file, and a proposal is not an effect.

When the layer is switched off, ``/status`` still answers 200 and says so. That
is deliberate -- a console needs to render "this is off" differently from "this
is broken", and an endpoint that 503s for both makes the two indistinguishable.
The three working routes do 503, because for them "off" and "unreachable" have
the same consequence: no answer.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from salvage_brain import attempts
from salvage_brain.config import settings
from salvage_brain.diagnosis.engine import DiagnosisEngine
from salvage_brain.features.extractor import FeatureExtractor
from salvage_brain.language.narrate import Narration, narrate_decision
from salvage_brain.language.nudge import NudgeCopy, NudgeRequest, write_nudge_copy
from salvage_brain.language.provider import (
    LanguageModel,
    LanguageOutputRejectedError,
    LanguageUnavailableError,
    resolve_language_model,
)
from salvage_brain.language.triage import AlreadyMappedError, TriageResponse, triage_unknown_code
from salvage_brain.policy.engine import PolicyEngine
from salvage_brain.sensing.tracker import default_rail_tracker

router = APIRouter(prefix="/v1/language", tags=["language"])


def language_model_dependency() -> LanguageModel:
    """Resolve the configured model, or refuse the request with a 503.

    A FastAPI dependency rather than a direct call so the test suite can
    substitute a double through ``app.dependency_overrides`` and exercise every
    validator without a network, a key, or a bill.
    """
    try:
        return resolve_language_model()
    except LanguageUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


LanguageModelDep = Annotated[LanguageModel, Depends(language_model_dependency)]



class LanguageStatus(BaseModel):
    """What the layer is configured to do. Carries no secret."""

    enabled: bool
    model: str
    review_queue_configured: bool
    # Stated on the wire so a console cannot imply otherwise by omission.
    money_path: str = (
        "No route in this service executes a recovery action, and nothing here is "
        "imported by the diagnosis, policy or taxonomy code."
    )


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_error_code: str = Field(min_length=1, max_length=64)
    provider_error_description: str | None = Field(default=None, max_length=500)


class NarrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    merchant_id: str = Field(min_length=1)
    payment_attempt_id: str = Field(min_length=1)


@router.get("/status", response_model=LanguageStatus)
def language_status() -> LanguageStatus:
    return LanguageStatus(
        enabled=settings.language_enabled,
        model=settings.gemini_model,
        review_queue_configured=settings.triage_queue_path is not None,
    )


@router.post(
    "/triage",
    response_model=TriageResponse,
    responses={
        409: {"description": "The deterministic mapper already resolves this code"},
        502: {"description": "The model answered with something that failed validation"},
        503: {"description": "The language layer is disabled or the provider did not answer"},
    },
)
def triage(request: TriageRequest, model: LanguageModelDep) -> TriageResponse:
    """Propose a taxonomy mapping for a code the deterministic mapper cannot resolve.

    The proposal is never applied. ``applied`` is a literal false on the
    response type, and no code in this repository writes to the mapper table.
    """
    try:
        return triage_unknown_code(
            provider_error_code=request.provider_error_code,
            provider_error_description=request.provider_error_description,
            model=model,
            queue_path=settings.triage_queue_path,
        )
    except AlreadyMappedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except LanguageOutputRejectedError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except LanguageUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.post(
    "/nudge-copy",
    response_model=NudgeCopy,
    responses={
        502: {"description": "The generated copy failed validation and was refused"},
        503: {"description": "The language layer is disabled or the provider did not answer"},
    },
)
def nudge_copy(request: NudgeRequest, model: LanguageModelDep) -> NudgeCopy:
    """Write customer copy for a nudge the policy engine has already chosen.

    Generating copy does not send it. Nothing in salvage-brain has an outbound
    channel to a customer; delivery is salvage-core's, under the bounds engine.
    """
    try:
        return write_nudge_copy(request=request, model=model)
    except LanguageOutputRejectedError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except LanguageUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.post(
    "/narrate",
    response_model=Narration,
    responses={
        404: {"description": "No such attempt for this merchant"},
        502: {"description": "The narration failed validation and was refused"},
        503: {"description": "The language layer is disabled or the provider did not answer"},
    },
)
def narrate(request: NarrationRequest, model: LanguageModelDep) -> Narration:
    """Narrate one decision chain, over facts this service fetched itself."""
    attempt = attempts.get_attempt(request.merchant_id, request.payment_attempt_id)

    features = FeatureExtractor.extract_features(
        merchant_id=request.merchant_id,
        payment_attempt_id=request.payment_attempt_id,
        observation_timestamp=None,
    )
    diagnosis = None
    decision = None
    if features is not None:
        rail_snapshot = default_rail_tracker.get_snapshot(
            rail_id=features.rail_id, observation_timestamp=None
        )
        diagnosis = DiagnosisEngine.diagnose(features, rail_snapshot)
        decision = PolicyEngine.decide(
            features=features,
            rail_snapshot=rail_snapshot,
            diagnosis=diagnosis,
            active_rails=default_rail_tracker.get_all_snapshots(observation_timestamp=None),
        )

    try:
        return narrate_decision(
            attempt=attempt, diagnosis=diagnosis, decision=decision, model=model
        )
    except LanguageOutputRejectedError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except LanguageUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


