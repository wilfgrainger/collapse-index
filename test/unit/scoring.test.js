import test from "node:test";
import assert from "node:assert/strict";

import { acuteOverlay, calculateSnapshot, freshnessStage, scoreIndicator } from "../../src/domain/scoring/structural.js";
import { INDICATORS, PUBLICATION_GATES, indicatorById, levelFor } from "../../src/domain/methodology/v1.js";
import { EVIDENCE_STATE, FRESHNESS, GEOGRAPHY, QUALITY_CLASS } from "../../src/domain/evidence/states.js";
import { FREQUENCY } from "../../src/shared/period.js";

const HASH = "b".repeat(64);
const AS_OF = "2026-08-01T00:00:00.000Z";

function source(overrides = {}) {
  return {
    id: "test-source",
    title: "Test series",
    provider: "ONS",
    qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL,
    expectedCadenceDays: 31,
    graceDays: 14,
    hardExpiryDays: 120,
    ...overrides
  };
}

function observation(indicatorId, value, overrides = {}) {
  return {
    indicatorId,
    sourceId: "test-source",
    cdid: "TEST",
    datasetId: "TST",
    rawValue: value,
    transformedValue: value,
    unit: "%",
    frequency: FREQUENCY.MONTHLY,
    geography: GEOGRAPHY.UK,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    periodLabel: "2026 JUN",
    publishedAt: "2026-07-21T23:00:00.000Z",
    expectedNextRelease: "2026-08-19",
    retrievedAt: AS_OF,
    sourceUrl: "https://www.ons.gov.uk/x/data",
    licence: "OGL v3.0",
    evidenceSha256: HASH,
    parserVersion: "test@1",
    state: EVIDENCE_STATE.VERIFIED,
    ...overrides
  };
}

/** Builds a full ten-indicator set so gate behaviour can be tested at 100%. */
function fullObservationSet(overrides = {}) {
  return INDICATORS.map((indicator) => observation(indicator.id, overrides[indicator.id] ?? 0));
}

/**
 * A raw value guaranteed to sit at the top of an indicator's curve.
 * Direction matters: for a lower-is-worse indicator such as GDP growth, maximum
 * pressure is a large NEGATIVE value.
 */
function maxPressureValue(indicator) {
  return indicator.direction === "lower-is-worse" ? -1e6 : 1e6;
}

function maxPressureObservations() {
  return INDICATORS.map((indicator) => observation(indicator.id, maxPressureValue(indicator)));
}

const SOURCES = new Map([["test-source", source()]]);

test("fixed weights sum to exactly 1", () => {
  const total = INDICATORS.reduce((sum, indicator) => sum + indicator.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});

test("indicator ids are unique", () => {
  const ids = INDICATORS.map((indicator) => indicator.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("missing indicators do not increase the influence of the rest", () => {
  // Every indicator at maximum pressure.
  const all = maxPressureObservations();
  const complete = calculateSnapshot({ observations: all, sources: SOURCES, asOf: AS_OF });

  // Same evidence, minus healthcare (the single heaviest indicator at 15%).
  const partial = calculateSnapshot({
    observations: all.filter((o) => o.indicatorId !== "healthcare_strain"),
    sources: SOURCES,
    asOf: AS_OF
  });

  const contributionOf = (snapshot, id) =>
    snapshot.indicators.find((indicator) => indicator.id === id).contribution;

  for (const indicator of INDICATORS) {
    if (indicator.id === "healthcare_strain") continue;
    assert.equal(
      contributionOf(partial, indicator.id),
      contributionOf(complete, indicator.id),
      `${indicator.id} contribution changed when another indicator went missing`
    );
  }

  assert.ok(
    partial.structural.observedPressure < complete.structural.observedPressure,
    "removing evidence must lower measured pressure, not redistribute it"
  );
  assert.ok(partial.confidence.score < complete.confidence.score, "missing evidence must lower confidence");
  assert.equal(partial.structural.missingWeight, 0.15);
});

test("full high-pressure evidence reaches the top of the scale", () => {
  const snapshot = calculateSnapshot({
    observations: maxPressureObservations(),
    sources: SOURCES,
    asOf: AS_OF
  });
  assert.equal(snapshot.structural.observedPressure, 100);
  assert.equal(snapshot.structural.availableWeight, 1);
  assert.equal(snapshot.publication.status, "published");
  assert.equal(snapshot.publication.level.id, "emergency");
});

test("availability below the gate suppresses the headline", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2.6), observation("labour_market_stress", 4.9)],
    sources: SOURCES,
    asOf: AS_OF
  });

  assert.equal(snapshot.publication.status, "suppressed");
  assert.equal(snapshot.publication.headlineScore, null);
  assert.equal(snapshot.publication.level, null);
  assert.equal(snapshot.publication.gates.availabilityPassed, false);
  assert.match(snapshot.publication.reason, /availability/);
});

