export const INDEX_VERSION = "0.1.0";

export const LEVELS = [
  { min: 0, max: 24.999, id: "stable", label: "Stable", colour: "#2fb171", summary: "Broad systems are functioning within normal pressure ranges." },
  { min: 25, max: 39.999, id: "guarded", label: "Guarded", colour: "#8dbb3e", summary: "Several pressures are elevated, but national systems remain resilient." },
  { min: 40, max: 54.999, id: "strained", label: "Strained", colour: "#e0a11b", summary: "Multiple pressures are materially above healthy baselines." },
  { min: 55, max: 69.999, id: "severe", label: "Severe", colour: "#e06a2c", summary: "Systemic pressure is high and resilience is being eroded." },
  { min: 70, max: 84.999, id: "critical", label: "Critical", colour: "#d64242", summary: "Several systems are under acute and mutually reinforcing strain." },
  { min: 85, max: 100, id: "emergency", label: "Emergency", colour: "#8e2635", summary: "Exceptional, widespread disruption with serious systemic risk." }
];

export const INDICATORS = [
  {
    id: "gdp_per_capita_growth",
    title: "Economic growth",
    shortTitle: "Growth",
    description: "Real GDP per person, using annual growth as the headline pressure signal.",
    unit: "% year-on-year",
    display: "percent",
    weight: 0.14,
    cadenceDays: 100,
    direction: "lower-is-worse",
    breakpoints: [
      { value: -4, score: 100 },
      { value: -1, score: 75 },
      { value: 0, score: 55 },
      { value: 1, score: 30 },
      { value: 2.5, score: 0 }
    ],
    sourceClass: "official",
    sourceName: "Office for National Statistics",
    sourceUrl: "https://www.ons.gov.uk/economy/grossdomesticproductgdp"
  },
  {
    id: "inflation_cpi",
    title: "Inflation and living costs",
    shortTitle: "Inflation",
    description: "Consumer Prices Index annual inflation. Both persistent inflation and deflation can be destabilising; this prototype scores high inflation only.",
    unit: "% year-on-year",
    display: "percent",
    weight: 0.11,
    cadenceDays: 40,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 0, score: 5 },
      { value: 2, score: 15 },
      { value: 4, score: 45 },
      { value: 7, score: 75 },
      { value: 12, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "Office for National Statistics",
    sourceUrl: "https://www.ons.gov.uk/economy/inflationandpriceindices"
  },
  {
    id: "unemployment_rate",
    title: "Employment pressure",
    shortTitle: "Unemployment",
    description: "Headline unemployment rate, supplemented in later releases by real wages, inactivity and vacancies.",
    unit: "% of labour force",
    display: "percent",
    weight: 0.11,
    cadenceDays: 50,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 3, score: 5 },
      { value: 4, score: 20 },
      { value: 5.5, score: 45 },
      { value: 8, score: 75 },
      { value: 12, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "Office for National Statistics",
    sourceUrl: "https://www.ons.gov.uk/employmentandlabourmarket"
  },
  {
    id: "child_poverty_rate",
    title: "Poverty and inequality",
    shortTitle: "Child poverty",
    description: "Children living in relative low-income households after housing costs. Annual data is retained until replaced.",
    unit: "% of children",
    display: "percent",
    weight: 0.1,
    cadenceDays: 430,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 15, score: 5 },
      { value: 22, score: 25 },
      { value: 30, score: 55 },
      { value: 38, score: 80 },
      { value: 50, score: 100 }
    ],
    sourceClass: "official-plus",
    sourceName: "DWP / Households Below Average Income",
    sourceUrl: "https://www.gov.uk/government/collections/households-below-average-income-hbai--2"
  },
  {
    id: "private_rent_burden",
    title: "Housing stress",
    shortTitle: "Rent burden",
    description: "Median private rent as a share of median private-renter household income.",
    unit: "% of income",
    display: "percent",
    weight: 0.1,
    cadenceDays: 400,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 18, score: 5 },
      { value: 24, score: 25 },
      { value: 30, score: 55 },
      { value: 37, score: 80 },
      { value: 48, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "Office for National Statistics",
    sourceUrl: "https://www.ons.gov.uk/peoplepopulationandcommunity/housing"
  },
  {
    id: "trust_in_government",
    title: "Trust and governance",
    shortTitle: "Public trust",
    description: "Share of adults reporting trust in national government. Lower trust produces a higher stress score.",
    unit: "% trusting",
    display: "percent",
    weight: 0.1,
    cadenceDays: 400,
    direction: "lower-is-worse",
    breakpoints: [
      { value: 10, score: 100 },
      { value: 20, score: 75 },
      { value: 30, score: 50 },
      { value: 40, score: 25 },
      { value: 55, score: 0 }
    ],
    sourceClass: "survey",
    sourceName: "OECD / reputable national polling",
    sourceUrl: "https://www.oecd.org/en/topics/trust-in-government.html"
  },
  {
    id: "industrial_disruption",
    title: "Social and industrial unrest",
    shortTitle: "Disruption",
    description: "Working days lost to labour disputes per 1,000 employees, combined later with independently verified protest disruption.",
    unit: "days per 1,000 workers",
    display: "decimal",
    weight: 0.09,
    cadenceDays: 60,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 0, score: 0 },
      { value: 2, score: 20 },
      { value: 8, score: 50 },
      { value: 20, score: 75 },
      { value: 50, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "Office for National Statistics",
    sourceUrl: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/workplacedisputesandworkingconditions"
  },
  {
    id: "food_bank_parcels_per_1000",
    title: "Basic-needs hardship",
    shortTitle: "Food hardship",
    description: "Emergency food parcels distributed per 1,000 residents. This is an NGO proxy, not a complete measure of food insecurity.",
    unit: "parcels per 1,000 people",
    display: "decimal",
    weight: 0.09,
    cadenceDays: 430,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 5, score: 5 },
      { value: 15, score: 25 },
      { value: 30, score: 55 },
      { value: 45, score: 80 },
      { value: 70, score: 100 }
    ],
    sourceClass: "ngo",
    sourceName: "Trussell",
    sourceUrl: "https://www.trussell.org.uk/news-and-research/latest-stats"
  },
  {
    id: "nhs_waiting_list_per_1000",
    title: "Healthcare strain",
    shortTitle: "NHS backlog",
    description: "Elective treatment pathways waiting per 1,000 residents, with long waits and emergency performance added later.",
    unit: "pathways per 1,000 people",
    display: "decimal",
    weight: 0.11,
    cadenceDays: 50,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 30, score: 5 },
      { value: 60, score: 25 },
      { value: 90, score: 50 },
      { value: 120, score: 75 },
      { value: 160, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "NHS England",
    sourceUrl: "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/"
  },
  {
    id: "climate_disruption",
    title: "Environmental disruption",
    shortTitle: "Climate shocks",
    description: "A transparent composite of severe weather alerts, major flooding, wildfire and infrastructure disruption. Prototype input is provisional.",
    unit: "0–100 disruption signal",
    display: "integer",
    weight: 0.05,
    cadenceDays: 2,
    direction: "higher-is-worse",
    breakpoints: [
      { value: 0, score: 0 },
      { value: 15, score: 20 },
      { value: 35, score: 50 },
      { value: 60, score: 75 },
      { value: 90, score: 100 }
    ],
    sourceClass: "official",
    sourceName: "Met Office / Environment Agency",
    sourceUrl: "https://www.gov.uk/check-flooding"
  }
];

export const METHODOLOGY_SUMMARY = {
  headline: "A national stress score, not a prediction of state failure.",
  principles: [
    "Every component is visible and reproducible.",
    "Official statistics remain dated at their true publication cadence.",
    "Missing or stale data lowers confidence; it is never silently imputed.",
    "Qualitative events are separately disclosed, reviewable and capped.",
    "Methodology changes require a version bump and a documented backtest."
  ],
  eventOverlayCap: 10,
  minimumHeadlineConfidence: 0.5
};
