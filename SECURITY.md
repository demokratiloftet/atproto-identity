# Security and maintenance

Tests use synthetic data. A passing audit is not a guarantee of security.
Do not put personal data or real identity evidence in fixtures. Private
GitHub visibility does not make committed credentials safe.

- Report suspected vulnerabilities privately to an organisation maintainer.
  Do not include tokens, passwords, private keys, database contents or personal
  information in an issue or pull request.
- Keep environment files, runtime accounts, signing keys and databases out of
  Git and Docker build contexts. Back up persistent data together with its keys.
- Run the README checks before merging. CI tests changes and scans full Git
  history for secrets. Dependencies and Actions are checked weekly by Dependabot.
- Authentication, identity links and handle ownership do not grant membership.
  Check authorization at the point of access and fail closed on upstream failure.
- Instance deployment, live-PDS tests and provider activation belong on
  `instance/test-pds`. Preserve that environment's isolation and backup rules.
  Never deploy or reset a shared environment as part of library tests.

See the README for this repository's specific deployment and trust boundaries.
