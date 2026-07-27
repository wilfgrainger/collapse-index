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

For D1 changes, also apply migrations locally with Wrangler before merge.
