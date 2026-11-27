# Reusable AT Protocol identity

Use one OAuth client for accounts on independent hosts. Bluesky and Eurosky use
AT Protocol identity; the protocol, rather than a branded adapter, determines the
account's server. This package uses the official `@atproto/oauth-client-node`
SDK for identity verification, PKCE, PAR, DPoP, OAuth discovery and token refresh.

## Smallest composition

```ts
import { AuthStore } from "@atproto-identity/auth/store";
import { createAtprotoProvider } from "@atproto-identity/auth/atproto";
import { AuthService } from "@atproto-identity/auth/session";

const origin = "https://your-app.example";
const store = new AuthStore(
  "./private-auth-data",
  process.env.AUTH_ENCRYPTION_KEY,
);
const atproto = createAtprotoProvider({
  origin,
  store,
  clientName: "Your app",
  // Identity only. Request app-specific permissions explicitly when needed.
  scope: "atproto",
});
const auth = new AuthService({ origin, store, atproto });
```

Compose once per app process. Serve `atproto.metadata` as JSON at
`/auth/client-metadata.json`, publicly reachable by the account host. The SDK uses
the URL as the client ID; there is no provider registration or provider-specific
client secret in this public-client flow. HTTP loopback origins (`127.0.0.1` or
`[::1]`) use the SDK's development client ID. Public account servers still use
HTTPS even when the app callback is local.

The host owns these framework-independent route bindings:

| Method and path                  | Operation                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| GET `/auth/client-metadata.json` | Return `atproto.metadata` as JSON                                                   |
| POST `/auth/atproto/start`       | `await auth.startAtproto(req, res, body.identifier)` returns `{url}`                |
| GET `/auth/atproto/callback`     | `await auth.finishAtproto(req, res, requestUrl)`, then redirect to a fixed app page |
| GET `/api/auth`                  | `auth.state(req)`                                                                   |
| POST `/auth/logout`              | `await auth.logout(req, res)`                                                       |

For mutation routes, enforce exact same-origin requests, JSON content type and a
bounded body. Keep callback queries and tokens out of logs. In the UI, ask for
“Handle, DID or account provider URL”. Examples are `someone.bsky.social`, the
user's full Eurosky/custom handle, `did:plc:…`, `did:web:person.example`, or an
HTTPS PDS/entryway URL. Do not append a provider domain or guess a host from a
handle suffix. A bare server hostname is interpreted as a handle; use an HTTPS
URL for server-first login. The existing `startAtproto` method still accepts its
third argument directly, so existing route payloads named `handle` keep working.

`auth.requireUser(req).did` is the account key. Handles can change. Successful
login grants no membership, role, organisation verification or publishing rights.
Use `await auth.oauthSession(req)` for the SDK session when making authorized
requests. Actual API access depends on the granted scope and the host's features.

## Add blocks as needed

| Need                                       | Import                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| OAuth and its public metadata              | `createAtprotoProvider`, `atprotoClientMetadata` from `@atproto-identity/auth/atproto` |
| Browser sessions                           | `AuthService` from `@atproto-identity/auth/session`                                    |
| Encrypted persistence                      | `AuthStore` from `@atproto-identity/auth/store`                                        |
| Public HTTPS / controlled network          | `publicFetch`, `restrictedFetch` from `@atproto-identity/auth/transport`               |
| Organisation OIDC                          | `OidcProvider` from `@atproto-identity/auth/oidc`                                      |
| Explicit linking and OIDC-first onboarding | `IdentityGateway` from `@atproto-identity/identity/gateway`                            |
| Approved handle namespaces                 | `HandleProvisioner` from `@atproto-identity/identity/handles`                          |

All previous root imports still work. The low-level metadata builder can also be
used directly with `NodeOAuthClient` when an application owns its storage and
locking. No extra service wrapper or social-profile dependency is required.

## Discovery and network policy

