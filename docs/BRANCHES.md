# Generic library and instance branch

| Branch                                  | Owns                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                                  | Standard AT OAuth discovery, generic OIDC, browser sessions, encrypted storage, resolver/provisioning interfaces and synthetic protocol tests                          |
| `instance/test-pds`                     | Local account creation, operator-managed credentials and enrollment, fixed-PDS compatibility, named provider presets, instance documentation and live-PDS test scripts |
| `archive/identity-before-generic-split` | The exact committed source snapshot from before this split, including previously uncommitted work; recovery only                                                       |

Implement and test reusable fixes on `main` first. Merge `main` into
`instance/test-pds` as needed and resolve adapter differences there. Do not merge
the whole instance branch back into `main`. Promote a reusable improvement as a
small independent change without its instance policy. The instance branch extends
`main`; it is not a second source of truth for the generic library.

Keep normal synthetic tests on both branches. A simulated PDS or fictional handle
is a protocol test fixture, not a deployed-instance dependency. Live-PDS scripts
and real service addresses belong on the instance branch. Never commit runtime
credentials or databases to either branch.

## Migration to the generic packages

Generic versions are auth 0.5.0 and identity 0.6.0. The instance packages use
`0.5.0-test-pds.0` and `0.6.0-test-pds.0` respectively, so archives cannot be
confused with the generic releases. Rebuild after switching branches; generated
output is cleaned automatically. Existing consumer installations remain pinned
until explicitly upgraded.

Changes from the previous combined API:

- `createAtprotoProvider` no longer accepts `pdsOrigin`. Normally omit any resolver
  and use standard discovery. For controlled environments, inject
  `handleResolver: createPdsHandleResolver(origin, request)` together with the
  appropriate transport and PLC configuration. This generic adapter has no
  hardcoded server or host list.
- The default scope is always `atproto`. Specify any repository permissions
  explicitly; there is no implicit `transition:generic` scope.
- `managedPdsAccounts`, `IdentityGateway.managedAccounts`, `enrollManaged`,
  managed-account state fields, and the `identity/managed` and `identity/sandbox`
  exports are instance-only.
- `vippsDefinition`, the provider-specific OIDC `market` parameter, provider
  templates and activation instructions are instance-only. `OidcProvider` and
  the `IdentityProvider` interface remain generic extension points.
- The default OAuth client display name is `AT Protocol app`; set `clientName`
  to your app's name. Package names and existing browser-cookie/storage formats
  are retained for compatibility; no data migration or automatic session sharing
  is introduced.

Choosing the generic package does not remove instance policy from a consuming
app automatically. Upgrade its imports and composition, test its authorization
boundaries and only then deploy it separately.
