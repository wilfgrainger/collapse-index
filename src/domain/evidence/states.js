/**
 * Evidence-state, geography and quality enums.
 *
 * These are the vocabulary of the whole product. They are defined once, here,
 * because the difference between `provisional` and `verified` is the
 * difference between an honest monitor and a misleading one.
 */

/** docs/SOURCE_REGISTER.md — evidence states. */
export const EVIDENCE_STATE = Object.freeze({
  ILLUSTRATIVE: "illustrative",
  PROVISIONAL: "provisional",
  VERIFIED: "verified",
  REVISED: "revised",
  WITHDRAWN: "withdrawn",
  SUPPRESSED: "suppressed"
});

export const EVIDENCE_STATES = Object.freeze(Object.values(EVIDENCE_STATE));

/** Only these states may support a verified public headline. */
export const HEADLINE_ELIGIBLE_STATES = Object.freeze([
  EVIDENCE_STATE.VERIFIED,
  EVIDENCE_STATE.REVISED
]);

export function isHeadlineEligibleState(state) {
  return HEADLINE_ELIGIBLE_STATES.includes(state);
}

/**
 * Geography codes and their population-coverage factors.
 *
 * Factors are the share of the UK population covered, so that England-only
 * evidence can never silently represent the UK. Values are derived from ONS
 * mid-2023 population estimates and are versioned with the methodology.
 */
export const GEOGRAPHY = Object.freeze({
  UK: "UK",
  GB: "GB",
  ENGLAND_WALES_NI: "ENG_WAL_NI",
  ENGLAND: "ENG"
});

export const GEOGRAPHY_COVERAGE = Object.freeze({
  [GEOGRAPHY.UK]: 1.0,
  [GEOGRAPHY.GB]: 0.971,
  [GEOGRAPHY.ENGLAND_WALES_NI]: 0.919,
  [GEOGRAPHY.ENGLAND]: 0.845
});

export const GEOGRAPHY_LABEL = Object.freeze({
  [GEOGRAPHY.UK]: "United Kingdom",
  [GEOGRAPHY.GB]: "Great Britain",
  [GEOGRAPHY.ENGLAND_WALES_NI]: "England, Wales and Northern Ireland",
  [GEOGRAPHY.ENGLAND]: "England only"
});

/** The population denominator vintage backing the coverage factors above. */
export const GEOGRAPHY_DENOMINATOR_VINTAGE = Object.freeze({
  source: "ONS mid-2023 population estimates",
  retrievedFor: "methodology v1 coverage factors",
  note: "Coverage factors are fixed within a methodology version and are not recalculated automatically."
});

export function coverageFactor(geography) {
  const factor = GEOGRAPHY_COVERAGE[geography];
  if (factor === undefined) throw new Error(`unknown geography: ${geography}`);
  return factor;
}

/**
 * Quality factors by evidence class (docs/METHODOLOGY_V1_DESIGN.md §7.1).
 * `illustrative` and `withdrawn` are zero so they cannot support a headline.
 */
export const QUALITY_CLASS = Object.freeze({
  ACCREDITED_OFFICIAL: "accredited-official",
  OFFICIAL: "official",
  OFFICIAL_IN_DEVELOPMENT: "official-in-development",
  MANAGEMENT_INFORMATION: "management-information",
  SURVEY_PROXY: "survey-proxy",
  MANUAL_TRACEABLE: "manual-traceable",
  ILLUSTRATIVE: "illustrative"
});

export const QUALITY_FACTOR = Object.freeze({
  [QUALITY_CLASS.ACCREDITED_OFFICIAL]: 1.0,
  [QUALITY_CLASS.OFFICIAL]: 0.9,
  [QUALITY_CLASS.OFFICIAL_IN_DEVELOPMENT]: 0.9,
  [QUALITY_CLASS.MANAGEMENT_INFORMATION]: 0.8,
  [QUALITY_CLASS.SURVEY_PROXY]: 0.7,
  [QUALITY_CLASS.MANUAL_TRACEABLE]: 0.6,
  [QUALITY_CLASS.ILLUSTRATIVE]: 0.0
});

export function qualityFactor(qualityClass) {
  const factor = QUALITY_FACTOR[qualityClass];
  if (factor === undefined) throw new Error(`unknown quality class: ${qualityClass}`);
  return factor;
}

/** Freshness stages (docs/METHODOLOGY_V1_DESIGN.md §6.2). */
export const FRESHNESS = Object.freeze({
  CURRENT: "current",
  AGING: "aging",
  STALE: "stale",
  EXPIRED: "expired"
});

export const FRESHNESS_FACTOR = Object.freeze({
  [FRESHNESS.CURRENT]: 1.0,
  [FRESHNESS.AGING]: 0.8,
  [FRESHNESS.STALE]: 0.5,
  [FRESHNESS.EXPIRED]: 0.0
});
