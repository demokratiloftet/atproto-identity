# @atproto-identity/identity

Optional, provider-neutral onboarding on top of `@atproto-identity/auth`. Basic AT sign-in
only needs `AuthService`; use this package when the app also needs OIDC-first
onboarding, explicit account association or a provisioning extension point.

```ts
import { IdentityGateway } from "@atproto-identity/identity/gateway";
import { HandleProvisioner } from "@atproto-identity/identity/handles";
import type { Provisioner } from "@atproto-identity/identity";
```

`IdentityGateway` extends `AuthService`. Configured `entryProviders` can initiate
OIDC-first login. A new association still requires AT account authorization and
explicit confirmation. A returning OIDC login can restore only a previously
consented DID association and valid AT session. It cannot replace expired or
revoked AT authorization with a password-based fallback.

The optional `provisioner` implements this contract:

```ts
interface Provisioner {
  validate(input: unknown, context?: { provider: string }): void;
  create(
    input: { handle: string; [key: string]: unknown },
    context?: { provider: string },
  ): Promise<{ did: string; handle: string }>;
}
```

The complete exported interface also allows domain choices and suggestions.
No account creation implementation is bundled. Supply one from your application
when its provider allows it. The gateway accepts standard `did:plc` and `did:web`
identifiers and never interprets account creation as AT OAuth authorization.

`HandleProvisioner` wraps app-supplied adapters in explicit `{domain, providers,
adapter}` namespaces. Provider context comes from verified server state. Domain
ownership, DNS setup, provider signup policy and account recovery remain the
operator's responsibility. Test namespaces require explicit `allowTest` opt-in.

Creation reserves an identity and handle before invoking the adapter. Ambiguous
results retain a review marker; a definite failure explicitly marked
`safeToRetry: true` releases reservations. Only the returned DID and handle are
stored, never extra adapter tokens or credentials. Reservations and transactions
support a single app process.

Login, domain choice and account linking confer no app membership or publishing
permission. Keep those checks in the consuming app. Shared databases or keys
between apps are not an SSO mechanism.

The `managedPdsAccounts`, `managedAccounts`, `enrollManaged`, `identity/managed`
and `identity/sandbox` APIs live exclusively on `instance/test-pds`. See
[branch boundaries](../../docs/BRANCHES.md) and
[HTTP integration](../../docs/INTEGRATION.md).
