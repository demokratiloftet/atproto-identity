import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStore, createAtprotoProvider } from "../packages/auth/index.ts";

test("consumer scope is preserved in HTTPS and loopback OAuth metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "identity-scope-"));
  const store = new AuthStore(directory);
  try {
    const scope =
      "atproto transition:generic space:no.demokratiloftet.social.group?authority=*&collection=no.demokratiloftet.social.entry";
    for (const origin of ["https://social.invalid", "http://127.0.0.1:4310"]) {
      const options = {
        origin,
        store,
        fetch: () => {
          throw new Error("No network expected");
        },
        plcUrl: "https://plc.invalid",
        pdsOrigin: "https://pds.invalid",
      };
      const provider = createAtprotoProvider({ ...options, scope });
      assert.equal(provider.metadata.scope, scope);
      assert.equal(
        createAtprotoProvider(options).metadata.scope,
        "atproto transition:generic",
      );
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
