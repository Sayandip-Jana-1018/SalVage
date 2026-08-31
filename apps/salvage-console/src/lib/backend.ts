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

/**
 * Where the two services are, when nobody has said otherwise.
 *
 * These defaults must match the host ports `docker-compose.yml` publishes, and
 * for salvage-brain that is **8001, not 8000**. The compose file moves both
 * services off the obvious port deliberately -- its own comment calls 8000 and
 * 8080 "among the most contended ports on a developer machine" -- and this
 * module defaulted to 8000 anyway.
 *
 * That is not a cosmetic mismatch, because of what lives on a contended port.
 * On the machine this was found on, port 8000 was serving an unrelated
 * project's API. Every brain-backed route -- the rail matrix, the attempt
 * listing, the language status -- was proxied into that stranger's service,
 * which answered a perfectly correct 404 for paths it had never heard of. The
 * console then rendered "no attempts ingested" and "the layer could not be
 * read": true statements about the wrong server. Nothing errored, nothing
 * logged, and the screens looked merely empty rather than misdirected.
 *
 * A wrong port is therefore not a connection failure. It is a silent read of
 * somebody else's data, and it is why {@link assertSalvageBrain} exists.
 */
export const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL ?? "http://localhost:8001";
export const CORE_BASE_URL = process.env.CORE_BASE_URL ?? "http://localhost:8081";

/**
 * The console's own API key, read server-side only.
 *
 * Deliberately not `NEXT_PUBLIC_`: a `NEXT_PUBLIC_` variable is inlined into
 * the JavaScript bundle and shipped to every visitor, which for a credential
 * means publishing it. Route handlers run on the server, the browser talks only
 * to those handlers, and the key never crosses that line.
 *
 * The console runs as an **operator** key because it has a merchant switcher.
 * That is a real privilege and it is why this application belongs on an
 * internal network behind your own sign-in, not on the public internet.
 */
const API_KEY = process.env.SALVAGE_API_KEY ?? "";

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

/** For the one route that builds its own request rather than going through `request`. */
export const coreAuthHeaders = authHeaders;

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
/**
 * The backend rejected the console's own credential.
 *
 * A distinct type because it is a distinct fact and calls for a different
 * response. "The service is down" is an incident; "this deployment's key is
 * wrong or missing" is a five-minute configuration fix, and a UI that reports
 * the second as the first sends somebody to check a database that is fine.
 */
export class Misconfigured extends Error {
  readonly service: string;

  constructor(service: string, message: string) {
    super(message);
    this.name = "Misconfigured";
    this.service = service;
  }
}

export class NotFound extends Error {
  constructor(what: string) {
    super(what);
    this.name = "NotFound";
  }
}

/* ---------------------------------------------------------------------------
 * Is the thing on that port actually ours?
 *
 * A 404 from a backend is normally an answer: no such attempt, no such
 * merchant. But it is also exactly what an unrelated service returns for a
 * path it has never heard of, and the console cannot tell those apart from the
 * status code alone. That ambiguity is not hypothetical -- it is how a
 * misconfigured BRAIN_BASE_URL presented as five screens quietly reporting
 * "nothing ingested" while a stranger's API answered every request.
 *
 * So on a 404, and only on a 404, ask the address who it is. FastAPI serves
 * `info.title` at /openapi.json, and salvage-brain sets it to "Salvage Brain".
 *
 * Three outcomes, and only one of them changes anything:
 *
 *   confirmed ours       -> the 404 was a real answer. Leave it alone.
 *   confirmed a stranger -> Misconfigured, naming the address. This is a
 *                           configuration bug, not an empty database, and the
 *                           banner already renders those differently.
 *   could not tell       -> leave it alone. A guess here would replace a true
 *                           "no such record" with a false accusation, and this
 *                           console's whole discipline is not doing that.
 *
 * Cached per address, because the answer is a property of the deployment and
 * this sits behind a polling loop.
 * ------------------------------------------------------------------------ */

type Identity = "ours" | "stranger" | "unknown";

const IDENTITY_TTL_MS = 60000;
const identityCache = new Map<string, { verdict: Identity; checkedAt: number }>();

async function identify(baseUrl: string, expectedTitle: string): Promise<Identity> {
  const cached = identityCache.get(baseUrl);
  if (cached && Date.now() - cached.checkedAt < IDENTITY_TTL_MS) return cached.verdict;

  let verdict: Identity = "unknown";
  try {
    const response = await fetch(`${baseUrl}/openapi.json`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (response.ok) {
      const document = (await response.json()) as { info?: { title?: unknown } };
      const title = document.info?.title;
      // An absent title is not evidence of a stranger -- a proxy or a stripped
      // schema can drop it -- so only a present, different title convicts.
      if (typeof title === "string") {
        verdict = title === expectedTitle ? "ours" : "stranger";
      }
    }
  } catch {
    // Unreachable or not JSON. Says nothing either way.
  }

  identityCache.set(baseUrl, { verdict, checkedAt: Date.now() });
  return verdict;
}

/**
 * Turn a 404 into a configuration error when the address is demonstrably not
 * salvage-brain. Returns the error to throw, or null to let the 404 stand.
 */
async function strangerAtTheAddress(
  service: string,
  baseUrl: string,
  expectedTitle: string,
): Promise<Misconfigured | null> {
  if ((await identify(baseUrl, expectedTitle)) !== "stranger") return null;
  return new Misconfigured(
    service,
    `${baseUrl} is not ${service}. Something else is listening there and it answered 404. `
      + `Check ${service === "salvage-brain" ? "BRAIN_BASE_URL" : "CORE_BASE_URL"} against the host port `
      + "docker-compose.yml publishes.",
  );
}

const SERVICE_TITLES: Record<string, string> = {
  "salvage-brain": "Salvage Brain",
};

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
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    throw new BackendUnavailable(service, `${service} is unreachable (${reason})`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Misconfigured(
      service,
      API_KEY
        ? `${service} rejected the console's API key. Check SALVAGE_API_KEY against that service's SALVAGE_API_KEYS.`
        : `${service} requires an API key and SALVAGE_API_KEY is not set on the console. Generate one with scripts/generate_api_key.sh.`,
    );
  }
  if (response.status === 404) {
    const expectedTitle = SERVICE_TITLES[service];
    if (expectedTitle) {
      const stranger = await strangerAtTheAddress(service, baseUrl, expectedTitle);
      if (stranger) throw stranger;
    }
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
const CREDENTIAL_REFUSALS = new Set([401, 403]);
const MAX_DETAIL_CHARS = 400;

export async function brainPostReadingRefusals<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BRAIN_BASE_URL}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      signal: AbortSignal.timeout(LANGUAGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    throw new BackendUnavailable("salvage-brain", `salvage-brain is unreachable (${reason})`);
  }

  if (response.ok) return (await response.json()) as T;

  if (CREDENTIAL_REFUSALS.has(response.status)) {
    throw new Misconfigured(
      "salvage-brain",
      "salvage-brain rejected the console's API key for this request.",
    );
  }
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
