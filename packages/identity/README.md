# @loftet/identity — reusable identity gateway

`IdentityGateway` extends the existing auth service. It replaces the earlier,
unconnected enrollment prototype; there is one browser onboarding flow.

## Try it locally

Start the existing sandbox and calendar using the calendar repository README. Open
http://127.0.0.1:3000 and choose **Start demoen → Velg eller lag en testperson**.
Enter a fictional name to create a fresh identity, or choose an existing person.
New test people persist in the local `demo-people` Docker volume. Each creation
gets a distinct subject, even when names match; names never link accounts.

- New account: **Opprett demokonto for meg** shows a proposed sandbox handle for confirmation. Continue
  to the PDS with the displayed fixture password, authorize, then explicitly
  confirm the association. The password is deliberately public demo data
  (`local-sandbox-only`), suitable only for the isolated synthetic sandbox.
- Existing account: expand the existing-account option, enter its handle,
  authenticate at the private PDS, authorize, then confirm the association.
- Return: use the same fictional OIDC identity. A valid stored AT authorization is
  reused. Missing/revoked authorization requires confirmation at the PDS again.
- Logout clears local access and revokes the shared AT authorization. Removing an
  identity link removes permission for future OIDC sign-ins through that link;
  it does not delete the PDS account or sign out existing AT-authenticated sessions.

A newly provisioned account has no club publishing authority. Choose a club in step 2
and **Simuler klubbens godkjenning**. This local-only shortcut grants permission
to the authenticated account, never a browser-supplied subject. Step 3 opens the
activity form with an optional example. See the calendar repository `docs/DEMO.md`.

## Boundaries

- Only providers explicitly listed in `IDENTITY_LOGIN_PROVIDERS_JSON` can be used
  as entry points. The shared default is `[]`; local development enables `demo`.
  Register provider definitions in `OIDC_PROVIDERS_JSON` as before. The reusable
  provider keeps issuer/audience/signature/nonce/expiry/freshness validation.
- Old identity links are NOT automatically login grants. The `identity_logins`
  table records explicit consent separately. One entry identity per DID and one
  DID per entry identity. Matching uses keyed hashes of verified issuer + subject,
  never email or name. Linking and granting login permission share a transaction.
- HttpOnly SameSite cookies bind both protocols to the browser. Callback states
  are consumed once; successful steps rotate the cookie. Same-origin JSON is
  required for mutations. Pending AT authorization cannot publish or access a
  signed-in calendar until explicit confirmation.
- Auth state and identity data remain encrypted in the existing AuthStore. No new
  database service, identity server or credentials store is introduced.
- A durable signup marker prevents concurrent/repeated creation. Ambiguous errors
  require operator review; the marker retains the requested handle, not password
  or raw provider errors. An already-created account can resume authorization.
  Cancelling the browser flow does not roll back remote account creation.
- One process and one auth store only. No multi-replica coordination, recovery UI,
  automatic merge, invite management or production account lifecycle is included.
- Provisioning is local-only. Its fixed loopback PDS target is rewritten through
  the existing exact-origin transport when running inside the isolated container.
  The VPS has no provisioning adapter. Arbitrary external PDSs remain unreachable.

## Before a real organisation pilot

Configure a registered OIDC client, decide admission policy, and add reviewed
network access. Implement a provisioning adapter for the selected PDS and an
organisation-owned domain, including helpful name-availability feedback and
recovery for rejected/uncertain creation. The sandbox currently reports creation
failures conservatively for operator review. Verify credential/recovery policy
with that PDS before replacing the explicit password + AT OAuth steps.

Matrix is out of scope for the agreed first version. Nothing in this increment
is deployed to the VPS. The synthetic identity provider is not a real login system.

## Verification

```sh
pnpm test
node test/identity-integration.ts
pnpm run test:package
# In the consuming calendar repository: pnpm run test:integration && pnpm run verify
```

Gateway tests cover missing confirmation, wrong/replayed callbacks, logout during
exchange, existing links versus login grants, incorrect DIDs, identity conflicts,
creation races and review markers. Token validation tests exercise signed OIDC
responses. Browser tests cover both account choices using the real local IdP/PDS.

Verified in the local browser: existing-account linking, new-account creation,
explicit confirmation, session persistence after calendar restart, and OIDC-only
return with retained AT authorization. HTTP checks reject cross-origin mutations
and unauthenticated creation, confirmation and event publication.

## Package boundary and reuse

This directory is now an pnpm workspace package with a public API. Calendar uses
`@loftet/identity`, not source paths into the directory. It exports
`IdentityGateway` and `HandleProvisioner`; the local-only PDS adapter is an explicit
`@loftet/identity/sandbox` import. `@loftet/auth` is a peer dependency providing
OIDC, AT OAuth, encrypted storage and sessions. Neither package imports calendar
code. The host app owns HTTP routes, UI, transport allowlists and deployment.

