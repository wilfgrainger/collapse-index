# Security policy

## Supported versions

The latest version on `main` is supported.

## Reporting

Do not disclose a vulnerability publicly before a fix is available. Open a private GitHub security advisory for the repository owner.

## Current controls

- static assets and API are served by one Cloudflare Worker;
- no user accounts, comments or arbitrary write endpoints exist;
- API routes are read-only;
- D1 writes occur only in the scheduled handler or through controlled administrative tooling;
- SQL uses prepared statements;
- restrictive security headers are applied to assets and API responses;
- event records require constrained review states and numeric bounds;
- secrets are not stored in the repository.

## Known pre-launch work

- add collector allow-lists, response-size limits and timeouts;
- validate upstream MIME types and schemas;
- add ingestion payload hashing and immutable audit storage;
- add deployment provenance and dependency scanning;
- perform a formal threat model before subscriptions or user input are added.
