# Roadmap

## Release 0.1 — Methodology prototype

- [x] public dashboard and mobile layout
- [x] deterministic ten-indicator scoring engine
- [x] confidence and freshness model
- [x] capped, reviewed and decaying event overlay
- [x] public API and methodology page
- [x] Cloudflare Worker plus Static Assets deployment
- [x] optional D1 schema and daily snapshot cron
- [x] labelled prototype backcast
- [x] core unit tests

## Release 0.2 — Verified official-data core

- [ ] verify definitions and historical availability for all ten indicators
- [ ] implement ONS collectors for GDP, inflation, unemployment and disputes
- [ ] implement NHS England RTT collector
- [ ] implement DWP poverty release collector
- [ ] implement housing affordability collector
- [ ] add population denominator versioning
- [ ] add source payload hashing and change detection
- [ ] remove unverified seed values from the public score

## Release 0.3 — Reproducible history

- [ ] acquire source histories back to at least 2000 where available
- [ ] publish data transformations and joins
- [ ] calculate a full daily carry-forward backcast
- [ ] mark structural breaks and source-definition changes
- [ ] publish sensitivity analysis for weights and thresholds
- [ ] add downloadable CSV and JSON snapshots

## Release 0.4 — Reviewed event system

- [ ] define eligible event classes and exclusion rules
- [ ] require two-source corroboration for high-severity events
- [ ] add editor identity and review audit trail
- [ ] add duplicate-event and geographic-scope controls
- [ ] test event decay against historical cases
- [ ] publish all event decisions, including rejected candidates

## Release 1.0 — Public editorial launch

- [ ] independent academic and statistical-method review
- [ ] legal review of data licences and headline claims
- [ ] WCAG 2.2 AA audit
- [ ] threat model and penetration test
- [ ] incident response and correction policy
- [ ] public methodology consultation
- [ ] stable custom domain and alert subscriptions
