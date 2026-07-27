# Data acquisition plan

## Objective

Build a source pipeline that can prove where every number came from, detect upstream changes and fail visibly. Collector speed is secondary to exact series identity and reproducibility.

## Collector contract

Every collector must emit a canonical observation with:

- `indicator_id`;
- `source_id` and exact series/table identifier;
- raw and transformed values;
- unit, frequency and seasonal-adjustment state;
- geography and population coverage;
- reference-period start and end;
- source publication timestamp;
- retrieval timestamp;
- source URL and licence;
- source payload SHA-256;
- parser version;
- validation state and notes;
- revision relationship to any superseded observation.

Collectors must store the source payload, or a legally permissible canonical extract, before writing an observation.

## Priority source register

### 1. Real GDP per capita growth

- **Primary source:** Office for National Statistics.
- **Proposed series:** `N3Y6`, GDP average per head, year-on-year growth rate, chained-volume measure, seasonally adjusted.
- **Cadence:** quarterly.
- **Geography:** UK.
- **Acquisition:** ONS time-series CSV endpoint or exact series download; do not use nominal/current-price series `N3Y3`.
- **Validation:** unit must be percent; frequency must contain quarterly periods; latest point must reconcile with the quarterly national accounts bulletin.
- **Revision risk:** high. Preserve source versions and release vintages.

### 2. CPI inflation

- **Primary source:** Office for National Statistics.
- **Series:** `D7G7`, CPI annual rate, all items, 2015=100.
- **Dataset:** `MM23`.
- **Cadence:** monthly.
- **Geography:** UK.
- **Acquisition:** small exact-series CSV rather than the full 20+ MB inflation workbook.
- **Validation:** percent unit, monthly period, latest release date, no accidental CPIH/RPI substitution.
- **Method note:** scoring is two-sided around price stability; the Bank of England target is context, not a claim that 2% creates zero social pressure.

### 3. Labour-market stress

- **Primary source:** Office for National Statistics.
- **Core series:** `MGSX`, unemployment rate aged 16 and over, seasonally adjusted.
- **Cadence:** monthly release of rolling three-month estimate.
- **Geography:** UK.
- **Future supporting series:** economic inactivity, vacancies and real regular-pay growth.
- **Version 1 rule:** only `MGSX` affects the score until a documented sub-index is approved.
- **Validation:** period labels represent rolling quarters; provisional/revision flags are retained.

### 4. Child poverty / relative low income

- **Primary source:** Department for Work and Pensions, Households Below Average Income.
- **Definition candidate:** percentage of children in relative low-income households after housing costs.
- **Cadence:** annual.
- **Geography:** UK.
- **Acquisition:** published HBAI data-table archive or Stat-Xplore export with a pinned query specification.
- **Validation:** exact before/after-housing-cost definition, three-year-average versus single-year distinction, denominator and confidence intervals.
- **Risk:** table structure and survey methodology can change. Build fixture-led parsing and require manual analytical sign-off for each annual release.

### 5. Housing stress

- **Primary structural source:** ONS private rental affordability for England, Wales and Northern Ireland.
- **Cadence:** annual.
- **Coverage limitation:** excludes Scotland; this must lower geographic confidence.
- **Candidate faster context series:** ONS renter affordability for new tenancies, monthly, UK, official statistics in development.
- **Version 1 proposal:** use the structural annual measure for scoring and display the monthly new-tenancy series as context until its comparability and history are assessed.
- **Validation:** distinguish all private-renter households from new tenancies; do not splice the series.

### 6. Trust and governance

- **Primary source:** ONS Trust in Government Survey / ONS measures of national wellbeing.
- **Definition:** percentage tending to trust or reporting high/moderately high trust in the UK government; one definition must be selected and kept consistent.
- **Cadence:** periodic; the dedicated survey is approximately biennial, while the wider wellbeing release may provide more recent measures.
- **Geography:** UK.
- **Validation:** question wording, response scale and threshold must match across time. Do not mix the ONS `tend to trust` measure with the OECD 6–10 measure without a bridge.
- **Fallback:** OECD Drivers of Trust country note, displayed as a separate source lineage.

### 7. Industrial disruption

- **Primary source:** ONS labour-disputes series.
- **Series:** `BBFW`, working days lost due to strike action, UK, thousands.
- **Cadence:** monthly.
- **History:** long series is available, supporting backcast calibration.
- **Transformation:** normalise by employment or employee count using a versioned denominator.
- **Validation:** distinguish blank/suppressed observations from zero; inspect pandemic-era collection breaks.
- **Scope:** protests and public disorder do not enter this quantitative series. They may enter the reviewed acute overlay only when operationally significant.

