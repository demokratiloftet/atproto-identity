# @loftet/auth

Provider-neutral server-side identity blocks. Standard AT Protocol OAuth is the
default flow; generic OIDC is an optional way to link or verify an external
identity. The library includes no fixed PDS or named identity-provider preset.

| Import                   | Exports                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `@loftet/auth/atproto`   | `createAtprotoProvider`, `atprotoClientMetadata`, `createPdsHandleResolver`, option types |
| `@loftet/auth/session`   | `AuthService`, `AuthServiceOptions`                                                       |
| `@loftet/auth/store`     | `AuthStore`, `hash`, `random`                                                             |
| `@loftet/auth/transport` | `publicFetch`, `restrictedFetch`                                                          |
| `@loftet/auth/oidc`      | `OidcProvider`                                                                            |

Root exports and shared types are available from `@loftet/auth`. AT-only imports
do not load SQLite or OIDC implementations at runtime.

```ts
import { AuthStore } from "@loftet/auth/store";
import { createAtprotoProvider } from "@loftet/auth/atproto";
import { AuthService } from "@loftet/auth/session";

const origin = "https://app.example";
const store = new AuthStore(
  "./private-auth-data",
  process.env.AUTH_ENCRYPTION_KEY,
);
const atproto = createAtprotoProvider({
  origin,
  store,
  clientName: "Example app",
});
const auth = new AuthService({ origin, store, atproto });
```

`createAtprotoProvider` uses the official `@atproto/oauth-client-node` SDK.
Handles resolve via DNS TXT/HTTPS, `did:plc` via the public PLC directory, and
`did:web` via HTTPS. The DID document locates the authoritative PDS/OAuth server.
The SDK handles PKCE, PAR, DPoP, issuer/identity validation and token refresh.
`scope` defaults to `atproto`; request other permissions explicitly. No legacy
permission is inferred from a host, resolver or environment.

The optional `handleResolver`, `plcUrl` and `fetch` settings support controlled
networks without adding instance code. Public traffic uses guarded HTTPS;
`allowHttp` requires an explicit transport for isolated development. Custom
transports own their outbound network policy. `restrictedFetch` rejects unknown
origins and redirects; HTTP origin rewriting is limited to isolated development.

## Sessions and linking

The start operation creates an opaque HttpOnly, SameSite=Lax browser cookie and
a ten-minute flow bound to it. Callback processing checks that binding before
exchanging the code and rotates the session after verification. AT credentials
stay on the server. Sessions expire after eight hours.

An authenticated user can start OIDC linking while their AT login is fresh
(within fifteen minutes). OIDC validates PKCE, state, nonce, issuer, audience,
signature, expiry and authentication freshness. The user explicitly confirms the
pending link. No account is matched or merged by email, name or phone number.
One private issuer/subject association maps to one DID.

Generic OIDC supports `none`, `client_secret_basic` and `client_secret_post`,
optional ACR requirements and app-supplied provider definitions. Provider-specific
protocols or parameters need an implementation of `IdentityProvider` in the
consumer or instance branch. OIDC tokens are discarded after verification.

Multiple browser sessions for one DID share SDK authorization. Logout invalidates
those local sessions immediately and attempts remote revocation even when the
provider is unavailable. Logout does not delete private identity links.

## Persistence and limits

`AuthStore` encrypts values with AES-256-GCM and binds namespace/key as authenticated
data. Browser cookies are random and stored by hash. Subject lookup uses a keyed
hash; audit rows contain action, DID, provider ID and time rather than tokens or
external subject identifiers.

Set a stable `AUTH_ENCRYPTION_KEY` (64 hex characters) in shared environments.
Back it up separately from the database. Local development can generate a 0600
key in the storage directory. Encrypting the database does not protect against
theft of both it and its key. Never commit either.

SQLite operations and refresh locks support one process. Distributed storage,
provider-initiated logout, account recovery, automatic cross-app SSO and
confidential OAuth client key management are not supplied. HTTPS apps currently
use public client metadata with `token_endpoint_auth_method=none`.

See [AT Protocol composition](../../docs/ATPROTO.md),
[HTTP/OIDC integration](../../docs/INTEGRATION.md) and
[branch migration](../../docs/BRANCHES.md). Provider presets and local managed
accounts are maintained on `instance/test-pds`.
