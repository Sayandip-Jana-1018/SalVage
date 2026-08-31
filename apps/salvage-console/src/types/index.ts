/**
 * Wire types, transcribed from the services that serve them.
 *
 * Each interface mirrors a response model in salvage-brain or salvage-core,
 * field for field. The previous version of this file described a system that
 * did not exist: `RailHealthCell` carried `error_rate_1m`, `error_rate_15m`
 * and `p95_latency_ms`, none of which the sensing service publishes, and a
 * `bank` field holding a real bank's display name. It typed a hand-written
 * `mockData.ts` rather than any API.
 *
 * Sources:
 *   RailHealthMatrix   services/salvage-brain/.../sensing/routes.py
 *   AttemptView        services/salvage-brain/.../attempts.py
 *   DiagnosisResponse  services/salvage-brain/.../diagnosis/models.py
 *   PolicyDecision     services/salvage-brain/.../policy/models.py
 *   MerchantStats      services/salvage-core/.../api/MerchantStats.java
 *   LedgerEntryView    services/salvage-core/.../api/LedgerController.java
 */

export type RailState = "HEALTHY" | "DEGRADED" | "DOWN";

export type RecoveryAction =
  | "RETRY_IMMEDIATE"
  | "RETRY_SCHEDULED"
  | "SWITCH_RAIL"
  | "CUSTOMER_NUDGE"
  | "NO_ACTION";

export interface RailHealthView {
  rail_id: string;
  state: RailState;
  success_rate_5m: number;
  failure_velocity_5m: number;
  last_evaluated_at: string;
}

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

export interface DiagnosisView {
  payment_attempt_id: string;
  taxonomy_code: string;
  confidence: number;
  root_cause: string;
  rail_id: string;
  rail_state: string;
  explainability_tokens: string[];
  suggested_action: string;
  diagnosed_at: string;
}

export interface ActionValuation {
  action: RecoveryAction;
  recovery_probability: number;
  gross_expected_value_paise: number;
  estimated_cost_paise: number;
  net_expected_value_paise: number;
}

export interface PolicyDecisionView {
  payment_attempt_id: string;
  chosen_action: RecoveryAction;
  recovery_probability: number;
  expected_net_value_paise: number;
  target_rail_id: string | null;
  scheduled_delay_seconds: number | null;
  nudge_channel: string | null;
  reasoning_tokens: string[];
  candidate_valuations: ActionValuation[];
  decided_at: string;
}

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

/** Everything the autopsy page shows for one attempt. */
export interface AutopsyView {
  attempt: AttemptView;
  diagnosis: DiagnosisView | null;
  decision: PolicyDecisionView | null;
  ledger_entries: LedgerEntryView[];
}

/** One attempt in the listing served by `GET /v1/attempts/{merchant_id}`. */
export interface AttemptSummary {
  merchant_id: string;
  payment_attempt_id: string;
  order_id: string;
  amount_paise: number;
  currency: string;
  payment_method: string;
  issuer: string;
  created_at: string;
  failure_count: number;
}

export interface AttemptPage {
  merchant_id: string;
  limit: number;
  attempts: AttemptSummary[];
}

/* ---------------------------------------------------------------------------
 * The language layer (Phase 11).
 *
 * Everything below describes generated text, and every one of these shapes
 * carries the model id and a digest of the prompt that produced it. None of it
 * reaches a money decision: see docs/adr/0008-language-model-boundary.md.
 * ------------------------------------------------------------------------- */

export interface LanguageStatus {
  enabled: boolean;
  model: string;
  review_queue_configured: boolean;
  money_path: string;
}

export interface TriageProposal {
  proposed_taxonomy_code: string;
  is_retryable_same_rail: boolean;
  is_retryable_alternative_rail: boolean;
  rationale: string;
  specification_to_check: string;
}

export interface TriageResponse {
  provider_error_code: string;
  provider_error_description: string | null;
  current_mapping: string;
  proposal: TriageProposal;
  status: "PROPOSED_PENDING_HUMAN_REVIEW";
  /** Always false. The wire format cannot say otherwise. */
  applied: false;
  model: string;
  prompt_sha256: string;
  generated_at: string;
  queued_to: string | null;
}

export interface NudgeCopy {
  template: string;
  rendered: string;
  language: string;
  channel: string;
  amount_paise: number;
  rendered_amount: string;
  placeholders: string[];
  model: string;
  prompt_sha256: string;
  generated_at: string;
  /** Always false. Generating copy is not sending it. */
  sent: boolean;
}

export interface Narration {
  payment_attempt_id: string;
  narration: string;
  model: string;
  prompt_sha256: string;
  generated_at: string;
}

/** The envelope every console API route returns. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; service?: string };