### 8. Household food insecurity

- **Primary source:** Food Standards Agency, Food and You 2.
- **Measure:** percentage classified as low or very-low food security using the USDA module.
- **Cadence:** approximately six-monthly/annual publication.
- **Coverage:** England, Wales and Northern Ireland; Food Standards Scotland must be evaluated for a compatible Scotland series.
- **Acquisition:** FSA data-catalogue CSV and trends dataset.
- **Validation:** survey wave, fieldwork dates, weights, classification rules and country coverage.
- **Replacement decision:** use this official survey measure instead of food-bank parcel counts for the core score. Trussell data remains contextual because network coverage is not total need.

### 9. Healthcare strain

- **Primary source:** NHS England Referral to Treatment statistics.
- **Measure candidate:** incomplete pathways per 1,000 England residents, with the percentage waiting over 52 weeks as a supporting series.
- **Cadence:** monthly.
- **Coverage:** England only; prominent limitation and population factor required.
- **Acquisition:** England-level time-series workbook or full CSV extract. Prefer the small published overview series when stable.
- **Validation:** pathways are not unique people; estimates for missing trusts and published revisions must be retained.
- **Future UK design:** assess comparable elective-waiting series for Scotland, Wales and Northern Ireland before claiming full UK healthcare coverage.

### 10. Environmental disruption

- **Primary near-real-time source:** Environment Agency flood-monitoring API.
- **Initial scope:** England flood alerts and warnings only.
- **Inputs:** counts by severity, duration and population/infrastructure exposure where defensible.
- **Cadence:** hourly collection; daily aggregation.
- **Licence:** Open Government Licence with required attribution.
- **Additional sources:** Met Office severe-weather warnings and equivalent flood agencies for Wales, Scotland and Northern Ireland.
- **Version 1 rule:** do not call the composite UK-wide until all four nations have defined source coverage.

### Population denominators

- **Primary source:** ONS population estimates dataset `pop`.
- **Series:** `UKPOP`, plus nation-specific series such as `ENPOP` where required.
- **Cadence:** annual.
- **Rule:** store the denominator vintage used for every derived observation. Revisions must not silently rewrite previously published rates.

## Source tiers

### Tier A — exact machine-readable official series

ONS time-series CSV and stable JSON APIs. These should be implemented first.

### Tier B — official spreadsheet/ZIP publications

NHS RTT, DWP HBAI and some housing releases. Parsers require frozen fixtures, sheet-name validation and explicit cell/table contracts.

### Tier C — official survey catalogues

Trust and food security. These need question/definition versioning in addition to file parsing.

### Tier D — reviewed event sources

Operational agencies, transport operators, emergency services and other primary sources. These propose acute events but do not automatically change the score.

## Pipeline stages

1. **Discover:** check release calendar or source metadata.
2. **Fetch:** download with timeout, size limit, accepted MIME types and conditional headers.
3. **Archive:** hash and store raw response or permitted extract.
4. **Parse:** transform through a source-specific parser version.
5. **Validate:** schema, range, period, monotonic release date, duplicate and revision checks.
6. **Reconcile:** compare with a bulletin/table headline where available.
7. **Stage:** write candidate observation with validation report.
8. **Approve:** automatic for fully deterministic Tier A sources after tests; manual for new structures or definition changes.
9. **Publish:** calculate a new snapshot only when evidence changes.
10. **Audit:** retain run status, timings, hashes and old observations.

## Failure rules

- HTTP, MIME, schema or range failure: write no observation.
- Source unchanged: record a successful no-change run; create no new snapshot.
- Source definition changed: quarantine and require review.
- Latest value disappears or moves backwards in publication time: quarantine.
- Multiple candidate rows match: fail rather than guess.
- Empty value is never treated as zero.
- A collector failure is public in the evidence-health panel after the grace period.

## Backcast strategy

### Phase A

Acquire latest-vintage full histories for the easiest exact series: GDP per head, CPI, unemployment, labour disputes and population.

### Phase B

Add published historical tables for RTT, poverty, housing, trust and food insecurity.

### Phase C

Build daily carry-forward snapshots and annotate source/method breaks.

### Phase D

Where source-vintage archives exist, calculate a real-time vintage backcast in parallel with the latest-revised backcast.

## Tomorrow's first collector tranche

Implementation should start with the four smallest, strongest ONS series:

1. `D7G7` CPI;
2. `MGSX` unemployment;
3. `N3Y6` real GDP per head growth;
4. `BBFW` working days lost.

These provide representative monthly and quarterly paths, exact identifiers, long histories and revision handling without beginning with fragile spreadsheet scraping.
