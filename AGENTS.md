# Agent operating contract

This repository is a public-evidence product. Correctness and disclosure outrank speed or visual drama.

## Required behaviour

- Read `README.md`, `docs/ARCHITECTURE.md`, `docs/SOURCE_REGISTER.md`, `docs/DECISIONS.md` and `PROGRESS.md` before changing code.
- Keep the scoring engine deterministic and independently testable.
- Never convert a provisional or illustrative observation to verified without exact source evidence.
- Never present a daily recalculation as a daily official statistic.
- Preserve source URL, reference period, publication date, units, denominator and revision status.
- Any scoring change must update tests, methodology version and decision log.
- Prefer the smallest trustworthy change; do not add frameworks or services without a demonstrated need.
- Never add an event that changes the score without the review fields required by the schema.

## Validation

Run:

```bash
npm run check
```

This runs a syntax sweep of every source file, the full test suite, and a
`--dry-run` bundle of both Workers.

For D1 changes, also apply migrations locally before merge:

```bash
npm run migrate:local
```

Migrations are additionally applied from empty against real SQLite in
`test/integration/ingestion.test.js`, so an invalid migration fails the suite.

## Evidence rules that tests enforce

Do not weaken these without changing the methodology version and the decision log:

- an observation cannot exist without the SHA-256 of the bytes it was parsed from;
- a blank source value is never coerced to zero;
- fixed weights are never renormalised around missing indicators;
- illustrative or withdrawn evidence can never make an indicator available;
- a failed fetch, parse or validation writes no observation;
- the public Worker exposes no mutation route and no scheduled handler.
