# Auditability exports — test plan

## Automated checks

### CSV unit tests

- quote string cells and preserve finite numeric cells;
- escape embedded quotes;
- prefix spreadsheet formula strings (`=`, `+`, `-`, `@`) with an apostrophe;
- retain genuine negative numeric values as numbers;
- emit deterministic column ordering, UTF-8 BOM and CRLF records;
- clamp malformed and excessive query limits.

### API integration tests

- current CSV contains a header plus all ten fixed-weight indicators;
- available indicators retain evidence hashes and unavailable indicators remain explicit rows;
- observation JSON/CSV retain source identity, evidence hashes, dependency fingerprints and denominator lineage;
- snapshot JSON/CSV publish one latest materialisation per civil day;
- manifest exposes scope, provenance, licences and limitations;
- bootstrap mode permits only an explicitly labelled current fixture export;
- bootstrap mode cannot expose canonical observation or snapshot history;
- HEAD returns the same status and headers with an empty body;
- CORS preflight permits `If-None-Match` and exposes download/warning headers;
- all existing API, collector, scoring, migration and operational regressions remain green.

### Build checks

`npm run check` must pass:

1. syntax sweep;
2. full Node test suite;
3. public Worker dry-run bundle;
4. ingestion Worker dry-run bundle.

## Manual review

### Richard

- exported fields preserve the meaning of canonical observations and snapshots;
- current CSV includes unavailable rows so missing evidence cannot be interpreted as zero;
- derived values retain denominator provenance;
- daily materialisation wording does not imply daily source updates.

### Dinesh

- routes and filenames are discoverable and predictable;
- download centre works with native links and without JavaScript;
- mobile grid collapses cleanly;
- README, OpenAPI and manifest agree with the implemented routes.

### Gilfoyle

- no public mutation or R2 object body is exposed;
- row limits are bounded;
- CSV formula injection is neutralised;
- stale/degraded behaviour and security headers are preserved;
- HEAD/CORS behaviour does not create a cache or metadata leak.

### Jian-Yang — read-only

- exports cannot be easily misrepresented as complete UK coverage or raw source archives;
- manifest states that observations include public analytical states, not every internal row;
- bootstrap fixtures cannot be laundered into canonical history;
- licence and source attribution remain visible.

### Jared

- release scope remains auditability/open-source readiness;
- FSA collector is deferred to issue #5 until exact resource and definition gates are met;
- no unsupported live-deployment or accessibility-audit claim is made.

## Release evidence

Record the final commit SHA, CI run, test count, bundle results, actual changed-file list and residual risks in `evidence.md` before merge.
