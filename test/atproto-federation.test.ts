// Synthetic protocol responses only: no public accounts, DNS or OAuth activation.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore } from "../packages/auth/store.ts";
import { createAtprotoProvider } from "../packages/auth/atproto.ts";
import { AuthService } from "../packages/auth/service.ts";
import { publicFetch } from "../packages/auth/public-transport.ts";
import { TestResponse } from "./helpers.ts";

const accounts = [
  {
    handle: "alice.bluesky.example",
    did: "did:plc:abcdefghijklmnopqrstuvwx",
    pds: "https://pds.bluesky.example",
    issuer: "https://entry.bluesky.example",
  },
  {
    handle: "bob.eurosky.example",
    did: "did:plc:bcdefghijklmnopqrstuvwxy",
    pds: "https://pds.eurosky.example",
    issuer: "https://pds.eurosky.example",
  },
  {
    handle: "carol.example",
    did: "did:web:carol.example",
    pds: "https://independent.example:8443",
    issuer: "https://independent.example:8443",
  },
];

function setup(t: TestContext, { useDns = true, wrongHandle = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "identity-federation-"));
  const store = new AuthStore(directory);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const dnsRequests: string[] = [];
  t.mock.method(dns, "resolveTxt", async (hostname: string) => {
    dnsRequests.push(hostname);
    const account = accounts.find((a) => hostname === `_atproto.${a.handle}`);
    return useDns && account ? [[`did=${account.did}`]] : [];
  });
  syncBuiltinESMExports();
  const requests: Request[] = [];
  const pars: URLSearchParams[] = [];
  let tokenDid = accounts[0].did;
  const provider = createAtprotoProvider({
    origin: "https://app.example",
    store,
    clientName: "Example app",
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      const account = accounts.find(
        (a) =>
          decodeURIComponent(request.url) ===
            `https://plc.directory/${a.did}` ||
          request.url === `https://${a.handle}/.well-known/did.json` ||
          url.hostname === a.handle ||
          url.origin === a.pds ||
          url.origin === a.issuer,
      );
      assert(account, `Unexpected fixture request: ${request.url}`);
      if (url.pathname === "/.well-known/atproto-did")
        return new Response(useDns ? "" : account.did);
      if (
        url.hostname === "plc.directory" ||
        url.pathname === "/.well-known/did.json"
      )
        return Response.json({
          id: account.did,
          alsoKnownAs: [
            `at://${wrongHandle ? "someone-else.example" : account.handle}`,
          ],
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: account.pds,
            },
          ],
        });
      if (url.pathname === "/.well-known/oauth-protected-resource")
        return Response.json({
          resource: account.pds,
          authorization_servers: [account.issuer],
        });
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return Response.json({
          issuer: account.issuer,
          authorization_endpoint: `${account.issuer}/authorize`,
          token_endpoint: `${account.issuer}/token`,
          pushed_authorization_request_endpoint: `${account.issuer}/par`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          dpop_signing_alg_values_supported: ["ES256"],
          scopes_supported: ["atproto"],
          client_id_metadata_document_supported: true,
        });
      if (url.pathname === "/par") {
        pars.push(new URLSearchParams(await request.text()));
        assert(request.headers.has("dpop"));
        return Response.json(
          {
            request_uri: "urn:ietf:params:oauth:request_uri:synthetic",
            expires_in: 60,
          },
          { status: 201 },
        );
      }
      if (url.pathname === "/token")
        return Response.json({
          access_token: "synthetic-token",
          token_type: "DPoP",
          scope: "atproto",
          sub: tokenDid,
          expires_in: 300,
        });
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    },
  });
  return {
    provider,
    store,
    requests,
    pars,
    dnsRequests,
    setTokenDid: (did: string) => {
      tokenDid = did;
    },
  };
}

for (const useDns of [true, false]) {
  test(`one client discovers independent hosts using ${useDns ? "DNS TXT" : "HTTPS handles"}`, async (t) => {
    const { provider, requests, pars, dnsRequests } = setup(t, { useDns });
    assert.equal(provider.metadata.scope, "atproto");
    assert.equal(provider.metadata.client_name, "Example app");
    for (const account of accounts) {
      const url = await provider.client.authorize(account.handle, {
        state: "flow",
      });
      assert.equal(url.origin, account.issuer);
      assert(url.searchParams.has("request_uri"));
      const par = pars.at(-1)!;
      assert.equal(par.get("login_hint"), account.handle);
      assert.equal(par.get("scope"), "atproto");
      assert.equal(par.get("code_challenge_method"), "S256");
      assert(dnsRequests.includes(`_atproto.${account.handle}`));
      assert(
        requests.some(
          (r) =>
            r.url === `${account.pds}/.well-known/oauth-protected-resource`,
        ),
      );
    }
    assert(!requests.some((r) => r.url.includes("resolveHandle")));
  });
}

test("DID and PDS URL login use standard discovery", async (t) => {
  const { provider, pars } = setup(t);
  for (const account of accounts) {
    assert.equal(
      (await provider.client.authorize(account.did)).origin,
      account.issuer,
    );
    assert.equal(
      (await provider.client.authorize(account.pds)).origin,
      account.issuer,
    );
    assert.equal(pars.at(-1)!.get("login_hint"), null);
  }
});

test("handle must also be claimed by its DID document", async (t) => {
  const { provider, pars } = setup(t, { wrongHandle: true });
  await assert.rejects(provider.client.authorize(accounts[0].handle));
  assert.equal(pars.length, 0);
});

test("real SDK callback accepts an authoritative DID and binds the browser session", async (t) => {
  const { provider, store, pars, setTokenDid } = setup(t);
  const auth = new AuthService({
    store,
    atproto: provider,
    origin: "https://app.example",
  });
  const account = accounts[1];
  setTokenDid(account.did);
  const res = new TestResponse();
  await auth.startAtproto({ headers: {} }, res, account.handle);
  const cookie = res.headers["set-cookie"][0].split(";")[0];
  const callback = new URL("https://app.example/auth/atproto/callback");
  callback.search = new URLSearchParams({
    state: pars.at(-1)!.get("state")!,
    code: "synthetic-code",
    iss: account.issuer,
  }).toString();
  assert.equal(
    await auth.finishAtproto({ headers: { cookie } }, res, callback),
    account.did,
  );
  const rotatedCookie = res.headers["set-cookie"].at(-1)!.split(";")[0];
  assert.equal(
    auth.requireUser({ headers: { cookie: rotatedCookie } }).did,
    account.did,
  );
  await assert.rejects(
    auth.finishAtproto({ headers: { cookie } }, res, callback),
  );
});

test("callback rejects a DID owned by a different authorization server", async (t) => {
  const { provider, pars, setTokenDid } = setup(t);
  await provider.client.authorize(accounts[0].pds);
  setTokenDid(accounts[1].did);
  await assert.rejects(
    provider.client.callback(
      new URLSearchParams({
        state: pars.at(-1)!.get("state")!,
        code: "synthetic-code",
        iss: accounts[0].issuer,
      }),
    ),
  );
});

test("public transport blocks HTTP and private IP destinations", async () => {
  for (const url of [
    "http://127.0.0.1/token",
    "https://127.0.0.1/token",
    "https://[::1]/token",
    "https://10.0.0.1/token",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::ffff:127.0.0.1]/token",
    "file:///etc/passwd",
  ])
    await assert.rejects(publicFetch(url));
});
