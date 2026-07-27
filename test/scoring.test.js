import test from "node:test";
import assert from "node:assert/strict";
import { INDICATORS } from "../src/config.js";
import { calculateIndex, eventContribution, freshnessConfidence, getLevel, interpolateScore } from "../src/scoring.js";
import { PROTOTYPE_OBSERVATIONS } from "../src/demo.js";

test("piecewise interpolation is exact at breakpoints", () => {
  const inflation = INDICATORS.find((indicator) => indicator.id === "inflation_cpi");
  assert.equal(interpolateScore(2, inflation.breakpoints), 15);
  assert.equal(interpolateScore(7, inflation.breakpoints), 75);
});

test("piecewise interpolation handles descending score direction", () => {
  const trust = INDICATORS.find((indicator) => indicator.id === "trust_in_government");
  assert.equal(interpolateScore(10, trust.breakpoints), 100);
  assert.equal(interpolateScore(55, trust.breakpoints), 0);
  assert.equal(interpolateScore(35, trust.breakpoints), 37.5);
});

test("freshness confidence decays but never below the stale floor", () => {
  const asOf = "2026-07-27T00:00:00.000Z";
  assert.equal(freshnessConfidence("2026-07-17T00:00:00.000Z", asOf, 10), 1);
  assert.equal(freshnessConfidence("2026-07-07T00:00:00.000Z", asOf, 10), 0.8);
  assert.equal(freshnessConfidence("2025-01-01T00:00:00.000Z", asOf, 10), 0.35);
});

test("unapproved events never change the score", () => {
  const event = {
    occurredAt: "2026-07-27T00:00:00.000Z",
    severity: 5,
    confidence: 1,
    halfLifeHours: 72,
    reviewStatus: "draft"
  };
  assert.equal(eventContribution(event, "2026-07-27T00:00:00.000Z"), 0);
});

test("approved events decay by half after one half-life", () => {
  const event = {
    occurredAt: "2026-07-24T00:00:00.000Z",
    severity: 5,
    confidence: 1,
    halfLifeHours: 72,
    reviewStatus: "approved"
  };
  assert.equal(eventContribution(event, "2026-07-27T00:00:00.000Z"), 1);
});

test("prototype index is bounded and exposes every indicator", () => {
  const result = calculateIndex({
    definitions: INDICATORS,
    observations: PROTOTYPE_OBSERVATIONS,
    events: [],
    asOf: "2026-07-27T12:00:00.000Z",
    version: "test",
    mode: "prototype"
  });
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.indicators.length, 10);
  assert.equal(result.dataQuality.available, 10);
  assert.equal(result.eventOverlay, 0);
  assert.equal(result.methodologyVersion, "test");
});

test("level boundaries are deterministic", () => {
  assert.equal(getLevel(24.9).id, "stable");
  assert.equal(getLevel(25).id, "guarded");
  assert.equal(getLevel(55).id, "severe");
  assert.equal(getLevel(100).id, "emergency");
});
