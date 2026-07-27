INSERT OR REPLACE INTO observations
(indicator_id, observed_at, published_at, value, source_name, source_url, source_confidence, status, notes)
VALUES
('gdp_per_capita_growth', '2025-12-31T00:00:00.000Z', '2026-02-15T00:00:00.000Z', 0.8, 'Office for National Statistics', 'https://www.ons.gov.uk/economy/grossdomesticproductgdp', 0.62, 'provisional', 'Concept-brief seed value. Replace with an automated ONS series before launch.'),
('inflation_cpi', '2026-05-31T00:00:00.000Z', '2026-06-17T00:00:00.000Z', 2.8, 'Office for National Statistics', 'https://www.ons.gov.uk/economy/inflationandpriceindices', 0.68, 'provisional', 'Concept-brief seed value awaiting collector verification.'),
('unemployment_rate', '2026-04-30T00:00:00.000Z', '2026-06-16T00:00:00.000Z', 4.9, 'Office for National Statistics', 'https://www.ons.gov.uk/employmentandlabourmarket', 0.68, 'provisional', 'Concept-brief seed value awaiting collector verification.'),
('child_poverty_rate', '2023-12-31T00:00:00.000Z', '2024-03-21T00:00:00.000Z', 30.5, 'DWP / Households Below Average Income', 'https://www.gov.uk/government/collections/households-below-average-income-hbai--2', 0.58, 'provisional', 'Long-lag annual indicator; definition and year must be verified before launch.'),
('private_rent_burden', '2025-03-31T00:00:00.000Z', '2025-10-01T00:00:00.000Z', 28.1, 'Office for National Statistics', 'https://www.ons.gov.uk/peoplepopulationandcommunity/housing', 0.60, 'provisional', 'Concept-brief seed value; UK coverage and denominator require verification.'),
('trust_in_government', '2025-06-30T00:00:00.000Z', '2025-09-01T00:00:00.000Z', 14.0, 'OECD / reputable national polling', 'https://www.oecd.org/en/topics/trust-in-government.html', 0.55, 'provisional', 'Survey wording materially affects comparability; retain the exact question in production.'),
('industrial_disruption', '2026-05-31T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 4.5, 'Office for National Statistics', 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/workplacedisputesandworkingconditions', 0.45, 'illustrative', 'Illustrative placeholder, not a claimed official observation.'),
('food_bank_parcels_per_1000', '2025-03-31T00:00:00.000Z', '2025-05-14T00:00:00.000Z', 37.7, 'Trussell', 'https://www.trussell.org.uk/news-and-research/latest-stats', 0.58, 'provisional', 'Derived from the concept brief annual parcel total and a rounded population denominator.'),
('nhs_waiting_list_per_1000', '2026-05-31T00:00:00.000Z', '2026-07-09T00:00:00.000Z', 105.5, 'NHS England', 'https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/', 0.68, 'provisional', 'Derived from the concept brief pathways total and a rounded population denominator.'),
('climate_disruption', '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z', 12.0, 'Met Office / Environment Agency', 'https://www.gov.uk/check-flooding', 0.35, 'illustrative', 'Illustrative placeholder until the official alert collector is implemented.');

INSERT OR REPLACE INTO events
(id, title, summary, category, occurred_at, severity, confidence, half_life_hours, review_status, source_name, source_url)
VALUES
('methodology-only-event-example', 'Event overlay is intentionally inactive', 'Qualitative events will not affect the score until source, review and decay rules are independently tested.', 'methodology', '2026-07-27T00:00:00.000Z', 0, 1, 24, 'informational', 'UK Stability Monitor methodology', '/methodology');
