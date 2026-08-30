import { z } from "zod";
import { BrainClient } from "../clients/brainClient.js";
import { CoreClient } from "../clients/coreClient.js";
import type { LedgerEntryView } from "../clients/types.js";

export const explainDecisionSchema = z.object({
  merchant_id: z.string().describe("The merchant identifier"),
  payment_attempt_id: z.string().describe("The payment attempt to explain"),
});

export type ExplainDecisionArgs = z.infer<typeof explainDecisionSchema>;

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/**
 * Explain what the system saw, concluded, and chose for one payment attempt.
 *
 * Every line below comes from a service response. Where a service has nothing
 * to say, this says so.
 *
 * That is the entire change from the previous version, and it was substantial:
 * essentially every field had an `||` fallback to an invented value. An
 * unknown attempt still produced a confident, complete-looking explanation --
 * ₹1,500.00 on `HDFC|UPI|RAZORPAY`, gateway code `U30`, 94% confidence,
 * `SWITCH_RAIL`, corroborated across 14 other merchants, ledger entry #104
 * with hash `c8b14e92a10...`. None of it was real, none of it was marked, and
 * all of it was addressed to an operator through a language model that had no
 * way to know.
 *
 * It also read `is_transient` and `corroborated_by_network` off the diagnosis
 * and `recommended_action` off the decision. No service has ever returned any
 * of those three.
 */
export async function handleExplainDecision(
  args: ExplainDecisionArgs,
  brainClient: BrainClient,
  coreClient: CoreClient,
) {
  const { merchant_id, payment_attempt_id } = args;

  const attempt = await brainClient.getAttempt(merchant_id, payment_attempt_id);
  if (attempt === null) {
    return {
      content: [
        {
          type: "text",
          text: [
            `# No such payment attempt`,
            "",
            `salvage-brain has no attempt \`${payment_attempt_id}\` for merchant \`${merchant_id}\`.`,
            "",
            "Nothing can be explained about an attempt the system never ingested.",
          ].join("\n"),
        },
      ],
    };
  }

  // Fetched together only after the attempt is known to exist. A failure in
  // any of these now propagates: if the diagnosis engine is down, this tool
  // reports that it is down rather than describing a diagnosis it never got.
  const [diagnosis, decision, ledgerEntries] = await Promise.all([
    brainClient.diagnose(merchant_id, payment_attempt_id),
    brainClient.decide(merchant_id, payment_attempt_id),
    coreClient.getLedgerEntries(merchant_id, 50),
  ]);

  const lines: string[] = [
    `# Decision explanation: \`${payment_attempt_id}\``,
    "",
    `**Merchant:** \`${merchant_id}\``,
    "",
    "## 1. What was ingested",
    `- **Order:** \`${attempt.order_id}\``,
    `- **Amount:** ${rupees(attempt.amount_paise)} ${attempt.currency}`,
    `- **Method / issuer / provider:** \`${attempt.payment_method}\` / \`${attempt.issuer}\` / \`${attempt.provider}\``,
    `- **Recurring:** ${attempt.is_recurring ? "yes" : "no"}`,
    `- **First seen:** ${attempt.created_at}`,
  ];

  if (attempt.failures.length === 0) {
    lines.push("- **Failures recorded:** none");
  } else {
    lines.push(`- **Failures recorded:** ${attempt.failures.length}`);
    for (const failure of attempt.failures) {
      lines.push(
        `  - \`${failure.provider_error_code}\` on \`${failure.rail_id}\` at ${failure.event_timestamp}` +
          ` (taxonomy: ${failure.taxonomy_code ?? "unclassified"})`,
      );
    }
  }

  lines.push("", "## 2. Diagnosis");
  if (diagnosis === null) {
    lines.push("- The diagnosis engine has no diagnosis for this attempt.");
  } else {
    lines.push(
      `- **Taxonomy:** \`${diagnosis.taxonomy_code}\` (confidence ${(diagnosis.confidence * 100).toFixed(1)}%)`,
      `- **Root cause:** ${diagnosis.root_cause}`,
      `- **Rail:** \`${diagnosis.rail_id}\` — sensed state \`${diagnosis.rail_state}\``,
      `- **Suggested action:** \`${diagnosis.suggested_action}\``,
      `- **Reasoning:** ${diagnosis.explainability_tokens.map((t) => `\`${t}\``).join(", ") || "none recorded"}`,
      `- **Diagnosed at:** ${diagnosis.diagnosed_at}`,
    );
  }

  lines.push("", "## 3. Policy decision");
  if (decision === null) {
    lines.push("- The policy engine has no decision for this attempt.");
  } else {
    lines.push(
      `- **Chosen action:** \`${decision.chosen_action}\``,
      `- **Recovery probability:** ${(decision.recovery_probability * 100).toFixed(1)}%`,
      `- **Expected net value:** ${rupees(decision.expected_net_value_paise)}`,
      `- **Target rail:** ${decision.target_rail_id ? `\`${decision.target_rail_id}\`` : "n/a"}`,
      `- **Scheduled delay:** ${
        decision.scheduled_delay_seconds === null
          ? "n/a"
          : `${decision.scheduled_delay_seconds}s`
      }`,
      `- **Nudge channel:** ${decision.nudge_channel ?? "n/a"}`,
      `- **Reasoning:** ${decision.reasoning_tokens.map((t) => `\`${t}\``).join(", ") || "none recorded"}`,
      `- **Decided at:** ${decision.decided_at}`,
    );

    if (decision.candidate_valuations.length > 0) {
      lines.push(
        "",
        "### Candidate actions considered",
        "| Action | P(recovery) | Gross | Cost | Net |",
        "|---|---|---|---|---|",
        ...decision.candidate_valuations.map(
          (candidate) =>
            `| \`${candidate.action}\` | ${(candidate.recovery_probability * 100).toFixed(1)}% |` +
            ` ${rupees(candidate.gross_expected_value_paise)} |` +
            ` ${rupees(candidate.estimated_cost_paise)} |` +
            ` ${rupees(candidate.net_expected_value_paise)} |`,
        ),
      );
    }
  }

  lines.push("", "## 4. Ledger record");
  const related = ledgerEntries.filter((entry: LedgerEntryView) =>
    entry.payload.includes(payment_attempt_id),
  );
  if (related.length === 0) {
    lines.push(
      "- No ledger entry in the last 50 for this merchant references this attempt.",
      "- This means no recovery action was recorded against it, not that the ledger is empty.",
    );
  } else {
    for (const entry of related) {
      lines.push(
        `- **#${entry.entry_index}** \`${entry.event_type}\` at ${entry.created_at}`,
        `  - hash \`${entry.entry_hash}\``,
        `  - prev \`${entry.prev_hash}\``,
      );
    }
    lines.push(
      "",
      "Verify the whole chain independently with `GET /api/v1/ledger/merchants/{merchant_id}/verify`.",
    );
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
