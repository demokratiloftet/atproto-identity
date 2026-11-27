# Identity component

- Use the configured user Git identity; no co-author trailers and no push unless requested.
- Own reusable identity/auth code here. Keep app UI, business roles, Spaces authorization and deployment in consuming apps.
- Never equate OIDC login, handle ownership or identity linkage with membership or publishing permission.
- Keep issuer/subject mappings, OAuth tokens and keys private. No public accounts or external identity-provider activation in tests.
- Keep `main` provider-neutral: standard AT OAuth, generic OIDC, sessions, storage and adapter interfaces only. Instance adapters, credentials, provider presets and live-PDS scripts belong on `instance/test-pds`.
- Unit tests: `pnpm test`. Use synthetic protocol fixtures on `main`; no running PDS is required.
- Preserve single-process/store and explicit consent boundaries. Document unimplemented lifecycle and multi-app SSO features honestly.
- Run consuming app integration and isolation checks when changing its installation or infrastructure. Never deploy without a deployment request.
