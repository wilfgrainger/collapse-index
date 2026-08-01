/**
 * Contract tests against real, unmodified ONS responses.
 *
 * These assert the properties that would silently corrupt the index if they
 * changed upstream: exact series identity, declared units, period semantics and
 * blank-versus-zero handling.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseOnsTimeSeries } from "../../src/collectors/ons/timeseries.js";
import { parseForSource, buildObservation } from "../../src/collectors/ons/collect.js";
import { ONS_SOURCES, deriveDaysLostPer1000, selectDenominatorPoint, sourceById } from "../../src/collectors/ons/registry.js";
import { assertAllowedUrl } from "../../src/collectors/ons/client.js";
import { FREQUENCY } from "../../src/shared/period.js";
import { validateObservation } from "../../src/domain/evidence/schema.js";
import { readFixture } from "../helpers/fixtures.js";

const EVIDENCE = { sha256: "d".repeat(64), retrievedAt: "2026-08-01T00:00:00.000Z", key: "test-key" };

test("every declared source parses its own fixture", async () => {
  for (const source of ONS_SOURCES) {
    const parsed = parseForSource(source, await readFixture(source.cdid));
    assert.equal(parsed.meta.cdid, source.cdid, `${source.id} cdid`);
    assert.equal(parsed.meta.datasetId, source.datasetId, `${source.id} dataset`);
    assert.ok(parsed.points.length > 0, `${source.id} has points`);
  }
});

test("CPI parses to the published headline value", async () => {
  const parsed = parseForSource(sourceById("ons-d7g7"), await readFixture("D7G7"));
  const latest = parsed.points.at(-1);

  assert.equal(latest.periodLabel, "2026 JUN");
  assert.equal(latest.value, 2.6);
  assert.equal(latest.periodStart, "2026-06-01");
  assert.equal(latest.periodEnd, "2026-06-30");
  assert.equal(latest.frequency, FREQUENCY.MONTHLY);

  // The parsed latest point must agree with the payload's own headline fields.
  assert.equal(Number(parsed.meta.headlineValue), latest.value);
  assert.equal(parsed.meta.headlineDate, latest.periodLabel);
  assert.equal(parsed.meta.expectedNextRelease, "2026-08-19");
});

test("unemployment is stored as a rolling quarter, not a single month", async () => {
  const parsed = parseForSource(sourceById("ons-mgsx"), await readFixture("MGSX"));
  const latest = parsed.points.at(-1);

  assert.equal(parsed.meta.rollingThreeMonth, true);
  assert.equal(latest.periodLabel, "2026 APR");
  assert.equal(latest.value, 4.9);
  assert.equal(latest.frequency, FREQUENCY.ROLLING_QUARTER);
  assert.equal(latest.periodStart, "2026-03-01", "March, not April");
  assert.equal(latest.periodEnd, "2026-05-31", "through May");
  assert.equal(latest.displayLabel, "2026 MAR-MAY");
});

test("N3Y6 publishes annual points only", async () => {
  // The acquisition plan originally assumed quarterly. The live series is
  // annual, and declaring it quarterly must fail rather than return nothing.
  const text = await readFixture("N3Y6");
  const parsed = parseForSource(sourceById("ons-n3y6"), text);

  assert.equal(parsed.points.at(-1).periodLabel, "2025");
  assert.equal(parsed.points.at(-1).value, 1.0);
  assert.equal(parsed.points.at(-1).frequency, FREQUENCY.ANNUAL);

  assert.throws(
    () => parseOnsTimeSeries(text, { cdid: "N3Y6", datasetId: "QNA", frequency: FREQUENCY.QUARTERLY }),
    /publishes no quarterly observations/
  );
});

test("blank months in the labour-disputes series are skipped, never zeroed", async () => {
  const parsed = parseForSource(sourceById("ons-bbfw"), await readFixture("BBFW"));

  assert.equal(parsed.blankCount, 23, "the live series contains genuinely blank months");
  assert.ok(parsed.points.every((point) => Number.isFinite(point.value)));

  // A blank must not have become a zero-valued point.
  const raw = JSON.parse(await readFixture("BBFW"));
  const blankDates = new Set(
    raw.months.filter((month) => month.value === "" || month.value === null).map((month) => month.date)
  );
  for (const point of parsed.points) {
    assert.ok(!blankDates.has(point.periodLabel), `blank month ${point.periodLabel} became a data point`);
  }
});

test("industrial disruption is normalised by a matched employment denominator", async () => {
  const bbfw = sourceById("ons-bbfw");
  const mgrz = sourceById("ons-mgrz");
  const parsedBbfw = parseForSource(bbfw, await readFixture("BBFW"));
  const parsedMgrz = parseForSource(mgrz, await readFixture("MGRZ"));

  const { observation } = buildObservation({
    source: bbfw,
    parsed: parsedBbfw,
    evidence: EVIDENCE,
    denominator: { source: mgrz, parsed: parsedMgrz, evidence: { sha256: "e".repeat(64) } }
  });

  assert.equal(observation.rawValue, 26, "raw value stays in the source's own units");
  assert.equal(observation.denominator.value, 34475);
  assert.equal(observation.denominator.cdid, "MGRZ");
  assert.equal(observation.denominator.exactPeriodMatch, true);
  assert.match(observation.unit, /per 1,000 employed/);

  // 26,000 days lost across 34,475,000 people = 0.754 per 1,000.
  assert.ok(Math.abs(observation.transformedValue - 0.7542) < 0.001, `got ${observation.transformedValue}`);
});

test("the denominator arithmetic is unit-correct and guards division by zero", () => {
  assert.equal(deriveDaysLostPer1000(100, 1000), 100);
  assert.equal(deriveDaysLostPer1000(0, 34475), 0);
  assert.equal(deriveDaysLostPer1000(26, 0), null);
  assert.equal(deriveDaysLostPer1000(26, -5), null);
  assert.equal(deriveDaysLostPer1000(Number.NaN, 100), null);
});

test("a denominator point covering the period is preferred", () => {
  const points = [
    { periodStart: "2026-01-01", periodEnd: "2026-03-31", value: 1 },
    { periodStart: "2026-03-01", periodEnd: "2026-05-31", value: 2 },
    { periodStart: "2026-06-01", periodEnd: "2026-08-31", value: 3 }
  ];
  assert.equal(selectDenominatorPoint(points, "2026-05-31").value, 2, "covering period wins");
  assert.equal(selectDenominatorPoint(points, "2026-09-30").value, 3, "otherwise nearest by period end");
  assert.equal(selectDenominatorPoint([], "2026-05-31"), null);
});

test("every fixture produces a valid canonical observation", async () => {
  const mgrz = sourceById("ons-mgrz");
  const denominator = { source: mgrz, parsed: parseForSource(mgrz, await readFixture("MGRZ")), evidence: EVIDENCE };

  for (const source of ONS_SOURCES.filter((s) => s.role === "indicator")) {
    const parsed = parseForSource(source, await readFixture(source.cdid));
    const { observation } = buildObservation({
      source,
      parsed,
      evidence: EVIDENCE,
      denominator: source.requiresDenominator ? denominator : null
    });

    const result = validateObservation(observation);
    assert.equal(result.ok, true, `${source.id}: ${JSON.stringify(result.errors)}`);
    assert.equal(observation.evidenceSha256, EVIDENCE.sha256);
    assert.equal(observation.licence, "Open Government Licence v3.0");
    assert.ok(observation.publishedAt, `${source.id} carries a publication date`);
  }
});

test("parsing is deterministic across repeated runs", async () => {
  const source = sourceById("ons-d7g7");
  const text = await readFixture("D7G7");
  assert.deepEqual(parseForSource(source, text), parseForSource(source, text));
});

/* -------------------------------------------------------------------------- */
/* Failure modes                                                               */
/* -------------------------------------------------------------------------- */

