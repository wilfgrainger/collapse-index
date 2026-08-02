import test from "node:test";
import assert from "node:assert/strict";

import { boundedInteger, csvCell, toCsv } from "../../src/web/csv.js";

test("CSV cells escape quotes and preserve numeric values", () => {
  assert.equal(csvCell(12.5), "12.5");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell('ONS "headline"'), '"ONS ""headline"""');
});

test("CSV strings neutralise spreadsheet formula injection", () => {
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")", "\n=1+1"]) {
    assert.match(csvCell(value), /^"'/, JSON.stringify(value));
  }
  assert.equal(csvCell(-2.5), "-2.5", "real numeric values remain numeric");
});

test("CSV output is deterministic, labelled and spreadsheet compatible", () => {
  const csv = toCsv(
    [{ key: "id", label: "Indicator" }, { key: "value", label: "Value" }],
    [{ id: "cpi_inflation", value: 2.6 }]
  );

  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv, '\uFEFF"Indicator","Value"\r\n"cpi_inflation",2.6\r\n');
});

test("boundedInteger applies defaults, strict parsing and hard limits", () => {
  assert.equal(boundedInteger(undefined, 365), 365);
  assert.equal(boundedInteger("0", 365), 1);
  assert.equal(boundedInteger("-4", 365), 1);
  assert.equal(boundedInteger("9999", 365, { max: 500 }), 500);
  assert.equal(boundedInteger("20", 365), 20);
  assert.equal(boundedInteger("20abc", 365), 365);
  assert.equal(boundedInteger("1.5", 365), 365);
});
