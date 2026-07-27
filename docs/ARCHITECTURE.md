# Architecture

## Goals

- fit comfortably inside Cloudflare's free tier;
- keep the public page fast and cacheable;
- make scoring reproducible outside Cloudflare;
- separate evidence ingestion from editorial interpretation;
- fail transparently when data is absent or stale.

## Runtime

One Cloudflare Worker serves both the API and static assets. The browser requests the current index and history from read-only API routes. Static assets are automatically cached by Cloudflare.

The default `prototype` mode reads bundled observations. This makes the repository deployable without provisioning a database and ensures every public claim remains visibly provisional.

Production `d1` mode reads the latest observation per indicator from Cloudflare D1. A daily Cron Trigger calculates and upserts one snapshot per UTC date. It does not falsely update the underlying observation date.

## Data flow

```text
Official/approved source
        ↓
Collector with schema validation
        ↓
Observation + source metadata + payload hash
        ↓
D1 observations table
        ↓
Pure scoring engine
        ↓
Daily D1 snapshot
        ↓
Read-only API + cached dashboard
```

Collectors are deliberately not included in 0.1. Source-specific parsing is the highest data-integrity risk and must be implemented with fixtures and exact series identifiers rather than guessed URLs.

## Free-tier posture

The intended workload is tiny: one daily scheduled calculation, ten current observations, a modest snapshot history and cached public reads. Queries are indexed by indicator/date and snapshot date. The dashboard requires two API requests per uncached visit; both are cacheable.

## Failure behaviour

- no D1 binding: serve the labelled bundled prototype;
- connected but empty D1: serve the labelled prototype and a warning;
- D1 read error: serve the labelled prototype and a warning;
- missing indicator: omit its weight and list it as missing;
- stale indicator: retain the observation but lower confidence;
- confidence below threshold: mark the headline low-confidence;
- unapproved event: zero contribution.

## Future isolation

Collectors should eventually run in a separate ingestion Worker with no public routes. The public Worker should retain read-only D1 access where Cloudflare binding permissions permit, or use a materialised read database.
