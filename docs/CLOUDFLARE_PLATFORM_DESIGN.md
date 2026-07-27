# Cloudflare platform design

## Decision

Use Cloudflare's free developer platform as the production runtime, with Wrangler as the source-controlled deployment interface.

The initial architecture uses four resources:

1. **Public Worker with Static Assets** — cached website and read-only JSON API.
2. **Ingestion Worker** — scheduled source retrieval and validation.
3. **D1 database** — canonical observations, source metadata, events, snapshots and audit records.
4. **R2 bucket** — immutable raw evidence payloads and longer-lived exports.

Do not introduce Queues, Durable Objects, Workflows or a frontend framework until a measured requirement justifies them.

## Free-tier fit

The design is intentionally far below current free-tier limits:

- Workers Free: 100,000 requests per day;
- Workers Free: 10 ms CPU per invocation, so parsing must remain small and streaming-friendly;
- up to five Cron Triggers per account;
- D1 Free: 5 million rows read and 100,000 rows written per day;
- D1 Free: 500 MB per database and 5 GB per account;
- R2 Standard free allowance: 10 GB-month storage, 1 million Class A and 10 million Class B operations per month;
- D1 Time Travel: seven days on the free plan.

The product should remain usable if Cloudflare changes limits: all scoring logic and data exports must run locally.

## Resource topology

```text
Internet
   |
   v
collapse-index-web Worker
   |-- Static Assets: HTML/CSS/JS/icons
   |-- GET /api/v1/current
   |-- GET /api/v1/history
   |-- GET /api/v1/indicators/:id
   |-- GET /api/v1/evidence-health
   |-- GET /api/v1/methodology
   |
   +--> D1 (read paths only in application design)
   +--> R2 (only public evidence objects explicitly exposed)

Cron Triggers
   |
   v
collapse-index-ingest Worker
   |-- fetch exact official source
   |-- archive payload to R2
   |-- parse and validate
   |-- write candidate/verified observation to D1
   |-- calculate snapshot only when evidence changes
   +-- write ingestion audit record
```

## Worker separation

### Public Worker

Responsibilities:

- serve static assets;
- expose read-only APIs;
- calculate no source data on request;
- return the last materialised snapshot;
- apply cache and security headers;
- expose degraded evidence state without exposing secrets or internal stack traces.

It must contain no public write endpoint and no scheduled ingestion handler.

### Ingestion Worker

Responsibilities:

- run scheduled checks;
- use conditional requests where sources support `ETag` or `Last-Modified`;
- enforce hostname allow-lists, timeouts, MIME and response-size limits;
- archive evidence before parsing;
- run source-specific validation;
- write observations and snapshots transactionally where practical;
- record failures without overwriting the last verified observation.

No public route is required in production. A protected/manual trigger may be added later for operations, but not in the first implementation.

## Cron budget

Use at most two triggers initially because the account limit is shared with other projects.

| Trigger | Purpose |
|---|---|
| `15 8 * * *` UTC | check official monthly, quarterly and annual sources once daily |
| `17 * * * *` UTC | collect near-real-time environmental disruption data |

The daily job can skip sources whose expected release date has not arrived. The hourly job must make only a small number of bounded requests.

No job should create a snapshot when all source hashes and active event contributions are unchanged.

## CPU constraint

Ten milliseconds of active CPU is the main free-tier constraint. Network waiting does not consume active CPU, but decompression, spreadsheet parsing and large JSON processing can.

Therefore:

- start with exact small CSV/time-series endpoints;
- avoid downloading full ONS datasets when a single-series endpoint exists;
- stream or incrementally parse payloads where possible;
- do not bundle a large XLSX parser into the first ingestion Worker;
- benchmark `wrangler dev` and deployed CPU metrics before enabling each collector;
- keep spreadsheet/ZIP sources in manual or preprocessed mode until a collector proves safe;
- do not assume Workflows solve CPU limits on the free plan, because free workflow steps inherit the 10 ms compute limit.

If a required official source cannot be parsed reliably within free limits, the honest choices are a reviewed canonical extract or moving that collector to paid compute—not a fragile parser.

## D1 model

Recommended tables:

- `sources` — identity, exact series/table, licence, cadence, geography and state;
- `source_releases` — release discovery and payload metadata;
- `evidence_objects` — R2 key, hash, MIME, byte size and retrieval metadata;
- `observations` — immutable versions of raw and transformed values;
- `indicator_definitions` — methodology-versioned curves and weights;
- `events` and `event_reviews` — acute-overlay decisions;
- `snapshots` — materialised headline outputs;
- `snapshot_components` — exact observation versions used;
- `ingestion_runs` and `validation_results` — operational audit trail;
- `methodology_versions` — publication and compatibility metadata.

