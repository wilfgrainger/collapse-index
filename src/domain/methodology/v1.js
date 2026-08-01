/**
 * Methodology v1 (docs/METHODOLOGY_V1_DESIGN.md).
 *
 * Weights are FIXED and sum to 1.0. They are not renormalised when an
 * indicator is missing — that is the central methodological commitment of this
 * version. A missing indicator reduces measured pressure coverage and
 * confidence; it never increases another indicator's influence.
 *
 * Six of the ten indicators have no collector yet. They are declared here in
 * full anyway, because publishing a score built from four indicators while
 * pretending the framework is complete would be exactly the failure this
 * project exists to avoid.
 */

import { CPI_TWO_SIDED_BREAKPOINTS } from "./curves.js";
import { GEOGRAPHY } from "../evidence/states.js";

export const METHODOLOGY_VERSION = "1.0.0-alpha.1";

export const METHODOLOGY_STATUS = Object.freeze({
  stage: "alpha",
  headlineClaim: "none",
  summary:
    "Structural scoring runs on four verified ONS series. Six indicators have no collector, " +
    "so the fixed-weight headline is suppressed by design."
});

export const DOMAIN = Object.freeze({
  ECONOMY: "economy_living_standards",
  HOUSEHOLD: "household_resilience",
  INSTITUTIONS: "institutions_cohesion",
  PUBLIC_SERVICES: "public_service_resilience",
  ENVIRONMENT: "environmental_disruption"
});

export const DOMAIN_LABEL = Object.freeze({
  [DOMAIN.ECONOMY]: "Economy and living standards",
  [DOMAIN.HOUSEHOLD]: "Household resilience",
  [DOMAIN.INSTITUTIONS]: "Institutions and cohesion",
  [DOMAIN.PUBLIC_SERVICES]: "Public-service resilience",
  [DOMAIN.ENVIRONMENT]: "Environmental disruption"
});

/**
 * Indicator definitions.
 *
 * `sourceId` binds an indicator to a collector. `null` means no verified
 * collector exists, and the indicator contributes nothing but still holds its
 * weight against the availability gate.
 */
