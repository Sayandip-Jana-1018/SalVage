"""FastAPI route handlers for recovery policy decision making."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from salvage_brain.diagnosis.engine import DiagnosisEngine
from salvage_brain.features.extractor import FeatureExtractor
from salvage_brain.policy.engine import PolicyEngine
from salvage_brain.policy.models import PolicyDecisionRequest, PolicyDecisionResponse
from salvage_brain.sensing.tracker import default_rail_tracker

router = APIRouter(prefix="/v1/decide", tags=["policy"])


@router.post(
    "",
    response_model=PolicyDecisionResponse,
    responses={
        404: {"description": "No such attempt for this merchant"},
        422: {"description": "Malformed request payload"},
    },
)
def decide_recovery_action(request: PolicyDecisionRequest) -> PolicyDecisionResponse:
    """Computes the optimal recovery policy decision using expected net utility optimization."""
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

    active_rails = default_rail_tracker.get_all_snapshots(
        observation_timestamp=request.observation_timestamp,
    )

    diagnosis = DiagnosisEngine.diagnose(features, rail_snapshot)

    return PolicyEngine.decide(
        features=features,
        rail_snapshot=rail_snapshot,
        diagnosis=diagnosis,
        active_rails=active_rails,
    )
