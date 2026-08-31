import axios, { AxiosInstance } from "axios";
import { authHeaders, config } from "../config.js";
import { asBackendError } from "./errors.js";
import type { ChainVerification, LedgerEntryView, MerchantStats } from "./types.js";

const SERVICE = "salvage-core";

/**
 * Read-only client for salvage-core.
 *
 * The endpoints below exist. That sentence is worth writing down, because the
 * version of this file it replaces called `/api/v1/telemetry/...` and
 * `/api/v1/ledger/...` at a time when salvage-core served nothing but
 * `/health/liveness` and `/health/readiness`. Every call failed, every failure
 * was caught, and the catch block returned invented figures -- a 52.9%
 * recovery rate, ₹181,000 recovered, and, worst of all, fabricated ledger
 * entries with made-up `entry_hash` values.
 *
 * That last one is the reason this class now throws instead. The ledger is the
 * product's integrity claim: it exists so that an auditor can recompute the
 * chain and confirm nothing was altered. Serving invented hashes through a
 * tool that an operator trusts turns that guarantee inside out. If core is
 * unreachable, the honest answer is "I could not reach the ledger", and it is
 * the only acceptable one.
 */
export class CoreClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = config.coreBaseUrl) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
  }

  /** GET /api/v1/telemetry/merchants/{id}/stats */
  async getMerchantStats(merchantId: string, windowHours = 24): Promise<MerchantStats> {
    try {
      const response = await this.client.get<MerchantStats>(
        `/api/v1/telemetry/merchants/${encodeURIComponent(merchantId)}/stats`,
        { params: { hours: windowHours } },
      );
      return response.data;
    } catch (error) {
      throw asBackendError(SERVICE, error);
    }
  }

  /** GET /api/v1/ledger/merchants/{id}/entries */
  async getLedgerEntries(merchantId: string, limit = 20): Promise<LedgerEntryView[]> {
    try {
      const response = await this.client.get<LedgerEntryView[]>(
        `/api/v1/ledger/merchants/${encodeURIComponent(merchantId)}/entries`,
        { params: { limit } },
      );
      return response.data;
    } catch (error) {
      throw asBackendError(SERVICE, error);
    }
  }

  /**
   * GET /api/v1/ledger/merchants/{id}/verify
   *
   * Rewalks the chain server-side and recomputes every hash. A `valid: false`
   * result is a successful call reporting tampering, not an error.
   */
  async verifyLedger(merchantId: string): Promise<ChainVerification> {
    try {
      const response = await this.client.get<ChainVerification>(
        `/api/v1/ledger/merchants/${encodeURIComponent(merchantId)}/verify`,
      );
      return response.data;
    } catch (error) {
      throw asBackendError(SERVICE, error);
    }
  }
}
