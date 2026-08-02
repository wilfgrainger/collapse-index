# Contributing

Thank you for helping improve the UK Stability Monitor. This is a public-evidence product, so correctness, provenance and honest limitations outrank speed or visual drama.

## Before opening a change

Read:

- [`README.md`](README.md)
- [`AGENTS.md`](AGENTS.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/SOURCE_REGISTER.md`](docs/SOURCE_REGISTER.md)
- [`docs/DECISIONS.md`](docs/DECISIONS.md)

For a new or changed indicator, also read [`docs/DATA_ACQUISITION_PLAN.md`](docs/DATA_ACQUISITION_PLAN.md) and [`docs/METHODOLOGY_V1_DESIGN.md`](docs/METHODOLOGY_V1_DESIGN.md).

## Ground rules

- Do not add a value that cannot be traced to an exact source response.
- Never convert blank, suppressed or unavailable source data to zero.
- Preserve source identity, geography, unit, period, publication date, licence, evidence hash and revision state.
- Missing indicators keep their fixed weight; do not renormalise around gaps.
- Do not present fixture, provisional or illustrative data as live or verified.
- Do not change scoring curves, weights or publication gates without a methodology version and decision record.
- Keep the public Worker read-only and the ingestion Worker unreachable by public URL.

## Development setup

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run check
```

`npm run check` performs the syntax sweep, full test suite and dry-run bundles for both Cloudflare Workers.

For migration work:

```bash
npm run migrate:local
```

Never edit a migration already merged to `main`. Add a forward migration and prove both the empty-database and populated-upgrade paths.

## Collector changes

A collector is not ready merely because it returns a plausible number. A contribution must include, where applicable:

1. the exact provider, dataset, table or series identifier;
2. a legally permissible fixture captured from the real source;
3. a deterministic parser with identity, unit and period assertions;
4. canonical observation provenance and evidence hashing;
5. explicit handling of blanks, suppression, revisions and structural breaks;
6. geography and population-coverage treatment;
7. freshness and hard-expiry rules;
8. contract and integration tests, including failure behaviour;
9. source-register and decision-log updates.

The preferred path is one complete vertical slice: fetch → archive → parse → validate → store → score → API → evidence-health → tests.

## Pull requests

Keep changes bounded and explain:

- the observable outcome;
- the evidence or defect that justified the work;
- material design decisions and rejected alternatives;
- tests and commands actually run;
- migration, compatibility, security and rollback implications;
- residual risk or unverified external behaviour.

Do not claim live collection, deployment, migration, accessibility, security or production verification unless it actually ran.

## Accessibility and public claims

User-facing changes must preserve keyboard access, meaningful headings, readable contrast, reduced-motion behaviour and non-JavaScript access to core data.

Copy must distinguish:

- pressure from prediction;
- a daily materialisation from daily source data;
- a partial observed contribution from a complete national score;
- UK-wide evidence from nation-specific evidence;
- pathways, incidents or records from unique people where the source does not support that claim.

## Reporting security concerns

Do not open public issues for vulnerabilities involving credentials, private evidence objects, write access or exploitable deployment behaviour. Follow [`SECURITY.md`](SECURITY.md).
