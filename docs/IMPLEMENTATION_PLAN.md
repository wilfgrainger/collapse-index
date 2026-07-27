# Implementation plan

## Delivery rule

Build evidence integrity before visual polish. A smaller verified index is better than a complete-looking index supported by ambiguous or hand-entered data.

## Tomorrow's objective

Create the first end-to-end verified data path using exact ONS time series, without yet claiming a production UK headline score.

By the end of the first coding session, the repository should be able to:

1. fetch four exact ONS series;
2. archive and hash source responses;
3. parse them into canonical observations;
4. validate identity, units, periods and values;
5. store them in local D1;
6. calculate a fixed-weight partial structural result with honest confidence;
7. expose collector and evidence health through the API;
8. reproduce all behaviour from fixtures in tests.

## First collector tranche

| Order | Indicator | Source identifier | Reason |
|---:|---|---|---|
| 1 | CPI inflation | ONS `D7G7/MM23` | small monthly exact series; simple percentage |
| 2 | unemployment | ONS `MGSX/LMS` | monthly rolling-quarter series and revisions |
| 3 | real GDP per capita growth | ONS `N3Y6` | quarterly cadence and national-accounts revisions |
| 4 | industrial disruption | ONS `BBFW/LMS` | long history, blanks/zero distinction and denominator dependency |

Do not start with NHS spreadsheets, HBAI archives or event/news ingestion until this framework is sound.

## Planned repository shape

```text
src/
  web/                    public Worker and API
  ingest/                 scheduled ingestion Worker
  domain/
    methodology/          definitions, weights, transforms, levels
    scoring/              pure structural/confidence/event functions
    evidence/             canonical schemas and validation
  collectors/
    ons/
      client.js
      timeseries.js
      d7g7.js
      mgsx.js
      n3y6.js
      bbfw.js
  storage/
    d1/                    repositories and transaction boundaries
    r2/                    evidence object archive
  shared/                  errors, hashing, time and response helpers

migrations/
fixtures/
  ons/{series}/{release}/
test/
  unit/
  contract/
  integration/
public/
docs/
wrangler.web.jsonc
wrangler.ingest.jsonc
```

Names may change during implementation, but domain, source, storage and presentation concerns must remain separated.

## Work packages

### WP1 — Freeze API and evidence schemas

Deliverables:

- canonical `Source`, `SourceRelease`, `EvidenceObject`, `Observation`, `Snapshot` and `ValidationResult` shapes;
- JSON Schema or equivalent runtime validation;
- methodology version and deployed Git SHA in outputs;
- explicit geography and evidence-state enums.

Acceptance criteria:

- invalid unit, missing reference period or unknown status is rejected;
- an observation cannot exist without exact source identity and evidence hash;
- illustrative data cannot qualify a verified headline.

### WP2 — D1 migration v2

Deliverables:

- immutable observation versions;
- source and release tables;
- snapshot-component join table;
- ingestion and validation audit tables;
- indexes for latest observation, indicator history and run health.

Acceptance criteria:

- revised source values do not overwrite history;
- one snapshot identifies the exact observation version for every component;
- current-state API requires bounded indexed queries.

### WP3 — R2 evidence archive

Deliverables:

- deterministic object key;
- SHA-256 calculation;
- metadata record in D1;
- no duplicate upload when an identical source hash already exists.

Acceptance criteria:

- parsing happens from the archived bytes or a byte-identical in-memory response;
- content hash is stable in fixtures and deployed Worker tests;
- evidence objects are private by default.

### WP4 — ONS exact-series client

Deliverables:

- fixed ONS hostname allow-list;
- timeout, size and content-type checks;
- conditional request support;
- CSV parser for small exact-series responses;
- source-specific identity assertions.

Acceptance criteria:

- redirect to an unapproved host fails;
- HTML error pages cannot be parsed as data;
- a series mismatch fails rather than creating an observation;
- blanks remain null and are never coerced to zero.

### WP5 — Four collectors

Each collector contains:

- source declaration;
- expected unit and frequency;
- parser mapping;
- period normalisation;
- validation rules;
- fixture from a real published response;
- expected latest and historical sample assertions.

Acceptance criteria:

- collector output is deterministic from fixtures;
- latest point, prior point and revision metadata are tested;
- unknown format changes quarantine the release.

