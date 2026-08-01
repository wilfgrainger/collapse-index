import test from "node:test";
import assert from "node:assert/strict";

import { CPI_TWO_SIDED_BREAKPOINTS, applyCurve, clamp, round } from "../../src/domain/methodology/curves.js";
import { INDICATORS } from "../../src/domain/methodology/v1.js";

test("curve interpolates linearly between breakpoints", () => {
  const curve = [{ value: 0, score: 0 }, { value: 10, score: 100 }];
  assert.equal(applyCurve(0, curve), 0);
  assert.equal(applyCurve(5, curve), 50);
  assert.equal(applyCurve(10, curve), 100);
});

test("curve clamps outside its declared range", () => {
  const curve = [{ value: 0, score: 10 }, { value: 10, score: 90 }];
  assert.equal(applyCurve(-50, curve), 10);
  assert.equal(applyCurve(500, curve), 90);
});

test("non-finite input yields null rather than a score", () => {
  const curve = [{ value: 0, score: 0 }, { value: 1, score: 1 }];
  // Infinity is rejected rather than clamped: a non-finite value means the
  // upstream transformation went wrong, and clamping it would hide that.
  for (const bad of [Number.NaN, Infinity, -Infinity, null, undefined, "2"]) {
    assert.equal(applyCurve(bad, curve), null, `accepted ${String(bad)}`);
  }
});

test("a curve needs at least two breakpoints", () => {
  assert.throws(() => applyCurve(1, [{ value: 0, score: 0 }]), /two breakpoints/);
});

test("inflation pressure is two-sided around the target", () => {
  const at = (value) => applyCurve(value, CPI_TWO_SIDED_BREAKPOINTS);

  // The trough sits at the 2% target.
  assert.equal(at(2), 5);

  // High inflation rises.
  assert.ok(at(5) > at(3), "5% is worse than 3%");
  assert.ok(at(10) > at(5), "10% is worse than 5%");

  // Deflation also rises — the property the prototype got wrong.
  assert.ok(at(-2) > at(0), "sustained deflation scores above zero inflation");
  assert.ok(at(-4) > at(-2), "deeper deflation is worse");

  // ...but less sharply than equivalent high inflation.
  const deflationSide = at(2 - 6);
  const inflationSide = at(2 + 6);
  assert.ok(inflationSide > deflationSide, "8% inflation outscores 4% deflation at equal distance");
});

test("every indicator curve is well-formed and yields scores in range", () => {
  for (const indicator of INDICATORS) {
    assert.ok(indicator.breakpoints.length >= 2, `${indicator.id} needs breakpoints`);

    for (const breakpoint of indicator.breakpoints) {
      assert.ok(Number.isFinite(breakpoint.value), `${indicator.id} breakpoint value must be finite`);
      assert.ok(
        breakpoint.score >= 0 && breakpoint.score <= 100,
        `${indicator.id} breakpoint score must be 0-100`
      );
    }

    const values = indicator.breakpoints.map((b) => b.value);
    assert.equal(new Set(values).size, values.length, `${indicator.id} has duplicate breakpoint values`);

    for (const value of [-1000, 0, 1000]) {
      const score = applyCurve(value, indicator.breakpoints);
      assert.ok(score >= 0 && score <= 100, `${indicator.id} produced an out-of-range score`);
    }
  }
});

test("monotonic indicators move in their declared direction", () => {
  for (const indicator of INDICATORS) {
    if (indicator.direction === "two-sided") continue;

    const sorted = [...indicator.breakpoints].sort((a, b) => a.value - b.value);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (indicator.direction === "higher-is-worse") {
        assert.ok(
          sorted[i + 1].score >= sorted[i].score,
          `${indicator.id} is higher-is-worse but score falls at ${sorted[i + 1].value}`
        );
      } else {
        assert.ok(
          sorted[i + 1].score <= sorted[i].score,
          `${indicator.id} is lower-is-worse but score rises at ${sorted[i + 1].value}`
        );
      }
    }
  }
});

test("clamp and round behave predictably", () => {
  assert.equal(clamp(150), 100);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(9.55, 1), 9.6);
  assert.equal(round(-1.25, 1), -1.2);
  // Rounding is presentational only. It is applied to outputs, never fed back
  // into a calculation, so ordinary binary-float edge cases cannot accumulate.
  assert.equal(round(0.1 + 0.2, 1), 0.3);
});
