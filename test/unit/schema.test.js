import test from "node:test";
import assert from "node:assert/strict";

import {
  isHeadlineEligibleObservation,
  validateEvidenceObject,
  validateObservation,
  validateSnapshot,
  validateSource
} from "../../src/domain/evidence/schema.js";
import { EVIDENCE_STATE, GEOGRAPHY, QUALITY_CLASS } from "../../src/domain/evidence/states.js";
import { FREQUENCY } from "../../src/shared/period.js";

const VALID_HASH = "a".repeat(64);

function validObservation(overrides = {}) {
  return {
    indicatorId: "cpi_inflation",
    sourceId: "ons-d7g7",
    cdid: "D7G7",
    datasetId: "MM23",
    rawValue: 2.6,
    rawUnit: "% year-on-year",
    transformedValue: 2.6,
    unit: "% year-on-year",
    frequency: FREQUENCY.MONTHLY,
    geography: GEOGRAPHY.UK,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    periodLabel: "2026 JUN",
    publishedAt: "2026-07-21T23:00:00.000Z",
    retrievedAt: "2026-08-01T00:00:00.000Z",
    sourceUrl: "https://www.ons.gov.uk/x/data",
    licence: "Open Government Licence v3.0",
    evidenceSha256: VALID_HASH,
    dependencyFingerprint: `primary:${VALID_HASH}`,
    parserVersion: "ons-timeseries@1.0.0",
    state: EVIDENCE_STATE.VERIFIED,
    denominator: null,
    ...overrides
  };
}

function validSnapshot(overrides = {}) {
  return {
    schemaVersion: "2.0",
    methodologyVersion: "1.0.0-alpha.1",
    asOf: "2026-08-01T09:00:00.000Z",
    generatedAt: "2026-08-01T09:00:01.000Z",
    publication: { status: "suppressed", headlineScore: null },
    structural: {
      observedPressure: 1,
      availableWeight: 0.08,
      missingWeight: 0.92,
      range: { low: 1, high: 93 }
    },
    acute: { overlay: 0 },
    confidence: { score: 0.08 },
    indicators: [{
      id: "cpi_inflation",
      available: true,
      weight: 0.08,
      pressure: 12.5,
      source: {
        evidenceSha256: VALID_HASH,
        dependencyFingerprint: `primary:${VALID_HASH}`
      }
    }],
    ...overrides
  };
}

test("a complete observation validates", () => {
  const result = validateObservation(validObservation());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("an observation cannot exist without evidence provenance", () => {
  for (const bad of [undefined, "", "not-a-hash", "A".repeat(64), "a".repeat(63)]) {
    const result = validateObservation(validObservation({ evidenceSha256: bad }));
    assert.equal(result.ok, false, `accepted hash: ${bad}`);
  }
  assert.equal(validateObservation(validObservation({ dependencyFingerprint: "" })).ok, false);
});

test("a missing reference period is rejected", () => {
  assert.equal(validateObservation(validObservation({ periodStart: undefined })).ok, false);
  assert.equal(validateObservation(validObservation({ periodEnd: "" })).ok, false);
  assert.equal(validateObservation(validObservation({ periodStart: "2026-06" })).ok, false);
});

test("a reference period cannot end before it starts", () => {
  const result = validateObservation(validObservation({ periodStart: "2026-07-01", periodEnd: "2026-06-30" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === "observation.period"));
});

test("blank and non-finite values are rejected rather than coerced", () => {
  for (const bad of [null, undefined, "", "n/a", Number.NaN]) {
    assert.equal(validateObservation(validObservation({ rawValue: bad })).ok, false);
  }
  assert.equal(validateObservation(validObservation({ transformedValue: Number.NaN })).ok, false);
  assert.equal(validateObservation(validObservation({ rawValue: 0, transformedValue: 0 })).ok, true);
});

test("derived observations require denominator evidence", () => {
  const denominator = {
    sourceId: "ons-mgrz",
    cdid: "MGRZ",
    value: 34_000,
    periodStart: "2026-04-01",
    periodEnd: "2026-06-30",
    evidenceSha256: "b".repeat(64)
  };
  assert.equal(validateObservation(validObservation({ denominator })).ok, true);
  assert.equal(validateObservation(validObservation({ denominator: { ...denominator, evidenceSha256: null } })).ok, false);
});

test("unknown units, states, geographies and frequencies are rejected", () => {
  assert.equal(validateObservation(validObservation({ unit: "" })).ok, false);
  assert.equal(validateObservation(validObservation({ state: "probably-fine" })).ok, false);
  assert.equal(validateObservation(validObservation({ geography: "EUROPE" })).ok, false);
  assert.equal(validateObservation(validObservation({ frequency: "fortnightly" })).ok, false);
});

test("illustrative evidence validates but is never headline-eligible", () => {
  const observation = validObservation({ state: EVIDENCE_STATE.ILLUSTRATIVE });
  const result = validateObservation(observation);
  assert.equal(result.ok, true);
  assert.equal(isHeadlineEligibleObservation(observation), false);
});

test("only verified and revised states can support a headline", () => {
  const eligible = [EVIDENCE_STATE.VERIFIED, EVIDENCE_STATE.REVISED];
  for (const state of Object.values(EVIDENCE_STATE)) {
    assert.equal(isHeadlineEligibleObservation(validObservation({ state })), eligible.includes(state));
  }
});

test("source declarations require licence, geography and expiry", () => {
  const source = {
    id: "ons-d7g7",
    provider: "ONS",
    cdid: "D7G7",
    datasetId: "MM23",
    sourceUrl: "https://www.ons.gov.uk/x/data",
    licence: "OGL v3.0",
    geography: GEOGRAPHY.UK,
    qualityClass: QUALITY_CLASS.ACCREDITED_OFFICIAL,
    unit: "%",
    hardExpiryDays: 120
  };
  assert.equal(validateSource(source).ok, true);
  assert.equal(validateSource({ ...source, licence: "" }).ok, false);
  assert.equal(validateSource({ ...source, geography: "MARS" }).ok, false);
  assert.equal(validateSource({ ...source, hardExpiryDays: 0 }).ok, false);
});

test("evidence objects require a hash, size and retrieval time", () => {
  const evidence = {
    key: "sources/ons-d7g7/2026-07-21/hash/d7g7-mm23.json",
    sha256: VALID_HASH,
    mime: "application/json",
    bytes: 121500,
    retrievedAt: "2026-08-01T00:00:00.000Z",
    sourceUrl: "https://www.ons.gov.uk/x/data"
  };
  assert.equal(validateEvidenceObject(evidence).ok, true);
  assert.equal(validateEvidenceObject({ ...evidence, bytes: 0 }).ok, false);
});

test("schema-v2 snapshots validate and malformed snapshots are rejected", () => {
  assert.equal(validateSnapshot(validSnapshot()).ok, true);
  assert.equal(validateSnapshot(validSnapshot({ schemaVersion: "1.0" })).ok, false);
  assert.equal(validateSnapshot(validSnapshot({ confidence: 0.8 })).ok, false);
  assert.equal(validateSnapshot(validSnapshot({ indicators: [] })).ok, false);
});
