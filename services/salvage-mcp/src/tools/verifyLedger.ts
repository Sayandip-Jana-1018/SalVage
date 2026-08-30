import { z } from "zod";
import { CoreClient } from "../clients/coreClient.js";

export const verifyLedgerSchema = z.object({
  merchant_id: z.string().describe("Merchant whose ledger chain should be verified"),
});

export type VerifyLedgerArgs = z.infer<typeof verifyLedgerSchema>;

/**
 * Ask salvage-core to rewalk a merchant's hash chain and recompute every hash.
 *
 * This tool replaces `simulate_policy_change`, which was removed rather than
 * repaired. That tool produced a "Doubly Robust estimate" with a confidence
 * interval and a Kish effective sample size, formatted as a statistical
 * report. It computed them with `Math.random()` around two hardcoded
 * constants. No simulation ran, no data was read, and the output was
 * indistinguishable from the genuine off-policy evaluation that
 * `packages/salvage-eval` performs. Restoring it honestly means exposing the
 * eval harness behind an endpoint and calling that; until then there is no
 * tool, because a plausible fake is worse than a missing feature.
 *
 * What is here instead is real, and is the claim most worth being able to
 * check: that the audit trail has not been altered. Verification happens
 * server-side against stored rows, and `valid: false` is a successful answer
 * reporting tampering, not an error.
 */
export async function handleVerifyLedger(args: VerifyLedgerArgs, coreClient: CoreClient) {
  const result = await coreClient.verifyLedger(args.merchant_id);

  const lines: string[] = [
    `# Ledger verification: \`${result.merchant_id}\``,
    "",
    `**Verdict:** ${result.valid ? "INTACT" : "TAMPERED"}`,
    `**Entries verified:** ${result.verified_entries}`,
  ];

  if (result.valid) {
    lines.push(
      `**Chain head:** \`${result.head_hash ?? "genesis"}\``,
      "",
      result.verified_entries === 0
        ? "The chain is empty. An empty chain is trivially valid; it is not evidence that anything was recorded."
        : "Every entry's recorded hash matches the hash recomputed from its stored content, and every entry links to its predecessor.",
    );
  } else {
    lines.push(
      `**First bad entry:** #${result.failure_index}`,
      `**Reason:** ${result.failure_reason}`,
      "",
      "The chain is broken at that index. Entries before it verified; entries from it onward cannot be trusted.",
    );
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
