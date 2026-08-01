/**
 * ONS source declarations — the first collector tranche (WP5).
 *
 * Four indicator series plus one denominator series. Every field here is a
 * claim that must be checkable against the payload: the parser asserts CDID,
 * dataset and frequency, so a wrong declaration fails loudly rather than
 * producing a plausible-looking number from the wrong series.
 *
 * Cadence and expiry are per-source. An annual national-accounts series is not
 * "stale" for being annual; it is stale when ONS misses a release it announced.
 */

import { FREQUENCY } from "../../shared/period.js";
import { GEOGRAPHY, QUALITY_CLASS } from "../../domain/evidence/states.js";

const ONS_ORIGIN = "https://www.ons.gov.uk";
export const OGL_V3 = "Open Government Licence v3.0";

function onsUrl(path) {
  return `${ONS_ORIGIN}${path}/data`;
}

export const SOURCE_ROLE = Object.freeze({
  INDICATOR: "indicator",
  DENOMINATOR: "denominator"
});

export const ONS_SOURCES = Object.freeze([
  {
    id: "ons-d7g7",
    role: SOURCE_ROLE.INDICATOR,
    indicatorId: "cpi_inflation",
    provider: "Office for National Statistics",
    cdid: "D7G7",
    datasetId: "MM23",
    title: "CPI annual rate: all items, 2015=100",
    path: "/economy/inflationandpriceindices/timeseries/d7g7/mm23",
    sourceUrl: onsUrl("/economy/inflationandpriceindices/timeseries/d7g7/mm23"),
    licence: OGL_V3,
    geography: GEOGRAPHY.UK,
    qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL,
    frequency: FREQUENCY.MONTHLY,
    unit: "% year-on-year",
    expectedUnit: "%",
    seasonalAdjustment: "not applicable",
    expectedCadenceDays: 31,
    graceDays: 14,
    hardExpiryDays: 120,
    notes: "Consumer Prices Index, not CPIH and not RPI. Substituting either would change the measured concept."
  },
  {
    id: "ons-mgsx",
    role: SOURCE_ROLE.INDICATOR,
    indicatorId: "labour_market_stress",
    provider: "Office for National Statistics",
    cdid: "MGSX",
    datasetId: "LMS",
    title: "Unemployment rate, aged 16 and over, seasonally adjusted",
    path: "/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms",
    sourceUrl: onsUrl("/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms"),
    licence: OGL_V3,
    geography: GEOGRAPHY.UK,
    // Labour Force Survey estimates carry known response-rate problems, so this
    // is treated as an official statistic in development rather than accredited.
    qualityClass: QUALITY_CLASS.OFFICIAL_IN_DEVELOPMENT,
    frequency: FREQUENCY.ROLLING_QUARTER,
    unit: "% of those aged 16+ in the labour force",
    expectedUnit: "%",
    seasonalAdjustment: "seasonally adjusted",
    expectedCadenceDays: 31,
    graceDays: 14,
    hardExpiryDays: 120,
    notes: "Published as a rolling three-month estimate; a point labelled APR covers March to May."
  },
  {
    id: "ons-n3y6",
    role: SOURCE_ROLE.INDICATOR,
    indicatorId: "gdp_per_capita_growth",
    provider: "Office for National Statistics",
    cdid: "N3Y6",
    datasetId: "QNA",
    title: "GDP (average) per head, year-on-year growth rate, CVM, seasonally adjusted",
    path: "/economy/grossdomesticproductgdp/timeseries/n3y6/qna",
    sourceUrl: onsUrl("/economy/grossdomesticproductgdp/timeseries/n3y6/qna"),
    licence: OGL_V3,
    geography: GEOGRAPHY.UK,
    qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL,
    // Verified against the live payload: N3Y6 publishes annual points only,
    // despite sitting in the quarterly national accounts dataset. See
    // docs/DECISIONS.md 2026-08-01.
    frequency: FREQUENCY.ANNUAL,
    unit: "% year-on-year",
    expectedUnit: "%",
    seasonalAdjustment: "seasonally adjusted",
    expectedCadenceDays: 365,
    graceDays: 45,
    hardExpiryDays: 550,
    notes:
      "Chained-volume measure. The nominal series N3Y3 must never be substituted. " +
      "Annual reference periods are revised by quarterly national-accounts releases."
  },
  {
    id: "ons-bbfw",
    role: SOURCE_ROLE.INDICATOR,
    indicatorId: "industrial_disruption",
    provider: "Office for National Statistics",
    cdid: "BBFW",
    datasetId: "LMS",
    title: "Labour disputes: working days lost due to strike action, UK (thousands)",
    path: "/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/bbfw/lms",
    sourceUrl: onsUrl("/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/bbfw/lms"),
    licence: OGL_V3,
    geography: GEOGRAPHY.UK,
    qualityClass: QUALITY_CLASS.OFFICIAL,
    frequency: FREQUENCY.MONTHLY,
    unit: "thousands of working days",
    expectedUnit: "(000's)",
    seasonalAdjustment: "not seasonally adjusted",
    expectedCadenceDays: 31,
    graceDays: 14,
    hardExpiryDays: 120,
    requiresDenominator: "ons-mgrz",
    notes:
      "A count, so it requires a versioned employment denominator before scoring. " +
      "The series contains genuinely blank months which must not be read as zero."
  },
  {
    id: "ons-mgrz",
    role: SOURCE_ROLE.DENOMINATOR,
    indicatorId: null,
    provider: "Office for National Statistics",
    cdid: "MGRZ",
    datasetId: "LMS",
    title: "Number of people in employment, aged 16 and over, seasonally adjusted (thousands)",
    path: "/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/mgrz/lms",
    sourceUrl: onsUrl("/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/mgrz/lms"),
    licence: OGL_V3,
    geography: GEOGRAPHY.UK,
    qualityClass: QUALITY_CLASS.OFFICIAL_IN_DEVELOPMENT,
    frequency: FREQUENCY.ROLLING_QUARTER,
    unit: "thousands of people",
    expectedUnit: "000's",
    seasonalAdjustment: "seasonally adjusted",
    expectedCadenceDays: 31,
    graceDays: 14,
    hardExpiryDays: 120,
    notes: "Denominator only. Never scored directly; its vintage is recorded on every derived observation."
  }
]);

export function sourceById(id) {
  return ONS_SOURCES.find((source) => source.id === id) ?? null;
}

export function indicatorSources() {
  return ONS_SOURCES.filter((source) => source.role === SOURCE_ROLE.INDICATOR);
}

/**
 * Selects the denominator point covering a numerator's reference period.
 *
 * Employment is a rolling three-month estimate while labour disputes are
 * monthly, so the periods rarely align exactly. The nearest point by period end
 * is used, and the chosen point's own period is returned so the derived
 * observation can record which denominator vintage produced it.
 */
export function selectDenominatorPoint(points, periodEnd) {
  if (!Array.isArray(points) || points.length === 0) return null;

  const covering = points.find((point) => point.periodStart <= periodEnd && point.periodEnd >= periodEnd);
  if (covering) return covering;

  const target = Date.parse(periodEnd);
  let best = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(Date.parse(point.periodEnd) - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Working days lost per 1,000 employed people, per month.
 *
 * Both series are in thousands, so the thousands cancel:
 *   (days_lost_000s / employed_000s) * 1000
 */
export function deriveDaysLostPer1000(daysLostThousands, employedThousands) {
  if (!Number.isFinite(daysLostThousands) || !Number.isFinite(employedThousands) || employedThousands <= 0) {
    return null;
  }
  return (daysLostThousands / employedThousands) * 1000;
}
