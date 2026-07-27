# Product specification

## Product

**Public name:** UK Stability Monitor  
**Working descriptor:** UK Collapse Index  
**Release target:** methodology preview first; verified public index only after source and backcast gates pass.

The product answers four questions in under thirty seconds:

1. How much systemic pressure is the UK under?
2. Is pressure rising, falling or unchanged?
3. Which systems are driving the result?
4. How complete and trustworthy is the evidence?

It does not predict state failure, civil war, political outcomes or the timing of a crisis.

## Primary users

- members of the public seeking a comprehensible national overview;
- journalists who need traceable evidence and historical context;
- analysts and researchers who need reproducible data and methodology;
- policymakers and civil-society organisations monitoring cross-system strain.

## Product promise

The homepage must make the following visible without requiring a methodology page:

- current score and named level;
- structural baseline and acute disruption overlay;
- change over 7 and 30 days;
- date of the last material score change;
- three largest drivers;
- data confidence and coverage;
- whether the score is verified, provisional or suppressed;
- direct access to sources and methodology.

## Public terminology

Use calm, descriptive language.

| Avoid | Prefer |
|---|---|
| Britain is collapsing | Systemic pressure is elevated |
| Live official data | Latest available official data |
| Today’s inflation | Latest CPI observation, published on [date] |
| Prediction | Measurement or scenario |
| Proof | Evidence |
| Safe | Stable pressure range |

The repository may retain `collapse-index` as its name, but public copy should lead with **UK Stability Monitor**.

## Core product model

### 1. Structural pressure baseline

A 0–100 score calculated from fixed-weight quantitative indicators. It changes only when an underlying observation changes or a methodology version changes.

### 2. Acute disruption overlay

A separately displayed 0–8 point addition for short-lived, independently evidenced disruptions that are not yet reflected in official series. It decays automatically and cannot dominate the baseline.

### 3. Data confidence

A 0–100 measure of evidence completeness, freshness, source quality and geographic coverage. Confidence never makes adverse data look healthier. It controls whether the headline is publishable.

### 4. Uncertainty range

A visible range around the headline, derived from indicator measurement uncertainty and plausible weighting variation. The first production release may use a simpler sensitivity range, but it must not imply false precision.

## Information architecture

### Homepage

1. Hero: score, level, trend, confidence and status.
2. Score equation: structural baseline + acute overlay.
3. Top drivers: largest contributions and recent changes.
4. Ten indicator cards grouped into five domains.
5. Historical chart with crisis annotations and methodology breaks.
6. Active disruption events.
7. Evidence health and source release calendar.
8. Plain-English explanation and limitations.

### Indicator detail

Each indicator page must show:

- exact definition and geography;
- latest value, reference period and publication date;
- transformed pressure score and contribution;
- historical series and revisions;
- source licence and collector status;
- scoring curve and rationale;
- strengths, limitations and known breaks;
- downloadable observations.

### Methodology

- conceptual framework;
- indicator selection criteria;
- weights and aggregation;
- freshness and confidence;
- missing-data policy;
- event-overlay rules;
- uncertainty and sensitivity analysis;
- revision and correction policy;
- version history.

### Evidence register

A machine-readable and human-readable register of every series, exact source identifier, licence, cadence, geography, collector, last successful retrieval, checksum and validation state.

## Domains and proposed weights

Fixed weights sum to 100%. Domain weights prevent one area with several similar series from dominating the result.

| Domain | Weight | Indicators |
|---|---:|---|
| Economy and living standards | 30% | GDP per capita 12%; inflation pressure 8%; labour-market stress 10% |
| Household resilience | 25% | poverty and inequality 9%; housing stress 8%; food insecurity 8% |
| Institutions and cohesion | 20% | trust and governance 10%; industrial/social disruption 10% |
| Public-service resilience | 15% | healthcare strain 15% |
| Environmental disruption | 10% | severe-weather and flood disruption 10% |

Weights are design hypotheses until backtesting and sensitivity analysis are complete.

## Status states

| Status | Meaning |
|---|---|
| `illustrative` | fabricated or hand-entered solely to exercise the design |
| `provisional` | traceable to a source but not independently validated or production-collected |
| `verified` | exact definition, value, source, transformation and collector have passed review |
| `revised` | source issued a revision and the previous value remains auditable |
| `withdrawn` | value is known to be unreliable and excluded |
| `suppressed` | headline cannot be responsibly published |

## Headline publication gates

A public verified headline is allowed only when all conditions pass:

- at least 90% of fixed indicator weight is available;
- every domain has at least one current or aging verified indicator;
- confidence is at least 70%;
- no critical collector or source-integrity alert is open;
- no more than one core monthly series is stale;
- methodology version has a completed backcast and sensitivity report;
- the current snapshot is reproducible from stored observations.

When a gate fails, retain the last verified score with a prominent warning or suppress the headline. Never silently renormalise around missing evidence.

## Product success measures

### Trust and comprehension

- at least 80% of usability-test participants correctly explain what a higher score means;
- at least 80% notice the confidence/status label;
- fewer than 10% interpret the score as a prediction of collapse;
- source links and methodology are reachable within one interaction.

### Reliability

- 99.9% availability for the cached public dashboard;
- collectors either publish a validated observation or a visible failure state;
- every snapshot is reproducible from immutable evidence records;
- corrections are published with an audit trail.

### Performance and accessibility

- mobile-first and keyboard-operable;
- WCAG 2.2 AA target;
- no chart is the sole representation of information;
- cached homepage response under 100 KB compressed where practical;
- no third-party client-side tracking in the initial release.

## Non-goals for the first verified release

- predictive machine learning;
- social-media sentiment scoring;
- user comments;
- personalised regional scores;
- partisan policy evaluation;
- automatic editorial scoring of news;
- paid infrastructure or a complex frontend framework.

## Release gates

### Preview

The design, API and calculation may be public, but the score is clearly illustrative or provisional.

### Beta

At least eight indicators are verified, all five domains are represented, a real backcast exists, and the headline is labelled beta.

### 1.0

All ten indicators are verified or a documented replacement is approved; sensitivity, accessibility, security and external methodological reviews are complete; correction and event-review governance are operational.
