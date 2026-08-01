/**
 * Builds canonical observations from parsed ONS payloads (WP5).
 *
 * This is the boundary where a source-shaped record becomes a
 * methodology-shaped one. Everything needed to reproduce or challenge the
 * number travels with it: exact series, reference period, publication date,
 * evidence hash, parser version and — where a value is derived — the
 * denominator vintage used.
 */

import { parseOnsTimeSeries, latestPoints, PARSER_VERSION } from "./timeseries.js";
import { deriveDaysLostPer1000, selectDenominatorPoint } from "./registry.js";
import { EVIDENCE_STATE } from "../../domain/evidence/states.js";
import { validateObservation } from "../../domain/evidence/schema.js";
import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";

/**
 * Checks the payload's declared unit against the collector's expectation.
 * A unit change is a definitional change and must quarantine the release.
 */
function assertExpectedUnit(source, meta) {
  const expected = String(source.expectedUnit ?? "").trim().toLowerCase();
  if (!expected) return;
  const actual = String(meta.unit ?? "").trim().toLowerCase();
  if (actual !== expected) {
    throw new CollectorError(
      FAILURE_CLASS.QUARANTINE,
      `unit changed for ${source.cdid}: expected "${source.expectedUnit}", payload declares "${meta.unit}"`,
      { sourceId: source.id, expected: source.expectedUnit, actual: meta.unit }
    );
  }
}

/**
 * Parses a payload for one source and returns its parsed series plus metadata.
 */
export function parseForSource(source, text) {
  const parsed = parseOnsTimeSeries(text, {
    cdid: source.cdid,
    datasetId: source.datasetId,
    frequency: source.frequency
  });
  assertExpectedUnit(source, parsed.meta);
  return parsed;
}

/**
 * Builds the canonical observation for a source's latest usable point.
 *
 * @param {object} input
 * @param {object} input.source registry declaration
 * @param {object} input.parsed output of parseForSource
 * @param {object} input.evidence { sha256, retrievedAt, key }
 * @param {object} [input.denominator] { source, parsed } when a derived value is required
 */
export function buildObservation({ source, parsed, evidence, denominator = null }) {
  const { latest, previous } = latestPoints(parsed);
  if (!latest) {
    throw new CollectorError(FAILURE_CLASS.VALIDATION, `no usable observation for ${source.cdid}`, { sourceId: source.id });
  }

  const observation = {
    indicatorId: source.indicatorId,
    sourceId: source.id,
    cdid: parsed.meta.cdid,
    datasetId: parsed.meta.datasetId,

    rawValue: latest.value,
    rawUnit: source.unit,
    transformedValue: latest.value,
    unit: source.unit,

    frequency: latest.frequency,
    geography: source.geography,
    seasonalAdjustment: source.seasonalAdjustment,

    periodStart: latest.periodStart,
    periodEnd: latest.periodEnd,
    periodLabel: latest.periodLabel,

    publishedAt: parsed.meta.releaseDate,
    expectedNextRelease: parsed.meta.expectedNextRelease,
    retrievedAt: evidence.retrievedAt,

    sourceUrl: source.sourceUrl,
    licence: source.licence,
    evidenceSha256: evidence.sha256,
    evidenceKey: evidence.key ?? null,
    parserVersion: PARSER_VERSION,

    state: EVIDENCE_STATE.VERIFIED,
    notes: source.notes ?? null,

    // Retained for revision detection and sparklines.
    previousPoint: previous ? { value: previous.value, periodLabel: previous.periodLabel, periodEnd: previous.periodEnd } : null,
    blankCount: parsed.blankCount,
    seriesPointCount: parsed.points.length,
    denominator: null
  };

  // --- Derived values ------------------------------------------------------
  if (source.requiresDenominator) {
    if (!denominator?.parsed) {
      throw new CollectorError(
        FAILURE_CLASS.VALIDATION,
        `${source.cdid} requires denominator ${source.requiresDenominator} but none was supplied`,
        { sourceId: source.id }
      );
    }

    const denominatorPoint = selectDenominatorPoint(denominator.parsed.points, latest.periodEnd);
    if (!denominatorPoint) {
      throw new CollectorError(FAILURE_CLASS.VALIDATION, `no denominator point available for ${latest.periodLabel}`, {
        sourceId: source.id
      });
    }

    const derived = deriveDaysLostPer1000(latest.value, denominatorPoint.value);
    if (derived === null) {
      throw new CollectorError(FAILURE_CLASS.VALIDATION, "denominator produced a non-finite derived value", {
        sourceId: source.id
      });
    }

    observation.transformedValue = derived;
    observation.unit = "working days lost per 1,000 employed people per month";
    observation.denominator = {
      sourceId: denominator.source.id,
      cdid: denominator.parsed.meta.cdid,
      value: denominatorPoint.value,
      unit: denominator.source.unit,
      periodStart: denominatorPoint.periodStart,
      periodEnd: denominatorPoint.periodEnd,
      periodLabel: denominatorPoint.periodLabel,
      publishedAt: denominator.parsed.meta.releaseDate,
      evidenceSha256: denominator.evidence?.sha256 ?? null,
      exactPeriodMatch: denominatorPoint.periodStart <= latest.periodEnd && denominatorPoint.periodEnd >= latest.periodEnd
    };
  }

  const validation = validateObservation(observation);
  if (!validation.ok) {
    throw new CollectorError(FAILURE_CLASS.VALIDATION, `observation failed validation for ${source.cdid}`, {
      sourceId: source.id,
      errors: validation.errors
    });
  }

  return { observation, validation };
}

/**
 * Detects whether a newly built observation materially differs from the stored
 * one. Used so a daily run with unchanged evidence creates no new snapshot.
 */
export function isMaterialChange(previous, next) {
  if (!previous) return true;
  return (
    previous.evidenceSha256 !== next.evidenceSha256 ||
    previous.periodEnd !== next.periodEnd ||
    Number(previous.transformedValue) !== Number(next.transformedValue) ||
    previous.publishedAt !== next.publishedAt
  );
}
