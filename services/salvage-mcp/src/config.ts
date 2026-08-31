export interface SalvageConfig {
  brainBaseUrl: string;
  coreBaseUrl: string;
  apiKey: string;
  serverName: string;
  serverVersion: string;
}

export const config: SalvageConfig = {
  /**
   * The host ports `docker-compose.yml` publishes -- 8001 and 8081, not the
   * 8000 and 8080 the containers listen on internally. The compose file moves
   * both off the obvious port on purpose, calling them "among the most
   * contended ports on a developer machine", and defaulting to the contended
   * ones means this server reads whatever else happens to be running there.
   */
  brainBaseUrl: process.env.BRAIN_BASE_URL || "http://localhost:8001",
  coreBaseUrl: process.env.CORE_BASE_URL || "http://localhost:8081",
  /**
   * The key this server authenticates with.
   *
   * Both backends require `Authorization: Bearer <key>` on every route except
   * the health probes. Without one, every tool here returns "I could not reach
   * the service", which is technically true and useless -- so the tools say
   * plainly when the cause is a missing key instead.
   *
   * Scope is the operator's choice. A `merchant` key confines this server to
   * one tenant, which is the right setting when an assistant is being given to
   * a merchant. An `operator` key lets it read every tenant, which is right for
   * an internal support desk and wrong for anyone else.
   */
  apiKey: process.env.SALVAGE_API_KEY || "",
  serverName: "salvage-mcp",
  serverVersion: "0.1.0",
};

/** Header block for an authenticated backend call. Omitted entirely when unset. */
export function authHeaders(): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}
