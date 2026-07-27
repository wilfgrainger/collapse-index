# Methodology v1 design

This document is the implementation contract for the first evidence-backed version. It supersedes the prototype's flat-score assumptions but does not change runtime code until implementation begins.

## 1. Conceptual definition

The UK Stability Monitor measures **observable systemic pressure on the United Kingdom's social, economic, institutional, public-service and environmental systems**.

A higher score means that a broader and/or more severe set of pressures is present. It is not a probability of collapse and it does not estimate the date or likelihood of a particular political or social event.

## 2. Output model

The public result contains four distinct outputs:

1. `structural_score`: 0–100 fixed-weight composite of quantitative indicators.
2. `acute_overlay`: 0–8 reviewed and decaying disruption contribution.
3. `headline_score`: `min(100, structural_score + acute_overlay)`.
4. `confidence`: 0–100 evidence-health score that determines publication eligibility.

The API and interface must never present only the headline score without the other three.

## 3. Domains and weights

| Domain | Indicator | Weight |
|---|---|---:|
| Economy and living standards | real GDP per capita growth | 12% |
| Economy and living standards | CPI inflation pressure | 8% |
| Economy and living standards | labour-market stress | 10% |
| Household resilience | child poverty / relative low income | 9% |
| Household resilience | private-renter housing stress | 8% |
| Household resilience | household food insecurity | 8% |
| Institutions and cohesion | trust in national government | 10% |
| Institutions and cohesion | industrial and social disruption | 10% |
| Public-service resilience | elective-healthcare strain | 15% |
| Environmental disruption | severe-weather and flood disruption | 10% |

The weights are fixed inside a methodology version. Weight changes require a new version, a regenerated historical series and a sensitivity report.

## 4. Indicator transformations

### 4.1 General rule

Each raw observation is transformed onto a 0–100 pressure scale. A score of 0 represents unusually low pressure, 50 represents materially elevated pressure and 100 represents an extreme observed or policy-relevant condition.

Version 1 uses transparent monotonic piecewise-linear curves. Curves must be frozen before the production backcast. Historical percentile calibration can inform breakpoints but must not cause thresholds to drift automatically as new observations arrive.

### 4.2 Curve documentation

Every curve must record:

- raw variable and unit;
- whether higher or lower is worse;
- exact breakpoints;
- policy or empirical rationale for each breakpoint;
- historical distribution used for calibration;
- treatment of revisions and structural breaks;
- known conditions where the curve may mislead.

### 4.3 Non-monotonic indicators

Inflation is not strictly monotonic because material deflation can also be destabilising. Version 1 should use a two-sided curve:

- target-consistent inflation receives low pressure;
- high positive inflation rises progressively;
- sustained negative inflation also rises, but less sharply unless accompanied by contraction.

Do not implement high-inflation-only scoring in the verified methodology.

## 5. Composite calculation

For indicator `i`:

- `s_i` is its 0–100 pressure score;
- `w_i` is its fixed weight;
- `q_i` is its quality factor from 0–1;
- `f_i` is its freshness factor from 0–1;
- `g_i` is its geographic-coverage factor from 0–1.

When all required observations are available:

`structural_score = Σ(w_i × s_i)`

where weights sum to 1.

The structural score is **not divided by the weight of available indicators**. Missing data therefore cannot silently increase the influence of the remaining indicators.

## 6. Missing data and carry-forward

### 6.1 Carry-forward

The latest verified observation may be carried forward between scheduled releases. The true reference period and publication date remain visible. Daily publication does not create a new observation.

### 6.2 Freshness stages

Each source has an expected release cadence and a grace period.

| Stage | Definition | Treatment |
|---|---|---|
| current | before expected next release plus grace | full freshness |
| aging | one missed expected release | reduced confidence; score retained |
| stale | two missed expected releases | strong warning; score retained only if no replacement exists |
| expired | beyond hard expiry | indicator unavailable; headline gate normally fails |

Hard-expiry rules are source-specific and declared in the evidence register.

### 6.3 Missing contribution

An unavailable indicator does not contribute zero and does not trigger renormalisation. The system calculates:

- a partial observed contribution;
- a conservative uncertainty range for the missing weight;
- a reduced confidence score;
- publication-gate status.

For the first implementation, the point headline is suppressed when fixed-weight availability drops below 90%. The API may expose a range for analysis, clearly marked as incomplete.

## 7. Confidence calculation

Confidence is an evidence-health score, not a statistical confidence interval.

`confidence = 100 × Σ(w_i × q_i × f_i × g_i)`

Because fixed weights are retained, missing observations contribute zero confidence.

### 7.1 Quality factor