test("an HTML error page cannot be parsed as data", () => {
  assert.throws(
    () => parseOnsTimeSeries("<!DOCTYPE html><html><body>Service unavailable</body></html>", {
      cdid: "D7G7", datasetId: "MM23", frequency: FREQUENCY.MONTHLY
    }),
    /not valid JSON/
  );
});

test("a valid JSON document that is not a timeseries is rejected", () => {
  assert.throws(
    () => parseOnsTimeSeries(JSON.stringify({ type: "bulletin", description: {} }), {
      cdid: "D7G7", datasetId: "MM23", frequency: FREQUENCY.MONTHLY
    }),
    /not an ONS timeseries/
  );
});

test("the wrong series fails rather than producing an observation", async () => {
  // CPIH served where CPI was expected: the classic invisible substitution.
  const text = await readFixture("D7G7");
  assert.throws(
    () => parseOnsTimeSeries(text, { cdid: "L55O", datasetId: "MM23", frequency: FREQUENCY.MONTHLY }),
    /series identity mismatch/
  );
  assert.throws(
    () => parseOnsTimeSeries(text, { cdid: "D7G7", datasetId: "LMS", frequency: FREQUENCY.MONTHLY }),
    /dataset mismatch/
  );
});

test("a changed unit quarantines the release", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  raw.description.unit = "index 2015=100";
  assert.throws(
    () => parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw)),
    /unit changed/
  );
});

test("a series that starts publishing rolling averages is quarantined", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  raw.description.monthLabelStyle = "three month average";
  assert.throws(
    () => parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw)),
    /three-month averages but is declared monthly/
  );
});

test("a rolling series that stops labelling itself as one is quarantined", async () => {
  const raw = JSON.parse(await readFixture("MGSX"));
  delete raw.description.monthLabelStyle;
  assert.throws(
    () => parseForSource(sourceById("ons-mgsx"), JSON.stringify(raw)),
    /no longer labels itself/
  );
});

test("a non-numeric value fails rather than being skipped", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  raw.months.at(-1).value = "2.6%";
  assert.throws(() => parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw)), /non-numeric value/);
});

test("a payload with no release date is rejected", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  delete raw.description.releaseDate;
  assert.throws(() => parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw)), /no release date/);
});

test("a derived indicator without its denominator writes nothing", async () => {
  const bbfw = sourceById("ons-bbfw");
  const parsed = parseForSource(bbfw, await readFixture("BBFW"));
  assert.throws(
    () => buildObservation({ source: bbfw, parsed, evidence: EVIDENCE, denominator: null }),
    /requires denominator/
  );
});

/* -------------------------------------------------------------------------- */
/* Transport allow-list                                                        */
/* -------------------------------------------------------------------------- */

test("only https ons.gov.uk urls are permitted", () => {
  assert.ok(assertAllowedUrl("https://www.ons.gov.uk/economy/timeseries/d7g7/mm23/data"));

  for (const bad of [
    "http://www.ons.gov.uk/data",
    "https://ons.gov.uk.evil.example/data",
    "https://evil.example/data",
    "https://www.ons.gov.uk.attacker.net/data",
    "ftp://www.ons.gov.uk/data",
    "not a url"
  ]) {
    assert.throws(() => assertAllowedUrl(bad), /host not on the allow-list|https|malformed/, `accepted ${bad}`);
  }
});

test("every registered source url is on the allow-list", () => {
  for (const source of ONS_SOURCES) {
    assert.ok(assertAllowedUrl(source.sourceUrl), source.id);
  }
});
