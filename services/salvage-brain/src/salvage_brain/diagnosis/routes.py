"""FastAPI route handlers for payment failure diagnosis."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from salvage_brain.diagnosis.engine import DiagnosisEngine
from salvage_brain.diagnosis.models import DiagnosisRequest, DiagnosisResponse
from salvage_brain.features.extractor import FeatureExtractor
from salvage_brain.sensing.tracker import default_rail_tracker

router = APIRouter(prefix="/v1/diagnose", tags=["diagnosis"])


@router.post(
    "",
    response_model=DiagnosisResponse,
    responses={
        404: {"description": "No such attempt for this merchant"},
        422: {"description": "Malformed request payload"},
    },
)
def diagnose_payment_attempt(request: DiagnosisRequest) -> DiagnosisResponse:
    """Diagnoses a payment failure and infers calibrated root cause with explainability."""
    features = FeatureExtractor.extract_features(
        merchant_id=request.merchant_id,
        payment_attempt_id=request.payment_attempt_id,
        observation_timestamp=request.observation_timestamp,
    )

    if features is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No such attempt for this merchant",
        )

    rail_snapshot = default_rail_tracker.get_snapshot(
        rail_id=features.rail_id,
        observation_timestamp=request.observation_timestamp,
    )

    return DiagnosisEngine.diagnose(features, rail_snapshot)
