import { LEVELS, METHODOLOGY_SUMMARY } from "./config.js";

const DAY_MS = 86_400_000;

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function interpolateScore(value, breakpoints) {
  if (!Number.isFinite(value)) return null;
  const points = [...breakpoints].sort((a, b) => a.value - b.value);

  if (value <= points[0].value) return clamp(points[0].score);
  if (value >= points.at(-1).value) return clamp(points.at(-1).score);

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (value >= left.value && value <= right.value) {
      const span = right.value - left.value;
      if (span === 0) return clamp(right.score);
      const progress = (value - left.value) / span;
      return clamp(left.score + progress * (right.score - left.score));
    }
  }

  return null;
}

export function ageInDays(observedAt, asOf) {
  const observed = new Date(observedAt).getTime();
  const current = new Date(asOf).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return Infinity;
  return Math.max(0, (current - observed) / DAY_MS);
}

export function freshnessConfidence(observedAt, asOf, cadenceDays) {
  const age = ageInDays(observedAt, asOf);
  const cadence = Math.max(1, cadenceDays);
  const ratio = age / cadence;

  if (ratio <= 1) return 1;
  if (ratio <= 2) return 1 - ((ratio - 1) * 0.2);
  if (ratio <= 4) return 0.8 - ((ratio - 2) * 0.125);
  return 0.35;
}

export function freshnessLabel(observedAt, asOf, cadenceDays) {
  const ratio = ageInDays(observedAt, asOf) / Math.max(1, cadenceDays);
  if (ratio <= 1) return "current";
  if (ratio <= 2) return "aging";
  if (ratio <= 4) return "stale";
  return "very-stale";
}

export function getLevel(score) {
  return LEVELS.find((level) => score >= level.min && score <= level.max) ?? LEVELS.at(-1);
}

export function scoreIndicator(definition, observation, asOf) {
  if (!observation || !Number.isFinite(Number(observation.value))) {
    return {
      id: definition.id,
      title: definition.title,
      shortTitle: definition.shortTitle,
      available: false,
      weight: definition.weight,
      score: null,
      confidence: 0,
      contribution: 0,
      freshness: "missing",
      source: {
        name: definition.sourceName,
        url: definition.sourceUrl,
        class: definition.sourceClass
      }
    };
  }

  const value = Number(observation.value);
  const rawScore = interpolateScore(value, definition.breakpoints);
  const freshness = freshnessConfidence(observation.observedAt, asOf, definition.cadenceDays);
  const sourceConfidence = clamp(Number(observation.sourceConfidence ?? 0.8), 0, 1);
  const confidence = freshness * sourceConfidence;

  return {
    id: definition.id,
    title: definition.title,
    shortTitle: definition.shortTitle,
    description: definition.description,
    available: rawScore !== null,
    value,
    unit: definition.unit,
    display: definition.display,
    weight: definition.weight,
    score: round(rawScore, 1),
    confidence: round(confidence, 3),
    contribution: round(rawScore * definition.weight, 2),
    observedAt: observation.observedAt,
    publishedAt: observation.publishedAt ?? observation.observedAt,
    freshness: freshnessLabel(observation.observedAt, asOf, definition.cadenceDays),
    status: observation.status ?? "verified",
    notes: observation.notes ?? "",
    source: {
      name: observation.sourceName ?? definition.sourceName,
      url: observation.sourceUrl ?? definition.sourceUrl,
      class: definition.sourceClass
    }
  };
}

export function eventContribution(event, asOf) {
  if (event.reviewStatus !== "approved") return 0;
  const occurred = new Date(event.occurredAt).getTime();
  const current = new Date(asOf).getTime();
  if (!Number.isFinite(occurred) || !Number.isFinite(current) || current < occurred) return 0;

  const ageHours = (current - occurred) / 3_600_000;
  const halfLife = Math.max(1, Number(event.halfLifeHours ?? 72));
  const decay = 0.5 ** (ageHours / halfLife);
  const severity = clamp(Number(event.severity ?? 0), 0, 5) / 5;
  const confidence = clamp(Number(event.confidence ?? 0.7), 0, 1);
  return severity * 2 * confidence * decay;
}

export function scoreEvents(events = [], asOf) {
  const scored = events.map((event) => ({
    ...event,
    contribution: round(eventContribution(event, asOf), 2)
  }));
  const total = scored.reduce((sum, event) => sum + event.contribution, 0);
  return {
    overlay: round(clamp(total, 0, METHODOLOGY_SUMMARY.eventOverlayCap), 1),
    events: scored.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
  };
}

export function calculateIndex({ definitions, observations, events = [], asOf = new Date().toISOString(), version = "0.1.0", mode = "prototype" }) {
  const observationMap = observations instanceof Map
    ? observations
    : new Map(observations.map((observation) => [observation.indicatorId, observation]));

  const indicators = definitions.map((definition) => scoreIndicator(definition, observationMap.get(definition.id), asOf));
  const available = indicators.filter((indicator) => indicator.available);
  const availableWeight = available.reduce((sum, indicator) => sum + indicator.weight, 0);

  const baseScore = availableWeight > 0
    ? available.reduce((sum, indicator) => sum + indicator.score * indicator.weight, 0) / availableWeight
    : 0;

  const confidence = availableWeight > 0
    ? available.reduce((sum, indicator) => sum + indicator.confidence * indicator.weight, 0) / availableWeight
    : 0;

  const eventResult = scoreEvents(events, asOf);
  const score = clamp(baseScore + eventResult.overlay);
  const level = getLevel(score);
  const missing = indicators.filter((indicator) => !indicator.available).map((indicator) => indicator.id);
  const stale = indicators.filter((indicator) => ["stale", "very-stale"].includes(indicator.freshness)).map((indicator) => indicator.id);

  return {
    schemaVersion: "1.0",
    methodologyVersion: version,
    generatedAt: new Date().toISOString(),
    asOf,
    mode,
    score: round(score, 1),
    baseScore: round(baseScore, 1),
    eventOverlay: eventResult.overlay,
    confidence: round(confidence, 3),
    headlineEligible: confidence >= METHODOLOGY_SUMMARY.minimumHeadlineConfidence && missing.length <= 2,
    level,
    indicators,
    events: eventResult.events,
    dataQuality: {
      available: available.length,
      total: indicators.length,
      missing,
      stale
    },
    caveats: [
      "This measures systemic pressure; it does not predict that the UK will collapse.",
      "Publication is daily, but each source retains its real release date and cadence.",
      "Prototype observations require independent source-by-source verification before editorial launch."
    ]
  };
}
