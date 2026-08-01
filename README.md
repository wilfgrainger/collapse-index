# UK Stability Monitor

A transparent measure of observable systemic pressure in the United Kingdom.

The working project name is **UK Collapse Index**. The public-facing product is deliberately framed as the **UK Stability Monitor** because the score measures pressure and resilience; it does not predict that the country will collapse.

## Current status

**Version 0.2 — evidence foundation. There is no published headline score, by design.**

Four of the ten indicators have working collectors, covering 40% of fixed weight. Publication requires 90% availability and 70% confidence, so the headline is suppressed and the site reports what has been measured, what has not, and the range a complete score could occupy.

| | |
|---|---|
| Indicators with collectors | 4 of 10 |
| Fixed weight available | 40% |
| Evidence confidence | 38% |
| Publication status | **suppressed** |
| Measured pressure | 9.5 points (range 9.5–69.5) |

### Collected sources

| Series | Indicator | Frequency | Latest |
|---|---|---|---|
| ONS `D7G7/MM23` | CPI inflation | monthly | 2.6% (2026 JUN) |
| ONS `MGSX/LMS` | Labour-market stress | rolling quarter | 4.9% (2026 MAR–MAY) |
| ONS `N3Y6/QNA` | GDP per capita growth | annual | +1.0% (2025) |
| ONS `BBFW/LMS` ÷ `MGRZ/LMS` | Industrial disruption | monthly | 0.75 days lost per 1,000 employed |

Six indicators — child poverty, housing stress, food insecurity, trust in government, healthcare strain and environmental disruption — have no collector. Each is blocked on a definitional decision rather than on engineering, which is why none has been filled with a placeholder. They hold 60% of the fixed weight between them.

## Product principles

1. **Pressure, not prophecy.** A high score is evidence of strain, not proof of imminent state failure.
2. **Daily publication is not daily data.** Every input keeps its actual reference period and publication date.
3. **Fixed weights.** Missing data lowers coverage and confidence. It never redistributes weight to the indicators that remain.
4. **Confidence is first-class.** It is published alongside the score and gates whether a headline appears at all.
5. **Events cannot dominate.** Acute events are reviewed, separately shown, capped at 8 points and decay over time.
6. **Everything is reproducible.** Weights, curves, code, source state and methodology versions are public, and every observation carries the hash of the bytes it came from.

## Architecture

```text
Browser
  └─ collapse-index-web Worker  (read-only, no scheduled handler)
       ├─ Static Assets: dashboard and methodology
       └─ GET /api/v1/{current,history,indicators/:id,evidence-health,
                        methodology,sources,health,openapi.json}
              └─ D1: last materialised snapshot
                 (falls back to a bundled fixture capture when unbound)

Cron 15 8 * * *
  └─ collapse-index-ingest Worker  (scheduled only, no public route)
       ├─ fetch    host allow-list, timeouts, size and MIME limits
       ├─ archive  R2, content-addressed by SHA-256
       ├─ parse    exact-series identity assertions
       ├─ validate canonical schema; failure writes nothing
       └─ store    D1 append-only observations, then a snapshot
                   only when the evidence fingerprint changes
```

The two Workers are separated so the public surface has no write path and no scheduled handler. Everything runs within Cloudflare's free tier.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run check          # syntax, 110 tests, and a dry-run bundle of both Workers
npm run dev            # public Worker and dashboard
```

Without a database bound, the site serves `public/data/bootstrap.json`: real ONS values with real payload hashes, parsed from the committed fixtures at a frozen retrieval date. The response and the interface both say so.

### Run the collectors locally

```bash
npm run migrate:local
npm run dev:ingest     # then: curl "http://127.0.0.1:8787/__scheduled?cron=15+8+*+*+*"
```

## Deploy

Resource identifiers are not committed. Create them, then paste the returned IDs into `wrangler.web.jsonc` and `wrangler.ingest.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.

```bash
npx wrangler login
npx wrangler d1 create collapse-index --location=weur
npx wrangler r2 bucket create collapse-index-evidence

npm run migrate:remote     # schema before the code that needs it
npm run deploy:ingest      # ingestion before public, when adding fields
npm run deploy:web
```

Smoke-test `/api/v1/health`, `/api/v1/evidence-health` and a static asset after deploying.

> **Live collection has not been confirmed from this development environment.** Its egress policy returns HTTP 403 to the Worker runtime, though the same URLs are reachable from a shell — which is how the fixtures were captured. The ingestion Worker was exercised against the live scheduler and failed correctly, writing no observations and auditing every failure. Confirm real collection on first deployment.

## API

All routes are read-only; the public Worker has no mutation route.

- `GET /api/v1/current` — pressure, acute overlay, confidence, publication gates and all ten indicators.
- `GET /api/v1/history` — materialised snapshots. Returns an empty series until a real backcast exists.
- `GET /api/v1/indicators/:id` — one indicator with its definition, curve and observation history.
- `GET /api/v1/evidence-health` — collector health, freshness, releases observed and recent runs.
- `GET /api/v1/methodology` — weights, curves, breakpoint rationale, gates and levels.
- `GET /api/v1/sources` — exact series identifiers, licences, coverage and the gaps.
- `GET /api/v1/health` — runtime and binding state.
- `GET /api/v1/openapi.json` — machine-readable API description.

## Repository map

```text
src/domain/methodology/   weights, curves, levels, publication gates
src/domain/scoring/       fixed-weight scoring, confidence, acute overlay
src/domain/evidence/      canonical schemas, states, quality and coverage factors
src/collectors/ons/       client, exact-series parser, source registry, collect
src/storage/d1/           repositories and read paths
src/storage/r2/           content-addressed evidence archive
src/ingest/               scheduled Worker and orchestrator
src/web/                  public Worker and read-only API
src/shared/               hashing, ONS period parsing, typed errors
fixtures/ons/             unmodified ONS payloads used by contract tests
migrations/               D1 schema
public/                   dashboard and methodology website
test/{unit,contract,integration}/
docs/                     methodology, acquisition, platform and decision records
```

## What must happen before a public editorial launch

- collect the six remaining indicators, or document approved versioned replacements;
- validate every collector across at least two published releases, including a revision;
- replace the empty history with a reproducible backcast and publish its vintage;
- agree breakpoints with independent domain reviewers;
- publish sensitivity, weight-ablation and leave-one-out analysis;
- build the acute-event review workflow and its audit trail;
- run accessibility, security, performance and misinformation-risk reviews.

See [ROADMAP.md](ROADMAP.md), [PROGRESS.md](PROGRESS.md), [docs/SOURCE_REGISTER.md](docs/SOURCE_REGISTER.md), [docs/METHODOLOGY_V1_DESIGN.md](docs/METHODOLOGY_V1_DESIGN.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Licence

MIT for the code. Contains public sector information licensed under the Open Government Licence v3.0; source attribution must be preserved.
