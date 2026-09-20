# Identity component

- Use the configured user Git identity; no co-author trailers and no push unless requested.
- Own reusable identity/auth code here. Keep app UI, business roles, Spaces authorization and deployment in consuming apps.
- Never equate OIDC login, handle ownership or identity linkage with membership or publishing permission.
- Keep issuer/subject mappings, OAuth tokens and keys private. No public accounts or external identity-provider activation in tests.
- Unit and package tests: `npm test` and `npm run test:package`. Run `npm run test:integration` only against the existing isolated loopback PDS. Create fresh synthetic accounts; never reset its data.
- Preserve single-process/store and explicit consent boundaries. Document unimplemented lifecycle and multi-app SSO features honestly.
- Run consuming calendar integration and isolation checks when changing its installation or infrastructure. Never deploy without a deployment request.
