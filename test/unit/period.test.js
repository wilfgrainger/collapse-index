import test from "node:test";
import assert from "node:assert/strict";

import { FREQUENCY, dateInTimeZone, daysBetween, parseNextRelease, parseOnsPeriod } from "../../src/shared/period.js";

test("annual labels become whole-year intervals", () => {
  assert.deepEqual(parseOnsPeriod("2025"), {
    frequency: FREQUENCY.ANNUAL,
    start: "2025-01-01",
    end: "2025-12-31",
    label: "2025"
  });
});

test("quarterly labels become three-month intervals", () => {
  assert.deepEqual(parseOnsPeriod("2026 Q2"), {
    frequency: FREQUENCY.QUARTERLY,
    start: "2026-04-01",
    end: "2026-06-30",
    label: "2026 Q2"
  });
});

test("monthly labels respect month length", () => {
  assert.equal(parseOnsPeriod("2026 JUN").end, "2026-06-30");
  assert.equal(parseOnsPeriod("2026 JUL").end, "2026-07-31");
  assert.equal(parseOnsPeriod("2024 FEB").end, "2024-02-29");
  assert.equal(parseOnsPeriod("2026 FEB").end, "2026-02-28");
});

test("a rolling three-month point covers the month either side of its label", () => {
  const period = parseOnsPeriod("2026 APR", { rollingThreeMonth: true });
  assert.equal(period.frequency, FREQUENCY.ROLLING_QUARTER);
  assert.equal(period.start, "2026-03-01");
  assert.equal(period.end, "2026-05-31");
});

test("rolling periods cross year boundaries correctly", () => {
  assert.deepEqual(
    parseOnsPeriod("2026 JAN", { rollingThreeMonth: true }),
    { frequency: FREQUENCY.ROLLING_QUARTER, start: "2025-12-01", end: "2026-02-28", label: "2026 JAN" }
  );
  assert.deepEqual(
    parseOnsPeriod("2025 DEC", { rollingThreeMonth: true }),
    { frequency: FREQUENCY.ROLLING_QUARTER, start: "2025-11-01", end: "2026-01-31", label: "2025 DEC" }
  );
});

test("unrecognised period labels throw rather than guess", () => {
  assert.throws(() => parseOnsPeriod("2026 XYZ"), /unrecognised/);
  assert.throws(() => parseOnsPeriod(""), /empty/);
  assert.throws(() => parseOnsPeriod("June 2026"), /unrecognised/);
});

test("next-release text is parsed, and placeholders return null", () => {
  assert.equal(parseNextRelease("19 August 2026"), "2026-08-19");
  assert.equal(parseNextRelease("18 August  2026"), "2026-08-18");
  assert.equal(parseNextRelease("To be announced"), null);
  assert.equal(parseNextRelease(null), null);
});

test("ONS midnight timestamps resolve to the UK publication date", () => {
  assert.equal(dateInTimeZone("2026-07-21T23:00:00.000Z"), "2026-07-22");
  assert.equal(dateInTimeZone("2026-01-20T00:00:00.000Z"), "2026-01-20");
  assert.equal(dateInTimeZone("not-a-date"), null);
});

test("daysBetween is signed and whole", () => {
  assert.equal(daysBetween("2026-08-01", "2026-08-19"), 18);
  assert.equal(daysBetween("2026-08-19", "2026-08-01"), -18);
  assert.equal(daysBetween("2026-08-01", "2026-08-01"), 0);
});
