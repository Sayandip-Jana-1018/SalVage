import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CORE_BASE_URL, coreAuthHeaders } from "@/lib/backend";
import type { ApiResult } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Publish a real `payment_failed.v1` event through salvage-core.
 *
 * The event is assembled here rather than accepted from the browser so that a
 * page cannot publish arbitrary attributed events by calling this route
 * directly. The caller chooses a scenario and an amount; everything else --
 * ids, timestamps, the provider -- is generated server-side.
 *
 * `provider` is always `simulated`. These events did not come from a payment
 * gateway, and labelling them with one would put fabricated traffic into the
 * same dataset as real traffic with nothing to tell them apart.
 */
interface PublishRequest {
  merchant_id: string;
  amount_paise: number;
  scenario: keyof typeof SCENARIOS;
}

/**
 * The three failure shapes the checkout page can produce.
 *
 * Issuers are synthetic. The page this replaces published nothing at all and
 * printed a script naming real banks with invented error rates against them;
 * these ids match the simulator's synthetic issuers so that generated traffic
 * is visibly not a claim about anyone.
 */
const SCENARIOS = {
  issuer_outage: {
    label: "Issuer outage",
    issuer: "issuer_gamma",
    payment_method: "upi",
    provider_error_code: "SIM_ISSUER_UNAVAILABLE",
    provider_error_description: "The issuing bank did not respond",
  },
  insufficient_funds: {
    label: "Insufficient funds",
    issuer: "issuer_alpha",
    payment_method: "card",
    provider_error_code: "SIM_INSUFFICIENT_FUNDS",
    provider_error_description: "The account does not hold sufficient balance",
  },
  network_timeout: {
    label: "Network timeout",
    issuer: "issuer_beta",
    payment_method: "netbanking",
    provider_error_code: "SIM_ISSUER_TIMEOUT",
    provider_error_description: "The issuing bank timed out",
  },
} as const;

export async function POST(request: Request): Promise<NextResponse<ApiResult<unknown>>> {
  let body: PublishRequest;
  try {
    body = (await request.json()) as PublishRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request body." }, { status: 400 });
  }

  const scenario = SCENARIOS[body.scenario];
  if (!scenario) {
    return NextResponse.json(
      { ok: false, error: `Unknown scenario. Expected one of ${Object.keys(SCENARIOS).join(", ")}.` },
      { status: 400 },
    );
  }

  const amount = Number.isFinite(body.amount_paise) ? Math.round(body.amount_paise) : 0;
  if (amount < 1) {
    // The contract requires a positive amount: a zero-value payment cannot fail.
    return NextResponse.json(
      { ok: false, error: "amount_paise must be a positive integer." },
      { status: 400 },
    );
  }

  const suffix = randomUUID().slice(0, 8);
  const event = {
    event_id: randomUUID(),
    event_version: 1,
    event_timestamp: new Date().toISOString().replace(/\.(\d{3})\d*Z$/, ".$1Z"),
    merchant_id: body.merchant_id,
    order_id: `ord_console_${suffix}`,
    payment_attempt_id: `pay_console_${suffix}`,
    amount_paise: amount,
    currency: "INR",
    payment_method: scenario.payment_method,
    provider: "simulated",
    provider_error_code: scenario.provider_error_code,
    provider_error_description: scenario.provider_error_description,
    issuer: scenario.issuer,
    customer_id: `cust_console_${suffix}`,
    customer_phone_hash: null,
    customer_email_hash: null,
    is_recurring: false,
    mandate_id: null,
    card_network: scenario.payment_method === "card" ? "rupay" : null,
    card_type: scenario.payment_method === "card" ? "debit" : null,
    upi_app: scenario.payment_method === "upi" ? "app_one" : null,
    metadata: { sim_origin: "console_checkout" },
  };

  let response: Response;
  try {
    response = await fetch(`${CORE_BASE_URL}/api/v1/demo/payment-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...coreAuthHeaders() },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "salvage-core is unreachable. Start the stack with `make up`." },
      { status: 502 },
    );
  }

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "salvage-core rejected the console's API key. Check SALVAGE_API_KEY against salvage-core's SALVAGE_API_KEYS.",
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const reason =
      detail && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : `salvage-core returned HTTP ${response.status}`;
    const hint =
      reason === "demo_ingest_disabled"
        ? "The demo ingest endpoint is disabled. Set salvage.demo-ingest.enabled=true on salvage-core to use this page."
        : reason;
    return NextResponse.json({ ok: false, error: hint }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      merchant_id: body.merchant_id,
      payment_attempt_id: event.payment_attempt_id,
      order_id: event.order_id,
      scenario: scenario.label,
    },
  });
}
