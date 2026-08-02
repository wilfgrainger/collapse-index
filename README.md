# UK Stability Monitor

A transparent measure of observable systemic pressure in the United Kingdom.

The working project name is **UK Collapse Index**. The public product is deliberately framed as the **UK Stability Monitor** because it measures pressure and resilience; it does not predict that the country will collapse.

## Current status

**Version 0.2 — evidence foundation. There is no published headline score, by design.**

Four of the ten indicators have working collectors, covering 40% of fixed weight. Publication requires 90% availability and 70% confidence, so the headline is suppressed and the site reports what has been measured, what is missing, and the range a complete score could occupy.

| | |
|---|---|
| Indicators with collectors | 4 of 10 |
| Fixed weight available | 40% |
| Evidence confidence | 38% |
| Publication status | **suppressed** |
| Measured pressure | 9.5 points (range 9.5–69.5) |

### Collected sources

| Series | Indicator | Frequency | Fixture value |
|---|---|---|---|
| ONS `D7G7/MM23` | CPI inflation | monthly | 2.6% (2026 JUN) |
| ONS `MGSX/LMS` | Labour-market stress | rolling quarter | 4.9% (2026 MAR–MAY) |
| ONS `N3Y6/QNA` | GDP per capita growth | annual | +1.0% (2025) |
| ONS `BBFW/LMS` ÷ `MGRZ/LMS` | Industrial disruption | monthly | 0.75 days lost per 1,000 employed |

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
       ├─ Static Assets: dashboard and methodology
       └─ GET /api/v1/{current,index,history,indicators/:id,
                        evidence-health,methodology,sources,health,openapi.json}
              └─ D1: latest daily materialised snapshot

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

Migrations are forward-only. `0002_evidence_model.sql` remains immutable; `0003_review_correctness.sql` upgrades populated v0.2 databases while preserving observation, snapshot and ingestion-run lineage.

Smoke-test `/api/v1/health`, `/api/v1/evidence-health`, `/api/v1/current` and a static asset after deployment.

> **Live collection has not been confirmed from the original development sandbox.** Its egress policy returned HTTP 403 to the Worker runtime, although the source URLs were reachable from the shell. Confirm real collection immediately after first deployment.

## API

All routes are read-only.

- `GET /api/v1/current` — current materialised pressure, confidence, gates and indicators.
- `GET /api/v1/index` — deprecated compatibility alias for `/api/v1/current`.
- `GET /api/v1/history` — one latest materialisation per civil day.
- `GET /api/v1/indicators/:id` — definition, current state and observation history.
- `GET /api/v1/evidence-health` — collector health, freshness, releases and recent runs.
- `GET /api/v1/methodology` — weights, curves, rationale, gates and levels.
- `GET /api/v1/sources` — exact series identifiers, licences, coverage and gaps.
- `GET /api/v1/health` — binding, snapshot-age and latest-ingestion health.
- `GET /api/v1/openapi.json` — machine-readable API description.

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
src/web/                  public Worker and read-only API
src/shared/               hashing, periods and typed errors
fixtures/ons/             unmodified ONS payloads used by contract tests
migrations/               forward-only D1 schema changes
public/                   dashboard and methodology website
test/{unit,contract,integration}/
docs/                     methodology, platform and decision records
```

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
