/**
 * Fixed-weight structural scoring, evidence confidence and publication gates.
 *
 * The three outputs are deliberately kept apart:
 *
 *   observedPressure  what the available evidence actually shows, on the fixed
 *                     weight scale — NOT rescaled to fill the missing weight
 *   confidence        an evidence-health measure, not a statistical interval
 *   publication       whether any of it may be published as a headline
 *
 * Because weights are never renormalised, `observedPressure` with four of ten
 * indicators cannot reach 100 and must not be read as a headline score. The
 * uncertainty range exists to make that impossible to miss.
 */

import {
  INDICATORS,
  METHODOLOGY_VERSION,
  PUBLICATION_GATES,
  levelFor
} from "../methodology/v1.js";
import { applyCurve, clamp, round } from "../methodology/curves.js";
import {
  FRESHNESS,
  FRESHNESS_FACTOR,
  GEOGRAPHY_LABEL,
  coverageFactor,
  qualityFactor
} from "../evidence/states.js";
import { isHeadlineEligibleObservation } from "../evidence/schema.js";
import { daysBetween } from "../../shared/period.js";

/**
 * Determines how current an observation is.
 *
 * Freshness is judged against the source's own announced next release date
 * where ONS provides one, falling back to the declared cadence. An annual
 * statistic is not "stale" merely for being annual — it is stale when an
 * expected release has been missed.
 */
export function freshnessStage(observation, source, asOf) {
  if (!observation) return { stage: FRESHNESS.EXPIRED, factor: 0, reason: "no observation" };

  const ageDays = daysBetween(observation.publishedAt.slice(0, 10), asOf.slice(0, 10));
  if (Number.isFinite(source?.hardExpiryDays) && ageDays > source.hardExpiryDays) {
    return {
      stage: FRESHNESS.EXPIRED,
      factor: 0,
      reason: `published ${ageDays} days ago, beyond the ${source.hardExpiryDays}-day hard expiry`
    };
  }

  const cadence = Math.max(1, Number(source?.expectedCadenceDays ?? 400));
  const grace = Math.max(0, Number(source?.graceDays ?? 14));
  const expected = observation.expectedNextRelease;

  // Days late relative to the release we were entitled to expect.
  let daysLate;
  if (expected) {
    daysLate = daysBetween(expected, asOf.slice(0, 10));
  } else {
    daysLate = ageDays - cadence;
  }

  if (daysLate <= grace) {
    return { stage: FRESHNESS.CURRENT, factor: FRESHNESS_FACTOR[FRESHNESS.CURRENT], reason: "within the expected release window" };
  }
  if (daysLate <= cadence + grace) {
    return { stage: FRESHNESS.AGING, factor: FRESHNESS_FACTOR[FRESHNESS.AGING], reason: "one expected release has been missed" };
  }
  if (daysLate <= 2 * cadence + grace) {
    return { stage: FRESHNESS.STALE, factor: FRESHNESS_FACTOR[FRESHNESS.STALE], reason: "two expected releases have been missed" };
  }
  return { stage: FRESHNESS.EXPIRED, factor: 0, reason: "no release for more than two expected cycles" };
}

/**
 * Scores a single indicator.
 *
 * Returns an entry even when nothing is available, because the missing weight
 * is information the interface must show.
 */
