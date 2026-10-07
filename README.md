# Identity component

Reusable server-side identity and account onboarding for AT Protocol apps.
This is a standalone Git repository, extracted from `calendar-app` commit
`aff4ad0bb2736fea2240d5a7d66250d40ddd486a`. It owns the source and tests of two
Node.js packages written in TypeScript; it is not an application, user directory or hosted SSO service.

| Package | Responsibility |
| --- | --- |
| `@loftet/identity` | OIDC-first onboarding, handle/domain policy, provisioning adapter orchestration, explicit account linking and returning-user login |
| `@loftet/auth` | OIDC validation, AT OAuth, browser sessions, encrypted SQLite storage, provider definitions and restricted transport |

The flow is organisation login → proposed handle → confirmed account creation →
AT authorization → confirmed identity link. Returning logins use the verified
issuer/subject association to the same DID. A configured organisation domain
and/or shared domain can be offered per provider. Handle ownership never grants
organisation membership, roles or private-content access.

## Develop and verify

Requires Node.js 24.17.x and npm. No calendar checkout, Docker or network services
are needed for the unit tests. Package installation needs the npm dependency
cache or registry access.

```sh
gh repo clone demokratiloftet/identity-component
cd identity-component
npm ci
npm test # strict typecheck, compiled packages, then runtime tests
npm run test:package
npm run pack
```

`test:package` installs the two archives in a fresh directory outside this repo
and checks their runtime imports and TypeScript declarations, including rejection
of an invalid argument. `pack` produces versioned archives in ignored
`dist/`. Packages are not published to npm. Source is maintained in the private
`demokratiloftet/identity-component` repository.

Optional real-PDS test, **only with the existing isolated loopback PDS running**:

```sh
npm run test:integration
```

It creates a disposable synthetic `.test` account without resetting the PDS.
App integration/isolation tests continue to belong to the consuming app.

## Install in another app

From this repository, produce the two archives with `npm run pack`. From the
consumer app (example sibling layout):

```sh
mkdir -p vendor
cp ../identity-component/dist/loftet-auth-0.3.0.tgz vendor/
cp ../identity-component/dist/loftet-identity-0.3.0.tgz vendor/
npm install --save-exact ./vendor/loftet-auth-0.3.0.tgz ./vendor/loftet-identity-0.3.0.tgz
```

A pnpm app can use `pnpm add` with the same archive paths. Commit the two archives,
package manifest and lockfile in the consumer. Docker must copy `vendor/` before
installing dependencies. This keeps app builds self-contained while the source
has one owner here. Do not edit extracted files in `node_modules` or copy source
back into app repositories. Bump package versions for subsequent releases and
update consumers deliberately. A registry or remote Git distribution can be
introduced later; none is required for local reuse.

```js
import {IdentityGateway, HandleProvisioner} from '@loftet/identity';
import {AuthStore, OidcProvider, createAtprotoProvider, restrictedFetch} from '@loftet/auth';
```

See [integration guide](docs/INTEGRATION.md),
[gateway/domain API](packages/identity/README.md) and
[auth/provider setup](packages/auth/README.md).

## Consumers and limits

- **calendar-app:** migrated to the 0.2.0 packages. Composition, UI and app
  authorization stay in that repo; SQLite format and cookies are unchanged.
- **loftet-social:** shared-component AT OAuth is active on the public demo as
  of 2026-09-21. Private Spaces reads retain their separate native credential
  checks. Organisation OIDC providers are not configured; local fixtures still
  default to demo password login. See its `docs/IDENTITY.md` for verification.

Real Idrettens ID, production domain/DNS provisioning, production PDS signup,
Matrix, account recovery and automatic cross-app SSO are not implemented.
AT OAuth authorization is still required. The encrypted store and locking are
single-process. Multiple apps get separate registrations, stores, secrets and
hostnames. Reusing a library does not create a common account registry: onboarding
the same organisation identity independently in two stores can create two DIDs.
For one account across apps, link an existing DID through each app's AT OAuth or
design a shared onboarding broker as a separate feature. Never share SQLite
files or keys between apps as a shortcut.

## TypeScript and distribution

All maintained package, test and tooling source is TypeScript with `strict: true`.
`npm run typecheck` checks the complete source tree. Node 24 runs test/tooling
`.ts` files; distributable packages contain compiled ESM JavaScript and `.d.ts`
declarations so consumers need no TypeScript runtime or loader. `npm run build`
compiles auth first, then identity against its public package API. Generated
`dist/` directories are ignored. Runtime validation of identities, protocol
responses and request data remains necessary and is kept in place.
