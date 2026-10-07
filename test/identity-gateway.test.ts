import type { TestContext } from "node:test";
import type {
  IdentityProvider,
  AtprotoProvider,
  AuthRequest,
  VerifiedIdentity,
} from "../packages/auth/types.ts";
import { TestResponse, required, testSession } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore, hash } from "../packages/auth/store.ts";
import { sandboxPdsProvisioner } from "../packages/identity/sandbox-pds.ts";
import { IdentityGateway } from "../packages/identity/gateway.ts";
const origin = "https://calendar.example",
  did = "did:plc:alice";
function setup(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "identity-gateway-")),
    store = new AuthStore(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const identity = {
    issuer: "https://org.example",
    subject: "alice",
    linkedAt: new Date().toISOString(),
  };
  const provider: IdentityProvider = {
    definition: { id: "org", label: "Organisation", issuer: identity.issuer },
    start: async (state) => ({
      url: `${identity.issuer}/authorize?state=${state}`,
      nonce: "nonce",
      verifier: "verifier",
    }),
    callback: async () => identity,
  };
  let selectedDid = did;
  let appState: string | undefined;
  const client: AtprotoProvider["client"] = {
    authorize: async (_handle, { state }) => {
      appState = state;
      return new URL("https://pds.example/authorize");
    },
    callback: async () => {
      store.set("at-session", selectedDid, { test: true });
      return { session: { did: selectedDid, signOut: async () => {} } };
    },
    restore: async (d) => {
      if (!store.get("at-session", d)) throw Error("revoked");
      return testSession(d);
    },
    revoke: async () => {},
  };
  const provisioner = {
    domain: "test",
    validate: () => {},
    create: async () => ({ did, handle: "enroll-alice.test" }),
  };
  const auth = new IdentityGateway({
    store,
    atproto: { client },
    providers: [provider],
    entryProviders: ["org"],
    origin,
    provisioner,
  });
  const req: AuthRequest = { headers: {} },
    res = new TestResponse();
  function adopt() {
    const cookies = res.headers["set-cookie"];
    if (cookies) {
      req.headers.cookie = required(cookies.at(-1)).split(";")[0];
      res.headers = {};
    }
  }
  async function login() {
    const { url } = await auth.startIdentity(req, res, "org");
    adopt();
    const callback = new URL(url);
    callback.searchParams.set("code", "fixture");
    await auth.finishOidc(req, res, "org", callback);
    adopt();
  }
  async function at(d = did) {
    selectedDid = d;
    await auth.startAtproto(req, res, d);
    store.set("at-state", "sdk", { appState });
    await auth.finishAtproto(
      req,
      res,
      new URL(origin + "/auth/atproto/callback?state=sdk&code=fixture"),
    );
    adopt();
  }
  return {
    auth,
    store,
    req,
    res,
    identity,
    provider,
    client,
    provisioner,
    adopt,
    login,
    at,
  };
}
test("OIDC-first login grants no calendar access before AT proof and explicit confirmation", async (t) => {
  const f = setup(t);
  await f.login();
  assert.equal(f.auth.current(f.req), undefined);
  assert.throws(() => f.auth.confirmIdentity(f.req, f.res));
  await f.at();
  assert.equal(f.auth.current(f.req), undefined);
  assert.equal(f.store.loginIdentity(f.identity), undefined);
  f.auth.confirmIdentity(f.req, f.res);
  f.adopt();
  assert.equal(required(f.auth.current(f.req)).did, did);
  assert.equal(required(f.store.loginIdentity(f.identity)).did, did);
});
test("subsequent OIDC login restores only an explicitly enabled identity; unlink removes that ability", async (t) => {
  const f = setup(t);
  f.store.set("at-session", did, { test: true });
  f.store.link(did, "org", f.identity);
  await f.login();
  assert.equal(
    f.auth.current(f.req),
    undefined,
    "old links do not become login grants",
  );
  await f.at();
  f.auth.confirmIdentity(f.req, f.res);
  f.adopt();
  f.req.headers.cookie = "";
  await f.login();
  assert.equal(required(f.auth.current(f.req)).did, did);
  f.auth.unlink(f.req, "org");
  f.req.headers.cookie = "";
  await f.login();
  assert.equal(f.auth.current(f.req), undefined);
});
test("replayed, wrong-browser and cancelled OIDC callbacks cannot create a session", async (t) => {
  const f = setup(t);
  const { url } = await f.auth.startIdentity(f.req, f.res, "org");
  f.adopt();
  const callback = new URL(url);
  await assert.rejects(() =>
    f.auth.finishOidc({ headers: {} }, f.res, "org", callback),
  );
  await f.auth.finishOidc(f.req, f.res, "org", callback);
  f.adopt();
  await assert.rejects(() => f.auth.finishOidc(f.req, f.res, "org", callback));
  const start = await f.auth.startIdentity(f.req, f.res, "org");
  f.adopt();
  let release: (identity: VerifiedIdentity) => void = () => {
    throw Error("callback not started");
  };
  f.provider.callback = () => new Promise((r) => (release = r));
  const work = f.auth.finishOidc(f.req, f.res, "org", new URL(start.url));
  await f.auth.logout(f.req, f.res);
  release(f.identity);
  await assert.rejects(() => work);
  assert.equal(f.auth.current(f.req), undefined);
});
test("an identity cannot take another DID when reauthorization is needed", async (t) => {
  const f = setup(t);
  f.store.link(did, "org", f.identity, { login: true });
  await f.login();
  assert.equal(required(f.auth.state(f.req).onboarding).expectedDid, did);
  await assert.rejects(() => f.at("did:plc:bob"));
  assert.equal(f.auth.current(f.req), undefined);
});
test("another identity cannot bind the same AT account; transaction leaves no extra link", async (t) => {
  const f = setup(t);
  f.store.link(
    did,
    "other",
    { ...f.identity, subject: "someone-else" },
    { login: true },
  );
  await f.login();
  await f.at();
  assert.throws(() => f.auth.confirmIdentity(f.req, f.res));
  assert.equal(f.store.listLinks(did).length, 1);
  assert.equal(f.auth.current(f.req), undefined);
});
test("new account writes are serialized by persisted marker and never imply AT authorization", async (t) => {
  const f = setup(t);
  await f.login();
  let release: (account: { did: string; handle: string }) => void = () => {
    throw Error("creation not started");
  };
  let calls = 0;
  f.provisioner.create = () => {
    calls++;
    return new Promise((r) => (release = r));
  };
  const work = f.auth.createIdentityAccount(f.req, {
    handle: "enroll-alice.test",
    password: "not-stored",
  });
  await assert.rejects(() => f.auth.createIdentityAccount(f.req, {}));
  release({ did, handle: "enroll-alice.test" });
  await work;
  assert.equal(calls, 1);
  assert.equal(f.auth.current(f.req), undefined);
  assert.equal(required(f.auth.state(f.req).onboarding).expectedDid, did);
  assert(
    !JSON.stringify(
      f.store.get("identity-signup", f.store.identityKey(f.identity)),
    ).includes("not-stored"),
  );
  await assert.rejects(() => f.at("did:plc:bob"));
});
test("ambiguous creation failure persists a review marker across gateway restart", async (t) => {
  const f = setup(t);
  await f.login();
  f.provisioner.create = async () => {
    throw Error("private upstream error");
  };
  await assert.rejects(
    () => f.auth.createIdentityAccount(f.req, { handle: "enroll-alice.test" }),
    /usikkert/,
  );
  const restarted = new IdentityGateway({
    store: f.store,
    atproto: { client: f.client },
    providers: [f.provider],
    entryProviders: ["org"],
    origin,
    provisioner: f.provisioner,
  });
  assert.equal(required(restarted.state(f.req).onboarding).needsReview, true);
  await assert.rejects(() => f.auth.startAtproto(f.req, f.res, did));
});

