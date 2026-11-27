import { test } from "node:test";
import assert from "node:assert/strict";
import { HandleProvisioner, IdentityGateway } from "@atproto-identity/identity";

const adapter = {
  validate() {},
  async create({ handle }: { handle: string }) {
    return { did: "did:plc:fixture", handle };
  },
};
const make = () =>
  new HandleProvisioner({
    namespaces: [
      { domain: "org.example.com", providers: ["org"], adapter },
      {
        domain: "community.example.com",
        providers: ["org", "community"],
        adapter,
      },
    ],
  });
test("public package exposes gateway; domain choices follow verified provider", async () => {
  assert.equal(typeof IdentityGateway, "function");
  const p = make();
  assert.equal(p.choices({ provider: "org" }).length, 2);
  assert.deepEqual(p.choices({ provider: "community" }), [
    { domain: "community.example.com" },
  ]);
  assert.deepEqual(p.choices({ provider: "unknown" }), []);
  await assert.rejects(() =>
    p.create(
      { handle: "alice.org.example.com", provider: "org" },
      { provider: "community" },
    ),
  );
  assert.equal(
    (
      await p.create(
        { handle: "Alice.Community.example.com" },
        { provider: "community" },
      )
    ).handle,
    "alice.community.example.com",
  );
});
test("rejects reserved names, nested names, domain suffix spoofing and malformed handles", () => {
  const p = make();
  for (const handle of [
    "admin.community.example.com",
    "a.b.community.example.com",
    "alice.community.example.com.evil.no",
    "alice.evil-community.example.com",
    "-alice.community.example.com",
    "alice-.community.example.com",
    "ali ce.community.example.com",
    "alice.community.example.com.",
    null,
  ]) {
    assert.throws(
      () => p.validate({ handle }, { provider: "community" }),
      String(handle),
    );
  }
  for (const s of p.suggest({ provider: "org" }))
    p.validate(s, { provider: "org" });
});
test("test namespaces are opt-in; namespace configuration fails closed", () => {
  for (const domain of [
    "test",
    "org.test",
    "org.local",
    "single-label",
    "org.123",
    "org..no",
  ]) {
    assert.throws(
      () =>
        new HandleProvisioner({
          namespaces: [{ domain, providers: ["org"], adapter }],
        }),
    );
  }
  const p = new HandleProvisioner({
    allowTest: true,
    namespaces: [{ domain: "test", providers: ["demo"], adapter }],
  });
  p.validate({ handle: "enroll-abc.test" }, { provider: "demo" });
  assert.throws(
    () =>
      new HandleProvisioner({
        namespaces: [{ domain: "example.com", providers: [], adapter }],
      }),
  );
});
