/**
 * Canonical evidence shapes and runtime validation (WP1).
 *
 * Validation here is deliberately strict and dependency-free. The rule the
 * whole product rests on is encoded in `validateObservation`: an observation
 * cannot exist without exact source identity, an explicit reference period and
 * an evidence hash. Anything less is rejected rather than downgraded, because a
 * silently weakened observation is worse than a missing one.
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
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
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

/**
 * Validates a source declaration — the static identity of an upstream series.
 */
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

/**
 * Validates an archived evidence object: the bytes an observation came from.
 */
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

/**
 * Validates a canonical observation.
 *
 * Rejection, not coercion, is the point of this function.
 */
export function validateObservation(observation) {
  const v = new Validator("observation");

  v.require(isNonEmptyString(observation?.indicatorId), "observation.indicatorId", "indicator id is required");
  v.require(isNonEmptyString(observation?.sourceId), "observation.sourceId", "source id is required");
  v.require(isNonEmptyString(observation?.cdid), "observation.cdid", "exact series identifier is required");

  // A blank source cell is not zero. `null` is a legal raw value only when the
  // observation is explicitly recorded as unavailable rather than measured.
  const hasValue = isFiniteNumber(observation?.rawValue);
  v.require(hasValue, "observation.rawValue", "raw value must be a finite number; blanks must not be coerced to zero");

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
    v.require(
      observation.periodStart <= observation.periodEnd,
      "observation.period",
      "reference period start must not follow its end"
    );
  }

  v.require(ISO_TIMESTAMP.test(observation?.publishedAt ?? ""), "observation.publishedAt", "source publication timestamp is required");
  v.require(ISO_TIMESTAMP.test(observation?.retrievedAt ?? ""), "observation.retrievedAt", "retrieval timestamp is required");
  v.require(isNonEmptyString(observation?.sourceUrl), "observation.sourceUrl", "source url is required");
  v.require(isNonEmptyString(observation?.licence), "observation.licence", "licence is required");
  v.require(
    SHA256_HEX.test(observation?.evidenceSha256 ?? ""),
    "observation.evidenceSha256",
    "an observation cannot exist without the hash of the evidence it came from"
  );
  v.require(isNonEmptyString(observation?.parserVersion), "observation.parserVersion", "parser version is required");
  v.require(
    EVIDENCE_STATES.includes(observation?.state),
    "observation.state",
    `state must be one of ${EVIDENCE_STATES.join(", ")}`
  );

  // An illustrative observation is legal, but it must never claim verification.
  if (observation?.state === EVIDENCE_STATE.ILLUSTRATIVE) {
    v.warn(false, "observation.illustrative", "illustrative evidence cannot contribute to a verified headline");
  }

  return v.result(observation);
}

/**
 * Guards headline eligibility at the point of use.
 *
 * Called by the scoring layer so that an illustrative or withdrawn observation
 * cannot reach a verified score even if it passed structural validation.
 */
export function isHeadlineEligibleObservation(observation) {
  if (!observation) return false;
  if (!isHeadlineEligibleState(observation.state)) return false;
  if (!SHA256_HEX.test(observation.evidenceSha256 ?? "")) return false;
  return isFiniteNumber(observation.rawValue);
}

/** Validates a materialised snapshot before it is written or served. */
export function validateSnapshot(snapshot) {
  const v = new Validator("snapshot");
  v.require(isNonEmptyString(snapshot?.methodologyVersion), "snapshot.methodologyVersion", "methodology version is required");
  v.require(ISO_TIMESTAMP.test(snapshot?.generatedAt ?? ""), "snapshot.generatedAt", "generatedAt must be an ISO timestamp");
  v.require(isFiniteNumber(snapshot?.structuralScore), "snapshot.structuralScore", "structural score is required");
  v.require(isFiniteNumber(snapshot?.confidence), "snapshot.confidence", "confidence is required");
  v.require(Array.isArray(snapshot?.components), "snapshot.components", "component lineage is required");
  return v.result(snapshot);
}