test("sandbox provisioning rejects external handles and strips registration tokens", async () => {
  const p = sandboxPdsProvisioner({
    fetch: async (url, init) => {
      assert.equal(
        url,
        "http://127.0.0.1:2583/xrpc/com.atproto.server.createAccount",
      );
      assert(init);
      assert.equal(init.redirect, "error");
      return Response.json({
        did,
        handle: "enroll-demo.test",
        accessJwt: "discard",
        refreshJwt: "discard",
      });
    },
  });
  assert.throws(() =>
    p.validate({
      handle: "person.bsky.social",
      password: "synthetic-password",
    }),
  );
  assert.deepEqual(
    await p.create({
      handle: "enroll-demo.test",
      password: "synthetic-password",
    }),
    { did, handle: "enroll-demo.test" },
  );
});
test("expired onboarding and unconfigured identity provider fail closed", async (t) => {
  const f = setup(t);
  await assert.rejects(() => f.auth.startIdentity(f.req, f.res, "unknown"));
  await f.login();
  const key = hash(required(f.auth.token(f.req))),
    browser = f.store.get("browser", key);
  required(required(browser).onboarding).expires = Date.now() - 1;
  f.store.set("browser", key, required(browser));
  await assert.rejects(() => f.auth.createIdentityAccount(f.req, {}));
  assert.throws(() => f.auth.confirmIdentity(f.req, f.res));
});

