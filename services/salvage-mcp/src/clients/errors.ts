import axios from "axios";
import { config } from "../config.js";

/**
 * A backend call that did not succeed.
 *
 * This type exists so that "the service is down" and "the thing you asked for
 * does not exist" stop being the same outcome. The previous clients caught
 * every error and returned either `null` or invented data, which collapsed
 * three very different situations into one:
 *
 *   - the attempt genuinely is not in the database
 *   - salvage-brain is not running
 *   - salvage-brain answered, but with something this client cannot parse
 *
 * An operator asking a language model "what did we decide about payment X?"
 * needs those distinguished. "No decision was recorded" and "I could not
 * reach the decision service" lead to opposite next actions, and a tool that
 * reports the first when the second is true is worse than a tool that fails.
 */
export class BackendError extends Error {
  readonly service: string;
  readonly status?: number;

  constructor(service: string, message: string, status?: number) {
    super(message);
    this.name = "BackendError";
    this.service = service;
    this.status = status;
  }
}

/**
 * Convert a thrown value into a {@link BackendError}, preserving the status.
 *
 * The message deliberately names the service and the URL but never echoes a
 * response body: a 500 from a backend can carry a stack trace or a connection
 * string, and this text is handed to a language model that may repeat it.
 */
export function asBackendError(service: string, error: unknown): BackendError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const target = error.config?.url ?? "unknown endpoint";
    if (status === 401 || status === 403) {
      // Distinguished because the fix is different and cheap. "The service is
      // down" sends someone to check a database; "this server has no key"
      // is one environment variable. An assistant relaying the first when the
      // second is true wastes an operator's afternoon.
      return new BackendError(
        service,
        config.apiKey
          ? `${service} rejected this server's API key. Check SALVAGE_API_KEY against that service's SALVAGE_API_KEYS.`
          : `${service} requires an API key and SALVAGE_API_KEY is not set for salvage-mcp. Generate one with scripts/generate_api_key.sh.`,
        status,
      );
    }
    if (status !== undefined) {
      return new BackendError(
        service,
        `${service} returned HTTP ${status} for ${target}`,
        status,
      );
    }
    return new BackendError(
      service,
      `${service} is unreachable at ${target} (${error.code ?? "no response"})`,
    );
  }
  return new BackendError(
    service,
    `${service} call failed: ${error instanceof Error ? error.name : "unknown error"}`,
  );
}

/** True when the error is a definite "not found" rather than a failure. */
export function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
