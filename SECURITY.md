# Security policy

## Supported versions

The latest version on `main` is supported. Preview branches and fixture captures are not production services.

## Reporting a vulnerability

Do not open a public issue for a vulnerability involving credentials, private evidence objects, write access, deployment controls or exploitable runtime behaviour.

Use GitHub's private vulnerability reporting or open a private security advisory for this repository. Include:

- the affected route, component or configuration;
- the minimum steps needed to reproduce it;
- credible impact and required preconditions;
- whether any data, identity or control-plane access may already be exposed;
- a safe way to validate a correction.

Do not include real credentials, private evidence payloads or personal data in the report. Please allow the maintainer a reasonable opportunity to investigate and fix the issue before public disclosure.

## Security model

The production design separates public reads from evidence writes:

- `collapse-index-web` serves static assets and a read-only API;
- `collapse-index-ingest` has the scheduled handler and evidence-store write bindings, but no public `fetch` route;
- D1 stores canonical records and R2 stores content-addressed source payloads;
- no user accounts, comments, payments or arbitrary public mutation endpoints exist;
- SQL uses prepared statements;
- source retrieval is restricted to HTTPS and an explicit host allow-list;
- redirect destinations are checked again at every hop;
- upstream responses have MIME, timeout and hard streamed-size limits;
- observations require exact source identity, periods, units and evidence hashes;
- malformed, changed or ambiguous source data fails closed and writes no observation;
- production bootstrap fallback is disabled unless explicitly configured;
- stale or unreadable evidence stores are reported as degraded rather than disguised with fixtures;
- restrictive security headers are applied to static and API responses;
- secrets and Cloudflare resource identifiers are not committed.

## Export safety

Public CSV exports:

- contain only read-only canonical or explicitly labelled snapshot data;
- neutralise spreadsheet formula prefixes in string cells;
- apply bounded row limits;
- do not expose private R2 object contents;
- retain hashes and provenance so exported values can be audited.

The current fixture CSV may be available only when explicit bootstrap mode is enabled. Fixture data is never presented as canonical observation or snapshot history.

## Maintainer verification

Security-sensitive changes should run:

```bash
npm run check
```

Migration changes also require an upgrade test against a populated prior schema and `PRAGMA foreign_key_check`. Deployment changes require a documented rollback or roll-forward path and validation in the target environment.

## Known boundaries

- A formal external penetration test has not yet been completed.
- Live ONS collection still needs confirmation from the deployed Cloudflare environment.
- The project does not yet accept untrusted user input beyond bounded API query parameters.
- Subscription, alerting and user-personalisation features remain intentionally out of scope until the evidence and operational model are proven.
