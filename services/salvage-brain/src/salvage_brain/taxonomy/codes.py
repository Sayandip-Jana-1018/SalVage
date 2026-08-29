"""Universal failure taxonomy codes and mapping structures for Salvage."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class TaxonomyCode(StrEnum):
    """The canonical taxonomy of payment failures in Salvage.

    Every observed failure from every provider maps into exactly one of these
    categories before the diagnosis engine processes it.
    """

    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    ISSUER_OUTAGE = "ISSUER_OUTAGE"
    NETWORK_TIMEOUT = "NETWORK_TIMEOUT"
    MANDATE_INVALID = "MANDATE_INVALID"
    CARD_EXPIRED = "CARD_EXPIRED"
    RISK_DECLINE = "RISK_DECLINE"
    CUSTOMER_ABANDONED = "CUSTOMER_ABANDONED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True, slots=True)
class TaxonomyMappingResult:
    """The structured classification of a raw failure signal."""

    taxonomy_code: TaxonomyCode
    confidence: float
    rule_matched: str
    is_retryable_same_rail: bool
    is_retryable_alternative_rail: bool
