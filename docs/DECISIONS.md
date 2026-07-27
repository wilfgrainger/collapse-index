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