The standard resolver supports DNS TXT and HTTPS well-known handle records,
verifies the handle back-link in the DID document, resolves `did:plc` and
`did:web`, and follows the DID's PDS service to its OAuth metadata. Both
server-first and account-first login finish with the SDK's DID/issuer validation.
A familiar-looking handle or an unverified token subject is never enough.

Public discovery uses the AT SDK ecosystem's `@atproto-labs/fetch-node` guard
for DID, OAuth and authorized session requests. The Node handle resolver supplies
its own guarded transport. Public traffic requires HTTPS; private IP addresses
(including DNS results at connection time) are rejected. Requests have a ten-second
timeout and a two-MiB response limit (handle lookup has the SDK's tighter limits).
Redirects default to rejection; explicitly followed redirects remain guarded.
Custom HTTPS PDS ports are supported. Large blobs need a separately reviewed
transport/limit. Deployment egress rules may impose additional restrictions.

An explicit `fetch` option replaces the default transport; the caller owns that
network policy. Custom fetch implementations used by the Node handle resolver
must preserve its Node dispatcher option. `handleResolver` is also injectable for
controlled resolution. Neither option is browser input. OIDC operations keep
their own exact-origin allowlists; public AT discovery should
not be used as their transport.

## Optional controlled-network adapter

The factory does not select a PDS or infer permissions from its configuration.
When an application needs a controlled resolver, compose it explicitly:

```ts
import {
  createAtprotoProvider,
  createPdsHandleResolver,
} from "@atproto-identity/auth/atproto";
import { restrictedFetch } from "@atproto-identity/auth/transport";

const request = restrictedFetch(config.allowedOrigins);
const atproto = createAtprotoProvider({
  origin: config.origin,
  store,
  fetch: request,
  plcUrl: config.plcUrl,
  handleResolver: createPdsHandleResolver(config.pdsOrigin, request),
  scope: "atproto",
});
```

A resolver selects a lookup service, not an account-host allowlist. Use transport
and deployment policies to enforce network boundaries. Local HTTP requires
`allowHttp: true` and an explicit transport. No concrete host, domain or signup
adapter is bundled on `main`. Our instance composition lives on
`instance/test-pds`; see [branch boundaries and migration](BRANCHES.md).

## Compatibility and verification

This release targets accounts on hosts implementing standard AT Protocol OAuth.
It does not promise universal app functionality: collection permissions, AppView
services, Spaces, account creation, recovery and migrations are separate features.
The SDK restores and refreshes sessions; automatic session continuity after an
account migration has not been verified. A fresh login uses current discovery.
Account provisioning is an app-supplied adapter; the core bundles no provider-specific implementation.

All clients default to `atproto`, which is sufficient for identity only. Set
`scope` explicitly for repository access. There is no `pdsOrigin` shortcut or
implicit broad permission. Generic packages are auth 0.5.0 and identity 0.6.0;
existing apps keep their pinned archives until upgraded deliberately.
Storage and browser-cookie formats are
unchanged. Storage and refresh locks remain single-process; separate apps still
need separate registrations, stores and secrets. Reusing the package does not
create cross-app SSO.

`pnpm test` exercises the actual SDK against simulated DNS and HTTP responses:
independent hosting/entryway patterns, both handle methods, both DID methods,
PDS-first login, callback/browser binding, rejected handle back-links and rejected
DID/issuer mismatches. Transport tests reject private addresses. Generic auth, OIDC and provisioning-contract tests remain in place. `pnpm run test:package`
installs the archives outside this workspace and verifies runtime imports and
TypeScript declarations for the public blocks. These are synthetic compatibility
tests, not completed live logins to Bluesky or Eurosky. No public account is
created or external identity provider activated by the tests.

## References

- [AT Protocol OAuth specification](https://atproto.com/specs/oauth)
- [Official OAuth SDKs and implementation patterns](https://atproto.com/guides/about-oauth)
- [Handle resolution](https://atproto.com/specs/handle)
- [Supported DID methods](https://atproto.com/specs/did)
- [Eurosky account and application interoperability](https://eurosky.tech/faq/)
