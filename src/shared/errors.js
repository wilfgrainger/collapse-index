/**
 * Typed failure classes for the ingestion pipeline.
 *
 * Every failure must be attributable to a stage so that `ingestion_runs`
 * records why no observation was written. Failure classes are stable strings
 * because they are stored in D1 and surfaced on the evidence-health panel.
 */

export const FAILURE_CLASS = Object.freeze({
  TRANSPORT: "transport",
  HTTP_STATUS: "http_status",
  CONTENT_TYPE: "content_type",
  RESPONSE_TOO_LARGE: "response_too_large",
  DISALLOWED_HOST: "disallowed_host",
  PARSE: "parse",
  IDENTITY_MISMATCH: "identity_mismatch",
  VALIDATION: "validation",
  QUARANTINE: "quarantine",
  STORAGE: "storage"
});

export class CollectorError extends Error {
  constructor(failureClass, message, details = {}) {
    super(message);
    this.name = "CollectorError";
    this.failureClass = failureClass;
    this.details = details;
  }

  /** Safe representation: never leaks response bodies or secrets. */
  toSafeJSON() {
    return {
      failureClass: this.failureClass,
      message: this.message,
      details: this.details
    };
  }
}

export function isCollectorError(error) {
  return error instanceof CollectorError;
}

/** Normalises any thrown value into a safe, storable summary. */
export function toFailureSummary(error) {
  if (isCollectorError(error)) return error.toSafeJSON();
  return {
    failureClass: FAILURE_CLASS.TRANSPORT,
    message: error?.message ? String(error.message).slice(0, 500) : "unknown error",
    details: {}
  };
}