### WP6 — Methodology v1 scoring skeleton

Deliverables:

- fixed weights from the design document;
- no renormalisation around missing indicators;
- confidence based on fixed weights, quality, freshness and geography;
- partial-result/suppression state;
- two-sided inflation transformation placeholder with explicit tests.

Acceptance criteria:

- removing an indicator lowers confidence and cannot increase another indicator's weight;
- fewer than 90% available fixed weight suppresses a verified headline;
- daily recalculation with unchanged evidence produces no new material snapshot.

### WP7 — Ingestion orchestration

Deliverables:

- scheduled handler;
- per-source isolated failure handling;
- run summary and validation records;
- changed-evidence detection;
- snapshot materialisation after successful changes.

Acceptance criteria:

- one failed source does not destroy other successful observations;
- failed validation writes no verified observation;
- repeated identical run is idempotent;
- run status distinguishes success, partial, no-change and failure.

### WP8 — Read-only API v2

Proposed endpoints:

- `GET /api/v1/current`;
- `GET /api/v1/history`;
- `GET /api/v1/indicators/:id`;
- `GET /api/v1/evidence-health`;
- `GET /api/v1/methodology`;
- `GET /api/v1/sources`;
- `GET /api/v1/health`.

Acceptance criteria:

- current response exposes baseline, overlay, confidence, availability and status separately;
- source dates and geography are never omitted from indicator output;
- public API contains no mutation route;
- cache validators change only when the payload changes.

### WP9 — Dashboard adaptation

Only after the data path passes:

- replace prototype headline with suppressed/partial state;
- show four verified collectors and six planned sources;
- add evidence-health panel;
- implement structural + acute equation;
- preserve server-readable/static evidence table.

Do not redesign every visual component on the first coding day.

## Test strategy

### Unit

- curves and interpolation;
- freshness and hard expiry;
- fixed-weight confidence;
- period parsing;
- hashing and object keys;
- event decay when implemented.

### Contract

- one or more real frozen responses per source;
- malformed MIME and HTML response;
- changed headers/column order;
- blank and suppressed values;
- revised release fixture.

### Integration

- local D1 migration;
- fixture ingestion to R2/D1 emulators;
- idempotent second run;
- snapshot calculation and API response;
- degraded source state.

### Deployment smoke

- static homepage;
- `/api/v1/health`;
- `/api/v1/evidence-health`;
- no public write route;
- cron test endpoint locally only;
- compressed Worker size and startup checks.

## Pull-request sequence

Prefer small, independently reviewable changes:

1. `schema/evidence-model-v2`
2. `infra/cloudflare-resource-split`
3. `collectors/ons-client`
4. `collectors/ons-core-four`
5. `methodology/fixed-weight-confidence`
6. `api/evidence-health`
7. `ui/partial-verified-state`

A smaller number of PRs is acceptable if connector limitations require it, but commits should preserve these boundaries.

## Decisions required before beta, not before tomorrow

- final breakpoint values;
- whether labour-market stress becomes a multi-series sub-index;
- compatible Scotland food-security source;
- full-UK healthcare construction;
- housing core versus new-tenancy context measure;
- trust question/series continuity;
- severe-weather formula across all four nations;
- external reviewers and event-editorial governance.

## Explicit exclusions tomorrow

- machine learning;
- social-media sentiment;
- automated news scoring;
- email/SMS subscriptions;
- comments or accounts;
- regional map;
- paid Cloudflare services;
- heavy XLSX parsing;
- declaring the score verified.

## Definition of done for the first coding session

- all new tests pass locally;
- Wrangler dry run succeeds for both Workers;
- local D1 migrations apply from empty state;
- four collector fixtures ingest deterministically;
- evidence objects and observation versions are linked;
- missing-data confidence behaviour is tested;
- API documents partial/suppressed status honestly;
- `PROGRESS.md`, decisions and source register are updated;
- no source value is hand-entered into production configuration.

## Subsequent order

1. deploy preview resources through Wrangler OAuth;
2. prove live collection of the four ONS sources;
3. calculate the first real partial backcast;
4. add FSA food insecurity;
5. add NHS RTT with England-only disclosure;
6. add DWP HBAI and housing spreadsheet collectors;
7. add trust series and four-nation environmental coverage;
8. perform sensitivity analysis;
9. publish beta only after headline gates pass.
