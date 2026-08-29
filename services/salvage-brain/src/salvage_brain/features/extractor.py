"""Point-in-time feature extraction ensuring zero future data leakage."""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from sqlalchemy import text

import salvage_brain.database as database

IST = ZoneInfo("Asia/Kolkata")


@dataclass(frozen=True, slots=True)
class ExtractedFeatures:
    """Immutable point-in-time feature vector for an attempt."""

    merchant_id: str
    payment_attempt_id: str
    customer_id: str | None
    amount_paise: int
    amount_log: float
    currency: str
    payment_method: str
    provider: str
    issuer: str
    is_recurring: bool
    rail_id: str
    hour_of_day_ist: int
    day_of_week: int
    day_of_month: int
    is_salary_cycle_pre_payday: bool
    is_salary_cycle_post_payday: bool
    customer_total_attempts: int
    customer_failure_rate: float
    failure_event_count: int
    latest_error_code: str
    latest_error_desc: str | None
    observation_timestamp: dt.datetime


_ATTEMPT_QUERY = text(
    """
    SELECT id, merchant_id, order_id, payment_attempt_id, customer_id,
           amount_paise, currency, payment_method, provider, issuer,
           is_recurring, created_at
      FROM salvage.payment_attempts
     WHERE merchant_id = :merchant_id
       AND payment_attempt_id = :payment_attempt_id
    """
)

_FAILURES_QUERY = text(
    """
    SELECT event_id, provider_error_code, provider_error_desc, rail_id, event_timestamp
      FROM salvage.failure_events
     WHERE merchant_id = :merchant_id
       AND payment_attempt_id = :payment_attempt_uuid
       AND event_timestamp <= :cutoff_timestamp
     ORDER BY event_timestamp ASC
    """
)

_CUSTOMER_HISTORY_QUERY = text(
    """
    SELECT count(*) as total_attempts,
           sum(case when fe.id is not null then 1 else 0 end) as failed_attempts
      FROM salvage.payment_attempts pa
      LEFT JOIN salvage.failure_events fe
        ON pa.id = fe.payment_attempt_id AND pa.merchant_id = fe.merchant_id
     WHERE pa.merchant_id = :merchant_id
       AND pa.customer_id = :customer_id
       AND pa.created_at <= :cutoff_timestamp
    """
)


class FeatureExtractor:
    """Extracts features for an attempt with strict point-in-time boundary constraints."""

    @classmethod
    def extract_features(
        cls,
        merchant_id: str,
        payment_attempt_id: str,
        observation_timestamp: dt.datetime | None = None,
    ) -> ExtractedFeatures | None:
        """Extracts point-in-time features scoped strictly by merchant_id and cutoff timestamp."""
        with database.engine.connect() as conn:
            row = conn.execute(
                _ATTEMPT_QUERY,
                {"merchant_id": merchant_id, "payment_attempt_id": payment_attempt_id},
            ).mappings().first()

            if row is None:
                return None

            attempt_created = row["created_at"]
            if attempt_created.tzinfo is None:
                attempt_created = attempt_created.replace(tzinfo=dt.UTC)

            cutoff = observation_timestamp or attempt_created
            if cutoff.tzinfo is None:
                cutoff = cutoff.replace(tzinfo=dt.UTC)

            # Query failures observed on or before cutoff
            failures = conn.execute(
                _FAILURES_QUERY,
                {
                    "merchant_id": merchant_id,
                    "payment_attempt_uuid": row["id"],
                    "cutoff_timestamp": cutoff,
                },
            ).mappings().all()

            # Query historical customer statistics if customer_id present
            cust_id = row.get("customer_id")
            cust_total = 1
            cust_failed = 0
            if cust_id:
                cust_stats = conn.execute(
                    _CUSTOMER_HISTORY_QUERY,
                    {
                        "merchant_id": merchant_id,
                        "customer_id": cust_id,
                        "cutoff_timestamp": cutoff,
                    },
                ).mappings().first()
                if cust_stats:
                    cust_total = max(int(cust_stats["total_attempts"] or 1), 1)
                    cust_failed = int(cust_stats["failed_attempts"] or 0)

        # Compute calendar and salary cycle anchors in IST
        created_ist = cutoff.astimezone(IST)
        hour_ist = created_ist.hour
        day_of_week = created_ist.weekday()
        day_of_month = created_ist.day

        # Indian salary cycle: pre-payday pressure (days 21-27), payday (days 28-31, 1-7)
        is_pre_payday = 20 <= day_of_month <= 27
        is_post_payday = (day_of_month >= 28) or (day_of_month <= 7)

        amount_paise = int(row["amount_paise"])
        amount_log = math.log1p(max(amount_paise, 0))

        latest_error_code = "UNKNOWN"
        latest_error_desc: str | None = None
        rail_id = f"{row['issuer']}|{row['payment_method'].upper()}|{row['provider'].upper()}"

        if failures:
            latest = failures[-1]
            latest_error_code = latest["provider_error_code"]
            latest_error_desc = latest.get("provider_error_desc")
            if latest.get("rail_id"):
                rail_id = latest["rail_id"]

        cust_failure_rate = float(cust_failed / cust_total)

        return ExtractedFeatures(
            merchant_id=row["merchant_id"],
            payment_attempt_id=row["payment_attempt_id"],
            customer_id=cust_id,
            amount_paise=amount_paise,
            amount_log=amount_log,
            currency=row["currency"],
            payment_method=row["payment_method"],
            provider=row["provider"],
            issuer=row["issuer"],
            is_recurring=bool(row["is_recurring"]),
            rail_id=rail_id,
            hour_of_day_ist=hour_ist,
            day_of_week=day_of_week,
            day_of_month=day_of_month,
            is_salary_cycle_pre_payday=is_pre_payday,
            is_salary_cycle_post_payday=is_post_payday,
            customer_total_attempts=cust_total,
            customer_failure_rate=cust_failure_rate,
            failure_event_count=len(failures),
            latest_error_code=latest_error_code,
            latest_error_desc=latest_error_desc,
            observation_timestamp=cutoff,
        )