Indexes should serve exact current-state and history queries. Avoid unbounded `SELECT *` routes.

## R2 evidence archive

Object key convention:

```text
sources/{source_id}/{published_date}/{sha256}/{original_filename}
exports/d1/{yyyy-mm-dd}/{filename}
```

Store:

- exact small source responses;
- official CSV/XLSX/ZIP payloads when licence permits;
- canonical extracts when redistribution is restricted;
- daily or weekly D1 exports for recovery beyond free Time Travel retention.

Objects are private by default. Public downloads are served through controlled Worker routes only when licensing and disclosure rules allow.

## Caching

### Static assets

- fingerprint immutable JS/CSS assets;
- `Cache-Control: public, max-age=31536000, immutable` for fingerprinted assets;
- short cache for HTML to allow corrections.

### API

- current snapshot: edge cache 5 minutes, stale-while-revalidate 15 minutes;
- history and methodology: cache 1 hour or by version hash;
- evidence health: cache 1–5 minutes;
- use strong `ETag` based on snapshot/methodology hash.

Purge-by-tag is unnecessary for the initial scale; versioned URLs and short API TTLs are sufficient.

## Environments

### Local

- Miniflare/Wrangler local D1 and R2;
- recorded fixtures only for tests;
- no accidental production source writes.

### Preview

- separate Worker names;
- separate D1 database and R2 bucket;
- prototype or fixture data only;
- deployed from a feature branch when explicitly requested.

### Production

- production bindings and source credentials;
- `main` is the deployable branch;
- migrations applied explicitly before Worker deployment;
- public score remains provisional until publication gates pass.

## Wrangler deployment sequence

The intended production flow is:

```text
wrangler login
wrangler d1 create collapse-index
wrangler r2 bucket create collapse-index-evidence
wrangler d1 migrations apply collapse-index --remote
wrangler deploy --config wrangler.ingest.jsonc
wrangler deploy --config wrangler.web.jsonc
```

Actual resource IDs are written to environment-specific Wrangler configuration after creation. OAuth credentials and account IDs are never committed.

## Deployment policy

- tests and dry-run bundle checks before deployment;
- schema migration before code requiring the schema;
- deploy ingestion Worker before public Worker when adding new data fields;
- smoke-test `/health`, current snapshot and a static asset;
- retain previous Worker version for rollback;
- record deployed Git SHA and methodology version in `/health`.

GitHub Actions may run tests, but Cloudflare remains the runtime and data platform. Direct Wrangler OAuth deployment is acceptable for the initial release.

## Security controls

- fixed upstream hostname allow-list;
- HTTPS only;
- request timeouts and maximum response sizes;
- accepted MIME types per collector;
- no redirects to unapproved hosts;
- prepared D1 statements;
- no dynamic SQL from request parameters;
- restrictive CSP, permissions policy and frame denial;
- no secrets in client assets or D1 rows exposed publicly;
- no open administrative endpoint;
- evidence archive private by default;
- dependency minimisation and lockfile integrity.

## Observability

Every ingestion run records:

- source and collector version;
- start/end time;
- request status and bytes;
- source hash and whether content changed;
- parse/validation outcome;
- rows staged/published;
- snapshot ID, if changed;
- failure class and safe error summary.

Operational views:

- current collector health;
- expected versus last successful release;
- stale/expired indicators;
- D1/R2 usage estimates;
- Worker error and CPU-limit counts.

Alerts are not required for the first preview, but a failed core collector must be visible on the public evidence-health panel after its release grace period.

## Recovery

- D1 Time Travel covers short operational mistakes;
- periodic D1 exports to R2 provide longer recovery;
- observations and evidence objects are immutable in normal operation;
- corrections create replacement versions rather than destructive updates;
- the dashboard can serve the last verified snapshot if ingestion fails.

## Deferred platform features

- **Queues:** useful only when source fan-out or retries exceed one scheduled invocation.
- **Workflows:** useful for durable multi-step ingestion, but the free CPU limit does not help heavy parsing.
- **Durable Objects:** no coordination or real-time session need exists.
- **KV:** D1 plus edge cache already covers configuration and snapshots.
- **Analytics Engine:** unnecessary before meaningful traffic and event volumes exist.
- **Turnstile:** unnecessary until subscriptions or user input are introduced.
