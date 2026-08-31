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
