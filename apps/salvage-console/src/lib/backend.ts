/**
 * Server-side access to salvage-brain and salvage-core.
 *
 * This module is imported only by route handlers under `src/app/api`. The
 * browser never talks to the services directly, for two reasons: the backend
 * URLs stay server-side, and there is no cross-origin request to configure
 * CORS for. The console is a thin proxy over two APIs it does not own.
 *
 * Nothing here has a fallback. If a service is down, these throw and the route
 * handler turns that into a 502 with a reason; the UI then says the service is
 * unreachable. It does not render zeros, and it does not render an example.
 * The console this replaces had no network calls at all -- every screen was
 * drawn from a checked-in `mockData.ts` that named real banks and attached
 * invented failure rates to them.
 */

export const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL ?? "http://localhost:8000";
export const CORE_BASE_URL = process.env.CORE_BASE_URL ?? "http://localhost:8081";

/** How long to wait on a backend before giving up. */
const TIMEOUT_MS = 5000;

export class BackendUnavailable extends Error {
  readonly service: string;
  readonly status?: number;

  constructor(service: string, message: string, status?: number) {
    super(message);
    this.name = "BackendUnavailable";
    this.service = service;
    this.status = status;
  }
}

/** Thrown for a definite 404, which is an answer rather than a failure. */
export class NotFound extends Error {
  constructor(what: string) {
    super(what);
    this.name = "NotFound";
  }
}

async function request<T>(
  service: string,
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Operator dashboards must not be served from a build-time snapshot.
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    throw new BackendUnavailable(service, `${service} is unreachable (${reason})`);
  }

  if (response.status === 404) {
    throw new NotFound(`${service} has no record at ${path}`);
  }
  if (!response.ok) {
    // The body is deliberately not read into the error. A 500 from a backend
    // can carry a stack trace or a connection string, and this text reaches a
    // browser.
    throw new BackendUnavailable(service, `${service} returned HTTP ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

export const brain = {
  get: <T>(path: string) => request<T>("salvage-brain", BRAIN_BASE_URL, path),
  post: <T>(path: string, body: unknown) =>
    request<T>("salvage-brain", BRAIN_BASE_URL, path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const core = {
  get: <T>(path: string) => request<T>("salvage-core", CORE_BASE_URL, path),
};
