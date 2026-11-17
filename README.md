# UK Stability Monitor

A transparent measure of observable systemic pressure in the United Kingdom.

The working project name is **UK Collapse Index**. The public product is deliberately framed as the **UK Stability Monitor** because it measures pressure and resilience; it does not predict that the country will collapse.

## Current status

**Version 0.2.1 — site completion. There is no published headline score, by design.**

Four of the ten indicators have working collectors, covering 40% of fixed weight. Publication requires 90% availability and 70% confidence, so the headline is suppressed and the site reports what has been measured, what is missing, and the range a complete score could occupy.

| | |
|---|---|
| Indicators with collectors | 4 of 10 |
| Fixed weight available | 40% |
| Evidence confidence | 38% |
| Publication status | **suppressed** |
| Measured pressure | 10.3 points (range 10.3–70.3) at the 2026-11 capture |
| Collector maturity | every source validated across two real ONS releases, including a revision |

### Collected sources

| Series | Indicator | Frequency | 2026-07 capture | 2026-11 capture |
|---|---|---|---|---|
| ONS `D7G7/MM23` | CPI inflation | monthly | 2.6% (2026 JUN) | 3.5% (2026 SEP) |
| ONS `MGSX/LMS` | Labour-market stress | rolling quarter | 4.9% (2026 MAR–MAY) | 4.7% (2026 JUN–AUG) |
| ONS `N3Y6/QNA` | GDP per capita growth | annual | +1.0% (2025) | +0.9% (2025, **revised**) |
| ONS `BBFW/LMS` ÷ `MGRZ/LMS` | Industrial disruption | monthly | 0.75 days lost per 1,000 employed | 0.67 (2026 AUG) |

Six indicators — child poverty, housing stress, food insecurity, trust in government, healthcare strain and environmental disruption — have no collector. They retain 60% of the fixed weight rather than being filled with placeholders.

## Product principles

1. **Pressure, not prophecy.** A high score is evidence of strain, not proof of imminent state failure.
2. **Daily publication is not daily data.** Inputs retain their true reference periods and publication dates.
3. **Fixed weights.** Missing data lowers coverage and confidence; it never redistributes weight.
4. **Confidence is first-class.** It is published separately and gates whether a headline appears.
5. **Events cannot dominate.** Reviewed acute events are separately disclosed, capped and time-decayed.
6. **Everything is reproducible.** Every observation identifies the exact evidence payloads involved, including denominator evidence for derived values.

## Architecture

```text
Browser
  └─ collapse-index-web Worker  (read-only, no scheduled handler)
       ├─ Static Assets: dashboard, downloads and methodology
       └─ GET /api/v1/{current,index,history,indicators/:id,
                        evidence-health,methodology,sources,health,openapi.json,
                        exports/*}
              └─ D1: canonical observations and daily materialised snapshots

Cron 15 8 * * *
  └─ collapse-index-ingest Worker  (scheduled only, no public route)
       ├─ fetch    host allow-list, timeout, streaming size and MIME limits
       ├─ archive  R2, content-addressed by SHA-256
       ├─ parse    exact-series identity and unit assertions
       ├─ validate canonical observations and schema-v2 snapshots
       └─ store    append-only observations and daily snapshots
```

Evidence objects remain deduplicated when upstream bytes do not change. Daily snapshots still advance because freshness, expiry and event decay depend on time. Identical state on the same civil day is deduplicated; a new day receives a new materialisation.

Derived observations use a dependency fingerprint containing every payload that can alter the result. For industrial disruption, that includes both the BBFW numerator and MGRZ employment denominator.

The public Worker never writes. A bound but unreadable D1 database returns a degraded response rather than silently falling back to fixtures. A materialisation more than two days old is explicitly marked stale and causes the health endpoints to report degraded status.

## Website

Static pages with no framework and no build step. Each one renders from the read-only API and states its operational status (live, stale, bootstrap or degraded):

- `/` — dashboard with publication status, range, domains, top drivers, all ten indicators, collector health and downloads;
- `/indicator?id=…` — one indicator: source, evidence hashes, denominator, period, freshness, scoring curve and every stored observation version;
- `/history` — daily materialisations the system actually calculated; no backcast and no illustrative line;
- `/evidence` — publication gates, domain coverage, collectors with the release calendar and overdue releases, indicator freshness and recent runs;
- `/methodology` — the full method, with live gate values;
- `/about` — what the monitor does and does not mean, FAQ, corrections and revision policy, and version history.

`robots.txt` and `sitemap.xml` are served by the Worker with absolute request-origin URLs. The shared header and footer are kept identical by `node scripts/sync-chrome.mjs`; the test suite fails if a page drifts. Pages contain no inline styles or scripts, so the site's strict CSP holds.

### Static preview on GitHub Pages

`.github/workflows/pages.yml` publishes a static preview on every push to `main`, at `https://wilfgrainger.github.io/collapse-index/`.

Pages cannot run the public Worker. `scripts/build-pages.mjs` therefore runs the real Worker once in explicit bootstrap mode and freezes each read-only API response into a file. It also rewrites root-relative links for the `/collapse-index` base path.

The preview shows the committed ONS fixture capture, labelled **frozen capture** on every page. Its history and canonical observation and snapshot exports are empty or unavailable, exactly as in bootstrap mode. It is not live data and not the production deployment.

Build it locally with `npm run build:pages`; the output goes to `dist/pages/`.

## Downloadable evidence

The public API provides bounded exports with stable schemas and deterministic row ordering:

- `/api/v1/exports/current.csv` — all ten fixed-weight indicators in the latest current or explicitly labelled bootstrap snapshot;
- `/api/v1/exports/observations.json` and `.csv` — canonical verified and revised observation versions from D1;
- `/api/v1/exports/snapshots.json` and `.csv` — one latest materialisation per civil day and methodology version;
- `/api/v1/exports/manifest.json` — scope, limitations, licences, operational provenance and links.

