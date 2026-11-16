# Food insecurity: exact-source review (issue #5, first gate)

Date: 2026-11-16. Status: **evidence verified, collector not built. Three owner decisions are needed (section 5).**

This is the "exact CSV resource and definition review" gate that `ROADMAP.md` puts before any FSA collector. Nothing here changes scoring, and no value has been entered into the system.

## 1. Exact resource

| Field | Value |
|---|---|
| Publisher | Food Standards Agency (FSA) |
| Catalogue entry | `https://data.food.gov.uk/catalog/datasets/18d79e57-71d0-4610-8ee1-606e5c457607` ("Food and You 2 Survey: Wave 11") |
| Respondent-level file | `https://fsaopendata.blob.core.windows.net/opendatacatalog/2407752501FoodandYou2Wave11AbridgedDataThreeCountriesV1.csv` |
| Published table | `https://fsaopendata.blob.core.windows.net/opendatacatalog/W11_allCountry_pub_postPubAmended_290926.xlsx`, sheet `T231` |
| Licence | Open Government Licence v3.0 (catalogue metadata) |
| Fieldwork (reference period) | 2025-05-19 to 2025-08-07 |
| Issued / modified | 2026-03-31 / 2026-11-12. The amended tables are dated 12 Nov; the CSV's `Last-Modified` is still 31 Mar. |
| Update period | "every 6 months" (catalogue). Each wave has **new file URLs**. |
| Geography | England, Wales and Northern Ireland. Scotland is not surveyed. The existing `ENGLAND_WALES_NI` coverage factor is 0.919. |
| CSV | 5,811,375 bytes, `text/csv`, Azure blob `ETag 0x8DE8F111D193116`, SHA-256 `ee8e17e91b803c950e43180679e8759fecb1db08978416700b47dec425d2f525` |
| XLSX | 3,016,641 bytes, SHA-256 `22bc3547c2f99ffc85597746265e310f932dcb51041e293b746bf2f7421d516c` |

Both files were retrieved directly from the FSA open-data blob store without authentication or bot challenges.

## 2. Definition

- **Variable:** `USDA_Fi_dv`, the derived USDA food-security classification.
  - Codes: `1` high, `2` marginal, `3` low, `4` very low, `-1` not answering.
  - FSA labels the published table `FOOD_SECURITY_dv`, "Household food security (individual level)".
- **Weight:** `wt_ewni_all`, the combined England, Wales and Northern Ireland weight.
- **Measure:** the weighted share of answering respondents with low or very low food security. This is FSA's own published "Net – Low / Very low".

**Unit finding.** Methodology v1 states the unit as "% of households with low or very low food security". FSA's measure is individual-level: the share of adults (16+) who live in households with low or very low food security. It is not a share of households. The unit wording must change before collection. That is a methodology decision (section 5, D2).

## 3. Verification: reproduction matches the published table

The weighted estimate was recomputed from the respondent-level CSV and compared with FSA's own published table T231. A plain 50-line RFC 4180 scan was used, and the same result was obtained independently in Python.

| Scope | Recomputed from CSV | Published (T231, Net Low/Very low) | Answering base |
|---|---|---|---|
| E, W and NI | 21.2039031324 % | 21.203903132444498 % | 5,695 of 5,898 (203 coded −1) |
| England | 21.1726865413 % | 21.172686541304699 % | 2,782 |
| Wales | 21.3546973352 % | 21.3546973352496 % | 1,402 |
| Northern Ireland | 21.9201312159 % | 21.920131215938198 % | 1,511 |

Every scope agrees to at least ten significant figures, and the published weighted base (5,668) matches too. The respondent-level CSV with `wt_ewni_all` therefore reproduces the official statistic exactly. A collector can derive the indicator from public microdata and prove, on every wave, that it agrees with FSA's own table.

## 4. Platform constraints

- **CPU.** A minimal streaming parse of the 5.8 MB CSV takes about 50–70 ms of CPU in Node 22. The Workers Free plan allows 10 ms of CPU per invocation, including Cron Triggers. The Paid plan allows 30 s by default. Conditional requests (blob ETag) mean the parse would run only when a new file appears, roughly twice a year. On the Free plan, though, that one invocation would fail.
- **Size.** 5.8 MB is above the current collector response limit, which was sized for ONS JSON payloads of up to 220 KB. The limit would need a per-source override.
- **Discovery.** Each wave is published at new URLs. Scraping the HTML catalogue to find them would be fragile and would weaken identity assertion.
- **XLSX alternative.** Reading T231 directly needs unzip plus XML parsing of a 241-sheet workbook. That is heavier and more fragile than the CSV, so it is not recommended (D-015).

## 5. Decisions required before building the collector

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Where the parse runs | (a) Workers Paid plan, with a per-source size limit and parsing only on a new ETag; (b) stay on Free and keep food insecurity uncollected | (a), if the project is, or will be, on Paid. Nothing else in the design needs Paid. |
| D2 | Unit and wording | Change the v1 unit to "% of adults living in households with low or very low food security" | Yes. This needs a methodology note and decision-log entry, but the version can stay unchanged because no collected value exists yet. |
| D3 | Breakpoints | The provisional curve (4→5, 8→30, 13→60, 20→85, 30→100) would score the current 21.2% at about 86.8/100. Waves 1–11 have stayed around this level. | Review the breakpoints against the Wave 1–11 trend file (`W1-11Trends_Allcountries_pub_postPubAmended_300426b.xlsx`) and the methodology's anchoring rules **before** collection. Otherwise one indicator enters near the top of its scale by design. |
| D4 | Wave discovery | Register each wave's exact URLs in code, as a reviewed change about every 6 months | Yes. Identity stays exact, and every new wave is a reviewed release with a contract test against its published table. |

## 6. Proposed collector, once D1–D4 are settled

1. Register `fsa-fy2-w11` with exact URLs, licence, fieldwork period, geography `ENGLAND_WALES_NI` and quality class `official`. FSA describes Food and You 2 as an official statistic.
2. Fetch the CSV with a per-source size limit and a conditional request on the blob ETag. Archive it to R2 by SHA-256.
3. Parse with a streaming scan that asserts the header contains `USDA_Fi_dv`, `wt_ewni_all` and `country`. Treat a blank or non-decimal weight as a parse failure, and codes outside `-1..4` as quarantine.
4. Compute the weighted low-plus-very-low share. Store the answering base and the weighted base with the observation.
5. Add a contract test with the committed CSV fixture that asserts the result equals published T231 to 1e-9. Committing the fixture adds 5.8 MB to the repository, so the owner should approve it.

## 7. Related finding: NHS RTT source access

`www.england.nhs.uk`, which hosts the RTT statistics and their files, answers automated requests from this environment with an empty `HTTP 202` challenge instead of content. No attempt was made to get around it. A Worker collector would probably meet the same challenge.

Before any RTT collector is designed, the project needs one of the following:
- a machine-access route NHS England endorses (for example, the files' direct URLs being reachable without a challenge from Cloudflare egress);
- written permission;
- an alternative official source.

This makes RTT a **source-access** blocker, not only a parsing one. It also matters for the 90% gate: without healthcare's 15% weight, at most 85% of weight can be collected.
