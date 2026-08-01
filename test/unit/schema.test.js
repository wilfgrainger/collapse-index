import test from "node:test";
import assert from "node:assert/strict";

import {
  isHeadlineEligibleObservation,
  validateEvidenceObject,
  validateObservation,
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
    parserVersion: "ons-timeseries@1.0.0",
    state: EVIDENCE_STATE.VERIFIED,
    ...overrides
  };
}

test("a complete observation validates", () => {
  const result = validateObservation(validObservation());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("an observation cannot exist without an evidence hash", () => {
  for (const bad of [undefined, "", "not-a-hash", "A".repeat(64), "a".repeat(63)]) {
    const result = validateObservation(validObservation({ evidenceSha256: bad }));
    assert.equal(result.ok, false, `accepted hash: ${bad}`);
    assert.ok(result.errors.some((e) => e.code === "observation.evidenceSha256"));
  }
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

test("a blank value is rejected rather than coerced to zero", () => {
  for (const bad of [null, undefined, "", "n/a", Number.NaN]) {
    const result = validateObservation(validObservation({ rawValue: bad }));
    assert.equal(result.ok, false, `accepted raw value: ${String(bad)}`);
  }
  // Zero itself is a legitimate measurement and must still pass.
  assert.equal(validateObservation(validObservation({ rawValue: 0 })).ok, true);
});

test("unknown units, states, geographies and frequencies are rejected", () => {
  assert.equal(validateObservation(validObservation({ unit: "" })).ok, false);
  assert.equal(validateObservation(validObservation({ state: "probably-fine" })).ok, false);
  assert.equal(validateObservation(validObservation({ geography: "EUROPE" })).ok, false);
  assert.equal(validateObservation(validObservation({ frequency: "fortnightly" })).ok, false);
});

test("exact source identity is required", () => {
  assert.equal(validateObservation(validObservation({ cdid: "" })).ok, false);
  assert.equal(validateObservation(validObservation({ sourceId: undefined })).ok, false);
  assert.equal(validateObservation(validObservation({ licence: "" })).ok, false);
});

test("illustrative evidence validates but warns and is never headline-eligible", () => {
  const observation = validObservation({ state: EVIDENCE_STATE.ILLUSTRATIVE });
  const result = validateObservation(observation);

  assert.equal(result.ok, true, "structurally valid");
  assert.ok(result.warnings.some((w) => w.code === "observation.illustrative"));
  assert.equal(isHeadlineEligibleObservation(observation), false);
});

test("only verified and revised states can support a headline", () => {
  const eligible = [EVIDENCE_STATE.VERIFIED, EVIDENCE_STATE.REVISED];
  for (const state of Object.values(EVIDENCE_STATE)) {
    assert.equal(
      isHeadlineEligibleObservation(validObservation({ state })),
      eligible.includes(state),
      `state ${state}`
    );
  }
});

test("headline eligibility also requires a real hash and a finite value", () => {
  assert.equal(isHeadlineEligibleObservation(validObservation({ evidenceSha256: "nope" })), false);
  assert.equal(isHeadlineEligibleObservation(validObservation({ rawValue: null })), false);
  assert.equal(isHeadlineEligibleObservation(null), false);
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
  assert.equal(validateSource({ ...source, qualityClass: "vibes" }).ok, false);
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
  assert.equal(validateEvidenceObject({ ...evidence, sha256: "short" }).ok, false);
  assert.equal(validateEvidenceObject({ ...evidence, retrievedAt: "2026-08-01" }).ok, false);
});
