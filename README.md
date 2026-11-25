# AT Protocol identity building blocks

A small server-side TypeScript library for standard AT Protocol sign-in, browser
sessions and optional OIDC account linking. It has no UI, deployment, fixed PDS,
organisation provider preset, or dependency on a particular application.

`main` owns the generic library. `instance/test-pds` owns our local PDS adapters,
managed-account demo and named provider integrations. See [branch boundaries and
migration](docs/BRANCHES.md).

## Start with standard sign-in

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
});
const auth = new AuthService({ origin, store, atproto });
```

Accept a handle, DID or HTTPS account-provider URL. The official AT Protocol SDK
resolves the identity, discovers its PDS and OAuth server, and verifies the
result. The default scope is always `atproto` (identity only). Apps explicitly
request additional permissions. No Bluesky/Eurosky-specific adapter is required.

Serve `atproto.metadata` and bind the start/callback methods to your HTTP routes;
see [AT Protocol composition](docs/ATPROTO.md). Add only the blocks you need:

| Package / import                     | Responsibility                                                        |
| ------------------------------------ | --------------------------------------------------------------------- |
| `@atproto-identity/auth/atproto`     | OAuth client, public metadata and optional resolver adapter           |
| `@atproto-identity/auth/session`     | Browser binding, session rotation and explicit account linking        |
| `@atproto-identity/auth/store`       | Encrypted SQLite persistence                                          |
| `@atproto-identity/auth/transport`   | Public HTTPS discovery or explicit origin allowlist                   |
| `@atproto-identity/auth/oidc`        | Generic OIDC validation for app-supplied providers                    |
| `@atproto-identity/identity/gateway` | Optional OIDC-first onboarding, followed by AT proof and consent      |
| `@atproto-identity/identity/handles` | Optional namespace policy around an app-supplied provisioning adapter |

Root imports remain available. Package names identify the maintainer; they do
not select a PDS, organisation, domain or app policy. Generic OIDC/onboarding is
optional and does not replace AT OAuth. Login and identity linkage never imply
membership, organisation verification or publishing rights.

## Develop and package

Requires Node.js 24.17.x and pnpm 11.8.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run format:check
pnpm run test:package
pnpm run pack
```

Tests use synthetic DNS/HTTP responses and temporary encrypted stores. No running
PDS, public accounts or external provider activation is required. Package tests
install archives in an independent directory and check runtime imports,
TypeScript declarations and the absence of instance-only modules. Builds clean
generated output before compilation so branch switches cannot leak stale files.

`pack` produces `dist/loftet-auth-0.5.0.tgz` and
`dist/loftet-identity-0.6.0.tgz`. Install these exact archives in a consumer,
commit its vendor files and lockfile, and upgrade deliberately. Packages remain
private and are not published to a registry. Existing consumers are unchanged.

## Boundaries

This is a Node.js library, not a hosted login service or browser component.
The encrypted store and refresh locks support one process. Each app needs its
own origin, client metadata, store and keys; library reuse does not create
cross-app SSO. Recovery, account migration, distributed locking and arbitrary
provider signup are not implemented. Standard OAuth interoperability is tested
with simulated servers; live provider compatibility must be verified separately.

See [auth API](packages/auth/README.md), [optional onboarding](packages/identity/README.md),
[HTTP integration](docs/INTEGRATION.md) and [security boundaries](SECURITY.md).

## License

Licensed under [MIT](LICENSE).
