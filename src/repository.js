import { INDICATORS, INDEX_VERSION } from "./config.js";
import { calculateIndex } from "./scoring.js";
import { buildIllustrativeHistory, createPrototypeSnapshot, PROTOTYPE_EVENTS, PROTOTYPE_OBSERVATIONS } from "./demo.js";

function hasDatabase(env) {
  return Boolean(env?.DB && typeof env.DB.prepare === "function");
}

function mapObservationRow(row) {
  return {
    indicatorId: row.indicator_id,
    value: Number(row.value),
    observedAt: row.observed_at,
    publishedAt: row.published_at,
    sourceConfidence: Number(row.source_confidence),
    status: row.status,
    notes: row.notes,
    sourceName: row.source_name,
    sourceUrl: row.source_url
  };
}

function mapEventRow(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    occurredAt: row.occurred_at,
    severity: Number(row.severity),
    confidence: Number(row.confidence),
    halfLifeHours: Number(row.half_life_hours),
    reviewStatus: row.review_status,
    sourceName: row.source_name,
    sourceUrl: row.source_url
  };
}

export async function readCurrentState(env, asOf = new Date().toISOString()) {
  if (!hasDatabase(env) || env.DATA_MODE !== "d1") {
    return {
      snapshot: createPrototypeSnapshot(asOf),
      storage: "bundled-prototype",
      warning: "D1 is not bound; serving the transparent prototype dataset."
    };
  }

  try {
    const observationQuery = await env.DB.prepare(`
      SELECT o.*
      FROM observations o
      INNER JOIN (
        SELECT indicator_id, MAX(observed_at) AS latest_observed_at
        FROM observations
        WHERE observed_at <= ?1
        GROUP BY indicator_id
      ) latest
        ON latest.indicator_id = o.indicator_id
       AND latest.latest_observed_at = o.observed_at
      ORDER BY o.indicator_id
    `).bind(asOf).all();

    const eventQuery = await env.DB.prepare(`
      SELECT *
      FROM events
      WHERE occurred_at <= ?1
        AND review_status IN ('approved', 'informational')
      ORDER BY occurred_at DESC
      LIMIT 50
    `).bind(asOf).all();

    const observations = (observationQuery.results ?? []).map(mapObservationRow);
    const events = (eventQuery.results ?? []).map(mapEventRow);

    if (observations.length === 0) {
      return {
        snapshot: createPrototypeSnapshot(asOf),
        storage: "d1-empty-fallback",
        warning: "D1 is connected but contains no observations; serving the prototype dataset."
      };
    }

    return {
      snapshot: calculateIndex({
        definitions: INDICATORS,
        observations,
        events,
        asOf,
        version: INDEX_VERSION,
        mode: "live"
      }),
      storage: "d1",
      warning: null
    };
  } catch (error) {
    console.error("D1 read failed; using prototype fallback", error);
    return {
      snapshot: createPrototypeSnapshot(asOf),
      storage: "d1-error-fallback",
      warning: "D1 could not be read; serving the prototype dataset."
    };
  }
}

export async function readHistory(env) {
  if (!hasDatabase(env) || env.DATA_MODE !== "d1") {
    return {
      seriesKind: "illustrative-backcast",
      warning: "This is a visual prototype, not a historically calculated index.",
      points: buildIllustrativeHistory()
    };
  }

  try {
    const result = await env.DB.prepare(`
      SELECT as_of, score, confidence, level
      FROM snapshots
      ORDER BY as_of ASC
      LIMIT 5000
    `).all();

    if (!result.results?.length) {
      return {
        seriesKind: "illustrative-backcast",
        warning: "No calculated snapshots exist yet; showing the visual prototype backcast.",
        points: buildIllustrativeHistory()
      };
    }

    return {
      seriesKind: "calculated-snapshots",
      warning: null,
      points: result.results.map((row) => ({
        date: row.as_of,
        score: Number(row.score),
        confidence: Number(row.confidence),
        level: row.level
      }))
    };
  } catch (error) {
    console.error("D1 history read failed", error);
    return {
      seriesKind: "illustrative-backcast",
      warning: "History storage could not be read; showing the visual prototype backcast.",
      points: buildIllustrativeHistory()
    };
  }
}

export async function persistDailySnapshot(env, asOf = new Date().toISOString()) {
  if (!hasDatabase(env) || env.DATA_MODE !== "d1") {
    return { persisted: false, reason: "D1 is not configured" };
  }

  const { snapshot } = await readCurrentState(env, asOf);
  const day = asOf.slice(0, 10);

  await env.DB.prepare(`
    INSERT INTO snapshots (
      as_of, score, base_score, event_overlay, confidence, level, methodology_version, payload_json, generated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(as_of) DO UPDATE SET
      score = excluded.score,
      base_score = excluded.base_score,
      event_overlay = excluded.event_overlay,
      confidence = excluded.confidence,
      level = excluded.level,
      methodology_version = excluded.methodology_version,
      payload_json = excluded.payload_json,
      generated_at = excluded.generated_at
  `).bind(
    day,
    snapshot.score,
    snapshot.baseScore,
    snapshot.eventOverlay,
    snapshot.confidence,
    snapshot.level.id,
    snapshot.methodologyVersion,
    JSON.stringify(snapshot),
    new Date().toISOString()
  ).run();

  return { persisted: true, date: day, score: snapshot.score };
}

export function prototypeSeed() {
  return {
    observations: PROTOTYPE_OBSERVATIONS,
    events: PROTOTYPE_EVENTS
  };
}
