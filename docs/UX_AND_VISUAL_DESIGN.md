# UX and visual design

## Design direction

The product should feel like a serious public-information instrument: calm, legible and evidence-led. It should not resemble a disaster countdown, betting dashboard or sensational news site.

Reference qualities:

- the clarity of an official statistical bulletin;
- the scanability of a financial dashboard;
- the source discipline of a public evidence register;
- the visual restraint of a quality newspaper data desk.

## Core interaction principle

The main score is an entry point, not the whole product. Every visual path from the score should lead toward explanation, evidence and limitations.

## Desktop homepage wireframe

```text
+--------------------------------------------------------------------------------+
| UK STABILITY MONITOR             Drivers  History  Evidence  Methodology        |
+--------------------------------------------------------------------------------+
| METHODOLOGY PREVIEW / VERIFIED BETA STATUS                                     |
|                                                                                |
|  UK systemic pressure                       Evidence confidence                 |
|  47.2                                        82%                               |
|  STRAINED                                    Headline publishable               |
|  +1.8 over 30 days                           9/10 indicators current/aging      |
|                                                                                |
|  Structural baseline 45.9  +  Acute disruption 1.3  =  Headline 47.2          |
|  Last material change: 27 July 2026                                           |
+--------------------------------------------------------------------------------+
| WHAT IS DRIVING THE SCORE?                                                     |
|  1 Healthcare strain       +10.8     high pressure, unchanged                  |
|  2 Household resilience     +8.1     worsening                                 |
|  3 Economic growth          +6.7     improving slightly                        |
+--------------------------------------------------------------------------------+
| FIVE DOMAINS                                                                   |
| [Economy 42] [Households 58] [Institutions 49] [Services 72] [Environment 18] |
+--------------------------------------------------------------------------------+
| TEN INDICATORS — cards grouped by domain                                       |
| value | pressure score | contribution | trend | source date | evidence status  |
+--------------------------------------------------------------------------------+
| HISTORY                                               [1y] [5y] [Since 2000]   |
| accessible line chart + data table + methodology-break markers                 |
+--------------------------------------------------------------------------------+
| ACTIVE DISRUPTIONS                    EVIDENCE HEALTH / UPCOMING RELEASES        |
+--------------------------------------------------------------------------------+
| WHAT THIS MEANS / WHAT IT DOES NOT MEAN / DOWNLOAD DATA                         |
+--------------------------------------------------------------------------------+
```

## Mobile order

1. status banner;
2. headline score and level;
3. confidence and last material change;
4. baseline + acute equation;
5. top three drivers;
6. five-domain compact list;
7. indicator cards;
8. historical chart and table toggle;
9. active events;
10. evidence health;
11. methodology limitations.

Do not compress ten indicators into an unreadable horizontal carousel. Use a vertical list with collapsible detail.

## Headline component

### Required content

- score to one decimal place;
- named pressure level;
- methodology/publication status;
- 7-day and 30-day change;
- last material change timestamp;
- confidence percentage and plain-English label;
- structural baseline and acute overlay shown as an equation;
- link to exact snapshot inputs.

### Visual form

A partial circular scale or restrained horizontal instrument is acceptable. Avoid an automotive speedometer, flashing animation, rotating needles or pulsing red backgrounds.

The numeric score and level must remain readable with CSS, canvas and JavaScript disabled where practical.

## Colour system

Colour supports meaning but never carries it alone.

| Level | Intent |
|---|---|
| Stable | deep, accessible green |
| Guarded | olive/green-yellow |
| Strained | amber |
| Severe | burnt orange |
| Critical | red |
| Emergency | dark crimson |

Every level also has:

- a text label;
- an icon or pattern;
- a numeric range;
- a plain-language description.

Confidence uses a separate neutral scale so users do not confuse weak evidence with low national pressure.

## Typography

Use a robust system-font stack initially. Typography should prioritise rendering speed and accessibility over brand novelty.

- display score: tabular numerals;
- section headings: concise and sentence case;
- body text: minimum 16 px equivalent;
- metadata: never smaller than 13–14 px equivalent;
- line length: approximately 60–75 characters for explanatory text.

## Indicator cards

Each collapsed card contains:

