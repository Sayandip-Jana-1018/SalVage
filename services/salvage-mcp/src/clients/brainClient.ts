import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import { asBackendError, isNotFound } from "./errors.js";
import type {
  AttemptView,
  DiagnosisResponse,
  PolicyDecisionResponse,
  RailHealthMatrix,
} from "./types.js";

const SERVICE = "salvage-brain";

/**
 * Read-only client for salvage-brain.
 *
 * Two rules, both learned from the version this replaces.
 *
 * **Never fabricate.** Every method either returns what the service returned,
 * returns `null` for a genuine 404, or throws. There is no fallback data. The
 * previous implementation returned a hand-written rail health matrix -- naming
 * real banks, with invented error rates -- whenever the brain was unreachable,
 * and nothing downstream could tell that from a measurement.
 *
 * **Never flatten failures into absence.** A 404 means the record does not
 * exist. Anything else means the question was not answered, and that is
 * reported as an error rather than as "no".
 *
 * This client performs no writes and the brain exposes none. That is what
 * keeps "no LLM makes a money decision" checkable: the MCP server is wired to
 * a service that has no way to move money even if asked.
 */
export class BrainClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = config.brainBaseUrl) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
      headers: { "Content-Type": "application/json" },
    });
  }

  /** GET /v1/sensing/rails */
  async getRailHealth(): Promise<RailHealthMatrix> {
    try {
      const response = await this.client.get<RailHealthMatrix>("/v1/sensing/rails");
      return response.data;
    } catch (error) {
      throw asBackendError(SERVICE, error);
    }
  }

  /** GET /v1/attempts/{merchantId}/{attemptId}. `null` only on a real 404. */
  async getAttempt(merchantId: string, attemptId: string): Promise<AttemptView | null> {
    try {
      const response = await this.client.get<AttemptView>(
        `/v1/attempts/${encodeURIComponent(merchantId)}/${encodeURIComponent(attemptId)}`,
      );
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw asBackendError(SERVICE, error);
    }
  }

  /** POST /v1/diagnose. `null` only when the attempt does not exist. */
  async diagnose(merchantId: string, attemptId: string): Promise<DiagnosisResponse | null> {
    try {
      const response = await this.client.post<DiagnosisResponse>("/v1/diagnose", {
        merchant_id: merchantId,
        payment_attempt_id: attemptId,
      });
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw asBackendError(SERVICE, error);
    }
  }

  /**
   * POST /v1/decide. `null` only when the attempt does not exist.
   *
   * This asks the policy engine what it *would* choose. It does not commit
   * anything: execution lives in salvage-core behind the bounds engine, and
   * there is no route from here to it.
   */
  async decide(merchantId: string, attemptId: string): Promise<PolicyDecisionResponse | null> {
    try {
      const response = await this.client.post<PolicyDecisionResponse>("/v1/decide", {
        merchant_id: merchantId,
        payment_attempt_id: attemptId,
      });
      return response.data;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw asBackendError(SERVICE, error);
    }
  }
}
