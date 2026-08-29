"""Deterministic failure taxonomy classifier for raw provider error codes and messages."""

from __future__ import annotations

import re

from salvage_brain.taxonomy.codes import TaxonomyCode, TaxonomyMappingResult

# Direct exact-code lookup table for known error codes across NPCI, ISO-8583, and major gateways.
_EXACT_CODE_MAP: dict[str, tuple[TaxonomyCode, float, bool, bool]] = {
    # Synthetic Simulator Codes
    "INSUFFICIENT_FUNDS": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.98, False, False),
    "ISSUER_DOWN": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "NETWORK_TIMEOUT": (TaxonomyCode.NETWORK_TIMEOUT, 0.90, True, True),
    "MANDATE_EXPIRED": (TaxonomyCode.MANDATE_INVALID, 0.99, False, False),
    "MANDATE_REVOKED": (TaxonomyCode.MANDATE_INVALID, 0.99, False, False),
    "MANDATE_INVALID": (TaxonomyCode.MANDATE_INVALID, 0.99, False, False),
    "CARD_EXPIRED": (TaxonomyCode.CARD_EXPIRED, 0.99, False, False),
    "RISK_DECLINE": (TaxonomyCode.RISK_DECLINE, 0.90, False, False),
    "CUSTOMER_DROPPED": (TaxonomyCode.CUSTOMER_ABANDONED, 0.92, True, True),
    "CUSTOMER_CANCELLED": (TaxonomyCode.CUSTOMER_ABANDONED, 0.95, False, False),
    # NPCI UPI Error Codes
    "U30": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.96, False, False),
    "ZM": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.96, False, False),
    "ZA": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "U16": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "U28": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "XB": (TaxonomyCode.NETWORK_TIMEOUT, 0.92, True, True),
    "U66": (TaxonomyCode.NETWORK_TIMEOUT, 0.92, True, True),
    "U69": (TaxonomyCode.NETWORK_TIMEOUT, 0.90, True, True),
    "U96": (TaxonomyCode.NETWORK_TIMEOUT, 0.90, True, True),
    "ZH": (TaxonomyCode.MANDATE_INVALID, 0.98, False, False),
    "ZG": (TaxonomyCode.MANDATE_INVALID, 0.98, False, False),
    "Z9": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.95, False, False),
    "U19": (TaxonomyCode.CUSTOMER_ABANDONED, 0.90, True, True),
    "U29": (TaxonomyCode.CUSTOMER_ABANDONED, 0.92, True, True),
    "XY": (TaxonomyCode.CUSTOMER_ABANDONED, 0.90, True, True),
    "Z8": (TaxonomyCode.RISK_DECLINE, 0.90, False, False),
    "U48": (TaxonomyCode.RISK_DECLINE, 0.92, False, False),
    # ISO-8583 / Card Decline Codes
    "51": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.95, False, False),
    "61": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.90, False, False),
    "54": (TaxonomyCode.CARD_EXPIRED, 0.99, False, False),
    "91": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "96": (TaxonomyCode.ISSUER_OUTAGE, 0.90, True, True),
    "05": (TaxonomyCode.RISK_DECLINE, 0.70, False, True),  # Do Not Honor
    "14": (TaxonomyCode.CARD_EXPIRED, 0.85, False, False),  # Invalid card number
    "41": (TaxonomyCode.RISK_DECLINE, 0.95, False, False),  # Lost card
    "43": (TaxonomyCode.RISK_DECLINE, 0.95, False, False),  # Stolen card
    "57": (TaxonomyCode.RISK_DECLINE, 0.85, False, False),  # Transaction not permitted
    "68": (TaxonomyCode.NETWORK_TIMEOUT, 0.90, True, True),  # Response received too late
    # Gateway Textual Error Slugs
    "INSUFFICIENT_BALANCE": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.98, False, False),
    "NOT_ENOUGH_BALANCE": (TaxonomyCode.INSUFFICIENT_FUNDS, 0.98, False, False),
    "ISSUER_NOT_AVAILABLE": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "ISSUER_INOPERATIVE": (TaxonomyCode.ISSUER_OUTAGE, 0.95, True, True),
    "BANK_SYSTEM_ERROR": (TaxonomyCode.ISSUER_OUTAGE, 0.90, True, True),
    "TIMED_OUT": (TaxonomyCode.NETWORK_TIMEOUT, 0.92, True, True),
    "GATEWAY_TIMEOUT": (TaxonomyCode.NETWORK_TIMEOUT, 0.92, True, True),
    "NPCI_TIMEOUT": (TaxonomyCode.NETWORK_TIMEOUT, 0.92, True, True),
    "AUTHENTICATION_TIMEOUT": (TaxonomyCode.CUSTOMER_ABANDONED, 0.90, True, True),
    "OTP_EXPIRED": (TaxonomyCode.CUSTOMER_ABANDONED, 0.90, True, True),
    "PAYER_ABORTED": (TaxonomyCode.CUSTOMER_ABANDONED, 0.95, False, False),
    "MANDATE_INACTIVE": (TaxonomyCode.MANDATE_INVALID, 0.98, False, False),
    "PRE_DEBIT_FAILED": (TaxonomyCode.MANDATE_INVALID, 0.95, False, False),
    "HIGH_RISK_TRANSACTION": (TaxonomyCode.RISK_DECLINE, 0.92, False, False),
    "VELOCITY_EXCEEDED": (TaxonomyCode.RISK_DECLINE, 0.95, False, False),
}

