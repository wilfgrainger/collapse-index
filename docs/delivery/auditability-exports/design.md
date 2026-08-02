# Auditability exports — design

## Mission

Make the evidence foundation directly reusable by researchers, reviewers and contributors without weakening provenance, confusing fixture data with canonical history, or implying that a partial monitor is a complete national score.

## Current state

- Four of ten indicators have verified collectors, covering 40% of fixed weight.
- D1 stores append-only observation versions and daily materialised snapshots.
- R2 stores private content-addressed source payloads.
- The API exposes current state and bounded per-indicator history, but no bulk public export.
- The roadmap already requires downloadable CSV and JSON observations and snapshots.
- The public dashboard explains evidence health but does not provide a clear reuse path.

## Users

- researchers and journalists checking calculations and definitions;
- statistical and domain reviewers assessing source treatment;
- developers building independent visualisations or verification tools;
- maintainers investigating revisions, freshness and operational state;
- members of the public who want the data without reverse-engineering the dashboard.

## Requirements

### Functional

- **FR-001:** Export the current ten-indicator snapshot as CSV, including unavailable indicators.
- **FR-002:** Export canonical verified/revised observations as JSON and CSV.
- **FR-003:** Export daily materialised snapshot history as JSON and CSV.
- **FR-004:** Publish a manifest containing links, scope, limitations, licences and operational provenance.
- **FR-005:** Preserve source identifiers, periods, publication dates, evidence hashes, dependency fingerprints, denominators and revision lineage.
- **FR-006:** Never present explicit bootstrap fixtures as canonical observation or snapshot history.
- **FR-007:** Support GET and standards-correct HEAD responses.
- **FR-008:** Provide a public, keyboard-accessible download centre with a non-JavaScript path.

### Non-functional

- Export generation must be deterministic for identical stored state.
- Query limits must be bounded and require no new service or dependency.
- CSV strings must not execute as spreadsheet formulas when opened by common spreadsheet software.
- Private R2 payload contents must remain private.
- Exports must retain the existing read-only Worker boundary and security headers.
- Current snapshot exports may carry stale/bootstrap provenance; canonical history must require D1.
- The implementation must remain within the existing Cloudflare Worker and D1 posture.

## Options considered

### 1. Add static generated files during ingestion

Advantages: highly cacheable and cheap to serve.

Rejected for this release: introduces another publication transaction and failure mode between D1, R2 and Static Assets. It also needs deployment/write mechanics not currently present.

### 2. Generate bounded exports from D1 on request — selected

Advantages: uses canonical records, requires no migration or new service, keeps scope small and makes current provenance explicit.

Costs: repeated requests execute bounded reads and CSV serialisation. This is acceptable at the current data volume and can move to generated R2 objects if demand justifies it.

### 3. Expose raw R2 payloads

Rejected: raw evidence objects are private operational records, may have source-specific reuse constraints, and are not a stable public contract. Public exports expose canonical values and the hashes needed for audit linkage instead.

## API design

- `/api/v1/exports/manifest.json`
- `/api/v1/exports/current.csv`
- `/api/v1/exports/observations.json`
- `/api/v1/exports/observations.csv`
- `/api/v1/exports/snapshots.json`
- `/api/v1/exports/snapshots.csv`

Observation history includes public analytical states (`verified`, `revised`) only. The manifest says so explicitly rather than presenting the export as an internal database dump.

The current CSV includes all ten indicators because absence is a material part of the methodology. A consumer must be able to distinguish zero pressure from no evidence.

## Security and abuse model

- Formula injection: string cells beginning with `=`, `+`, `-` or `@` are prefixed with an apostrophe before CSV quoting. Numeric values remain numeric.
- Resource exhaustion: row counts are bounded by server-side maximums.
- History laundering: canonical history routes return `503` without D1, even if bootstrap mode is enabled.
- Private evidence disclosure: no R2 object body or object key is included.
- Cache confusion: degraded current responses retain warning and snapshot-age metadata; history and exports use explicit cache policies.
- Misleading reuse: the manifest distinguishes daily recalculation dates from source publication dates and partial pressure from a complete score.

## Accessibility

The download centre uses native links, headings and article landmarks. Core downloads remain available in the `noscript` path. Focus states and reduced-motion behaviour are preserved.

## Deployment

No migration or new binding is required. Deployment follows the existing public Worker path. Rollback is a normal code rollback because the change is read-only and does not alter stored data.

## Release criteria

- all export and existing regression tests pass;
- both Worker dry-run bundles pass;
- HEAD responses contain no body;
- CSV formula-injection tests pass;
- canonical history is unavailable in bootstrap-only mode;
- OpenAPI and README describe the new routes accurately;
- final team review finds no unresolved correctness, security, accessibility or claim blocker.