export const INDICATORS = Object.freeze([
  {
    id: "gdp_per_capita_growth",
    title: "Real GDP per capita growth",
    shortTitle: "Growth",
    domain: DOMAIN.ECONOMY,
    weight: 0.12,
    sourceId: "ons-n3y6",
    unit: "% year-on-year",
    display: "percent",
    direction: "lower-is-worse",
    description:
      "Real GDP per person, chained-volume measure, seasonally adjusted. Per-head rather than " +
      "aggregate growth, because population growth can mask falling individual living standards.",
    breakpoints: [
      { value: -4, score: 100, note: "2009-scale contraction in output per person" },
      { value: -2, score: 85, note: "deep recession" },
      { value: -1, score: 72, note: "sustained per-head decline" },
      { value: 0, score: 55, note: "stagnation; no improvement in living standards" },
      { value: 0.8, score: 35, note: "the 2015-2024 UK average — weak, not benign" },
      { value: 1.5, score: 20, note: "modest real improvement" },
      { value: 2.5, score: 5, note: "healthy sustained growth" },
      { value: 4, score: 0, note: "exceptional growth" }
    ],
    rationale:
      "Breakpoints are anchored on observed UK outcomes rather than a theoretical trend. Scoring " +
      "the recent UK average at 35 rather than 0 encodes the judgement that a decade of near-flat " +
      "per-head growth is itself a pressure, not a neutral baseline."
  },
  {
    id: "cpi_inflation",
    title: "CPI inflation pressure",
    shortTitle: "Inflation",
    domain: DOMAIN.ECONOMY,
    weight: 0.08,
    sourceId: "ons-d7g7",
    unit: "% year-on-year",
    display: "percent",
    direction: "two-sided",
    description:
      "Consumer Prices Index annual rate, all items. Scored two-sided: both high inflation and " +
      "sustained deflation raise pressure.",
    breakpoints: CPI_TWO_SIDED_BREAKPOINTS,
    rationale:
      "See curves.js. The trough sits at the 2% Bank of England target and is scored 5 rather " +
      "than 0, because on-target inflation means prices are not adding to pressure — not that " +
      "cost-of-living pressure is absent."
  },
  {
    id: "labour_market_stress",
    title: "Labour-market stress",
    shortTitle: "Unemployment",
    domain: DOMAIN.ECONOMY,
    weight: 0.10,
    sourceId: "ons-mgsx",
    unit: "% of those aged 16+ in the labour force",
    display: "percent",
    direction: "higher-is-worse",
    description:
      "Unemployment rate, aged 16 and over, seasonally adjusted, published as a rolling " +
      "three-month estimate. Version 1 scores this series alone; inactivity, vacancies and real " +
      "pay are candidate additions to a documented sub-index.",
    breakpoints: [
      { value: 3, score: 5, note: "exceptionally tight labour market" },
      { value: 4, score: 18, note: "near modern UK lows" },
      { value: 5, score: 35, note: "materially loosening" },
      { value: 6.5, score: 55, note: "post-2008 UK range" },
      { value: 8, score: 72, note: "2011-scale unemployment" },
      { value: 10, score: 88, note: "early-1990s scale" },
      { value: 12, score: 100, note: "1980s peak" }
    ],
    rationale:
      "Anchored on UK peaks since 1980 rather than international comparison. Headline " +
      "unemployment understates labour-market stress when inactivity is rising, which is why " +
      "this indicator carries 10% rather than a larger share."
  },
  {
    id: "child_poverty",
    title: "Child poverty",
    shortTitle: "Child poverty",
    domain: DOMAIN.HOUSEHOLD,
    weight: 0.09,
    sourceId: null,
    unit: "% of children",
    display: "percent",
    direction: "higher-is-worse",
    description:
      "Children in relative low-income households after housing costs (DWP Households Below " +
      "Average Income). No collector yet: the single-year versus three-year-average definition " +
      "must be pinned before ingestion.",
    breakpoints: [
      { value: 15, score: 5 },
      { value: 22, score: 28 },
      { value: 30, score: 58 },
      { value: 38, score: 82 },
      { value: 50, score: 100 }
    ],
    rationale: "Provisional breakpoints pending the HBAI definition decision."
  },
  {
    id: "housing_stress",
    title: "Private-renter housing stress",
    shortTitle: "Housing",
    domain: DOMAIN.HOUSEHOLD,
    weight: 0.08,
    sourceId: null,
    unit: "% of household income spent on rent",
    display: "percent",
    direction: "higher-is-worse",
    description:
      "Median private rent as a share of median private-renter household income. No collector " +
      "yet. The structural ONS series excludes Scotland, so it will carry a coverage penalty.",
    breakpoints: [
      { value: 18, score: 5 },
      { value: 24, score: 25 },
      { value: 30, score: 55 },
      { value: 37, score: 80 },
      { value: 48, score: 100 }
    ],
    rationale: "Provisional breakpoints; 30% of income is the conventional affordability threshold."
  },
  {
    id: "food_insecurity",
    title: "Household food insecurity",
    shortTitle: "Food security",
    domain: DOMAIN.HOUSEHOLD,
    weight: 0.08,
    sourceId: null,
    unit: "% of households with low or very low food security",
    display: "percent",
    direction: "higher-is-worse",
    description:
      "FSA Food and You 2, USDA food-security module. No collector yet. This replaces food-bank " +
      "parcel counts in the core score: parcel counts measure network demand, not population need.",
    breakpoints: [
      { value: 4, score: 5 },
      { value: 8, score: 30 },
      { value: 13, score: 60 },
      { value: 20, score: 85 },
      { value: 30, score: 100 }
    ],
    rationale: "Provisional breakpoints pending the Scotland-coverage decision."
  },
  {
    id: "trust_in_government",
    title: "Trust in national government",
    shortTitle: "Public trust",
    domain: DOMAIN.INSTITUTIONS,
    weight: 0.10,
    sourceId: null,
    unit: "% of adults expressing trust",
    display: "percent",
    direction: "lower-is-worse",
    description:
      "Share of adults reporting trust in the UK government. No collector yet: the ONS and OECD " +
      "measures use different questions and thresholds and must not be spliced.",
    breakpoints: [
      { value: 10, score: 100 },
      { value: 20, score: 78 },
      { value: 30, score: 52 },
      { value: 40, score: 26 },
      { value: 55, score: 0 }
    ],
    rationale: "Provisional breakpoints pending the series-continuity decision."
  },
  {
    id: "industrial_disruption",
    title: "Industrial disruption",
    shortTitle: "Strikes",
    domain: DOMAIN.INSTITUTIONS,
    weight: 0.10,
    sourceId: "ons-bbfw",
    unit: "working days lost per 1,000 employed people per month",
    display: "decimal",
    direction: "higher-is-worse",
    description:
      "Working days lost to labour disputes, normalised by a versioned employment denominator. " +
      "Protest and public disorder do not enter this series; they are eligible only for the " +
      "reviewed acute overlay.",
    breakpoints: [
      { value: 0, score: 0, note: "no recorded disputes" },
      { value: 0.5, score: 12, note: "routine background level" },
      { value: 2, score: 30, note: "elevated sectoral action" },
      { value: 6, score: 55, note: "2022-2023 dispute wave" },
      { value: 15, score: 78, note: "sustained multi-sector action" },
      { value: 40, score: 100, note: "1979-scale general disruption" }
    ],
    rationale:
      "Normalisation by employment is required because the raw series is a count. Monthly rather " +
      "than annual framing keeps episodic spikes visible instead of averaging them away."
  },
  {
    id: "healthcare_strain",
    title: "Elective-healthcare strain",
    shortTitle: "NHS waits",
    domain: DOMAIN.PUBLIC_SERVICES,
    weight: 0.15,
    sourceId: null,
    unit: "incomplete pathways per 1,000 residents",
    display: "decimal",
    direction: "higher-is-worse",
    description:
      "NHS England Referral to Treatment incomplete pathways. No collector yet. Pathways are not " +
      "unique people, and the series covers England only, so it will carry a coverage penalty.",
    breakpoints: [
      { value: 30, score: 5 },
      { value: 60, score: 25 },
      { value: 90, score: 50 },
      { value: 120, score: 75 },
      { value: 160, score: 100 }
    ],
    rationale: "Provisional breakpoints pending four-nation healthcare design."
  },
  {
    id: "environmental_disruption",
    title: "Severe-weather and flood disruption",
    shortTitle: "Environment",
    domain: DOMAIN.ENVIRONMENT,
    weight: 0.10,
    sourceId: null,
    unit: "0-100 disruption signal",
    display: "integer",
    direction: "higher-is-worse",
    description:
      "Composite of flood warnings and severe-weather alerts. No collector yet. The available " +
      "flood API covers England only, and this must not be described as UK-wide until all four " +
      "nations have defined coverage.",
    breakpoints: [
      { value: 0, score: 0 },
      { value: 15, score: 20 },
      { value: 35, score: 50 },
      { value: 60, score: 75 },
      { value: 90, score: 100 }
    ],
    rationale: "Composite construction is undefined; this indicator is a placeholder for its weight."
  }
]);

