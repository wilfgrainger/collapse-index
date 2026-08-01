# Architecture

## Goals

- fit comfortably inside Cloudflare's free tier;
- keep the public page fast and cacheable;
- make scoring reproducible outside Cloudflare;
- separate evidence ingestion from public presentation;
- preserve complete evidence and calculation lineage;
- fail transparently when storage, collection or materialisation is stale.

## Runtime

Two Workers are deployed from separate configurations.

**`collapse-index-web`** (`src/web/index.js`) serves static assets and the read-only JSON API. It calculates nothing from source data and has no scheduled handler or mutation route.

**`collapse-index-ingest`** (`src/ingest/index.js`) runs on a daily Cron Trigger and holds the only R2 write access. It exports no `fetch` handler, so it cannot be reached by a public URL in production.

The separation is deliberate: the component with write access has no public surface, and the component with a public surface cannot write.

## Layering

```text
src/domain/     methodology, scoring and evidence rules — pure, no bindings
src/collectors/ source-specific retrieval, identity assertions and transformations
src/storage/    D1 and R2 persistence
src/ingest/     scheduled orchestration
src/web/        HTTP presentation and operational-state disclosure
```

The domain layer imports nothing from storage or collectors. Scoring therefore runs identically in tests, the bootstrap generator and the Worker runtime.

## Data flow

```text
ONS time-series endpoint
        ↓  host allow-list re-checked on every redirect hop
        ↓  timeout remains active through streamed body consumption
        ↓  hard response-size and MIME limits
Raw bytes  ──────────────► SHA-256
        ↓                     ↓
        ↓            private R2 archive keyed by hash
        ↓            identical bytes → no re-upload
        ↓
Parser   asserts CDID, dataset, unit, frequency and period semantics
        ↓  blanks stay blank; definitional changes quarantine the release
Canonical observation
        ↓  primary evidence hash
        ↓  dependency fingerprint includes denominator evidence when derived
D1 observations
        ↓  append-only versions; replacements point to what they supersede
Fixed-weight scoring engine
        ↓  no renormalisation around missing evidence
Daily materialised snapshot
        ↓  dated state fingerprint includes evidence, freshness and output state
Read-only API + cached dashboard
```

Parsing happens from the same bytes that are hashed and archived. Every measured value can therefore be traced back to its exact source payloads.

## Evidence identity and state identity

Evidence identity and materialised state identity are deliberately separate.

- **Evidence objects** identify immutable upstream bytes.
- **Observations** identify a measured fact and all payload dependencies involved in producing it.
- **Snapshots** identify the output state on a specific civil day, including freshness, confidence and acute-event decay.

Identical source bytes do not imply an identical result forever. Freshness and expiry change with time, and reviewed acute events will decay even when source evidence is unchanged. The daily scheduler therefore recalculates and materialises state each day.

## Idempotency

Idempotency exists at three layers:

1. **R2:** content-addressed keys prevent duplicate payload uploads.
2. **Observations:** `UNIQUE (source_id, period_end, dependency_fingerprint)` prevents duplicate facts while allowing a denominator-only revision to create a new derived version.
3. **Snapshots:** `UNIQUE (as_of_date, methodology_version, state_fingerprint)` prevents duplicate same-day state while allowing a new daily materialisation when time advances.

A repeated identical run on the same day records its audit run but writes no duplicate observation or snapshot. The same evidence on the following day produces a new daily snapshot so freshness remains correct.

## Derived observations

Industrial disruption divides ONS BBFW working days lost by the MGRZ employment denominator. Its dependency fingerprint contains both hashes:

```text
primary:<bbfw-sha256>|denominator:<mgrz-sha256>
```

If the denominator changes while the numerator returns `304 Not Modified`, the orchestrator re-fetches the numerator unconditionally, rebuilds the derived observation and records a revised version. Snapshot components retain the resulting dependency fingerprint.

## Snapshot lineage

Snapshots are append-only materialisations. Each snapshot stores:

- the civil `as_of_date`;
- methodology and schema versions;
- evidence and state fingerprints;
- pressure, confidence, coverage and publication gates;
- the full response payload;
- one component row per indicator, linked to the exact observation version and dependency fingerprint.

History returns the latest materialisation for each civil day. Same-day state changes remain auditable in D1 even though the public history series exposes one point per day.

## Database migrations

Applied migrations are immutable.

- `0002_evidence_model.sql` is the merged v0.2 evidence schema.
- `0003_review_correctness.sql` performs the forward upgrade to dependency-aware observations and append-only state snapshots.

The upgrade is tested against a populated v0.2 database, including observation, snapshot, component and ingestion-run lineage plus `PRAGMA foreign_key_check`.

## Public operational state

The public Worker distinguishes four states:

| State | Behaviour |
|---|---|
| Current D1 snapshot | normal `200` response with live provenance |
| Snapshot older than two days | current data remains inspectable, but provenance says `stale`, warning headers are added, and health endpoints return `503` |
| Bound D1 unreadable or empty | `503 degraded`; no fixture fallback |
| No D1 with explicit `BOOTSTRAP_MODE=enabled` | frozen fixture capture with explicit bootstrap provenance |
| No D1 and bootstrap disabled | `503 unavailable` |

This prevents a configured production database failure from being disguised as a healthy fixture response.

## Failure behaviour

| Condition | Behaviour |
|---|---|
| Non-allow-listed redirect | fail before following it; no observation |
| Conditional `304` | recorded as not modified, not treated as a redirect |
| HTML error page with HTTP 200 | rejected on MIME before parsing |
| Body exceeds hard cap | streaming read aborted; no archive or observation |
| Wrong series or dataset | `identity_mismatch`; no observation |
| Unit or definitional change | `quarantine`; no observation |
| Blank source value | skipped; never coerced to zero |
| Collector failure | previous verified observation remains and ages; failure is audited |
| Denominator unavailable | only the dependent indicator is blocked |
| Denominator revised | dependent observation is recalculated and versioned |
| Indicator missing | keeps its fixed weight and lowers coverage and confidence |
| Indicator past hard expiry | becomes unavailable and contributes no confidence |
| Availability below 90% or confidence below 70% | headline suppressed; range published instead |
| Unapproved event | zero acute contribution |

No failure path substitutes an invented value for missing evidence.

## Free-tier posture

The workload is intentionally small: one daily scheduled run, five bounded JSON fetches, a small set of current observations and one public history point per day. Reads are indexed by indicator, date and fingerprints. The dashboard makes two cacheable API requests per uncached visit.

The collector tranche uses exact, small JSON series rather than spreadsheets or ZIP archives, keeping Worker CPU and memory predictable.

## Recovery

Evidence objects and observations are immutable in normal operation. Corrections create replacement versions rather than destructive updates. D1 Time Travel covers short operational mistakes; periodic exports to R2 can provide longer recovery. A stale last snapshot remains inspectable but is never described as live or healthy.
