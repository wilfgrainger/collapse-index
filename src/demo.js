import { INDICATORS, INDEX_VERSION } from "./config.js";
import { calculateIndex, round } from "./scoring.js";

export const PROTOTYPE_OBSERVATIONS = [
  {
    indicatorId: "gdp_per_capita_growth",
    value: 0.8,
    observedAt: "2025-12-31T00:00:00.000Z",
    publishedAt: "2026-02-15T00:00:00.000Z",
    sourceConfidence: 0.62,
    status: "provisional",
    notes: "Concept-brief seed value. Replace with an automated ONS series before launch."
  },
  {
    indicatorId: "inflation_cpi",
    value: 2.8,
    observedAt: "2026-05-31T00:00:00.000Z",
    publishedAt: "2026-06-17T00:00:00.000Z",
    sourceConfidence: 0.68,
    status: "provisional",
    notes: "Concept-brief seed value awaiting collector verification."
  },
  {
    indicatorId: "unemployment_rate",
    value: 4.9,
    observedAt: "2026-04-30T00:00:00.000Z",
    publishedAt: "2026-06-16T00:00:00.000Z",
    sourceConfidence: 0.68,
    status: "provisional",
    notes: "Concept-brief seed value awaiting collector verification."
  },
  {
    indicatorId: "child_poverty_rate",
    value: 30.5,
    observedAt: "2023-12-31T00:00:00.000Z",
    publishedAt: "2024-03-21T00:00:00.000Z",
    sourceConfidence: 0.58,
    status: "provisional",
    notes: "Long-lag annual indicator; definition and year must be verified before launch."
  },
  {
    indicatorId: "private_rent_burden",
    value: 28.1,
    observedAt: "2025-03-31T00:00:00.000Z",
    publishedAt: "2025-10-01T00:00:00.000Z",
    sourceConfidence: 0.6,
    status: "provisional",
    notes: "Concept-brief seed value; UK coverage and denominator require verification."
  },
  {
    indicatorId: "trust_in_government",
    value: 14,
    observedAt: "2025-06-30T00:00:00.000Z",
    publishedAt: "2025-09-01T00:00:00.000Z",
    sourceConfidence: 0.55,
    status: "provisional",
    notes: "Survey wording materially affects comparability; retain the exact question in production."
  },
  {
    indicatorId: "industrial_disruption",
    value: 4.5,
    observedAt: "2026-05-31T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    sourceConfidence: 0.45,
    status: "illustrative",
    notes: "Illustrative placeholder, not a claimed official observation."
  },
  {
    indicatorId: "food_bank_parcels_per_1000",
    value: 37.7,
    observedAt: "2025-03-31T00:00:00.000Z",
    publishedAt: "2025-05-14T00:00:00.000Z",
    sourceConfidence: 0.58,
    status: "provisional",
    notes: "Derived from the concept brief's annual parcel total and a rounded population denominator."
  },
  {
    indicatorId: "nhs_waiting_list_per_1000",
    value: 105.5,
    observedAt: "2026-05-31T00:00:00.000Z",
    publishedAt: "2026-07-09T00:00:00.000Z",
    sourceConfidence: 0.68,
    status: "provisional",
    notes: "Derived from the concept brief's pathways total and a rounded population denominator."
  },
  {
    indicatorId: "climate_disruption",
    value: 12,
    observedAt: "2026-07-26T00:00:00.000Z",
    publishedAt: "2026-07-26T00:00:00.000Z",
    sourceConfidence: 0.35,
    status: "illustrative",
    notes: "Illustrative placeholder until the official alert collector is implemented."
  }
];

export const PROTOTYPE_EVENTS = [
  {
    id: "methodology-only-event-example",
    title: "Event overlay is intentionally inactive",
    summary: "Qualitative events will not affect the score until source, review and decay rules are independently tested.",
    category: "methodology",
    occurredAt: "2026-07-27T00:00:00.000Z",
    severity: 0,
    confidence: 1,
    halfLifeHours: 24,
    reviewStatus: "informational",
    sourceName: "UK Stability Monitor methodology",
    sourceUrl: "/methodology"
  }
];

const HISTORY_ANCHORS = [
  ["2019-01-01", 29],
  ["2020-03-01", 72],
  ["2020-06-01", 66],
  ["2021-01-01", 61],
  ["2021-07-01", 46],
  ["2022-02-01", 49],
  ["2022-10-01", 63],
  ["2023-07-01", 56],
  ["2024-07-01", 50],
  ["2025-07-01", 48],
  ["2026-07-01", 47]
];

function monthDifference(start, end) {
  return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) + end.getUTCMonth() - start.getUTCMonth();
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function buildIllustrativeHistory() {
  const points = [];
  for (let index = 0; index < HISTORY_ANCHORS.length - 1; index += 1) {
    const [startDate, startScore] = HISTORY_ANCHORS[index];
    const [endDate, endScore] = HISTORY_ANCHORS[index + 1];
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const months = monthDifference(start, end);

    for (let month = 0; month < months; month += 1) {
      const progress = month / months;
      const wave = Math.sin((index + month) * 1.7) * 1.2;
      points.push({
        date: addMonths(start, month).toISOString().slice(0, 10),
        score: round(startScore + ((endScore - startScore) * progress) + wave, 1)
      });
    }
  }
  const [lastDate, lastScore] = HISTORY_ANCHORS.at(-1);
  points.push({ date: lastDate, score: lastScore });
  return points;
}

export function createPrototypeSnapshot(asOf = new Date().toISOString()) {
  return calculateIndex({
    definitions: INDICATORS,
    observations: PROTOTYPE_OBSERVATIONS,
    events: PROTOTYPE_EVENTS,
    asOf,
    version: INDEX_VERSION,
    mode: "prototype"
  });
}
