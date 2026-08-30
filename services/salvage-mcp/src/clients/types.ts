/**
 * Wire types, transcribed from the services that actually serve them.
 *
 * Every interface here mirrors a response model in salvage-brain or a record
 * in salvage-core, field for field and name for name. That sounds obvious. The
 * previous version of this file did not do it: it declared `is_transient` and
 * `corroborated_by_network` on the diagnosis response and `recommended_action`
 * and `estimated_recovery_probability` on the policy response, none of which
 * any service has ever returned. Those fields rendered as `undefined` in the
 * MCP tool output, and nobody noticed, because each client caught its own
 * failures and returned fabricated data instead of surfacing them.
 *
 * The sources are:
 *   DiagnosisResponse      services/salvage-brain/.../diagnosis/models.py
 *   PolicyDecision         services/salvage-brain/.../policy/models.py
 *   RailHealthMatrix       services/salvage-brain/.../sensing/routes.py
 *   AttemptView            services/salvage-brain/.../attempts.py
 *   MerchantStats          services/salvage-core/.../api/MerchantStats.java
 *   LedgerEntryView        services/salvage-core/.../api/LedgerController.java
 *
 * `contracts/openapi/brain.v1.yaml` is the committed contract for the brain
 * half and is enforced against the served spec by scripts/check_contracts.py.
 */

export type RailState = "HEALTHY" | "DEGRADED" | "DOWN";

/** One rail's health, as served by GET /v1/sensing/rails. */
export interface RailHealthView {
  rail_id: string;
  state: RailState;
  success_rate_5m: number;
  failure_velocity_5m: number;
  last_evaluated_at: string;
}

/** The full matrix. Note `rails` is an array, not a map keyed by rail id. */
export interface RailHealthMatrix {
  timestamp: string;
  rails: RailHealthView[];
}

export interface FailureSummary {
  event_id: string;
  provider_error_code: string;
  rail_id: string;
  event_timestamp: string;
  taxonomy_code: string | null;
}

export interface AttemptView {
  merchant_id: string;
  order_id: string;
  payment_attempt_id: string;
  amount_paise: number;
  currency: string;
  payment_method: string;
  provider: string;
  issuer: string;
  is_recurring: boolean;
  created_at: string;
  failures: FailureSummary[];
}

export type SuggestedAction =
  | "RETRY_IMMEDIATE"
  | "RETRY_SMART_SCHEDULE"
  | "SWITCH_RAIL"
  | "CUSTOMER_NUDGE"
  | "NO_ACTION";

export interface DiagnosisResponse {
  payment_attempt_id: string;
  taxonomy_code: string;
  confidence: number;
  root_cause: string;
  rail_id: string;
  rail_state: string;
  explainability_tokens: string[];
  suggested_action: SuggestedAction;
  diagnosed_at: string;
}

export type RecoveryActionType =
  | "RETRY_IMMEDIATE"
  | "RETRY_SCHEDULED"
  | "SWITCH_RAIL"
  | "CUSTOMER_NUDGE"
  | "NO_ACTION";

export interface ActionValuation {
  action: RecoveryActionType;
  recovery_probability: number;
  gross_expected_value_paise: number;
  estimated_cost_paise: number;
  net_expected_value_paise: number;
}

export interface PolicyDecisionResponse {
  payment_attempt_id: string;
  chosen_action: RecoveryActionType;
  recovery_probability: number;
  expected_net_value_paise: number;
  target_rail_id: string | null;
  scheduled_delay_seconds: number | null;
  nudge_channel: "WHATSAPP" | "SMS" | "EMAIL" | null;
  reasoning_tokens: string[];
  candidate_valuations: ActionValuation[];
  decided_at: string;
}

/**
 * Counted telemetry from salvage-core.
 *
 * There is deliberately no `recovery_rate_pct` and no `gross_recovered_inr`.
 * salvage-core cannot honestly compute either yet -- see the class comment on
 * MerchantStats.java. The previous version of this file declared both and the
 * client filled them with invented values when core was unreachable.
 */
export interface MerchantStats {
  merchant_id: string;
  window_hours: number;
  window_start: string;
  failures_observed: number;
  decisions_made: number;
  decisions_permitted: number;
  decisions_refused_by_bounds: number;
  expected_net_value_paise_permitted: number;
  taxonomy_breakdown: Record<string, number>;
  action_breakdown: Record<string, number>;
  truncated: boolean;
}

export interface LedgerEntryView {
  entry_index: number;
  merchant_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload: string;
  prev_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface ChainVerification {
  merchant_id: string;
  valid: boolean;
  verified_entries: number;
  head_hash: string | null;
  failure_index: number | null;
  failure_reason: string | null;
}
