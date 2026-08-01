/**
 * Pressure transformations (docs/METHODOLOGY_V1_DESIGN.md §4).
 *
 * Every indicator is mapped onto a 0–100 pressure scale by a transparent,
 * frozen, piecewise-linear curve. 0 is unusually low pressure, 50 is materially
 * elevated pressure and 100 is an extreme observed or policy-relevant condition.
 *
 * Curves are intentionally dumb: no fitting, no automatic recalibration from
 * incoming data. Breakpoints move only with a methodology version bump, so a
 * bad month cannot quietly redefine what "normal" means.
 */

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Piecewise-linear interpolation across breakpoints sorted by raw value.
 *
 * This handles non-monotonic curves (such as two-sided inflation) without
 * special-casing, because interpolation only ever looks at the bracketing pair.
 */
export function applyCurve(value, breakpoints) {
  if (!Number.isFinite(value)) return null;
  if (!Array.isArray(breakpoints) || breakpoints.length < 2) {
    throw new Error("a curve requires at least two breakpoints");
  }

  const points = [...breakpoints].sort((a, b) => a.value - b.value);

  if (value <= points[0].value) return clamp(points[0].score);
  if (value >= points.at(-1).value) return clamp(points.at(-1).score);

  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    if (value >= left.value && value <= right.value) {
      const span = right.value - left.value;
      if (span === 0) return clamp(right.score);
      const progress = (value - left.value) / span;
      return clamp(left.score + progress * (right.score - left.score));
    }
  }

  /* c8 ignore next */
  return null;
}

/**
 * Two-sided inflation pressure.
 *
 * Held separately from the generic curve because the shape carries a claim that
 * needs to be arguable in public: sustained deflation is destabilising too, but
 * less sharply than equivalent high inflation, since debt-deflation dynamics
 * take longer to reach households than a price shock does.
 *
 * The Bank of England 2% target anchors the trough. The trough is scored at 5
 * rather than 0 because price stability does not mean zero cost-of-living
 * pressure — it means prices are not currently adding to it.
 */
export const CPI_TWO_SIDED_BREAKPOINTS = Object.freeze([
  { value: -4, score: 70, note: "severe sustained deflation" },
  { value: -2, score: 45, note: "entrenched deflation" },
  { value: -0.5, score: 22, note: "mild deflation" },
  { value: 1, score: 8, note: "below target but stable" },
  { value: 2, score: 5, note: "Bank of England target" },
  { value: 3, score: 18, note: "above target" },
  { value: 5, score: 45, note: "materially elevated; real incomes squeezed" },
  { value: 8, score: 72, note: "acute cost-of-living pressure" },
  { value: 12, score: 92, note: "2022-scale price shock" },
  { value: 20, score: 100, note: "extreme; no modern UK precedent outside the 1970s" }
]);