test("the uncertainty range brackets where a complete score could fall", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2)],
    sources: SOURCES,
    asOf: AS_OF
  });

  const { range, observedPressure, missingWeight } = snapshot.structural;
  assert.equal(range.low, observedPressure, "low bound assumes missing indicators are at zero pressure");
  assert.ok(Math.abs(range.high - (observedPressure + missingWeight * 100)) < 0.05);
  assert.ok(range.high > range.low);
});

test("confidence is the weighted product of quality, freshness and coverage", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2)],
    sources: SOURCES,
    asOf: AS_OF
  });
  // 0.08 weight × 1.0 accredited × 1.0 current × 1.0 UK coverage
  assert.ok(Math.abs(snapshot.confidence.score - 0.08) < 1e-9);
});

test("partial geographic coverage lowers confidence but not pressure", () => {
  const englandOnly = new Map([["test-source", source({ qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL })]]);

  const uk = calculateSnapshot({
    observations: [observation("healthcare_strain", 90)],
    sources: englandOnly,
    asOf: AS_OF
  });
  const england = calculateSnapshot({
    observations: [observation("healthcare_strain", 90, { geography: GEOGRAPHY.ENGLAND })],
    sources: englandOnly,
    asOf: AS_OF
  });

  assert.equal(england.indicators[8].pressure, uk.indicators[8].pressure, "coverage must not change the measurement");
  assert.ok(england.confidence.score < uk.confidence.score, "England-only evidence must not claim UK confidence");
  assert.equal(england.indicators[8].geography.label, "England only");
});

test("lower-quality evidence lowers confidence", () => {
  const accredited = calculateSnapshot({
    observations: [observation("cpi_inflation", 2)],
    sources: new Map([["test-source", source({ qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL })]]),
    asOf: AS_OF
  });
  const manual = calculateSnapshot({
    observations: [observation("cpi_inflation", 2)],
    sources: new Map([["test-source", source({ qualityClass: QUALITY_CLASS.MANUAL_TRACEABLE })]]),
    asOf: AS_OF
  });
  assert.ok(manual.confidence.score < accredited.confidence.score);
});

test("illustrative evidence cannot make an indicator available", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2, { state: EVIDENCE_STATE.ILLUSTRATIVE })],
    sources: SOURCES,
    asOf: AS_OF
  });
  const indicator = snapshot.indicators.find((i) => i.id === "cpi_inflation");
  assert.equal(indicator.available, false);
  assert.equal(snapshot.structural.availableWeight, 0);
  assert.equal(snapshot.confidence.score, 0);
});

test("withdrawn evidence is excluded", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2, { state: EVIDENCE_STATE.WITHDRAWN })],
    sources: SOURCES,
    asOf: AS_OF
  });
  assert.equal(snapshot.indicators.find((i) => i.id === "cpi_inflation").available, false);
});

test("freshness degrades through the declared stages", () => {
  const src = source({ expectedCadenceDays: 31, graceDays: 14, hardExpiryDays: 400 });
  const stageAt = (expectedNextRelease, asOf) =>
    freshnessStage(observation("cpi_inflation", 2, { expectedNextRelease }), src, asOf).stage;

  assert.equal(stageAt("2026-08-19", AS_OF), FRESHNESS.CURRENT, "release not yet due");
  assert.equal(stageAt("2026-07-20", AS_OF), FRESHNESS.CURRENT, "within grace");
  assert.equal(stageAt("2026-07-01", AS_OF), FRESHNESS.AGING, "one release missed");
  assert.equal(stageAt("2026-06-01", AS_OF), FRESHNESS.STALE, "two releases missed");
  assert.equal(stageAt("2026-01-01", AS_OF), FRESHNESS.EXPIRED, "long past any expected release");
});

test("hard expiry overrides an optimistic release schedule", () => {
  const src = source({ hardExpiryDays: 120 });
  const stale = observation("cpi_inflation", 2, {
    publishedAt: "2025-01-01T00:00:00.000Z",
    expectedNextRelease: "2026-12-31"
  });
  assert.equal(freshnessStage(stale, src, AS_OF).stage, FRESHNESS.EXPIRED);
});

