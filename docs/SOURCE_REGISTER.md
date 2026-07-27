# Source register

This register describes the intended evidence and current design decision. It is not a claim that collectors are complete or that a public headline is verified.

The detailed acquisition and validation contract is in [`DATA_ACQUISITION_PLAN.md`](DATA_ACQUISITION_PLAN.md).

| Indicator | Primary source and exact candidate | Cadence | Geography | Current state | Main risk |
|---|---|---:|---|---|---|
| Real GDP per capita growth | ONS `N3Y6`, GDP average per head, year-on-year CVM growth | Quarterly | UK | Collector planned | National-accounts revisions and release vintages |
| CPI inflation pressure | ONS `D7G7/MM23`, CPI annual rate, all items | Monthly | UK | Collector planned | Wrong inflation family/series; two-sided scoring design |
| Labour-market stress | ONS `MGSX/LMS`, unemployment rate aged 16+ | Monthly rolling quarter | UK | Collector planned | Survey volatility, rolling periods and revisions |
| Child poverty | DWP Households Below Average Income, relative low income after housing costs | Annual | UK | Definition validation required | Single-year versus three-year average; table changes |
| Private-renter housing stress | ONS private-rental affordability | Annual | England, Wales and Northern Ireland | Definition validation required | Scotland absent; structural series differs from new-tenancy series |
| Trust in national government | ONS Trust in Government Survey / consistent ONS wellbeing series | Periodic | UK | Continuity assessment required | Question wording, thresholds and survey comparability |
| Industrial disruption | ONS `BBFW/LMS`, working days lost due to strike action | Monthly | UK | Collector planned | Blank/suppressed values, denominator and episodic spikes |
| Household food insecurity | FSA Food and You 2, low or very-low food security | Approximately six-monthly/annual | England, Wales and Northern Ireland | Definition validation required | Scotland compatibility and survey-wave continuity |
| Elective-healthcare strain | NHS England Referral to Treatment incomplete pathways | Monthly | England | Collector planned after ONS tranche | Pathways are not people; England-only coverage; spreadsheet changes |
| Environmental disruption | Environment Agency flood-monitoring API, then equivalent four-nation sources | Hourly input / daily aggregate | England initially | Composite design required | Must not be labelled UK-wide before all nations are covered |

## Context-only evidence

The following evidence may be displayed but does not enter the fixed structural score unless a later methodology version explicitly approves it:

- Trussell emergency food-parcel counts — valuable evidence of network demand, but not a population-complete measure of food insecurity;
- monthly new-tenancy affordability — useful leading context, but not directly interchangeable with the annual structural renter-affordability series;
- protest and public-disorder reports — eligible only for the reviewed acute-disruption overlay when operational significance and evidence rules are met;
- NHS waiting-list estimates described as unique people — the primary RTT measure counts pathways, so any people estimate requires separate sourcing.

## Denominators

Derived per-capita or per-worker measures must use a dated, versioned denominator. The initial population source is ONS `UKPOP`, with nation-specific series used for partial-geography indicators. A denominator revision must not silently rewrite previously published observations.

## Evidence states

| State | Meaning |
|---|---|
| `illustrative` | fabricated or hand-entered only to exercise the design; never headline-eligible |
| `provisional` | source-traceable but not fully validated or production-collected |
| `verified` | exact definition, source, transformation, evidence hash and collector have passed review |
| `revised` | the source has replaced a previous published value; both versions remain auditable |
| `withdrawn` | known unreliable and excluded |
| `suppressed` | insufficient evidence to publish a point headline |

## Verification checklist

A source is not production-ready until the repository records:

- exact dataset, table and series identifier;
- geographic scope and population-coverage factor;
- unit, frequency and seasonal-adjustment state;
- reference-period start/end and publication timestamp;
- revision and structural-break policy;
- machine-readable licence and attribution requirements;
- archived source response or legally permissible canonical extract with SHA-256;
- collector/parser version;
- fixture copied from a real source response;
- validation against at least two published releases, including one revision where available;
- deterministic handling of blanks, suppressed values and format changes;
- failure behaviour when the source changes;
- evidence-quality, freshness and hard-expiry rules.

## First implementation tranche

Tomorrow's first source work is intentionally limited to four exact, small ONS time series:

1. CPI `D7G7`;
2. unemployment `MGSX`;
3. real GDP per capita growth `N3Y6`;
4. working days lost `BBFW`.

These establish the end-to-end evidence contract before fragile XLSX/ZIP or survey-table collectors are attempted.
