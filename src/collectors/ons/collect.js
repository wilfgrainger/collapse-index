/**
 * Builds canonical observations from parsed ONS payloads.
 *
 * A derived observation carries every evidence dependency that can change its
 * value. This matters for idempotency: a revised denominator is a material
 * change even when the numerator payload is byte-for-byte identical.
 */

import { parseOnsTimeSeries, latestPoints, PARSER_VERSION } from "./timeseries.js";
import { deriveDaysLostPer1000, selectDenominatorPoint } from "./registry.js";
import { EVIDENCE_STATE } from "../../domain/evidence/states.js";
import { validateObservation } from "../../domain/evidence/schema.js";
import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";

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

export function parseForSource(source, text) {
  const parsed = parseOnsTimeSeries(text, {
    cdid: source.cdid,
    datasetId: source.datasetId,
    frequency: source.frequency
  });
  assertExpectedUnit(source, parsed.meta);
  return parsed;
}

/** Stable identity of every payload involved in one observation. */
export function buildDependencyFingerprint(primaryEvidence, denominator = null) {
  const parts = [`primary:${primaryEvidence?.sha256 ?? "missing"}`];
  if (denominator) {
    parts.push(`denominator:${denominator.evidence?.sha256 ?? "missing"}`);
  }
  return parts.join("|");
}

/**
 * Builds the canonical observation for a source's latest usable point.
 * `previousObservation` is used only to classify a same-period replacement as
 * revised; a later period remains verified and merely supersedes the old latest.
 */
export function buildObservation({
  source,
  parsed,
  evidence,
  denominator = null,
  previousObservation = null
}) {
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
    dependencyFingerprint: buildDependencyFingerprint(evidence, denominator),
    evidenceKey: evidence.key ?? null,
    parserVersion: PARSER_VERSION,
    state:
      previousObservation?.periodEnd === latest.periodEnd
        ? EVIDENCE_STATE.REVISED
        : EVIDENCE_STATE.VERIFIED,
    notes: source.notes ?? null,
    previousPoint: previous
      ? { value: previous.value, periodLabel: previous.periodLabel, periodEnd: previous.periodEnd }
      : null,
    blankCount: parsed.blankCount,
    seriesPointCount: parsed.points.length,
    denominator: null
  };

  if (source.requiresDenominator) {
    if (!denominator?.parsed || !denominator?.evidence?.sha256) {
      throw new CollectorError(
        FAILURE_CLASS.VALIDATION,
        `${source.cdid} requires denominator ${source.requiresDenominator} with archived evidence`,
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
      evidenceSha256: denominator.evidence.sha256,
      exactPeriodMatch:
        denominatorPoint.periodStart <= latest.periodEnd &&
        denominatorPoint.periodEnd >= latest.periodEnd
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

/** Detects any change that can alter the measured fact or its provenance. */
export function isMaterialChange(previous, next) {
  if (!previous) return true;
  return (
    previous.dependencyFingerprint !== next.dependencyFingerprint ||
    previous.periodEnd !== next.periodEnd ||
    Number(previous.transformedValue) !== Number(next.transformedValue) ||
    previous.publishedAt !== next.publishedAt
  );
}