export function scoreIndicator(definition, observation, source, asOf) {
  const base = {
    id: definition.id,
    title: definition.title,
    shortTitle: definition.shortTitle,
    domain: definition.domain,
    description: definition.description,
    unit: definition.unit,
    display: definition.display,
    direction: definition.direction,
    weight: definition.weight
  };

  if (!observation || !isHeadlineEligibleObservation(observation)) {
    return {
      ...base,
      available: false,
      reason: observation ? `evidence state '${observation.state}' is not headline-eligible` : "no collector implemented",
      pressure: null,
      value: null,
      contribution: 0,
      confidenceContribution: 0,
      freshness: null,
      geography: null,
      source: null
    };
  }

  const value = Number(observation.transformedValue ?? observation.rawValue);
  const pressure = applyCurve(value, definition.breakpoints);

  if (pressure === null) {
    return {
      ...base,
      available: false,
      reason: "value could not be transformed by the indicator curve",
      pressure: null,
      value,
      contribution: 0,
      confidenceContribution: 0,
      freshness: null,
      geography: null,
      source: null
    };
  }

  const freshness = freshnessStage(observation, source, asOf);
  const quality = qualityFactor(source.qualityClass);
  const coverage = coverageFactor(observation.geography);

  // An expired observation carries no confidence, so it cannot support the
  // headline even though its last value is still displayed.
  const confidenceContribution = definition.weight * quality * freshness.factor * coverage;

  return {
    ...base,
    available: freshness.stage !== FRESHNESS.EXPIRED,
    reason: freshness.stage === FRESHNESS.EXPIRED ? freshness.reason : null,
    value: round(value, 3),
    rawValue: observation.rawValue,
    pressure: round(pressure, 1),
    contribution: round(definition.weight * pressure, 2),
    confidenceContribution: round(confidenceContribution, 4),
    factors: {
      quality: round(quality, 3),
      freshness: round(freshness.factor, 3),
      coverage: round(coverage, 3)
    },
    freshness: {
      stage: freshness.stage,
      reason: freshness.reason,
      publishedAt: observation.publishedAt,
      expectedNextRelease: observation.expectedNextRelease ?? null
    },
    period: {
      start: observation.periodStart,
      end: observation.periodEnd,
      label: observation.periodLabel,
      frequency: observation.frequency
    },
    geography: {
      code: observation.geography,
      label: GEOGRAPHY_LABEL[observation.geography],
      coverageFactor: round(coverage, 3)
    },
    state: observation.state,
    source: {
      id: observation.sourceId,
      cdid: observation.cdid,
      datasetId: observation.datasetId ?? null,
      title: source.title,
      provider: source.provider,
      url: observation.sourceUrl,
      licence: observation.licence,
      qualityClass: source.qualityClass,
      evidenceSha256: observation.evidenceSha256,
      parserVersion: observation.parserVersion
    },
    notes: observation.notes ?? null
  };
}

/**
 * Acute disruption overlay (docs/METHODOLOGY_V1_DESIGN.md §8).
 *
 * Implemented and tested now, but nothing feeds it: the reviewed-event system
 * is release 0.4. An unreviewed event contributes zero, by construction.
 */
export function acuteOverlay(events = [], asOf = new Date().toISOString()) {
  const now = Date.parse(asOf);
  const scored = [];

  for (const event of events) {
    if (event.reviewStatus !== "approved") continue;
    const occurred = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurred) || now < occurred) continue;

    const ageHours = (now - occurred) / 3_600_000;
    const halfLife = Math.max(1, Number(event.halfLifeHours ?? 72));
    const decay = 0.5 ** (ageHours / halfLife);

    const severity = clamp(Number(event.severity ?? 0), 0, 5) / 5;
    const evidence = clamp(Number(event.evidenceConfidence ?? 0), 0, 1);
    const reach = clamp(Number(event.geographicReach ?? 0), 0, 1);
    const breadth = clamp(Number(event.systemBreadth ?? 0), 0, 1);

    const contribution = Math.min(
      PUBLICATION_GATES.perEventCap,
      PUBLICATION_GATES.perEventCap * severity * evidence * reach * breadth * decay
    );

    scored.push({ ...event, contribution: round(contribution, 3) });
  }

  const total = scored.reduce((sum, event) => sum + event.contribution, 0);
  return {
    overlay: round(Math.min(total, PUBLICATION_GATES.acuteOverlayCap), 2),
    cap: PUBLICATION_GATES.acuteOverlayCap,
    events: scored.sort((a, b) => b.contribution - a.contribution)
  };
}

/**
 * Calculates a complete result from canonical observations.
 *
 * @param {object} input
 * @param {Map<string,object>|Array} input.observations keyed by indicator id
 * @param {Map<string,object>} input.sources keyed by source id
 */