- indicator name;
- latest raw value and unit;
- reference period;
- pressure score out of 100;
- weighted contribution to the structural score;
- direction since previous release;
- status badge: verified, provisional, stale, etc.;
- geography badge: UK, GB, EWNI or England;
- source name.

Expanded detail contains:

- why the indicator matters;
- scoring curve mini-chart;
- latest five observations;
- source publication and retrieval dates;
- collector health;
- strengths and limitations;
- direct source and data-download links.

## Domain summaries

Show five domain scores as comparable bars or compact cards. Domain scores are weighted averages within each domain and must not be mistaken for separate headline indexes.

Each domain card states:

- score and level wording;
- change since last source update;
- strongest contributing indicator;
- confidence/coverage;
- number of indicators.

## Historical chart

### Default

- line for headline score;
- optional toggle for structural baseline and acute overlay;
- shaded pressure bands;
- markers for methodology versions;
- event annotations limited to a small curated set;
- confidence/coverage strip below the chart.

### Honesty controls

- label whether history is illustrative, latest-vintage backcast or real-time-vintage backcast;
- never join across missing periods without visible treatment;
- mark source-definition breaks;
- offer the underlying table and CSV/JSON.

### Accessibility

- keyboard-operable range controls;
- textual summary of highest, lowest and current periods;
- complete data table alternative;
- no essential hover-only content.

## Acute disruption events

Events are visibly separate from quantitative indicators.

Each event shows:

- title and factual summary;
- occurred/start time and status;
- affected systems and geography;
- current contribution and original contribution;
- decay/closure rule;
- sources;
- reviewer and review time;
- why it is not double-counted.

Do not use a continuous news feed on the homepage. Show only events currently affecting the overlay plus a link to the decision log.

## Evidence-health panel

This is a first-class product feature, not footer metadata.

Display:

- fixed weight currently available;
- current, aging, stale and expired counts;
- collector failures;
- mixed-geography warnings;
- next expected releases;
- last successful snapshot calculation;
- methodology and deployed Git versions.

When the headline is suppressed, this panel explains exactly which gate failed.

## Empty, degraded and failure states

### No verified score

Show:

> The methodology is available, but there is not yet enough verified evidence to publish a UK headline score.

Then show source progress and verified indicator cards. Do not replace the score with zero.

### Source failure

Keep the last verified observation, show its age and a warning. Do not display a blank card or silently substitute a different source.

### JavaScript failure

Server/static HTML should still provide:

- current score/status;
- top drivers;
- indicator table;
- methodology and source links.

Interactive charts are enhancement, not the only evidence surface.

## Content voice

Use direct factual sentences.

Good:

> Healthcare pressure is the largest current contributor. The measure covers England and counts pathways, not unique patients.

Bad:

> The NHS is on the brink of collapse.

Good:

> The score rose 1.8 points after two source updates and one temporary flood-disruption event.

Bad:

> Britain moved closer to catastrophe today.

## Responsive behaviour

- no horizontal page scrolling at 320 px width;
- navigation collapses to a simple menu;
- score equation stacks vertically;
- domain cards become a list;
- charts use a reduced default range and table toggle;
- touch targets at least 44 by 44 CSS pixels;
- sticky elements must not hide content or consume excessive mobile height.

## Performance budget

Initial target:

- HTML under 50 KB compressed;
- critical CSS under 20 KB compressed;
- application JavaScript under 50 KB compressed;
- no third-party charting library unless a measured need justifies it;
- no webfont dependency;
- no client-side request waterfall beyond current snapshot and history;
- Largest Contentful Paint under 2.5 seconds on a representative mobile connection.

## Accessibility acceptance criteria

- WCAG 2.2 AA contrast;
- visible focus states;
- correct landmarks and heading hierarchy;
- skip link;
- descriptive link text;
- status announcements for async updates where needed;
- `prefers-reduced-motion` respected;
- score and trends not conveyed by colour or arrows alone;
- charts have equivalent summaries and tables;
- zoom to 200% without loss of content or function.

## Design decisions deferred

- UK map: defer until regional/national coverage is meaningful;
- subscriptions: defer until correction and alert governance exists;
- dark/light theme switch: optional after core accessibility;
- public comments: out of scope;
- personalised alerts: out of scope for beta;
- decorative icon set: defer; use simple inline SVG only where it adds meaning.
