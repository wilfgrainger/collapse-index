# Decision log

## D-001 — Public name separates monitoring from prophecy

**Decision:** Use `UK Stability Monitor` as the public name and retain `Collapse Index` as the working descriptor.

**Reason:** The system measures pressure. Calling every elevated reading “collapse” would overstate what the evidence can support.

## D-002 — Higher score always means more pressure

**Decision:** All transformed indicators use a 0–100 pressure scale where higher is worse.

**Reason:** This keeps the headline and component interpretation consistent.

## D-003 — Daily publication, source-frequency honesty

**Decision:** Publish/check daily where useful, but create a material score change only when an underlying observation, approved acute event or methodology version changes. Every input retains its true reference and publication dates.

**Reason:** Most official series are monthly, quarterly or annual. Fabricating daily movement would create false precision.

## D-004 — Confidence remains separate from pressure

**Decision:** Evidence quality, freshness and geographic coverage produce a separate confidence measure. They do not multiply the pressure score downward.

**Reason:** Discounting adverse pressure because the evidence is stale can make conditions appear healthier. Separate confidence and publication gates are more transparent.

## D-005 — Acute disruption is capped and decays

**Decision:** A reviewed event can contribute at most two initial points. Methodology v1 caps the total acute overlay at eight points and applies exponential decay.

**Reason:** Short-lived events should make the monitor responsive, but qualitative editorial judgement must not dominate the quantitative baseline.

**History:** The prototype cap was ten points. The v1 design lowers it to eight before any verified public release.

## D-006 — Prototype may deploy without D1

**Decision:** The v0.1 prototype can use bundled, visibly provisional data when no D1 binding exists.

**Reason:** The design can be reviewed without hiding missing infrastructure. Verified or beta operation will require canonical evidence storage.

## D-007 — Collectors follow schemas and disclosure

**Decision:** Establish evidence schemas, scoring rules, failure behaviour and tests before adding external-source parsers.

**Reason:** A collector that silently reads the wrong series is more dangerous than an explicit prototype.

## D-008 — Split structural pressure from acute disruption

**Decision:** The public result comprises a fixed-weight structural baseline plus a separately visible acute disruption overlay. Confidence is a third, independent output.

**Reason:** Annual poverty or trust measures and hourly flood disruption operate on different timescales. Combining them as indistinguishable components obscures what changed and why.

## D-009 — Do not renormalise around missing evidence

**Decision:** Fixed indicator weights remain fixed. Missing or expired evidence reduces availability and confidence and may suppress the point headline; the remaining indicators do not inherit its weight.

**Reason:** Renormalisation allows one source failure to increase unrelated indicators' influence and can move the score even though no real-world evidence changed.

## D-010 — Publishability requires explicit gates

**Decision:** A verified point headline requires at least 90% fixed-weight availability, all domains represented, confidence of at least 70%, reproducible snapshot inputs and no critical evidence-integrity alert.

**Reason:** A composite number should not appear complete merely because the software can calculate one.

## D-011 — Use official food-security measurement as the core indicator

**Decision:** Food Standards Agency Food and You 2 food-security classification is the preferred core evidence. Trussell parcel counts remain contextual unless a later methodology version approves them.

**Reason:** Parcel counts measure activity in one support network, not total population food insecurity. The official survey is closer to the intended construct, while its incomplete UK geography remains visible in confidence.

## D-012 — Never silently treat England as the UK

**Decision:** Every observation carries geography and a versioned coverage factor. England-only NHS RTT and initial flood data receive prominent scope warnings and lower evidence confidence.

**Reason:** Combining UK-wide economic series with England-only public-service data without disclosure creates a false national precision.

## D-013 — Start ingestion with exact small ONS series

**Decision:** The first production collectors are CPI `D7G7`, unemployment `MGSX`, real GDP per capita growth `N3Y6` and working days lost `BBFW`.

**Reason:** Exact, small, machine-readable series provide the strongest way to prove source identity, revisions, hashing and idempotence before fragile spreadsheet parsing.

## D-014 — Separate public and ingestion Workers

**Decision:** The target platform uses a read-only public Worker and a scheduled ingestion Worker, backed by D1 for canonical records and R2 for immutable source evidence.

**Reason:** It reduces the public attack surface, isolates source failures, preserves raw evidence and keeps the runtime understandable.

## D-015 — Free-tier constraints shape collector design

**Decision:** Prefer small CSV/JSON endpoints, bounded responses and source-specific parsers. Do not introduce heavy XLSX parsing, Queues, Workflows or Durable Objects until measurements show they are required and safe within the chosen Cloudflare tier.

**Reason:** Infrastructure should serve the evidence method, not add complexity or encourage unreliable parsing under tight CPU limits.

## D-016 — Historical output must state its vintage

