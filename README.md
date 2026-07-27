# UK Stability Monitor

A transparent, high-frequency measure of systemic pressure in the United Kingdom.

The working project name is **UK Collapse Index**. The public-facing product is deliberately framed as the **UK Stability Monitor** because the score measures pressure and resilience; it does not predict that the country will collapse.

## Current status

**Version 0.1.0 is a deployable methodology prototype.** It includes:

- a responsive public dashboard;
- a deterministic 0–100 scoring engine;
- ten visible indicator definitions and weights;
- freshness-aware confidence scoring;
- a separately disclosed, capped and decaying event overlay;
- a public JSON API and OpenAPI document;
- Cloudflare Worker Static Assets support;
- an optional Cloudflare D1 evidence store;
- a daily Cron Trigger for snapshot calculation;
- a labelled illustrative historical backcast;
- unit tests for the core scoring rules.

The bundled observations are intentionally marked `provisional` or `illustrative`. Do not remove that status until the source register is independently verified and the collectors are implemented.

## Product principles

1. **Pressure, not prophecy.** A high score is evidence of strain, not proof of imminent state failure.
2. **Daily publication is not daily data.** Every input keeps its actual observation and publication date.
3. **Confidence is first-class.** Missing or stale data lowers confidence rather than being hidden.
4. **Events cannot dominate.** Qualitative events are reviewed, separately shown, capped at ten points and decay over time.
5. **Everything is reproducible.** Weights, thresholds, code, source state and methodology versions are public.

## Architecture

```text
Browser
  ├─ Cloudflare Worker Static Assets
  │   ├─ responsive dashboard
  │   └─ methodology pages
  └─ Worker API
      ├─ /api/v1/index
      ├─ /api/v1/history
      ├─ /api/v1/methodology
      ├─ /api/v1/health
      └─ /api/v1/openapi.json
             │
             ├─ bundled prototype observations (default)
             └─ optional D1 evidence store (production path)
                    ├─ observations
                    ├─ reviewed events
                    ├─ daily snapshots
                    └─ ingestion audit runs
```

The default configuration has no paid dependency and deploys as a Worker plus static assets. D1 is optional until live collectors are ready.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run check
npm run dev
```

Wrangler serves the dashboard and API together.

## Deploy on Cloudflare's free tier

The simplest route avoids GitHub Actions entirely:

1. In Cloudflare, create a Worker from an imported Git repository.
2. Select `wilfgrainger/collapse-index`.
3. Use `npm install` as the build command if requested.
4. Use `npx wrangler deploy` as the deploy command.
5. Keep the root directory as `/`.

The included `wrangler.jsonc` deploys the honest prototype mode immediately. Cloudflare's Git integration handles its own deployment token.

### Enable D1

```bash
npx wrangler d1 create uk-collapse-index --location=weur
```

Copy `wrangler.d1.example.jsonc` to `wrangler.jsonc`, insert the returned database ID, then run:

```bash
npx wrangler d1 migrations apply uk-collapse-index --remote
npx wrangler d1 execute uk-collapse-index --remote --file=./scripts/seed-prototype.sql
npx wrangler deploy
```

The seed is still prototype data. It exists to validate the full storage path, not to confer verification.

## API

- `GET /api/v1/index` – current score, level, confidence, all indicators and active events.
- `GET /api/v1/history` – calculated snapshots or a clearly labelled illustrative backcast.
- `GET /api/v1/methodology` – indicator definitions, thresholds, levels and guardrails.
- `GET /api/v1/health` – runtime and storage mode.
- `GET /api/v1/openapi.json` – machine-readable API description.

## Repository map

```text
src/config.js             indicator definitions, weights and level bands
src/scoring.js            pure scoring and confidence engine
src/demo.js               transparent prototype data and visual backcast
src/repository.js         bundled/D1 read and snapshot persistence paths
src/index.js              Worker routes, assets and daily cron handler
public/                   dashboard and methodology website
migrations/               D1 schema
scripts/seed-prototype.sql optional D1 prototype seed
test/                     deterministic scoring tests
docs/                     architecture, evidence and release decisions
```

## What must happen before a public editorial launch

- verify every seed figure, exact definition and source release date;
- build resilient collectors for official sources;
- replace the illustrative history with a reproducible backcast;
- agree thresholds with independent domain reviewers;
- publish methodology sensitivity and weight-ablation analysis;
- add source-change detection and collector failure alerts;
- establish a named review policy for qualitative events;
- run accessibility, security, performance and misinformation-risk reviews.

See [ROADMAP.md](ROADMAP.md), [docs/SOURCE_REGISTER.md](docs/SOURCE_REGISTER.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licence

MIT. Data providers retain their own terms and licences; source attribution must be preserved.
