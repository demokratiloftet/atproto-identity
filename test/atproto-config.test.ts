import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuthStore,
  createAtprotoProvider,
  createPdsHandleResolver,
} from "../packages/auth/index.ts";

test("consumer scope is preserved in HTTPS and loopback OAuth metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "identity-scope-"));
  const store = new AuthStore(directory);
  try {
    const scope = "atproto repo:org.example.record?action=create";
    for (const origin of ["https://social.invalid", "http://127.0.0.1:4310"]) {
      const options = {
        origin,
        store,
        fetch: () => {
          throw new Error("No network expected");
        },
        plcUrl: "https://plc.invalid",
      };
      const provider = createAtprotoProvider({ ...options, scope });
      assert.equal(provider.metadata.scope, scope);
      assert.equal(createAtprotoProvider(options).metadata.scope, "atproto");
      if (origin.startsWith("http:"))
        assert.equal(
          new URL(provider.metadata.client_id).searchParams.get("scope"),
          scope,
        );
    }
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("federated defaults need no PDS/PLC configuration and request identity only", () => {
  const directory = mkdtempSync(join(tmpdir(), "identity-public-"));
  const store = new AuthStore(directory);
  try {
    const options = {
      origin: "https://app.example/",
      store,
      clientName: "My app",
    };
    const { metadata } = createAtprotoProvider(options);
    assert.equal(metadata.scope, "atproto");
    assert.equal(metadata.client_name, "My app");
    assert.equal(
      metadata.client_id,
      "https://app.example/auth/client-metadata.json",
    );
    assert.throws(
      () => createAtprotoProvider({ ...options, allowHttp: true }),
      /restricted fetch/,
    );
    assert.throws(
      () => createAtprotoProvider({ ...options, scope: "transition:generic" }),
      /include atproto/,
    );
    for (const origin of [
      "http://app.example",
      "https://app.example/path",
      "https://user@app.example",
      "https://app.example?x=1",
    ]) {
      assert.throws(
        () => createAtprotoProvider({ ...options, origin }),
        /origin/,
      );
    }
    for (const origin of ["http://127.0.0.1:4310", "http://[::1]:4310"]) {
      const { metadata } = createAtprotoProvider({ ...options, origin });
      assert.deepEqual(metadata.redirect_uris, [
        `${origin}/auth/atproto/callback`,
      ]);
      assert.equal(
        new URL(metadata.client_id).searchParams.get("scope") ?? "atproto",
        "atproto",
      );
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("injected PDS handle resolution stays on the configured transport and PLC", async () => {
  const directory = mkdtempSync(join(tmpdir(), "identity-fixed-pds-"));
  const store = new AuthStore(directory);
  const did = "did:plc:abcdefghijklmnopqrstuvwx";
  const requests: URL[] = [];
  try {
    const request: import("../packages/auth/types.ts").Fetch = async (
      input,
    ) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.origin === "http://pds.test") {
        assert.equal(url.pathname, "/xrpc/com.atproto.identity.resolveHandle");
        assert.equal(url.searchParams.get("handle"), "alice.test");
        return Response.json({ did });
      }
      assert.equal(url.origin, "http://plc.test");
      return Response.json({ id: did, alsoKnownAs: ["at://alice.test"] });
    };
    const { client } = createAtprotoProvider({
      origin: "http://127.0.0.1:4310",
      store,
      allowHttp: true,
      handleResolver: createPdsHandleResolver("http://pds.test", request),
      plcUrl: "http://plc.test",
      fetch: request,
    });
    assert.equal(
      (await client.identityResolver.resolve("alice.test")).did,
      did,
    );
    assert.equal(requests.length, 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