test("handle reservations block another identity, including case variants and after failure", async (t) => {
  const f = setup(t);
  await f.login();
  f.provisioner.create = async () => {
    throw Error("ambiguous");
  };
  await assert.rejects(() =>
    f.auth.createIdentityAccount(f.req, { handle: "enroll-alice.test" }),
  );
  f.identity.subject = "different-person";
  f.req.headers.cookie = "";
  await f.login();
  await assert.rejects(
    () => f.auth.createIdentityAccount(f.req, { handle: "ENROLL-ALICE.TEST" }),
    /reservert/,
  );
  assert.equal(
    f.store.get("identity-signup", f.store.identityKey(f.identity)),
    undefined,
  );
});
test("gateway only persists account identity, never adapter tokens or passwords", async (t) => {
  const f = setup(t);
  await f.login();
  f.provisioner.create = async () => ({
    did,
    handle: "enroll-alice.test",
    accessJwt: "secret",
    password: "secret",
  });
  await f.auth.createIdentityAccount(f.req, { handle: "enroll-alice.test" });
  assert.deepEqual(
    f.store.get("identity-signup", f.store.identityKey(f.identity)),
    { status: "created", did, handle: "enroll-alice.test" },
  );
});
test("unexpected adapter account remains under review rather than linking a different handle", async (t) => {
  const f = setup(t);
  await f.login();
  f.provisioner.create = async () => ({ did, handle: "another.test" });
  await assert.rejects(
    () => f.auth.createIdentityAccount(f.req, { handle: "enroll-alice.test" }),
    /usikkert/,
  );
  assert.equal(required(f.auth.state(f.req).onboarding).needsReview, true);
});

test("malformed signup input is refused before reserving a handle or calling an adapter", async (t) => {
  const f = setup(t);
  await f.login();
  let calls = 0;
  f.provisioner.create = async () => {
    calls++;
    return { did, handle: "enroll-alice.test" };
  };
  for (const input of [
    null,
    42,
    [],
    { handle: null },
    { handle: "enroll-alice.test", password: 42 },
  ]) {
    await assert.rejects(() => f.auth.createIdentityAccount(f.req, input));
  }
  assert.equal(calls, 0);
  assert.equal(
    f.store.get("identity-signup", f.store.identityKey(f.identity)),
    undefined,
  );
  assert.equal(f.store.get("identity-handle", "enroll-alice.test"), undefined);
});
