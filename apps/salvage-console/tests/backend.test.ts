import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How the console reports a credential problem.
 *
 * "The service is down" and "this deployment's key is wrong" are different
 * facts with different fixes, and a console that reports the second as the
 * first sends somebody to check a database that is fine. That distinction is
 * the same discipline the four UI states already follow, applied to the one
 * failure a fresh deployment is most likely to hit.
 *
 * `fetch` is stubbed rather than a server started: what is under test is the
 * mapping from a status code to a message, and standing up salvage-core to
 * produce a 401 would test Spring's filter, which has its own tests in Java.
 */

/**
 * A credential-shaped fixture, assembled rather than written inline.
 *
 * GitGuardian flagged the literal this replaces -- a JDBC URL with a password
 * in it -- and it was right to. A scanner cannot tell a fixture password from a
 * real one, and it should not try: the default has to be to flag it. The cost
 * of leaving it is not the fake password, it is that a repository generating
 * recurring false positives teaches its owner to dismiss the alerts, and then
 * the real leak gets dismissed with them.
 *
 * The test loses nothing. What is under test is that a value in a backend's
 * error body does not reach the caller, and that holds however the value was
 * built.
 */
const FIXTURE_SECRET = "fixture-value-not-a-credential";
const LEAKY_ERROR_BODY = `jdbc:postgresql://user:${FIXTURE_SECRET}@db/salvage`;

const ORIGINAL_ENV = { ...process.env };

async function freshBackend(env: Record<string, string | undefined>) {
  // The module reads its key at import time, so each case needs a fresh copy.
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../src/lib/backend.js");
}

function respondWith(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({}), { status })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the console's own credential", () => {
  it("is sent as a bearer token on every backend call", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const { brain } = await freshBackend({ SALVAGE_API_KEY: "svg_operator_test" });
    await brain.get("/v1/sensing/rails");

    const headers = calls[0].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer svg_operator_test");
  });

  it("is omitted rather than sent empty when unset", async () => {
    // An `Authorization: Bearer ` header with nothing after it is a malformed
    // credential, and a service is entitled to treat it as an attempt. Sending
    // no header at all is the honest description of having no key.
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const { brain } = await freshBackend({ SALVAGE_API_KEY: undefined });
    await brain.get("/v1/sensing/rails");

    expect((calls[0].headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("a rejected key is not an outage", () => {
  it.each([401, 403])("maps %i to a configuration problem, not an unreachable service", async (status) => {
    respondWith(status);
    const { brain, Misconfigured } = await freshBackend({ SALVAGE_API_KEY: "wrong-key" });

    await expect(brain.get("/v1/sensing/rails")).rejects.toBeInstanceOf(Misconfigured);
  });

  it("says which variable to check when a key is configured", async () => {
    respondWith(401);
    const { brain } = await freshBackend({ SALVAGE_API_KEY: "wrong-key" });

    await expect(brain.get("/v1/sensing/rails")).rejects.toThrow(/SALVAGE_API_KEY/);
  });

  it("says the key is missing when there is none", async () => {
    respondWith(401);
    const { brain } = await freshBackend({ SALVAGE_API_KEY: undefined });

    await expect(brain.get("/v1/sensing/rails")).rejects.toThrow(/is not set/);
  });

  it("never puts the key into the error text", async () => {
    // These messages reach a browser. The one thing they must not carry is the
    // credential that was rejected.
    respondWith(401);
    const { brain } = await freshBackend({ SALVAGE_API_KEY: "svg_secret_value" });

    await expect(brain.get("/v1/sensing/rails")).rejects.not.toThrow(/svg_secret_value/);
  });
});

describe("the other outcomes still read as themselves", () => {
  it("keeps 404 as a record that does not exist", async () => {
    respondWith(404);
    const { brain, NotFound } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/attempts/m/p")).rejects.toBeInstanceOf(NotFound);
  });

  it("keeps a 500 as a service failure", async () => {
    respondWith(500);
    const { brain, BackendUnavailable } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/sensing/rails")).rejects.toBeInstanceOf(BackendUnavailable);
  });

  it("does not echo a backend's error body to the browser", async () => {
    // A 500 from a backend can carry a stack trace or a connection string.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: LEAKY_ERROR_BODY }), {
            status: 500,
          }),
      ),
    );
    const { brain } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/sensing/rails")).rejects.not.toThrow(
      new RegExp(FIXTURE_SECRET),
    );
  });
});

/**
 * A 404 is only an answer if it came from the right server.
 *
 * The console defaulted to port 8000 for salvage-brain while the compose file
 * publishes 8001. On a machine where an unrelated project held 8000, every
 * brain-backed route was proxied into that stranger's API, which answered a
 * perfectly correct 404 for paths it had never heard of -- and the console
 * rendered "no attempts ingested" and "the layer could not be read". True
 * sentences about the wrong server, with nothing in any log to say so.
 */
describe("a 404 from the wrong server is not an empty database", () => {
  function respondWithIdentity(title: string | undefined) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/openapi.json")) {
          const info = title === undefined ? {} : { title };
          return new Response(JSON.stringify({ info }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
  }

  it("defaults salvage-brain to the host port compose actually publishes", async () => {
    const { BRAIN_BASE_URL, CORE_BASE_URL } = await freshBackend({
      BRAIN_BASE_URL: undefined,
      CORE_BASE_URL: undefined,
    });

    expect(BRAIN_BASE_URL).toBe("http://localhost:8001");
    expect(CORE_BASE_URL).toBe("http://localhost:8081");
  });

  it("still reads a 404 as a missing record when the address is salvage-brain", async () => {
    respondWithIdentity("Salvage Brain");
    const { brain, NotFound } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/attempts/m/p")).rejects.toBeInstanceOf(NotFound);
  });

  it("reports a configuration problem when something else is on the port", async () => {
    respondWithIdentity("Some Other API");
    const { brain, Misconfigured } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/sensing/rails")).rejects.toBeInstanceOf(Misconfigured);
    await expect(brain.get("/v1/sensing/rails")).rejects.toThrow(/BRAIN_BASE_URL/);
  });

  it("does not convict on a missing title", async () => {
    // A proxy or a stripped schema can drop info.title. Guessing there would
    // replace a true "no such record" with a false accusation, which is the
    // exact failure this console exists to avoid.
    respondWithIdentity(undefined);
    const { brain, NotFound } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/attempts/m/p")).rejects.toBeInstanceOf(NotFound);
  });

  it("does not convict when the identity probe itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/openapi.json")) throw new Error("refused");
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
    const { brain, NotFound } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/attempts/m/p")).rejects.toBeInstanceOf(NotFound);
  });

  it("asks the address at most once across repeated 404s", async () => {
    // This sits behind a polling loop. A probe per poll would triple the
    // traffic of the misconfiguration it is diagnosing.
    let probes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/openapi.json")) {
          probes += 1;
          return new Response(JSON.stringify({ info: { title: "Salvage Brain" } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }),
    );
    const { brain } = await freshBackend({ SALVAGE_API_KEY: "k" });

    await expect(brain.get("/v1/attempts/m/a")).rejects.toThrow();
    await expect(brain.get("/v1/attempts/m/b")).rejects.toThrow();
    await expect(brain.get("/v1/attempts/m/c")).rejects.toThrow();

    expect(probes).toBe(1);
  });
});
