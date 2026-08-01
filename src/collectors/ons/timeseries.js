/**
 * ONS time-series payload parser (WP4).
 *
 * The ONS `/data` endpoint returns one JSON document per series, containing
 * `years`, `quarters` and `months` arrays plus a `description` block carrying
 * the series identity and release metadata.
 *
 * Two rules matter more than anything else here:
 *
 *   1. Identity is asserted, not assumed. If the payload's CDID or dataset does
 *      not match what the collector declared, parsing fails. Silently scoring
 *      CPIH as CPI would be an invisible, systematic error.
 *   2. A blank cell is not zero. ONS leaves genuinely absent observations as
 *      empty strings, and the labour-disputes series contains 23 of them. A
 *      blank becomes a null point that is skipped, never a zero that would read
 *      as "no strikes this month".
 */

import { CollectorError, FAILURE_CLASS } from "../../shared/errors.js";
import { FREQUENCY, parseNextRelease, parseOnsPeriod } from "../../shared/period.js";

export const PARSER_VERSION = "ons-timeseries@1.0.0";

const FREQUENCY_ARRAY = Object.freeze({
  [FREQUENCY.ANNUAL]: "years",
  [FREQUENCY.QUARTERLY]: "quarters",
  [FREQUENCY.MONTHLY]: "months",
  [FREQUENCY.ROLLING_QUARTER]: "months"
});

function fail(failureClass, message, details) {
  throw new CollectorError(failureClass, message, details);
}

/**
 * Parses and validates an ONS time-series payload.
 *
 * @param {string} text raw response body (the same bytes that were hashed)
 * @param {object} expect declared identity: { cdid, datasetId, frequency }
 */
export function parseOnsTimeSeries(text, expect) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail(FAILURE_CLASS.PARSE, "response body is not valid JSON", { cdid: expect.cdid });
  }

  if (payload?.type !== "timeseries") {
    fail(FAILURE_CLASS.PARSE, `payload is not an ONS timeseries document (type=${payload?.type ?? "none"})`, {
      cdid: expect.cdid
    });
  }

  const description = payload.description;
  if (!description || typeof description !== "object") {
    fail(FAILURE_CLASS.PARSE, "payload has no description block", { cdid: expect.cdid });
  }

  // --- Identity assertions -------------------------------------------------
  const actualCdid = String(description.cdid ?? "").toUpperCase();
  const expectedCdid = String(expect.cdid ?? "").toUpperCase();
  if (actualCdid !== expectedCdid) {
    fail(FAILURE_CLASS.IDENTITY_MISMATCH, `series identity mismatch: expected ${expectedCdid}, payload declares ${actualCdid || "none"}`, {
      expected: expectedCdid,
      actual: actualCdid
    });
  }

  const actualDataset = String(description.datasetId ?? "").toUpperCase();
  const expectedDataset = String(expect.datasetId ?? "").toUpperCase();
  if (actualDataset !== expectedDataset) {
    fail(FAILURE_CLASS.IDENTITY_MISMATCH, `dataset mismatch: expected ${expectedDataset}, payload declares ${actualDataset || "none"}`, {
      expected: expectedDataset,
      actual: actualDataset
    });
  }

  if (!description.releaseDate) {
    fail(FAILURE_CLASS.VALIDATION, "payload has no release date", { cdid: expectedCdid });
  }

  // --- Frequency selection -------------------------------------------------
  const arrayName = FREQUENCY_ARRAY[expect.frequency];
  if (!arrayName) {
    fail(FAILURE_CLASS.VALIDATION, `unsupported declared frequency: ${expect.frequency}`, { cdid: expectedCdid });
  }

  const rows = Array.isArray(payload[arrayName]) ? payload[arrayName] : [];
  if (rows.length === 0) {
    // This is a real, load-bearing check: N3Y6 is published annually even
    // though the acquisition plan originally assumed quarterly.
    fail(FAILURE_CLASS.VALIDATION, `series ${expectedCdid} publishes no ${expect.frequency} observations`, {
      cdid: expectedCdid,
      requested: expect.frequency,
      availableCounts: {
        years: payload.years?.length ?? 0,
        quarters: payload.quarters?.length ?? 0,
        months: payload.months?.length ?? 0
      }
    });
  }

  // What the PAYLOAD says about itself — deliberately not mixed with what the
  // collector declared, so the two can be compared. Deriving this from the
  // declaration as well would make the guards below unreachable.
  const payloadSaysRolling =
    String(description.monthLabelStyle ?? "").toLowerCase() === "three month average";

  // Guard against a silent definitional change in either direction. If we
  // declared a plain monthly series and ONS starts publishing rolling averages
  // (or stops), every period we store would be misdated.
  if (expect.frequency === FREQUENCY.MONTHLY && payloadSaysRolling) {
    fail(FAILURE_CLASS.QUARANTINE, `${expectedCdid} now publishes three-month averages but is declared monthly`, {
      cdid: expectedCdid
    });
  }
  if (expect.frequency === FREQUENCY.ROLLING_QUARTER && !payloadSaysRolling) {
    fail(FAILURE_CLASS.QUARANTINE, `${expectedCdid} is declared as a rolling quarter but no longer labels itself as one`, {
      cdid: expectedCdid
    });
  }

  const rollingThreeMonth = payloadSaysRolling;

  const points = [];
  let blankCount = 0;

  for (const row of rows) {
    const rawValue = row?.value;
    const isBlank = rawValue === "" || rawValue === null || rawValue === undefined;

    if (isBlank) {
      blankCount += 1;
      continue; // never coerced to zero
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      fail(FAILURE_CLASS.PARSE, `non-numeric value in ${expectedCdid} at ${row?.date}`, {
        cdid: expectedCdid,
        date: row?.date
      });
    }

    let period;
    try {
      period = parseOnsPeriod(row.date, { rollingThreeMonth });
    } catch (error) {
      fail(FAILURE_CLASS.PARSE, error.message, { cdid: expectedCdid, date: row?.date });
    }

    points.push({
      value,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      displayLabel: row.label ?? period.label,
      frequency: period.frequency,
      updateDate: row.updateDate ?? null
    });
  }

  if (points.length === 0) {
    fail(FAILURE_CLASS.VALIDATION, `series ${expectedCdid} contains no usable observations`, { cdid: expectedCdid });
  }

  // Chronological order; ONS is already sorted but we must not rely on it.
  points.sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));

  return {
    meta: {
      cdid: actualCdid,
      datasetId: actualDataset,
      title: String(description.title ?? ""),
      unit: String(description.unit ?? ""),
      preUnit: String(description.preUnit ?? ""),
      releaseDate: description.releaseDate,
      nextRelease: description.nextRelease ?? null,
      expectedNextRelease: parseNextRelease(description.nextRelease),
      headlineDate: description.date ?? null,
      headlineValue: description.number ?? null,
      uri: payload.uri ?? null,
      rollingThreeMonth,
      alerts: Array.isArray(payload.alerts) ? payload.alerts : []
    },
    points,
    blankCount,
    parserVersion: PARSER_VERSION
  };
}

/** Latest point, and the one before it, for revision and change detection. */
export function latestPoints(parsed) {
  return {
    latest: parsed.points.at(-1) ?? null,
    previous: parsed.points.at(-2) ?? null
  };
}