Exports preserve source identifiers, periods, publication dates, evidence hashes, dependency fingerprints, denominator metadata and revision lineage. CSV string cells are neutralised against spreadsheet-formula execution. Response-generation timestamps and operational provenance can legitimately vary between requests.

Bootstrap fixtures may be exported only as the explicitly labelled **current** capture. They are never presented as canonical observation or snapshot history. Raw archived source payloads remain private in R2; public observations expose their SHA-256 hashes for audit linkage.

## Local development

Requirements: **Node.js 22.13 or newer**.

```bash
npm install
npm run check          # syntax, tests, migrations and both Worker dry-run bundles
npm run dev            # public Worker and dashboard
```

The committed `public/data/bootstrap.json` is available only when `BOOTSTRAP_MODE=enabled`. Production configuration disables bootstrap mode. Without D1 and without explicit bootstrap mode, the current and health endpoints return `503` rather than presenting a fixture as live data.

### Run the collectors locally

```bash
npm run migrate:local
npm run dev:ingest
# then: curl "http://127.0.0.1:8787/__scheduled?cron=15+8+*+*+*"
```

## Deploy

Resource identifiers are not committed. Create the resources, then insert the returned D1 ID into `wrangler.web.jsonc` and `wrangler.ingest.jsonc`.

```bash
npx wrangler login
npx wrangler d1 create collapse-index --location=weur
npx wrangler r2 bucket create collapse-index-evidence

npm run migrate:remote
npm run deploy:ingest
npm run deploy:web
```

Migrations are forward-only and applied migrations are immutable. A **fresh** installation applies every migration under D1's transactional conditions, and a test enforces this.

> **Known limitation (R4):** `0003_review_correctness.sql` uses `PRAGMA foreign_keys = OFF`, which has no effect inside a D1 migration transaction. It therefore cannot upgrade a *populated* v0.2 database. No such database is known to exist. If one does, upgrade it with a new forward migration that uses `PRAGMA defer_foreign_keys = true`. See `docs/delivery/site-completion/plan.md`.

Smoke-test `/api/v1/health`, `/api/v1/evidence-health`, `/api/v1/current`, `/api/v1/exports/manifest.json` and a static asset after deployment.

> **Live collection has not been confirmed from the original development sandbox.** Its egress policy returned HTTP 403 to the Worker runtime, although the source URLs were reachable from the shell. Confirm real collection immediately after first deployment.

## API

All routes are read-only and support `GET` and `HEAD`.

- `GET /api/v1/current` — current materialised pressure, confidence, gates and indicators.
- `GET /api/v1/index` — deprecated compatibility alias for `/api/v1/current`.
- `GET /api/v1/history` — one latest materialisation per civil day.
- `GET /api/v1/indicators/:id` — definition, current state and observation history.
- `GET /api/v1/evidence-health` — collector health, freshness, releases (including `releaseOverdue`) and recent runs.
- `GET /api/v1/methodology` — weights, curves, rationale, gates and levels.
- `GET /api/v1/sources` — exact series identifiers, licences, coverage and gaps.
- `GET /api/v1/health` — binding, snapshot-age and latest-ingestion health.
- `GET /api/v1/openapi.json` — machine-readable API description.
- `GET /api/v1/exports/manifest.json` — export catalogue and reuse limitations.
- `GET /api/v1/exports/current.csv` — current ten-indicator snapshot.
- `GET /api/v1/exports/observations.{json,csv}` — canonical observation versions.
- `GET /api/v1/exports/snapshots.{json,csv}` — daily materialised history.

Stale current data remains inspectable but includes provenance and warning headers. Health and evidence-health return `503` when the daily materialisation is stale or storage is degraded.

## Repository map

```text
src/domain/methodology/   weights, curves, levels and publication gates
src/domain/scoring/       fixed-weight scoring, confidence and acute overlay
src/domain/evidence/      canonical schemas, states and validation
src/collectors/ons/       hardened client, parser, registry and observation builder
src/storage/d1/           append-only evidence and snapshot repositories
src/storage/r2/           content-addressed private evidence archive
src/ingest/               scheduled Worker and orchestration
src/web/                  public Worker, read-only API and export serialisation
src/shared/               hashing, periods and typed errors
fixtures/ons/             unmodified ONS payloads used by contract tests
migrations/               forward-only D1 schema changes
public/                   static website: dashboard, indicator, history, evidence, methodology, about
test/{unit,contract,integration}/
docs/                     methodology, platform, delivery and decision records
```

## Contributing and security

Contributions are welcome, particularly source validation, statistical review, accessibility testing and resilient public-data collectors. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing evidence or methodology.

Report vulnerabilities privately according to [`SECURITY.md`](SECURITY.md). Do not place credentials, private evidence payloads or exploit details in public issues.

## Before a public editorial launch

- collect the six remaining indicators or approve versioned replacements;
- validate every collector across at least two releases, including revisions;
- replace the empty history with a reproducible backcast and publish its vintage;
- agree breakpoints with independent domain reviewers;
- publish sensitivity, weight-ablation and leave-one-out analysis;
- implement the acute-event review workflow and audit trail;
- complete accessibility, security, performance and misinformation-risk reviews.

See [ROADMAP.md](ROADMAP.md), [PROGRESS.md](PROGRESS.md), [docs/SOURCE_REGISTER.md](docs/SOURCE_REGISTER.md), [docs/METHODOLOGY_V1_DESIGN.md](docs/METHODOLOGY_V1_DESIGN.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Licence

MIT for the code. Contains public sector information licensed under the Open Government Licence v3.0; source attribution must be preserved.