# Regex pattern rules for fallback matching on provider error descriptions
_DESCRIPTION_PATTERNS: list[tuple[re.Pattern[str], TaxonomyCode, float, bool, bool]] = [
    (
        re.compile(r"(insufficient|low|not\s*enough|exceeds?).*?(balance|funds|limit)", re.I),
        TaxonomyCode.INSUFFICIENT_FUNDS,
        0.92,
        False,
        False,
    ),
    (
        re.compile(
            r"(issuer|bank|cbs).*?(down|unavailable|unreachable|outage|offline|error|degraded|inoperative)",
            re.I,
        ),
        TaxonomyCode.ISSUER_OUTAGE,
        0.90,
        True,
        True,
    ),
    (
        re.compile(
            r"(timeout|timed\s*out|response\s*delayed|no\s*response\s*from\s*(bank|npci|switch))",
            re.I,
        ),
        TaxonomyCode.NETWORK_TIMEOUT,
        0.88,
        True,
        True,
    ),
    (
        re.compile(
            r"(mandate|auto-?debit|subscription).*?(expired|revoked|inactive|invalid|cancelled)",
            re.I,
        ),
        TaxonomyCode.MANDATE_INVALID,
        0.95,
        False,
        False,
    ),
    (
        re.compile(r"(card|instrument).*?(expired|invalid\s*expiry)", re.I),
        TaxonomyCode.CARD_EXPIRED,
        0.98,
        False,
        False,
    ),
    (
        re.compile(r"(risk|fraud|velocity|block(ed)?|stolen|lost|restricted|blacklisted)", re.I),
        TaxonomyCode.RISK_DECLINE,
        0.85,
        False,
        False,
    ),
    (
        re.compile(
            r"(abandon(ed)?|cancelled\s*by\s*user|otp\s*(expired|timeout)|user\s*dropped)",
            re.I,
        ),
        TaxonomyCode.CUSTOMER_ABANDONED,
        0.88,
        True,
        True,
    ),
]


class FailureTaxonomyMapper:
    """Classifies raw failure events into canonical taxonomy codes."""

    @classmethod
    def map_failure(
        cls,
        provider_error_code: str | None,
        provider_error_desc: str | None = None,
    ) -> TaxonomyMappingResult:
        """Resolves a raw error code and optional description to a TaxonomyMappingResult."""
        normalized_code = (provider_error_code or "").strip().upper()

        # 1. Exact match on normalized error code
        if normalized_code in _EXACT_CODE_MAP:
            tax_code, conf, retry_same, retry_diff = _EXACT_CODE_MAP[normalized_code]
            return TaxonomyMappingResult(
                taxonomy_code=tax_code,
                confidence=conf,
                rule_matched=f"exact_code:{normalized_code}",
                is_retryable_same_rail=retry_same,
                is_retryable_alternative_rail=retry_diff,
            )

        # 2. Check description patterns if code was generic or unmapped
        desc = (provider_error_desc or "").strip()
        if desc:
            for pattern, tax_code, conf, retry_same, retry_diff in _DESCRIPTION_PATTERNS:
                if pattern.search(desc):
                    return TaxonomyMappingResult(
                        taxonomy_code=tax_code,
                        confidence=conf,
                        rule_matched=f"desc_pattern:{pattern.pattern[:20]}",
                        is_retryable_same_rail=retry_same,
                        is_retryable_alternative_rail=retry_diff,
                    )

        # 3. Check error code substrings
        if normalized_code:
            for pattern, tax_code, conf, retry_same, retry_diff in _DESCRIPTION_PATTERNS:
                if pattern.search(normalized_code):
                    return TaxonomyMappingResult(
                        taxonomy_code=tax_code,
                        confidence=conf * 0.95,
                        rule_matched=f"code_pattern:{pattern.pattern[:20]}",
                        is_retryable_same_rail=retry_same,
                        is_retryable_alternative_rail=retry_diff,
                    )

        # 4. Fail-closed fallback: UNKNOWN with minimal baseline confidence
        return TaxonomyMappingResult(
            taxonomy_code=TaxonomyCode.UNKNOWN,
            confidence=0.20,
            rule_matched="fallback_unknown",
            is_retryable_same_rail=False,
            is_retryable_alternative_rail=True,
        )
