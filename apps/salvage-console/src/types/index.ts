export type RailState = "HEALTHY" | "DEGRADED" | "DOWN";

export type RecoveryAction =
  | "RETRY_IMMEDIATE"
  | "RETRY_SCHEDULED"
  | "SWITCH_RAIL"
  | "CUSTOMER_NUDGE"
  | "NO_ACTION";

export interface RailHealthCell {
  bank: string;
  method: "UPI" | "CARD" | "NETBANKING";
  rail_id: string;
  state: RailState;
  error_rate_1m: number;
  error_rate_5m: number;
  error_rate_15m: number;
  p95_latency_ms: number;
  healthy_alternative?: string;
}

export interface IncidentInfo {
  id: string;
  rail_id: string;
  bank: string;
  severity: RailState;
  root_cause: string;
  started_at: string;
  affected_merchants: number;
  money_at_risk_paise: number;
  auto_rerouted_count: number;
  active_mitigation: string;
}

export interface DecisionStreamItem {
  id: string;
  merchant_id: string;
  customer_id: string;
  amount_paise: number;
  original_rail: string;
  taxonomy_code: string;
  chosen_action: RecoveryAction;
  target_rail?: string;
  bounds_status: "PERMITTED" | "REJECTED";
  expected_net_paise: number;
  created_at: string;
}

export interface ActionValuationDetail {
  action: RecoveryAction;
  probability: number;
  gross_expected_paise: number;
  cost_paise: number;
  friction_penalty_paise: number;
  net_utility_paise: number;
  is_chosen: boolean;
  is_permitted_by_bounds: boolean;
  rejection_reason?: string;
}

export interface AutopsyDetail {
  attempt_id: string;
  merchant_id: string;
  customer_id: string;
  amount_paise: number;
  created_at: string;
  raw_error_code: string;
  raw_error_message: string;
  payment_method: string;
  rail_id: string;
  taxonomy_code: string;
  taxonomy_confidence: number;
  rail_sensing_state: RailState;
  cross_tenant_corroborated: boolean;
  corroborating_merchants_count: number;
  actions_evaluated: ActionValuationDetail[];
  bounds_evaluation: {
    verdict: "PERMITTED" | "REJECTED";
    attempt_count: number;
    max_attempts: number;
    quiet_hours_active: boolean;
    customer_opted_out: boolean;
    contact_budget_remaining: number;
  };
  ledger_proof: {
    entry_index: number;
    entry_hash: string;
    previous_hash: string;
    merkle_root: string;
    verified: boolean;
  };
}
