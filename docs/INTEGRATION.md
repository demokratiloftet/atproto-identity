# App integration

The component has no calendar imports, HTTP listener or frontend dependency.
The host app composes it once per process and owns routing and business policy.
Install both packages as described in the root README.

## Composition

```js
import {AuthStore, OidcProvider, createAtprotoProvider, restrictedFetch} from '@loftet/auth';
import {IdentityGateway, HandleProvisioner} from '@loftet/identity';

// All configuration below is trusted server configuration, never browser input.
const store = new AuthStore(config.dataDirectory, config.encryptionKey);
const request = restrictedFetch(config.allowedOrigins);
const providers = config.oidcProviders.map(definition =>
  new OidcProvider(definition, {origin: config.origin, fetch: request}));
const atproto = createAtprotoProvider({
  origin: config.origin, store, fetch: request,
  pdsOrigin: config.pdsOrigin, plcUrl: config.plcUrl,
});
const gateway = new IdentityGateway({
  store, providers, atproto, origin: config.origin,
  entryProviders: config.entryProviders,
  // Omit until the host has a real, reviewed PDS/domain adapter.
  provisioner: config.namespaces && new HandleProvisioner({namespaces: config.namespaces}),
});
```

Each namespace has `{domain, providers, adapter}`. See the gateway README for
the adapter contract. The local `.test` adapter is only exported through
`@loftet/identity/sandbox`; do not import it into a production composition.

## HTTP and UI contract

Use Node-compatible request/response objects (Express supports them). Register
the following operations as in calendar's `src/server.ts`. Mutation routes must
enforce exact same-origin requests, JSON content type and bounded request bodies;
the gateway does not replace that HTTP boundary. Never log callback query strings.

| Route | Method / gateway operation |
| --- | --- |
| `/api/auth` | GET `state(req)`; exposes user-safe account and onboarding state |
| `/auth/client-metadata.json` | GET `atproto.metadata` |
| `/auth/identity/start` | POST `startIdentity(req, res, provider)` |
| `/auth/identity/create` | POST `createIdentityAccount(req, input)` after visible confirmation |
| `/auth/identity/confirm` | POST `confirmIdentity(req, res)` |
| `/auth/atproto/start` | POST `startAtproto(req, res, handle)` |
| `/auth/atproto/callback` | GET `finishAtproto(req, res, url)` |
| `/auth/oidc/:provider/callback` | GET `finishOidc(req, res, provider, url)` |
| `/auth/logout` | POST `logout(req, res)` |

Await asynchronous operations. Redirect successful callbacks to a fixed app URL,
not user-provided return URLs. Render `state().onboarding.suggestions` and allowed
`handleChoices`; browser input never chooses the authoritative provider context.
The app supplies its own UI and handles callback cancellation, review-required
creation, expired authorization and relinking. `requireUser(req)` supplies the
authenticated DID; it grants no business permissions.

Use separate app hostnames: cookies are host-scoped and the current implementation
uses a fixed cookie name, so two apps on different ports of the same hostname can
overwrite each other's cookie. The component is currently configured for a fixed
PDS/PLC per app, not arbitrary public account discovery.

## Connecting loftet-social

Inspected the sibling app's `server/index.ts` and `server/pds.ts`. Currently,
signup/sign-in create PDS password sessions, and `req.session.accessJwt` authorizes
PDS calls. Private Spaces reads also require fresh viewer credentials and DPoP.
An identity-library import alone cannot replace these credentials.

When activating the component in that app:

1. Install the two packages; compose the gateway with that app's own origin,
   private PLC/PDS, encrypted storage and registered OIDC/AT clients. Preserve
   the existing network isolation and synthetic fixtures.
2. Mount the routes above and adapt the social login UI. Bind local profile
   rows to the authenticated DID, never names or OIDC email addresses.
3. Replace the password-session transport with an OAuth-authorized transport
   compatible with the pinned Spaces PDS. Do not treat an OAuth authorization as
   the current bearer `accessJwt` session shape or copy tokens to the browser.
4. Preserve fresh per-viewer delegation/DPoP checks before private reads and
   writes. OIDC identity, a managed handle or a local group-index row cannot
   replace native Spaces membership authorization.
5. Exercise real signup/linking, return login, expired/revoked authorization,
   private outsider denial and membership removal against the app's fixture;
   run its documented unit, integration, isolation and build checks.

Social now installs these packages and implements an optional gateway mode,
DID-bound profiles, explicit confirmation UI and OAuth-aware Spaces transport.
Auth 0.2.1 accepts the consumer's explicit `scope`; social requests its own
Spaces permissions, which `transition:generic` does not grant. The existing
fixture remains on demo sessions pending real OAuth ingress and registration.
See the consuming app's `docs/IDENTITY.md` for exact activation and test status.
