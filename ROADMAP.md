# Roadmap

## Release 0.1 — Methodology prototype

- [x] public dashboard and mobile layout
- [x] deterministic ten-indicator prototype engine
- [x] prototype confidence and freshness model
- [x] capped, reviewed and decaying event concept
- [x] public API and methodology page
- [x] Cloudflare Worker plus Static Assets configuration
- [x] optional D1 schema and daily snapshot cron
- [x] clearly labelled illustrative backcast
- [x] core unit tests

## Planning gate — v0.2 design

- [x] define the product promise, users, terminology and publication states
- [x] separate structural pressure, acute disruption and evidence confidence
- [x] replace missing-data renormalisation with fixed-weight publication gates
- [x] define five domains and proposed v1 weights
- [x] specify source geography and coverage treatment
- [x] select exact first-tranche ONS series
- [x] replace food-bank parcels with official food-security measurement for the core design
- [x] define public/ingestion Worker separation, D1 and R2 roles
- [x] define homepage, indicator, history and evidence-health UX
- [x] create implementation work packages and acceptance criteria

## Release 0.2 — Verified official-data core

### Evidence foundation

- [ ] implement canonical source, release, evidence, observation and validation schemas
- [ ] implement immutable D1 observation versions and snapshot-component lineage
- [ ] implement private R2 source-payload archive with SHA-256 deduplication
- [ ] expose collector and evidence health
- [ ] remove hand-entered prototype values from headline eligibility

### First exact-series tranche

- [ ] implement ONS CPI collector for `D7G7/MM23`
- [ ] implement ONS unemployment collector for `MGSX/LMS`
- [ ] implement ONS real GDP-per-head collector for `N3Y6`
- [ ] implement ONS working-days-lost collector for `BBFW/LMS`
- [ ] version ONS population denominators where derived rates require them
- [ ] archive fixtures and validate at least two releases per source

### Remaining core indicators

- [ ] implement FSA Food and You 2 food-security collector
- [ ] implement NHS England RTT collector with England-only disclosure
- [ ] implement DWP HBAI child-poverty collector
- [ ] implement ONS private-rental-affordability collector
- [ ] resolve trust-series continuity and implement the approved source
- [ ] design four-nation environmental-disruption coverage

### Methodology and interface

- [ ] implement fixed-weight structural score without missing-data renormalisation
- [ ] implement separate evidence confidence and publication gates
- [ ] implement two-sided inflation pressure curve
- [ ] lower and document acute-overlay cap at eight points
- [ ] show structural baseline, acute overlay and confidence separately
- [ ] add evidence-health and suppressed-headline states

## Release 0.3 — Reproducible history and robustness

- [ ] acquire source histories back to at least 2000 where defensible
- [ ] publish all transformations, denominators and joins
- [ ] calculate a daily carry-forward latest-vintage backcast
- [ ] add a real-time-vintage backcast where source archives permit
- [ ] mark structural breaks, geography changes and methodology versions
- [ ] publish weight, breakpoint, aggregation and missing-data sensitivity analysis
- [ ] publish leave-one-indicator-out and correlation/double-counting analysis
- [ ] add downloadable CSV and JSON observations and snapshots

## Release 0.4 — Reviewed acute-event system

- [ ] define eligible event classes and exclusions
- [ ] require corroboration and at least one primary source where available
- [ ] add reviewer identity and complete review audit trail
- [ ] add duplicate-event, system-breadth and geographic-reach controls
- [ ] test event caps and half-lives against historical cases
- [ ] publish accepted, changed, expired and rejected event decisions
- [ ] keep automated news tools candidate-only, never self-publishing

## Release 0.5 — Public beta

- [ ] at least 90% fixed-weight availability
- [ ] all five domains represented by verified current/aging evidence
- [ ] confidence at or above 70%
- [ ] reproducible snapshot lineage
- [ ] real historical backcast and sensitivity report
- [ ] beta wording, correction policy and evidence-health dashboard
- [ ] user comprehension and misinformation-risk testing

## Release 1.0 — Public editorial launch

- [ ] all ten indicators verified or an approved versioned replacement documented
- [ ] independent academic/statistical-method review
- [ ] legal review of data licences and headline claims
- [ ] voluntary Code of Practice for Statistics self-assessment
- [ ] WCAG 2.2 AA audit
- [ ] threat model and penetration test
- [ ] incident response and correction policy exercised
- [ ] public methodology consultation
- [ ] stable custom domain and operational monitoring

Subscriptions and personalised alerts are deferred until the score, corrections and event governance are proven trustworthy.
