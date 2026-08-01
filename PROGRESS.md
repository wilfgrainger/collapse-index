# Progress

## 2026-07-27 — Foundation release prepared

### Completed

- created the Cloudflare Worker and Static Assets application
- built the public dashboard and methodology page
- implemented ten-indicator prototype scoring
- implemented prototype freshness-aware confidence
- implemented reviewed, capped and decaying event contributions
- added bundled prototype data with explicit provisional/illustrative status
- added D1 schema and optional seed
- added daily Cron Trigger snapshot persistence
- added current-index, history, methodology, health and OpenAPI routes
- added scoring tests and syntax validation
- documented architecture, source state, decisions, security and roadmap

### Release state

- application: deployable prototype
- storage: bundled prototype mode by default; initial D1 path present
- official collectors: not implemented
- public headline data: illustrative/provisional only
- historical chart: illustrative backcast, clearly labelled

## 2026-07-27 — v0.2 planning and design completed

### Product and editorial design

- defined the UK Stability Monitor product promise and primary users
- retained `collapse-index` as the working/repository descriptor while avoiding predictive public claims
- defined preview, beta, verified, revised, withdrawn and suppressed states
- made evidence health and publication eligibility first-class homepage information
- defined calm language, mobile information order, accessible chart fallbacks and performance budgets

### Methodology design

- separated the fixed-weight structural baseline from the acute disruption overlay
- retained evidence confidence as a separate output rather than discounting pressure
- replaced silent missing-data renormalisation with fixed weights and publication gates
- proposed five domains and ten v1 indicator weights
- specified two-sided inflation pressure, carry-forward rules and source-specific expiry
- defined geography coverage factors so England-only evidence cannot silently represent the UK
- lowered the proposed acute-overlay cap from ten to eight points
- defined historical-vintage, revision, sensitivity and correction requirements

### Source design

- selected exact first-tranche ONS series:
  - CPI `D7G7/MM23`
  - unemployment `MGSX/LMS`
  - real GDP per capita growth `N3Y6`
  - working days lost `BBFW/LMS`
- selected FSA Food and You 2 as the preferred core food-insecurity source
- retained Trussell parcel data as context only
- documented NHS RTT as England-only and pathways rather than unique people
- documented the initial environmental API as England-only pending four-nation coverage
- defined canonical source, release, evidence, observation, validation and revision fields

### Cloudflare platform design

- selected separate public and ingestion Workers
- selected D1 for canonical records and R2 for immutable evidence payloads
- limited the initial schedule to daily official-source checks and hourly environmental checks
- designed around free-tier CPU constraints by starting with exact small CSV/time-series sources
- deferred Queues, Workflows, Durable Objects and heavy spreadsheet parsing until justified
- defined caching, environments, security, observability, backup and Wrangler deployment policy

### Planning documents

- `docs/PRODUCT_SPEC.md`
- `docs/METHODOLOGY_V1_DESIGN.md`
- `docs/DATA_ACQUISITION_PLAN.md`
- `docs/CLOUDFLARE_PLATFORM_DESIGN.md`
- `docs/UX_AND_VISUAL_DESIGN.md`
- `docs/IMPLEMENTATION_PLAN.md`
- updated `docs/SOURCE_REGISTER.md`, `docs/DECISIONS.md` and `ROADMAP.md`

### Current release state

- runtime code remains at the v0.1 prototype
- no production claim has been added
- v0.2 implementation contract is complete
- planning branch: `planning/v0.2-design`

### First coding objective

Build one auditable end-to-end path for the four exact ONS series: source fetch, evidence archive/hash, canonical validation, immutable local D1 storage, fixed-weight partial scoring, evidence-health API and deterministic fixture tests.

### Definition of done for the first coding session

1. canonical schemas reject incomplete or ambiguous evidence;
2. local D1 migrations apply from an empty database;
3. R2/local evidence keys and SHA-256 hashes are deterministic;
4. four ONS fixtures ingest and validate reproducibly;
5. a repeated identical ingestion is idempotent;
6. missing data lowers confidence and can suppress the headline without reweighting remaining indicators;
7. API output exposes partial/suppressed state honestly;
8. Wrangler dry-run checks pass for public and ingestion Workers;
9. no hand-entered source value is promoted to verified production data.

## 2026-08-01 — v0.2 evidence foundation implemented

The runtime moved from the v0.1 prototype to the v0.2 evidence model. The
headline is now suppressed by design rather than estimated from seed values.

### Built

- canonical `Source`, `EvidenceObject`, `Observation`, `Snapshot` and
  `ValidationResult` shapes with dependency-free runtime validation
- D1 migration `0002`: append-only observation versions, evidence objects,
  source releases, snapshot component lineage and a full operational audit trail
- content-addressed R2 evidence archive with SHA-256 de-duplication
- hardened ONS client: host allow-list re-checked on every redirect hop,
  timeout, size and MIME limits, conditional requests
- exact-series parser asserting CDID, dataset, unit and period semantics
- five collectors: `D7G7`, `MGSX`, `N3Y6`, `BBFW` and the `MGRZ` denominator
- fixed-weight scoring with no missing-data renormalisation, separate evidence
  confidence, publication gates and an honest uncertainty range
- two-sided inflation curve; acute overlay implemented and capped at 8
- ingestion Worker (scheduled only) and public Worker (read-only)
- API v2: `current`, `history`, `indicators/:id`, `evidence-health`,
  `methodology`, `sources`, `health`, `openapi.json`
- dashboard rebuilt around the suppressed-headline state, with a collector
  health table and an explicit account of the six missing indicators
- 110 tests: unit, contract against real fixtures, and integration against the
  real migrations running on SQLite

### Retired

- prototype scoring engine, demo dataset, seed SQL and illustrative backcast
- the v0.1 single-Worker configuration

### Current release state

| | |
|---|---|
| Indicators with collectors | 4 of 10 |
| Fixed weight available | 40% |
| Evidence confidence | 38% |
| Publication status | **suppressed** (gates require 90% and 70%) |
| Measured pressure | 9.5 points, range 9.5–69.5 |

Values as at the 2026-08-01 fixture capture: CPI 2.6% (2026 JUN), unemployment
4.9% (2026 MAR–MAY), GDP per head +1.0% (2025), working days lost 0.75 per 1,000
employed people (2026 MAY).

### Verified in this session

- both migrations apply from empty through Wrangler's own runner
- both Workers pass `wrangler deploy --dry-run` (web 36.6 KiB, ingest 77.0 KiB)
- a repeated identical ingestion writes nothing and creates no snapshot
- one failing source leaves the other three intact and audited
- an HTML error page returned with HTTP 200 is rejected on MIME, before parsing
- a revised release adds a version and records what it superseded
- the dashboard renders at 1440px and 390px with no console errors or overflow

### Not verified in this session

Live collection from ons.gov.uk could not be exercised end to end: the sandbox's
egress policy returns HTTP 403 to the Worker runtime, although the same URLs are
reachable from the shell — which is how the fixtures were captured. The
ingestion Worker was run against the live scheduler and failed correctly,
classifying all five sources as `http_status` failures, writing no observations
and recording every failure. The collection path itself is exercised end to end
against the real payloads in the integration tests. **Live ingestion must be
confirmed on first deployment.**

### Next

1. deploy preview resources and confirm live collection against ONS;
2. capture a second release per source to satisfy the two-release rule;
3. add FSA food insecurity, then NHS RTT with England-only disclosure;
4. resolve the HBAI, housing, trust and four-nation environmental definitions.
