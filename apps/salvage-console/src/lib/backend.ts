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

/**
 * Longer, for the language routes only.
 *
 * Those calls sit behind a hosted model and a generation genuinely takes
 * seconds. Five seconds would time out on a working request and report the
 * service as unreachable, which is a lie about what happened.
 */
const LANGUAGE_TIMEOUT_MS = 30000;

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

/**
 * A refusal the caller is meant to read.
 *
 * The generic path above deliberately never puts a backend's response body into
 * an error, because a 500 can carry a stack trace or a connection string and
 * that text reaches a browser. The language routes are the one place where the
 * body is worth surfacing: 409, 422, 502 and 503 from `/v1/language/*` are
 * raised by handlers in this repository with messages written to be shown to an
 * operator -- "the message contains a digit", "the layer is disabled", "this
 * code already maps to ISSUER_OUTAGE". Losing those and rendering "the backend
 * returned HTTP 502" would turn a precise refusal into a shrug.
 *
 * Only those four statuses, only a string `detail`, and truncated. Anything
 * else falls through to {@link BackendUnavailable}.
 */
export class Refused extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "Refused";
    this.status = status;
  }
}

const READABLE_REFUSALS = new Set([409, 422, 502, 503]);
const MAX_DETAIL_CHARS = 400;

export async function brainPostReadingRefusals<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BRAIN_BASE_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(LANGUAGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    throw new BackendUnavailable("salvage-brain", `salvage-brain is unreachable (${reason})`);
  }

  if (response.ok) return (await response.json()) as T;

  if (READABLE_REFUSALS.has(response.status)) {
    const detail = await readDetail(response);
    if (detail) throw new Refused(response.status, detail);
  }
  throw new BackendUnavailable(
    "salvage-brain",
    `salvage-brain returned HTTP ${response.status}`,
    response.status,
  );
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail.slice(0, MAX_DETAIL_CHARS);
      // FastAPI renders a 422 as a list of validation errors. Rendering the
      // whole structure to an operator is noise; saying it was malformed is not.
      if (Array.isArray(detail)) return "The console sent a request this endpoint rejected.";
    }
  } catch {
    // A refusal whose body is not JSON is not worth guessing at.
  }
  return null;
}
