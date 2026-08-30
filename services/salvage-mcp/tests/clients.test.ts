import { describe, expect, it } from "vitest";
import { BrainClient } from "../src/clients/brainClient.js";
import { CoreClient } from "../src/clients/coreClient.js";
import { BackendError } from "../src/clients/errors.js";

/**
 * An unreachable backend must produce an error, not data.
 *
 * The tests this file replaces asserted the exact opposite. They were named
 * "returns fallback rail health if offline" and "returns fallback merchant
 * stats if offline", and they passed by confirming that a client pointed at a
 * dead port produced a healthy-looking rail matrix and a 52.9% recovery rate.
 * The fabrication was not an oversight that slipped past the tests; it was the
 * behaviour the tests pinned in place.
 */

// A port nothing listens on. Connection is refused immediately, so these are
// fast and do not depend on a timeout elapsing.
const DEAD = "http://127.0.0.1:9";

describe("clients fail loudly when a backend is unreachable", () => {
  it("BrainClient.getRailHealth throws rather than inventing a matrix", async () => {
    const client = new BrainClient(DEAD);
    await expect(client.getRailHealth()).rejects.toBeInstanceOf(BackendError);
  });

  it("CoreClient.getMerchantStats throws rather than inventing a recovery rate", async () => {
    const client = new CoreClient(DEAD);
    await expect(client.getMerchantStats("m_1", 24)).rejects.toBeInstanceOf(BackendError);
  });

  it("CoreClient.getLedgerEntries throws rather than inventing hash-chain entries", async () => {
    // The most important assertion in this file. Fabricated ledger entries
    // carry invented `entry_hash` values, and the ledger's whole purpose is
    // to be independently recomputable. Serving made-up hashes through a tool
    // an operator trusts inverts the guarantee it exists to provide.
    const client = new CoreClient(DEAD);
    await expect(client.getLedgerEntries("m_1", 5)).rejects.toBeInstanceOf(BackendError);
  });

  it("CoreClient.verifyLedger throws rather than reporting a chain intact", async () => {
    const client = new CoreClient(DEAD);
    await expect(client.verifyLedger("m_1")).rejects.toBeInstanceOf(BackendError);
  });

  it("the error names the service so an operator knows what is down", async () => {
    const client = new BrainClient(DEAD);
    const error = await client.getRailHealth().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).service).toBe("salvage-brain");
  });
});
