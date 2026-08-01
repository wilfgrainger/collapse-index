# Architecture

## Goals

- fit comfortably inside Cloudflare's free tier;
- keep the public page fast and cacheable;
- make scoring reproducible outside Cloudflare;
- separate evidence ingestion from editorial interpretation;
- fail transparently when data is absent or stale.

## Runtime

Two Workers, deployed from separate configurations.

**`collapse-index-web`** (`src/web/index.js`) serves static assets and the read-only JSON API. It calculates nothing from source data: it returns the last materialised snapshot. It has no scheduled handler and no route that writes, so there is no public path to the evidence store.

**`collapse-index-ingest`** (`src/ingest/index.js`) runs on a daily Cron Trigger and holds the only R2 write access. It exports no `fetch` handler at all, so it cannot be reached by URL in production.

The separation is deliberate: the component with write access has no public surface, and the component with a public surface cannot write.

## Layering

```text
src/domain/     methodology, scoring and evidence rules — pure, no bindings
src/collectors/ source-specific retrieval and parsing
src/storage/    D1 and R2 persistence
src/ingest/     scheduled orchestration
src/web/        HTTP presentation
```

The domain layer imports nothing from storage or collectors, which is what lets the scoring engine run identically in tests, in the bootstrap generator and in a Worker.

## Data flow

```text
ONS time-series endpoint
        ↓  host allow-list re-checked on every redirect hop
        ↓  timeout, response-size and MIME limits
Raw bytes  ──────────────► SHA-256
        ↓                     ↓
        ↓            R2 archive, keyed by its own hash
        ↓            (identical bytes → identical key → no re-upload)
        ↓
Parser   asserts CDID, dataset, unit, frequency and period semantics
        ↓  blanks stay blank; a definitional change quarantines the release
Canonical observation  (+ denominator vintage where the value is derived)
        ↓  rejected outright if identity, period or evidence hash is missing
D1 observations  — append-only; a revision adds a version and records what it superseded
        ↓
Fixed-weight scoring engine  (no renormalisation for missing data)
        ↓
Snapshot  — written only when the evidence fingerprint changes
        ↓
Read-only API + cached dashboard
```

Parsing happens from the same bytes that were hashed and archived, so any observation can be reproduced from its evidence.

## Idempotency

Three mechanisms, each at a different layer:

1. **R2** keys contain the payload hash, so identical bytes resolve to an existing object.
2. **D1** enforces `UNIQUE (source_id, period_end, evidence_sha256)`, so re-ingesting the same fact writes nothing.
3. **Snapshots** are keyed by an evidence fingerprint built from the per-indicator payload hashes; an unchanged fingerprint creates no snapshot.

A daily run against unchanged sources therefore writes one audit row and nothing else, and reports `no_change` rather than silence.

## Free-tier posture

The workload is small: one daily scheduled run, five bounded fetches of 15–220 KB, ten current observations and a modest snapshot history. Reads are indexed by `(indicator_id, id)` and `as_of_date`. The dashboard makes two cacheable API requests per uncached visit.

The 10 ms CPU limit is the binding constraint, which is why the tranche is exact small JSON series rather than spreadsheets, and why no XLSX or ZIP parser is bundled.

## Failure behaviour

| Condition | Behaviour |
|---|---|
| No D1 binding | serve the bundled fixture capture, declaring its frozen retrieval date |
| D1 empty or unreadable | same fallback, with provenance stated in the response |
| Non-allow-listed redirect | fail before the request; no observation |
| HTML error page returned with HTTP 200 | rejected on MIME, before parsing |
| Wrong series or dataset in payload | `identity_mismatch`; no observation |
| Unit or definitional change | `quarantine`; no observation, release held for review |
| Blank source value | skipped; never coerced to zero |
| Any collector failure | previous verified observation stays and ages; failure is audited with a class |
| Denominator unavailable | only the dependent indicator is blocked |
| Indicator missing | keeps its weight; lowers coverage and confidence |
| Indicator past hard expiry | becomes unavailable; contributes no confidence |
| Availability below 90% or confidence below 70% | headline suppressed; range published instead |
| Unapproved event | zero contribution |

No failure path substitutes an invented value for a missing one.

## Recovery

Observations and evidence objects are immutable in normal operation, and corrections create replacement versions rather than destructive updates. D1 Time Travel covers short operational mistakes; periodic exports to R2 cover longer recovery. The dashboard continues serving the last materialised snapshot if ingestion stops.