/** Levels describe pressure, never safety (docs/METHODOLOGY_V1_DESIGN.md §9). */
export const LEVELS = Object.freeze([
  { id: "stable", label: "Stable", min: 0, max: 24.999, colour: "#2f8f5b", summary: "Broad systems are within historically normal pressure ranges." },
  { id: "guarded", label: "Guarded", min: 25, max: 39.999, colour: "#6f9c33", summary: "Some pressures are elevated, with broad resilience intact." },
  { id: "strained", label: "Strained", min: 40, max: 54.999, colour: "#c8901a", summary: "Multiple systems are materially above healthy baselines." },
  { id: "severe", label: "Severe", min: 55, max: 69.999, colour: "#cc5f26", summary: "High cross-system pressure is eroding resilience." },
  { id: "critical", label: "Critical", min: 70, max: 84.999, colour: "#c03535", summary: "Acute and mutually reinforcing strain across several systems." },
  { id: "emergency", label: "Emergency", min: 85, max: 100, colour: "#7d2230", summary: "Exceptional, widespread disruption. Use only with high confidence." }
]);

export function levelFor(score) {
  if (!Number.isFinite(score)) return null;
  return LEVELS.find((level) => score >= level.min && score <= level.max) ?? LEVELS.at(-1);
}

/**
 * Publication gates.
 *
 * `minAvailableWeight` is the rule that currently suppresses the headline: four
 * of ten indicators is 40% of fixed weight, far below 90%.
 */
export const PUBLICATION_GATES = Object.freeze({
  minAvailableWeight: 0.9,
  minConfidence: 0.7,
  acuteOverlayCap: 8,
  perEventCap: 2
});

export const DEFAULT_GEOGRAPHY = GEOGRAPHY.UK;

/** Fixed weights must sum to 1. Checked at module load so drift fails loudly. */
const WEIGHT_SUM = INDICATORS.reduce((sum, indicator) => sum + indicator.weight, 0);
if (Math.abs(WEIGHT_SUM - 1) > 1e-9) {
  throw new Error(`methodology v1 weights must sum to 1, got ${WEIGHT_SUM}`);
}

export function indicatorById(id) {
  return INDICATORS.find((indicator) => indicator.id === id) ?? null;
}

export function implementedIndicators() {
  return INDICATORS.filter((indicator) => indicator.sourceId !== null);
}
