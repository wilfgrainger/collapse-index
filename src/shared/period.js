/**
 * ONS reference-period parsing.
 *
 * ONS time series label points as `2025`, `2026 Q2` or `2026 JUN`. A period
 * label is not a date: it is an interval, and the interval is what the
 * methodology carries forward and displays. Labour Force Survey series add a
 * further complication — a point labelled `2026 APR` is really the rolling
 * three-month average for March to May, which the payload signals through
 * `description.monthLabelStyle`.
 *
 * Getting this wrong would silently misdate every labour-market observation,
 * so rolling periods are represented by their true start and end.
 */

const MONTH_INDEX = Object.freeze({
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
});

const QUARTER_START_MONTH = Object.freeze({ Q1: 0, Q2: 3, Q3: 6, Q4: 9 });

export const FREQUENCY = Object.freeze({
  ANNUAL: "annual",
  QUARTERLY: "quarterly",
  MONTHLY: "monthly",
  ROLLING_QUARTER: "rolling-quarter"
});

function iso(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Parses an ONS period label into an explicit interval.
 *
 * @param {string} label e.g. "2025", "2026 Q2", "2026 JUN"
 * @param {{ rollingThreeMonth?: boolean }} options
 * @returns {{ frequency: string, start: string, end: string, label: string }}
 */
export function parseOnsPeriod(label, options = {}) {
  const raw = String(label ?? "").trim().toUpperCase();
  if (!raw) throw new Error("empty ONS period label");

  // Annual: "2025"
  const annual = /^(\d{4})$/.exec(raw);
  if (annual) {
    const year = Number(annual[1]);
    return {
      frequency: FREQUENCY.ANNUAL,
      start: iso(year, 0, 1),
      end: iso(year, 11, 31),
      label: annual[1]
    };
  }

  // Quarterly: "2026 Q2"
  const quarterly = /^(\d{4})\s+(Q[1-4])$/.exec(raw);
  if (quarterly) {
    const year = Number(quarterly[1]);
    const startMonth = QUARTER_START_MONTH[quarterly[2]];
    const endMonth = startMonth + 2;
    return {
      frequency: FREQUENCY.QUARTERLY,
      start: iso(year, startMonth, 1),
      end: iso(year, endMonth, lastDayOfMonth(year, endMonth)),
      label: `${quarterly[1]} ${quarterly[2]}`
    };
  }

  // Monthly: "2026 JUN"
  const monthly = /^(\d{4})\s+([A-Z]{3})$/.exec(raw);
  if (monthly) {
    const year = Number(monthly[1]);
    const monthIndex = MONTH_INDEX[monthly[2]];
    if (monthIndex === undefined) throw new Error(`unrecognised ONS month: ${label}`);

    if (options.rollingThreeMonth) {
      // A point labelled `2026 APR` covers March to May inclusive.
      const start = new Date(Date.UTC(year, monthIndex - 1, 1));
      const endMonth = new Date(Date.UTC(year, monthIndex + 1, 1));
      const endYear = endMonth.getUTCFullYear();
      const endMonthIndex = endMonth.getUTCMonth();
      return {
        frequency: FREQUENCY.ROLLING_QUARTER,
        start: iso(start.getUTCFullYear(), start.getUTCMonth(), 1),
        end: iso(endYear, endMonthIndex, lastDayOfMonth(endYear, endMonthIndex)),
        label: `${monthly[1]} ${monthly[2]}`
      };
    }

    return {
      frequency: FREQUENCY.MONTHLY,
      start: iso(year, monthIndex, 1),
      end: iso(year, monthIndex, lastDayOfMonth(year, monthIndex)),
      label: `${monthly[1]} ${monthly[2]}`
    };
  }

  throw new Error(`unrecognised ONS period label: ${label}`);
}

/**
 * Parses the free-text `nextRelease` field ONS returns, e.g. "19 August 2026".
 * Returns null when ONS gives a non-date placeholder such as "To be announced",
 * which must not be mistaken for "no release expected".
 */
export function parseNextRelease(text) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw);
  if (!match) return null;

  const monthKey = match[2].slice(0, 3).toUpperCase();
  const monthIndex = MONTH_INDEX[monthKey];
  if (monthIndex === undefined) return null;

  return iso(Number(match[3]), monthIndex, Number(match[1]));
}

/** Whole days between two ISO dates; negative when `to` precedes `from`. */
export function daysBetween(from, to) {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.floor((b - a) / 86_400_000);
}