Both packages now live in the standalone `identity-component` Git repository.
Calendar installs versioned tarballs built here; it no longer owns their source.
Run `pnpm run pack` from the repository root and install both archives into a
consumer. See [repository setup](../../README.md) and
[app integration](../../docs/INTEGRATION.md). Both packages remain private and
unpublished. A separate identity server is not required.

## Handles belong in identity onboarding

A namespace is a domain managed by an operator, a list of allowed OIDC provider
IDs, and a provisioning adapter. These example domains are illustrative, not a
claim that the operator has control of them:

```js
import { IdentityGateway, HandleProvisioner } from "@loftet/identity";

const provisioner = new HandleProvisioner({
  namespaces: [
    {
      domain: "idrett.devotta.no",
      providers: ["idrettens-id"],
      adapter: orgPdsAdapter,
    },
    {
      domain: "demokratiloftet.no",
      providers: ["idrettens-id", "community"],
      adapter: sharedPdsAdapter,
    },
  ],
});
// orgPdsAdapter/sharedPdsAdapter are deployment-specific implementations, not
// bundled public-service adapters. Existing AuthStore/OIDC/AT OAuth setup:
const gateway = new IdentityGateway({
  store,
  providers,
  atproto,
  origin,
  provisioner,
  entryProviders: ["idrettens-id", "community"],
});
```

An Idrettens ID user can choose either configured domain; a community user can
only choose the shared domain. A domain being open to all means admission via
explicitly configured providers, not accepting an arbitrary issuer. Register
additional provider IDs deliberately. Domain policy does not grant club roles.

1. The server validates OIDC and obtains issuer + subject. The browser cannot
   select the trusted provider context used for domain authorization.
2. The gateway stores stable random handle suggestions in the pending browser
   session. Suggestions are not reservations and do not reveal names or subjects.
   `state().onboarding` exposes `suggestions` and `handleChoices` for any UI.
3. The user sees and confirms a handle. `createIdentityAccount` validates the
   provider/domain/name, reserves the lowercase handle in the encrypted store,
   and persists the signup marker before calling the adapter.
4. The adapter creates the account and returns `{did, handle}`. The gateway only
   persists those fields. Errors or unexpected results keep the name reserved
   for operator review, preventing blind retries after ambiguous remote writes.
5. The existing AT OAuth and explicit link confirmation still establish access.
6. Later OIDC logins resolve the stored issuer + subject association to the same
   DID, regardless of the user's current handle. Revoked AT authorization must
   be renewed. Different OIDC subjects are never merged by name/email.

The local UI demonstrates confirmation of a generated `enroll-….test` handle.
Other clients can submit an edited name and use `handleChoices` to build a domain
picker; the server applies the same rules. Global availability is ultimately
checked by the PDS; local reservation is not proof that a public name is free.
Reservations and signup state assume one process/store. They are retained after
cancellation, failure and unlinking; do not recycle names automatically. Existing
signups predating reservations remain protected by the signup marker and PDS.

### Adapter contract and real domains

`validate({handle, ...input})` is synchronous and must validate all required
creation inputs before any reservation or network write. `create(input)` returns
`{did, handle}` for a `did:plc` account with the exact normalized handle. The
adapter must use a fixed, configured PDS and enforce its registration, invite,
credential and recovery rules. Never accept a browser-supplied server URL.

The package enforces namespace policy, but does **not** configure DNS or prove
that an operator owns a domain. Before offering a real namespace:

- Arrange registration with the selected PDS provider. Its supported domains,
  signup policies and authorization flow determine which adapter is possible.
- Configure DNS TXT at `_atproto.<handle>` or HTTPS
  `https://<handle>/.well-known/atproto-did` to return the account DID, and ensure
  the DID document claims the same handle. If the PDS does not manage the
  namespace, coordinate account creation, handle publication and activation in
  that provider's adapter. Do not declare success before that completes.
- Establish recovery, revocation and manual reconciliation of ambiguous writes.
  For an existing account, require account authorization before changing its
  handle; it is its account-wide handle, not an app-local alias.

No production DNS adapter, Idrettens ID credentials, public PDS provisioning,
passwordless bootstrap, Matrix support or automatic multi-app SSO is supplied.
Reusable code does not itself share browser sessions between applications. Each
app needs its own registered OAuth client and authorization, or an explicitly
operated shared identity service. Do not give unrelated apps the same database
and encryption key as a shortcut.

Protocol references: [handles](https://atproto.com/specs/handle),
[identity](https://atproto.com/guides/identity),
[account management](https://atproto.com/blog/network-account-management).

### Historical verification before repository extraction (2026-09-20)

38 unit tests pass, including provider/domain restrictions, malformed names,
case-insensitive reservations across identities, ambiguous creation, credential
filtering and returning-user login. `pnpm run test:integration`, the standalone
identity integration test and `pnpm run verify` pass against the isolated PDS.
The browser flow was exercised with a fresh synthetic person: visible proposed
handle → creation → real local AT OAuth → explicit link confirmation → signed-in
calendar. `pnpm --filter @loftet/identity pack --dry-run` verifies the package
contents. No real organisation/PDS provider integration was exercised.
