/**
 * Canonical evidence shapes and runtime validation.
 *
 * Validation rejects incomplete provenance rather than coercing or silently
 * degrading it. Derived observations must identify every payload involved in
 * the calculation, not only their primary source.
 */

import {
  EVIDENCE_STATE,
  EVIDENCE_STATES,
  GEOGRAPHY_COVERAGE,
  QUALITY_FACTOR,
  isHeadlineEligibleState
} from "./states.js";
import { FREQUENCY } from "../../shared/period.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const FREQUENCIES = Object.values(FREQUENCY);

class Validator {
  constructor(subject) {
    this.subject = subject;
    this.errors = [];
    this.warnings = [];
  }

  require(condition, code, message) {
    if (!condition) this.errors.push({ code, message });
    return condition;
  }

  warn(condition, code, message) {
    if (!condition) this.warnings.push({ code, message });
    return condition;
  }

  result(value) {
    return {
      ok: this.errors.length === 0,
      subject: this.subject,
      errors: this.errors,
      warnings: this.warnings,
      value: this.errors.length === 0 ? value : null
    };
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateSource(source) {
  const v = new Validator("source");
  v.require(isNonEmptyString(source?.id), "source.id", "source id is required");
  v.require(isNonEmptyString(source?.provider), "source.provider", "provider is required");
  v.require(isNonEmptyString(source?.cdid), "source.cdid", "exact series identifier (cdid) is required");
  v.require(isNonEmptyString(source?.datasetId), "source.datasetId", "dataset identifier is required");
  v.require(isNonEmptyString(source?.sourceUrl), "source.sourceUrl", "source url is required");
  v.require(isNonEmptyString(source?.licence), "source.licence", "licence is required");
  v.require(
    GEOGRAPHY_COVERAGE[source?.geography] !== undefined,
    "source.geography",
    `geography must be one of ${Object.keys(GEOGRAPHY_COVERAGE).join(", ")}`
  );
  v.require(
    QUALITY_FACTOR[source?.qualityClass] !== undefined,
    "source.qualityClass",
    `quality class must be one of ${Object.keys(QUALITY_FACTOR).join(", ")}`
  );
  v.require(isNonEmptyString(source?.unit), "source.unit", "unit is required");
  v.require(
    isFiniteNumber(source?.hardExpiryDays) && source.hardExpiryDays > 0,
    "source.hardExpiryDays",
    "a positive hard-expiry window is required"
  );
  return v.result(source);
}

export function validateEvidenceObject(evidence) {
  const v = new Validator("evidence_object");
  v.require(isNonEmptyString(evidence?.key), "evidence.key", "object key is required");
  v.require(SHA256_HEX.test(evidence?.sha256 ?? ""), "evidence.sha256", "sha256 must be 64 lowercase hex characters");
  v.require(isNonEmptyString(evidence?.mime), "evidence.mime", "mime type is required");
  v.require(isFiniteNumber(evidence?.bytes) && evidence.bytes > 0, "evidence.bytes", "byte size must be positive");
  v.require(ISO_TIMESTAMP.test(evidence?.retrievedAt ?? ""), "evidence.retrievedAt", "retrievedAt must be an ISO timestamp");
  v.require(isNonEmptyString(evidence?.sourceUrl), "evidence.sourceUrl", "source url is required");
  return v.result(evidence);
}

export function validateObservation(observation) {
  const v = new Validator("observation");

  v.require(isNonEmptyString(observation?.indicatorId), "observation.indicatorId", "indicator id is required");
  v.require(isNonEmptyString(observation?.sourceId), "observation.sourceId", "source id is required");
  v.require(isNonEmptyString(observation?.cdid), "observation.cdid", "exact series identifier is required");
  v.require(isNonEmptyString(observation?.datasetId), "observation.datasetId", "dataset identifier is required");
  v.require(isFiniteNumber(observation?.rawValue), "observation.rawValue", "raw value must be finite; blanks must not be coerced to zero");
  v.require(isFiniteNumber(observation?.transformedValue), "observation.transformedValue", "transformed value must be finite");
  v.require(isNonEmptyString(observation?.rawUnit), "observation.rawUnit", "raw unit is required");
  v.require(isNonEmptyString(observation?.unit), "observation.unit", "unit is required");
  v.require(
    FREQUENCIES.includes(observation?.frequency),
    "observation.frequency",
    `frequency must be one of ${FREQUENCIES.join(", ")}`
  );
  v.require(
    GEOGRAPHY_COVERAGE[observation?.geography] !== undefined,
    "observation.geography",
    "geography must be a known coverage code"
  );

  v.require(ISO_DATE.test(observation?.periodStart ?? ""), "observation.periodStart", "reference period start is required");
  v.require(ISO_DATE.test(observation?.periodEnd ?? ""), "observation.periodEnd", "reference period end is required");
  if (ISO_DATE.test(observation?.periodStart ?? "") && ISO_DATE.test(observation?.periodEnd ?? "")) {
    v.require(observation.periodStart <= observation.periodEnd, "observation.period", "reference period start must not follow its end");
  }

  v.require(ISO_TIMESTAMP.test(observation?.publishedAt ?? ""), "observation.publishedAt", "source publication timestamp is required");
  v.require(ISO_TIMESTAMP.test(observation?.retrievedAt ?? ""), "observation.retrievedAt", "retrieval timestamp is required");
  v.require(isNonEmptyString(observation?.sourceUrl), "observation.sourceUrl", "source url is required");
  v.require(isNonEmptyString(observation?.licence), "observation.licence", "licence is required");
  v.require(SHA256_HEX.test(observation?.evidenceSha256 ?? ""), "observation.evidenceSha256", "primary evidence hash is required");
  v.require(isNonEmptyString(observation?.dependencyFingerprint), "observation.dependencyFingerprint", "dependency fingerprint is required");
  v.require(isNonEmptyString(observation?.parserVersion), "observation.parserVersion", "parser version is required");
  v.require(
    EVIDENCE_STATES.includes(observation?.state),
    "observation.state",
    `state must be one of ${EVIDENCE_STATES.join(", ")}`
  );

  if (observation?.denominator !== null && observation?.denominator !== undefined) {
    const denominator = observation.denominator;
    v.require(isNonEmptyString(denominator?.sourceId), "observation.denominator.sourceId", "denominator source id is required");
    v.require(isNonEmptyString(denominator?.cdid), "observation.denominator.cdid", "denominator cdid is required");
    v.require(isFiniteNumber(denominator?.value), "observation.denominator.value", "denominator value must be finite");
    v.require(SHA256_HEX.test(denominator?.evidenceSha256 ?? ""), "observation.denominator.evidenceSha256", "denominator evidence hash is required");
    v.require(ISO_DATE.test(denominator?.periodStart ?? ""), "observation.denominator.periodStart", "denominator period start is required");
    v.require(ISO_DATE.test(denominator?.periodEnd ?? ""), "observation.denominator.periodEnd", "denominator period end is required");
  }

  if (observation?.state === EVIDENCE_STATE.ILLUSTRATIVE) {
    v.warn(false, "observation.illustrative", "illustrative evidence cannot contribute to a verified headline");
  }

  return v.result(observation);
}

export function isHeadlineEligibleObservation(observation) {
  if (!observation) return false;
  if (!isHeadlineEligibleState(observation.state)) return false;
  if (!SHA256_HEX.test(observation.evidenceSha256 ?? "")) return false;
  return isFiniteNumber(observation.rawValue) && isFiniteNumber(observation.transformedValue);
}

/** Validates the actual schema-v2 materialised snapshot shape. */
export function validateSnapshot(snapshot) {
  const v = new Validator("snapshot");
  v.require(snapshot?.schemaVersion === "2.0", "snapshot.schemaVersion", "schema version 2.0 is required");
  v.require(isNonEmptyString(snapshot?.methodologyVersion), "snapshot.methodologyVersion", "methodology version is required");
  v.require(ISO_TIMESTAMP.test(snapshot?.asOf ?? ""), "snapshot.asOf", "asOf must be an ISO timestamp");
  v.require(ISO_TIMESTAMP.test(snapshot?.generatedAt ?? ""), "snapshot.generatedAt", "generatedAt must be an ISO timestamp");
  v.require(["published", "suppressed"].includes(snapshot?.publication?.status), "snapshot.publication.status", "publication status is invalid");
  v.require(isFiniteNumber(snapshot?.structural?.observedPressure), "snapshot.structural.observedPressure", "observed pressure is required");
  v.require(isFiniteNumber(snapshot?.structural?.availableWeight), "snapshot.structural.availableWeight", "available weight is required");
  v.require(isFiniteNumber(snapshot?.structural?.missingWeight), "snapshot.structural.missingWeight", "missing weight is required");
  v.require(isFiniteNumber(snapshot?.structural?.range?.low), "snapshot.structural.range.low", "range low is required");
  v.require(isFiniteNumber(snapshot?.structural?.range?.high), "snapshot.structural.range.high", "range high is required");
  v.require(isFiniteNumber(snapshot?.acute?.overlay), "snapshot.acute.overlay", "acute overlay is required");
  v.require(isFiniteNumber(snapshot?.confidence?.score), "snapshot.confidence.score", "confidence score is required");
  v.require(Array.isArray(snapshot?.indicators) && snapshot.indicators.length > 0, "snapshot.indicators", "indicator components are required");

  for (const [index, indicator] of (snapshot?.indicators ?? []).entries()) {
    v.require(isNonEmptyString(indicator?.id), `snapshot.indicators.${index}.id`, "indicator id is required");
    v.require(typeof indicator?.available === "boolean", `snapshot.indicators.${index}.available`, "indicator availability must be boolean");
    v.require(isFiniteNumber(indicator?.weight), `snapshot.indicators.${index}.weight`, "indicator weight is required");
    if (indicator?.available) {
      v.require(isFiniteNumber(indicator?.pressure), `snapshot.indicators.${index}.pressure`, "available indicator pressure is required");
      v.require(SHA256_HEX.test(indicator?.source?.evidenceSha256 ?? ""), `snapshot.indicators.${index}.source.evidenceSha256`, "available indicator evidence hash is required");
      v.require(isNonEmptyString(indicator?.source?.dependencyFingerprint), `snapshot.indicators.${index}.source.dependencyFingerprint`, "available indicator dependency fingerprint is required");
    }
  }

  return v.result(snapshot);
}