**Decision:** Historical charts must identify whether they are illustrative, latest-vintage retrospective backcasts or real-time-vintage backcasts. Methodology and source breaks are marked.

**Reason:** Revised official data can make past conditions look different from what was known at the time. The distinction is material to interpretation.

## D-017 — N3Y6 is an annual series, not quarterly

**Decision:** Declare and collect ONS `N3Y6/QNA` (GDP per head, year-on-year growth, CVM SA) at **annual** frequency.

**Reason:** `DATA_ACQUISITION_PLAN.md` §1 assumed quarterly cadence. The live payload publishes 70 annual points and zero quarterly points, so the assumption was wrong. The series sits inside the quarterly national accounts dataset — which is what made quarterly plausible — but its own observations are annual, revised by successive QNA releases. The collector fails loudly if a quarterly frequency is declared, and a contract test pins this so a future change is caught rather than assumed.

**Consequence:** GDP per capita growth carries an annual cadence (365 days, 45-day grace, 550-day hard expiry) and a reference period of a whole calendar year. It is the slowest-moving indicator in the set.

## D-018 — Industrial disruption requires a versioned employment denominator

**Decision:** Add ONS `MGRZ/LMS` (people in employment, thousands) as a fifth collected series, used only as a denominator, and score `BBFW` as working days lost per 1,000 employed people per month.

**Reason:** `BBFW` is a count in thousands of days. A count cannot be placed on a pressure curve without normalisation, and the acquisition plan requires a versioned denominator. Recording the denominator's own reference period, publication date and evidence hash on every derived observation means a later revision to employment cannot silently rewrite a published rate.

**Consequence:** The first tranche is five sources, not four. `MGRZ` is never scored directly and has no indicator of its own. Where the numerator's monthly period and the denominator's rolling-quarter period do not align exactly, the observation records whether the match was exact.

## D-019 — Rolling three-month estimates keep their true reference period

**Decision:** A Labour Force Survey point labelled `2026 APR` is stored with the period 2026-03-01 to 2026-05-31, driven by the payload's own `monthLabelStyle` field.

**Reason:** ONS labels rolling three-month averages with their middle month. Storing that label as a single month would misdate every labour-market observation by design, and would make the series look a month fresher than it is. The parser also quarantines a release if a series starts or stops describing itself as a three-month average, because that is a definitional change.

## D-020 — Use the ONS time-series JSON endpoint rather than generated CSV

**Decision:** Collect from `https://www.ons.gov.uk/{path}/timeseries/{cdid}/{dataset}/data`.

**Reason:** The acquisition plan proposed the CSV generator. The JSON endpoint returns the same observations plus a `description` block carrying the CDID, dataset, unit, release date and announced next release date. That metadata is what makes identity assertion and source-driven freshness possible, and it removes a CSV parsing step under a tight CPU budget. Payloads are 15–220 KB, well inside the response limit.

## D-021 — Remove the hand-entered prototype dataset entirely

**Decision:** Migration `0002` drops the v0.1 `observations`, `events`, `snapshots` and `ingestion_runs` tables, and the prototype seed, demo module and illustrative backcast are deleted rather than retained behind a flag.

**Reason:** ROADMAP release 0.2 requires removing hand-entered values from headline eligibility. Leaving them reachable behind a mode flag preserves the risk that a concept-brief number is served as evidence. No production D1 database existed — `wrangler.jsonc` bound none — so nothing observed was lost. `ingestion_runs` had to be dropped explicitly because 0001 created it with a different shape that `CREATE TABLE IF NOT EXISTS` would have silently preserved.

**Consequence:** With no database bound, the site serves a bundled capture generated from committed ONS fixtures: real values and real payload hashes, with a frozen retrieval date that the response and the interface both declare. The history endpoint returns an empty series rather than an illustrative one.

## D-022 — MGSX and MGRZ are treated as official statistics in development

**Decision:** Assign the LFS-derived series a quality factor of 0.90 rather than the 1.00 given to accredited statistics.

**Reason:** Labour Force Survey estimates carry known response-rate problems and are published as official statistics in development. CPI (`D7G7`) and the national accounts series (`N3Y6`) are treated as accredited. The distinction is recorded per source so it can be revised in one place when ONS reclassifies them.

## D-023 — Collector maturity is tracked separately from evidence state

**Decision:** Observations from the four ONS collectors are written as `verified`, while `releasesObserved` is exposed per collector on the evidence-health endpoint.

**Reason:** `SOURCE_REGISTER.md` requires validation across at least two published releases before a source is production-ready. That is a property of the collector accumulating over time, not of an individual observation whose identity, units, period, hash and parser have all been checked. Separating the two avoids either overstating an observation or understating a validated one. The headline is suppressed by the availability gate regardless, so nothing is publicly overclaimed while maturity accrues.
