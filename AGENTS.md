# Agent operating contract

This repository is a public-evidence product. Correctness, auditability and honest operational disclosure outrank speed or visual drama.

## Required behaviour

- Read `README.md`, `docs/ARCHITECTURE.md`, `docs/SOURCE_REGISTER.md`, `docs/DECISIONS.md` and `PROGRESS.md` before changing code.
- Keep the scoring engine deterministic and independently testable.
- Never convert provisional or illustrative evidence to verified without exact source payloads.
- Never present a daily recalculation as a daily official statistic.
- Preserve source URL, reference period, UK publication date, units, dependency evidence and revision status.
- Derived observations must identify every payload that can alter their value, including denominator evidence.
- Evidence identity and materialised-state identity are separate: unchanged bytes do not stop freshness, expiry or event decay advancing with time.
- Applied migrations are immutable. Add a forward migration and test both empty installation and populated upgrade paths.
- A configured but failing production store must report degraded status; it must not be masked by fixture fallback.
- Any scoring change must update tests, methodology version and decision log.
- Prefer the smallest trustworthy change; do not add frameworks or services without a demonstrated need.
- Never add an event that changes the score without the review fields required by the schema.

## Runtime baseline

Use Node.js 22.13 or newer. The integration tests use the built-in `node:sqlite` module to exercise the real migration SQL.

## Validation

Run:

```bash
npm run check
```

This runs a syntax sweep, the full unit/contract/integration suite, migration tests and `--dry-run` bundles of both Workers.

For D1 changes, also apply migrations locally before merge:

```bash
npm run migrate:local
```

Migration tests cover:

- applying the full schema from empty;
- upgrading a populated v0.2 database through the next forward migration;
- preserving observation, snapshot, component and ingestion-run lineage;
- passing `PRAGMA foreign_key_check`.

## Evidence and state rules that tests enforce

Do not weaken these without a methodology or architecture decision:

- an observation cannot exist without the SHA-256 of its primary payload;
- a derived observation cannot exist without all dependency hashes;
- a blank source value is never coerced to zero;
- fixed weights are never renormalised around missing indicators;
- illustrative or withdrawn evidence can never make an indicator available;
- a failed fetch, parse or validation writes no observation;
- identical source bytes do not prevent a new daily materialisation;
- identical state on the same civil day does not create a duplicate snapshot;
- a denominator-only revision creates a new derived observation;
- stale materialisations are never labelled live or healthy;
- a bound D1 failure never falls back to bundled fixtures;
- the public Worker exposes no mutation route and no scheduled handler;
- the ingestion Worker exposes no public fetch handler.
