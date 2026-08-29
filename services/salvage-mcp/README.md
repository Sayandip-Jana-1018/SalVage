# salvage-mcp

**Not built yet. This is a Phase 6 deliverable.** TypeScript.

A Model Context Protocol server exposing Salvage to AI assistants, with these
tools:

| Tool | Returns |
|---|---|
| `get_rail_health` | Current health verdict per rail |
| `explain_decision` | Narration of one decision record |
| `get_recovery_stats` | Aggregate recovery performance |
| `list_open_incidents` | Active detected degradations |
| `simulate_policy_change` | Off-policy evaluation of a proposed change |

## The boundary

Every tool here is **read-only or advisory**. None of them moves money, and
none of them is in the decision path. `simulate_policy_change` runs the
off-policy evaluator and returns an estimate with its confidence interval and
overlap diagnostics; it does not deploy anything.

This is the same boundary the whole system is built around: a language model
explains, translates, and answers questions. The decision to move money is made
by deterministic and statistical code that is auditable, testable, sub-100ms,
and identical on replay. See the "Where we deliberately did not use an LLM"
section of [ARCHITECTURE.md](../../ARCHITECTURE.md), completed in Phase 6.