Proposed defaults:

| Evidence state | `q_i` |
|---|---:|
| accredited official statistic with validated collector | 1.00 |
| official statistic / official statistic in development, validated | 0.90 |
| official management information, validated | 0.80 |
| reputable survey or NGO proxy with documented method | 0.65–0.80 |
| manually entered but source-traceable | maximum 0.60 |
| illustrative | 0.00 for verified headline eligibility |
| withdrawn | 0.00 |

### 7.2 Geographic coverage factor

The product must not silently equate England with the UK.

- UK-complete and definitionally consistent: `1.00`.
- Great Britain only: population coverage factor, with limitation.
- England, Wales and Northern Ireland only: population coverage factor, with limitation.
- England only: population coverage factor and prominent scope warning.
- mixed incompatible national series: not aggregated until harmonised.

Population factors must use a dated ONS population denominator and be versioned.

### 7.3 Freshness factor

A source-specific linear or stepped schedule is preferred over one generic decay. Annual structural measures should not become low-confidence merely because they are annual; they become stale only when an expected release is missed.

## 8. Acute disruption overlay

### 8.1 Purpose

The overlay captures sudden disruptions that official indicators cannot reflect quickly, such as widespread transport shutdowns, severe flooding or nationally significant infrastructure failure.

### 8.2 Eligibility

An event can affect the score only when:

- it has a defined UK or national-subnational scope;
- it causes measurable operational disruption;
- it is corroborated by at least two credible sources, one primary where available;
- it is approved by a named reviewer;
- it is not already substantially represented in a quantitative indicator;
- duplicate reports are grouped into one event.

Political controversy, commentary, predictions, polling movements and social-media volume are not sufficient.

### 8.3 Scoring

Each approved event has:

- severity: 1–5;
- evidence confidence: 0–1;
- geographic reach: 0–1;
- system breadth: 0–1;
- half-life class: 24, 72 or 168 hours.

Initial contribution is capped at 2 points per event. Total overlay is capped at 8 points. Contribution decays exponentially and reaches zero when closed or no longer materially disruptive.

### 8.4 Governance

All accepted, changed, expired and rejected event decisions are retained in an audit log. Automated news systems may propose candidates but may not publish scoring decisions.

## 9. Levels

Level names should describe pressure, not safety guarantees.

| Score | Level | Meaning |
|---:|---|---|
| 0–24.9 | Stable | broad systems are within historically normal pressure ranges |
| 25–39.9 | Guarded | some pressures are elevated, with broad resilience intact |
| 40–54.9 | Strained | multiple systems are materially above healthy baselines |
| 55–69.9 | Severe | high cross-system pressure is eroding resilience |
| 70–84.9 | Critical | acute and mutually reinforcing strain across several systems |
| 85–100 | Emergency | exceptional, widespread disruption; use only with high confidence |

The historical backcast must test whether these bands distinguish known periods sensibly. Thresholds may change before 1.0, but never without versioning.

## 10. Change metrics

The interface reports:

- change since last material observation update;
- 7-day delta, mainly reflecting acute events;
- 30-day delta;
- 12-month structural delta;
- number and identity of inputs changed.

A zero daily change is valid and expected. The system must not interpolate daily movement between monthly, quarterly or annual releases.

## 11. Historical backcast

The verified public score requires a reproducible backcast, ideally from January 2000.

Rules:

- use only information that would have been available at each historical date for a real-time/vintage backcast where feasible;
- otherwise label the series as a latest-vintage retrospective backcast;
- carry observations forward until the next release;
- mark definition and geography breaks;
- store methodology version on every snapshot;
- annotate exceptional periods without fitting the model to produce predetermined peaks.

## 12. Robustness and sensitivity

Before beta, publish tests covering:

- weight variation of at least ±25% within domain constraints;
- leave-one-indicator-out results;
- alternative missing-data treatments;
- alternative aggregation rules;
- breakpoint perturbation;
- correlation and double-counting analysis;
- ranking/stability of historical peaks;
- effect of the acute overlay cap and half-lives.

The goal is not to prove one score is uniquely correct. It is to show which conclusions remain stable under reasonable methodological choices.

## 13. Revisions

Source revisions must create a new immutable observation version. Recalculated historical snapshots retain both the original-publication view and latest-revised view where feasible.

Corrections must state:

- what changed;
- why it changed;
- affected dates and scores;
- whether the level changed;
- the previous and replacement source payload hashes.

## 14. Publication standard

The project should work toward voluntary application of the UK Code of Practice for Statistics principles: Trustworthiness, Quality and Value. A public self-assessment should be completed before 1.0.
