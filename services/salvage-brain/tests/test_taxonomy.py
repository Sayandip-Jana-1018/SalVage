"""Unit tests for the Universal Failure Taxonomy Engine."""

from __future__ import annotations

import pytest

from salvage_brain.taxonomy.codes import TaxonomyCode
from salvage_brain.taxonomy.mapper import FailureTaxonomyMapper


@pytest.mark.parametrize(
    ("code", "desc", "expected_tax", "min_conf"),
    [
        # Synthetic simulator codes
        ("INSUFFICIENT_FUNDS", None, TaxonomyCode.INSUFFICIENT_FUNDS, 0.95),
        ("ISSUER_DOWN", None, TaxonomyCode.ISSUER_OUTAGE, 0.90),
        ("NETWORK_TIMEOUT", None, TaxonomyCode.NETWORK_TIMEOUT, 0.90),
        ("MANDATE_EXPIRED", None, TaxonomyCode.MANDATE_INVALID, 0.95),
        ("MANDATE_REVOKED", None, TaxonomyCode.MANDATE_INVALID, 0.95),
        ("CARD_EXPIRED", None, TaxonomyCode.CARD_EXPIRED, 0.95),
        ("RISK_DECLINE", None, TaxonomyCode.RISK_DECLINE, 0.85),
        ("CUSTOMER_DROPPED", None, TaxonomyCode.CUSTOMER_ABANDONED, 0.90),
        # NPCI UPI Error Codes
        ("U30", None, TaxonomyCode.INSUFFICIENT_FUNDS, 0.90),
        ("ZM", None, TaxonomyCode.INSUFFICIENT_FUNDS, 0.90),
        ("ZA", None, TaxonomyCode.ISSUER_OUTAGE, 0.90),
        ("U16", None, TaxonomyCode.ISSUER_OUTAGE, 0.90),
        ("XB", None, TaxonomyCode.NETWORK_TIMEOUT, 0.90),
        ("U66", None, TaxonomyCode.NETWORK_TIMEOUT, 0.90),
        ("ZH", None, TaxonomyCode.MANDATE_INVALID, 0.90),
        ("U19", None, TaxonomyCode.CUSTOMER_ABANDONED, 0.85),
        # ISO-8583 Card Codes
        ("51", None, TaxonomyCode.INSUFFICIENT_FUNDS, 0.90),
        ("54", None, TaxonomyCode.CARD_EXPIRED, 0.95),
        ("91", None, TaxonomyCode.ISSUER_OUTAGE, 0.90),
        ("41", None, TaxonomyCode.RISK_DECLINE, 0.90),
        # Textual description pattern matches
        (
            "GENERIC_ERROR",
            "Customer account has insufficient balance",
            TaxonomyCode.INSUFFICIENT_FUNDS,
            0.85,
        ),
        ("ERR_001", "Bank CBS core is unavailable", TaxonomyCode.ISSUER_OUTAGE, 0.85),
        ("DECLINE", "Transaction timed out at NPCI switch", TaxonomyCode.NETWORK_TIMEOUT, 0.85),
        (
            "UNKNOWN_ERR",
            "Subscription mandate revoked by customer",
            TaxonomyCode.MANDATE_INVALID,
            0.90,
        ),
        ("ERR_AUTH", "User dropped during OTP entry", TaxonomyCode.CUSTOMER_ABANDONED, 0.85),
        ("SUSPECT", "Blocked due to velocity risk limits", TaxonomyCode.RISK_DECLINE, 0.80),
    ],
)
def test_taxonomy_mapper_correctly_classifies_signals(
    code: str,
    desc: str | None,
    expected_tax: TaxonomyCode,
    min_conf: float,
) -> None:
    result = FailureTaxonomyMapper.map_failure(code, desc)
    assert result.taxonomy_code == expected_tax
    assert result.confidence >= min_conf
    assert result.rule_matched != ""


def test_unknown_error_code_falls_back_to_unknown_taxonomy() -> None:
    result = FailureTaxonomyMapper.map_failure(
        "XYZ_COMPLETELY_RANDOM_CODE_999",
        "Some arbitrary unparseable text",
    )
    assert result.taxonomy_code == TaxonomyCode.UNKNOWN
    assert result.confidence <= 0.30
    assert result.rule_matched == "fallback_unknown"