export function calculateSnapshot({
  observations,
  sources,
  events = [],
  asOf = new Date().toISOString(),
  definitions = INDICATORS
}) {
  const observationMap = observations instanceof Map
    ? observations
    : new Map((observations ?? []).map((o) => [o.indicatorId, o]));
  const sourceMap = sources instanceof Map
    ? sources
    : new Map((sources ?? []).map((s) => [s.id, s]));

  const indicators = definitions.map((definition) => {
    const observation = observationMap.get(definition.id) ?? null;
    const source = observation ? sourceMap.get(observation.sourceId) ?? null : null;
    if (observation && !source) {
      return scoreIndicator(definition, null, null, asOf);
    }
    return scoreIndicator(definition, observation, source, asOf);
  });

  const available = indicators.filter((indicator) => indicator.available);
  const availableWeight = available.reduce((sum, indicator) => sum + indicator.weight, 0);
  const missingWeight = round(1 - availableWeight, 4);

  // Fixed weights: the sum is NOT divided by availableWeight.
  const observedPressure = available.reduce((sum, indicator) => sum + indicator.weight * indicator.pressure, 0);
  const confidence = indicators.reduce((sum, indicator) => sum + indicator.confidenceContribution, 0);

  const overlay = acuteOverlay(events, asOf);

  const gates = {
    availableWeight: round(availableWeight, 4),
    minAvailableWeight: PUBLICATION_GATES.minAvailableWeight,
    availabilityPassed: availableWeight >= PUBLICATION_GATES.minAvailableWeight,
    confidence: round(confidence, 4),
    minConfidence: PUBLICATION_GATES.minConfidence,
    confidencePassed: confidence >= PUBLICATION_GATES.minConfidence
  };
  const publishable = gates.availabilityPassed && gates.confidencePassed;

  // The honest bound on where a complete score could sit: missing indicators
  // could be anywhere from zero to maximum pressure.
  const rangeLow = round(observedPressure, 1);
  const rangeHigh = round(observedPressure + missingWeight * 100, 1);

  const headlineScore = publishable
    ? round(Math.min(100, observedPressure + overlay.overlay), 1)
    : null;

  const byDomain = new Map();
  for (const indicator of indicators) {
    const entry = byDomain.get(indicator.domain) ?? { domain: indicator.domain, weight: 0, availableWeight: 0, contribution: 0 };
    entry.weight = round(entry.weight + indicator.weight, 4);
    if (indicator.available) {
      entry.availableWeight = round(entry.availableWeight + indicator.weight, 4);
      entry.contribution = round(entry.contribution + indicator.contribution, 2);
    }
    byDomain.set(indicator.domain, entry);
  }

  return {
    schemaVersion: "2.0",
    methodologyVersion: METHODOLOGY_VERSION,
    asOf,
    generatedAt: new Date().toISOString(),

    publication: {
      status: publishable ? "published" : "suppressed",
      headlineScore,
      level: headlineScore === null ? null : levelFor(headlineScore),
      reason: publishable
        ? null
        : `Fixed-weight availability is ${(availableWeight * 100).toFixed(0)}% and confidence is ` +
          `${(confidence * 100).toFixed(0)}%. A point headline requires ` +
          `${PUBLICATION_GATES.minAvailableWeight * 100}% availability and ` +
          `${PUBLICATION_GATES.minConfidence * 100}% confidence.`,
      gates
    },

    structural: {
      observedPressure: round(observedPressure, 1),
      availableWeight: round(availableWeight, 4),
      missingWeight,
      range: { low: rangeLow, high: rangeHigh },
      note:
        "Weights are fixed and never renormalised. observedPressure is the weighted pressure " +
        "actually measured, so with incomplete coverage it cannot reach 100 and is not a headline " +
        "score. The range shows where a complete score could fall."
    },

    acute: {
      overlay: overlay.overlay,
      cap: overlay.cap,
      events: overlay.events,
      note: "The reviewed-event system is not implemented; no event can currently change the score."
    },

    confidence: {
      score: round(confidence, 4),
      percent: round(confidence * 100, 1),
      note: "Evidence health: Σ(weight × quality × freshness × geographic coverage). Not a statistical confidence interval."
    },

    coverage: {
      indicatorsAvailable: available.length,
      indicatorsTotal: indicators.length,
      missingIndicators: indicators.filter((i) => !i.available).map((i) => i.id),
      byDomain: [...byDomain.values()]
    },

    indicators
  };
}