test("an expired indicator becomes unavailable and contributes no confidence", () => {
  const snapshot = calculateSnapshot({
    observations: [observation("cpi_inflation", 2, { publishedAt: "2024-01-01T00:00:00.000Z" })],
    sources: SOURCES,
    asOf: AS_OF
  });
  const indicator = snapshot.indicators.find((i) => i.id === "cpi_inflation");
  assert.equal(indicator.available, false);
  assert.equal(indicator.confidenceContribution, 0);
});

test("an annual statistic is current between its annual releases", () => {
  const annual = source({ expectedCadenceDays: 365, graceDays: 45, hardExpiryDays: 550 });
  const point = observation("gdp_per_capita_growth", 1.0, {
    frequency: FREQUENCY.ANNUAL,
    publishedAt: "2026-06-29T23:00:00.000Z",
    expectedNextRelease: "2026-08-13"
  });
  assert.equal(freshnessStage(point, annual, AS_OF).stage, FRESHNESS.CURRENT);
});

test("an indicator with no observation reports why", () => {
  const scored = scoreIndicator(indicatorById("trust_in_government"), null, null, AS_OF);
  assert.equal(scored.available, false);
  assert.equal(scored.contribution, 0);
  assert.equal(scored.confidenceContribution, 0);
  assert.match(scored.reason, /no collector/);
});

test("levels map scores to the documented bands", () => {
  assert.equal(levelFor(0).id, "stable");
  assert.equal(levelFor(24.9).id, "stable");
  assert.equal(levelFor(25).id, "guarded");
  assert.equal(levelFor(40).id, "strained");
  assert.equal(levelFor(55).id, "severe");
  assert.equal(levelFor(70).id, "critical");
  assert.equal(levelFor(85).id, "emergency");
  assert.equal(levelFor(100).id, "emergency");
  assert.equal(levelFor(Number.NaN), null);
});

test("only approved events contribute to the acute overlay", () => {
  const event = {
    occurredAt: AS_OF,
    severity: 5,
    evidenceConfidence: 1,
    geographicReach: 1,
    systemBreadth: 1,
    halfLifeHours: 72
  };
  assert.equal(acuteOverlay([{ ...event, reviewStatus: "candidate" }], AS_OF).overlay, 0);
  assert.equal(acuteOverlay([{ ...event, reviewStatus: "rejected" }], AS_OF).overlay, 0);
  assert.equal(acuteOverlay([{ ...event, reviewStatus: "approved" }], AS_OF).overlay, PUBLICATION_GATES.perEventCap);
});

test("the overlay is capped and decays", () => {
  const event = (id) => ({
    id,
    reviewStatus: "approved",
    occurredAt: AS_OF,
    severity: 5,
    evidenceConfidence: 1,
    geographicReach: 1,
    systemBreadth: 1,
    halfLifeHours: 72
  });

  const many = Array.from({ length: 20 }, (_, i) => event(`e${i}`));
  assert.equal(acuteOverlay(many, AS_OF).overlay, PUBLICATION_GATES.acuteOverlayCap);

  // One half-life later, a single event contributes half as much.
  const later = new Date(Date.parse(AS_OF) + 72 * 3_600_000).toISOString();
  const decayed = acuteOverlay([event("e")], later).overlay;
  assert.ok(Math.abs(decayed - PUBLICATION_GATES.perEventCap / 2) < 0.01, `decayed to ${decayed}`);
});

test("future events do not contribute", () => {
  const future = new Date(Date.parse(AS_OF) + 86_400_000).toISOString();
  const overlay = acuteOverlay([{
    reviewStatus: "approved", occurredAt: future, severity: 5,
    evidenceConfidence: 1, geographicReach: 1, systemBreadth: 1, halfLifeHours: 72
  }], AS_OF);
  assert.equal(overlay.overlay, 0);
});

test("recalculation with unchanged evidence is deterministic", () => {
  const observations = fullObservationSet({ cpi_inflation: 2.6 });
  const first = calculateSnapshot({ observations, sources: SOURCES, asOf: AS_OF });
  const second = calculateSnapshot({ observations, sources: SOURCES, asOf: AS_OF });

  assert.deepEqual(
    { ...first, generatedAt: null },
    { ...second, generatedAt: null },
    "identical inputs must produce an identical snapshot apart from generation time"
  );
});
