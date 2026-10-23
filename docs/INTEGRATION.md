# HTTP and optional OIDC integration

Start with the [AT Protocol composition](ATPROTO.md). The host app owns routing,
UI and business authorization. The library accepts Node-compatible request and
response objects and does not start an HTTP listener.

For organisation login or identity linking, add a generic OIDC provider with
trusted server configuration and an explicit network allowlist:

```ts
import { OidcProvider } from "@loftet/auth/oidc";
import { restrictedFetch } from "@loftet/auth/transport";
import { IdentityGateway } from "@loftet/identity/gateway";

const request = restrictedFetch(config.oidcOrigins);
const providers = config.oidcProviders.map(
  (definition) => new OidcProvider(definition, { origin, fetch: request }),
);
const gateway = new IdentityGateway({
  origin,
  store,
  atproto,
  providers,
  entryProviders: config.entryProviders,
  // Optional; supplied by the consuming app, never inferred from the provider.
  provisioner: config.provisioner,
});
```

| Route                               | Operation                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| GET `/api/auth`                     | `gateway.state(req)`                                                                      |
| GET `/auth/client-metadata.json`    | Return `atproto.metadata` as JSON                                                         |
| POST `/auth/atproto/start`          | `await gateway.startAtproto(req, res, body.identifier)`                                   |
| GET `/auth/atproto/callback`        | `await gateway.finishAtproto(req, res, requestUrl)`                                       |
| POST `/auth/identity/start`         | `await gateway.startIdentity(req, res, body.provider)`                                    |
| GET `/auth/oidc/:provider/callback` | `await gateway.finishOidc(req, res, provider, requestUrl)`                                |
| POST `/auth/identity/create`        | `await gateway.createIdentityAccount(req, body)` when an adapter is explicitly configured |
| POST `/auth/identity/confirm`       | `gateway.confirmIdentity(req, res)` after AT proof and visible consent                    |
| POST `/auth/logout`                 | `await gateway.logout(req, res)`                                                          |

For account linking after AT login, bind `startLink`, `confirmLink`, `cancelLink`
and `unlink` to your app's same-origin mutation routes. `finishOidc` dispatches
the callback according to its recorded flow purpose.

Require exact same-origin requests, JSON content type and bounded request bodies
for mutations. Never log callback queries, tokens or store contents. Redirect a
successful callback to a fixed app page. The UI must show account-link consent,
handle creation consent and errors requiring administrator reconciliation.

Use the authenticated DID from `requireUser(req)` as the account key. OIDC email,
name, handle ownership and local account associations do not grant app roles or
access to private content. Preserve the app's own authorization checks.

Stores and cookies belong to one app origin. Separate apps require separate
origins and storage/keys; cookies on different ports of one hostname still
collide. Linking an existing DID through each app's AT OAuth is supported;
automatic multi-app SSO is not.

Instance-specific integration is maintained on `instance/test-pds`, described in
[branch boundaries](BRANCHES.md).
