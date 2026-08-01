/**
 * D1 persistence and read paths.
 *
 * All statements are prepared and parameterised; no SQL is ever assembled from
 * request input. Read paths are bounded and indexed, because the public Worker
 * must answer from stored state without recalculating anything.
 */

import { ONS_SOURCES } from "../../collectors/ons/registry.js";

export function hasDatabase(env) {
  return Boolean(env?.DB && typeof env.DB.prepare === "function");
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

/** Syncs the code-declared source registry into D1. Declarations are code, not data. */
export async function syncSources(env, sources = ONS_SOURCES) {
  const now = new Date().toISOString();
  const statements = sources.map((source) =>
    env.DB.prepare(`
      INSERT INTO sources (
        id, role, indicator_id, provider, cdid, dataset_id, title, source_url, licence,
        geography, quality_class, frequency, unit, expected_cadence_days, grace_days,
        hard_expiry_days, notes, updated_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role,
        indicator_id = excluded.indicator_id,
        title = excluded.title,
        source_url = excluded.source_url,
        licence = excluded.licence,
        geography = excluded.geography,
        quality_class = excluded.quality_class,
        frequency = excluded.frequency,
        unit = excluded.unit,
        expected_cadence_days = excluded.expected_cadence_days,
        grace_days = excluded.grace_days,
        hard_expiry_days = excluded.hard_expiry_days,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).bind(
      source.id, source.role, source.indicatorId, source.provider, source.cdid,
      source.datasetId, source.title, source.sourceUrl, source.licence, source.geography,
      source.qualityClass, source.frequency, source.unit, source.expectedCadenceDays,
      source.graceDays, source.hardExpiryDays, source.notes ?? null, now
    )
  );
  await env.DB.batch(statements);
  return statements.length;
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                    */
/* -------------------------------------------------------------------------- */

export async function findEvidenceByHash(env, sha256) {
  const row = await env.DB.prepare(
    `SELECT sha256, object_key, published_at, retrieved_at, archived FROM evidence_objects WHERE sha256 = ?1`
  ).bind(sha256).first();
  return row ?? null;
}

/** Most recent evidence for a source, used for conditional requests. */
export async function latestEvidenceForSource(env, sourceId) {
  const row = await env.DB.prepare(`
    SELECT sha256, object_key, etag, last_modified, published_at, retrieved_at
    FROM evidence_objects
    WHERE source_id = ?1
    ORDER BY retrieved_at DESC
    LIMIT 1
  `).bind(sourceId).first();
  return row ?? null;
}

export async function recordEvidence(env, evidence) {
  await env.DB.prepare(`
    INSERT INTO evidence_objects (
      sha256, object_key, source_id, mime, byte_size, source_url,
      published_at, retrieved_at, etag, last_modified, archived
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
    ON CONFLICT(sha256) DO UPDATE SET
      archived = MAX(evidence_objects.archived, excluded.archived),
      retrieved_at = excluded.retrieved_at
  `).bind(
    evidence.sha256, evidence.key, evidence.sourceId, evidence.mime, evidence.byteSize,
    evidence.sourceUrl, evidence.publishedAt, evidence.retrievedAt,
    evidence.etag ?? null, evidence.lastModified ?? null, evidence.archived ? 1 : 0
  ).run();
}

export async function recordRelease(env, release) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO source_releases (
      source_id, published_at, expected_next_release, evidence_sha256,
      series_title, declared_unit, point_count, blank_count, discovered_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
  `).bind(
    release.sourceId, release.publishedAt, release.expectedNextRelease ?? null,
    release.evidenceSha256, release.seriesTitle ?? null, release.declaredUnit ?? null,
    release.pointCount ?? null, release.blankCount ?? null, release.discoveredAt
  ).run();
}

/* -------------------------------------------------------------------------- */
/* Observations                                                                */
/* -------------------------------------------------------------------------- */

function mapObservationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    indicatorId: row.indicator_id,
    sourceId: row.source_id,
    cdid: row.cdid,
    datasetId: row.dataset_id,
    rawValue: Number(row.raw_value),
    rawUnit: row.raw_unit,
    transformedValue: Number(row.transformed_value),
    unit: row.unit,
    frequency: row.frequency,
    geography: row.geography,
    seasonalAdjustment: row.seasonal_adjustment,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodLabel: row.period_label,
    publishedAt: row.published_at,
    expectedNextRelease: row.expected_next_release,
    retrievedAt: row.retrieved_at,
    sourceUrl: row.source_url,
    licence: row.licence,
    evidenceSha256: row.evidence_sha256,
    parserVersion: row.parser_version,
    state: row.state,
    notes: row.notes,
    denominator: row.denominator_json ? JSON.parse(row.denominator_json) : null,
    supersedesId: row.supersedes_id,
    createdAt: row.created_at
  };
}

export async function latestObservationForSource(env, sourceId) {
  const row = await env.DB.prepare(`
    SELECT * FROM observations WHERE source_id = ?1 ORDER BY id DESC LIMIT 1
  `).bind(sourceId).first();
  return mapObservationRow(row);
}

/** Latest observation version per indicator — one bounded, indexed query. */
export async function latestObservations(env) {
  const result = await env.DB.prepare(`
    SELECT * FROM observations
    WHERE id IN (
      SELECT MAX(id) FROM observations
      WHERE state IN ('verified', 'revised')
      GROUP BY indicator_id
    )
  `).all();
  return (result.results ?? []).map(mapObservationRow);
}

export async function insertObservation(env, observation, supersedesId = null) {
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO observations (
      indicator_id, source_id, cdid, dataset_id, raw_value, raw_unit, transformed_value, unit,
      frequency, geography, seasonal_adjustment, period_start, period_end, period_label,
      published_at, expected_next_release, retrieved_at, source_url, licence,
      evidence_sha256, parser_version, state, notes, denominator_json, supersedes_id
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)
  `).bind(
    observation.indicatorId, observation.sourceId, observation.cdid, observation.datasetId,
    observation.rawValue, observation.rawUnit, observation.transformedValue, observation.unit,
    observation.frequency, observation.geography, observation.seasonalAdjustment,
    observation.periodStart, observation.periodEnd, observation.periodLabel,
    observation.publishedAt, observation.expectedNextRelease ?? null, observation.retrievedAt,
    observation.sourceUrl, observation.licence, observation.evidenceSha256,
    observation.parserVersion, observation.state, observation.notes ?? null,
    observation.denominator ? JSON.stringify(observation.denominator) : null,
    supersedesId
  ).run();

  // `INSERT OR IGNORE` means a repeated identical run writes nothing.
  return { inserted: (result.meta?.changes ?? 0) > 0, id: result.meta?.last_row_id ?? null };
}

export async function observationHistory(env, indicatorId, limit = 60) {
  const result = await env.DB.prepare(`
    SELECT * FROM observations
    WHERE indicator_id = ?1 AND state IN ('verified', 'revised')
    ORDER BY period_end DESC
    LIMIT ?2
  `).bind(indicatorId, Math.min(Math.max(1, limit), 500)).all();
  return (result.results ?? []).map(mapObservationRow);
}

/* -------------------------------------------------------------------------- */
/* Snapshots                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A stable fingerprint of the evidence behind a snapshot. Two runs with the
 * same fingerprint describe the same world, so the second creates nothing.
 */
export function evidenceFingerprint(snapshot) {
  return snapshot.indicators
    .filter((indicator) => indicator.available)
    .map((indicator) => `${indicator.id}:${indicator.source?.evidenceSha256?.slice(0, 16) ?? "none"}`)
    .sort()
    .join("|") || "empty";
}

export async function latestSnapshot(env) {
  const row = await env.DB.prepare(`
    SELECT payload_json, evidence_fingerprint, generated_at, as_of_date
    FROM snapshots ORDER BY as_of_date DESC, id DESC LIMIT 1
  `).first();
  if (!row) return null;
  return {
    snapshot: JSON.parse(row.payload_json),
    fingerprint: row.evidence_fingerprint,
    generatedAt: row.generated_at,
    asOfDate: row.as_of_date
  };
}

export async function snapshotExistsForFingerprint(env, fingerprint) {
  const row = await env.DB.prepare(
    `SELECT id FROM snapshots WHERE evidence_fingerprint = ?1 ORDER BY id DESC LIMIT 1`
  ).bind(fingerprint).first();
  return row?.id ?? null;
}

export async function writeSnapshot(env, snapshot, observationIdByIndicator = new Map()) {
  const fingerprint = evidenceFingerprint(snapshot);
  const asOfDate = snapshot.asOf.slice(0, 10);

  const result = await env.DB.prepare(`
    INSERT INTO snapshots (
      as_of_date, methodology_version, publication_status, headline_score, level_id,
      observed_pressure, available_weight, missing_weight, range_low, range_high,
      acute_overlay, confidence, evidence_fingerprint, payload_json, generated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
    ON CONFLICT(as_of_date, methodology_version) DO UPDATE SET
      publication_status = excluded.publication_status,
      headline_score = excluded.headline_score,
      level_id = excluded.level_id,
      observed_pressure = excluded.observed_pressure,
      available_weight = excluded.available_weight,
      missing_weight = excluded.missing_weight,
      range_low = excluded.range_low,
      range_high = excluded.range_high,
      acute_overlay = excluded.acute_overlay,
      confidence = excluded.confidence,
      evidence_fingerprint = excluded.evidence_fingerprint,
      payload_json = excluded.payload_json,
      generated_at = excluded.generated_at
    RETURNING id
  `).bind(
    asOfDate, snapshot.methodologyVersion, snapshot.publication.status,
    snapshot.publication.headlineScore, snapshot.publication.level?.id ?? null,
    snapshot.structural.observedPressure, snapshot.structural.availableWeight,
    snapshot.structural.missingWeight, snapshot.structural.range.low, snapshot.structural.range.high,
    snapshot.acute.overlay, snapshot.confidence.score, fingerprint,
    JSON.stringify(snapshot), snapshot.generatedAt
  ).first();

  const snapshotId = result?.id;
  if (!snapshotId) return { snapshotId: null, fingerprint };

  const components = snapshot.indicators.map((indicator) =>
    env.DB.prepare(`
      INSERT INTO snapshot_components (
        snapshot_id, indicator_id, observation_id, weight, pressure,
        contribution, confidence_contribution, available, unavailable_reason
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(snapshot_id, indicator_id) DO UPDATE SET
        observation_id = excluded.observation_id,
        pressure = excluded.pressure,
        contribution = excluded.contribution,
        confidence_contribution = excluded.confidence_contribution,
        available = excluded.available,
        unavailable_reason = excluded.unavailable_reason
    `).bind(
      snapshotId, indicator.id, observationIdByIndicator.get(indicator.id) ?? null,
      indicator.weight, indicator.pressure, indicator.contribution,
      indicator.confidenceContribution, indicator.available ? 1 : 0, indicator.reason ?? null
    )
  );
  await env.DB.batch(components);

  return { snapshotId, fingerprint };
}

export async function snapshotHistory(env, limit = 365) {
  const result = await env.DB.prepare(`
    SELECT as_of_date, publication_status, headline_score, level_id, observed_pressure,
           available_weight, range_low, range_high, confidence, methodology_version
    FROM snapshots
    ORDER BY as_of_date DESC
    LIMIT ?1
  `).bind(Math.min(Math.max(1, limit), 2000)).all();

  return (result.results ?? []).map((row) => ({
    date: row.as_of_date,
    status: row.publication_status,
    headlineScore: row.headline_score,
    level: row.level_id,
    observedPressure: Number(row.observed_pressure),
    availableWeight: Number(row.available_weight),
    range: { low: Number(row.range_low), high: Number(row.range_high) },
    confidence: Number(row.confidence),
    methodologyVersion: row.methodology_version
  })).reverse();
}

/* -------------------------------------------------------------------------- */
/* Operational audit                                                           */
/* -------------------------------------------------------------------------- */

export async function startRun(env, trigger, startedAt) {
  const row = await env.DB.prepare(`
    INSERT INTO ingestion_runs (trigger, started_at, status) VALUES (?1, ?2, 'running') RETURNING id
  `).bind(trigger, startedAt).first();
  return row?.id ?? null;
}

export async function finishRun(env, runId, summary) {
  await env.DB.prepare(`
    UPDATE ingestion_runs SET
      finished_at = ?2, status = ?3, sources_attempted = ?4, sources_changed = ?5,
      sources_failed = ?6, observations_written = ?7, snapshot_id = ?8, summary_json = ?9
    WHERE id = ?1
  `).bind(
    runId, summary.finishedAt, summary.status, summary.attempted, summary.changed,
    summary.failed, summary.written, summary.snapshotId ?? null, JSON.stringify(summary.details ?? {})
  ).run();
}

export async function recordCollectorResult(env, runId, result) {
  await env.DB.prepare(`
    INSERT INTO collector_results (
      run_id, source_id, outcome, failure_class, message, evidence_sha256,
      http_status, byte_size, duration_ms, recorded_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
  `).bind(
    runId, result.sourceId, result.outcome, result.failureClass ?? null,
    result.message ?? null, result.evidenceSha256 ?? null, result.httpStatus ?? null,
    result.byteSize ?? null, result.durationMs ?? null, result.recordedAt
  ).run();
}

export async function recordValidationResult(env, runId, sourceId, validation, recordedAt) {
  await env.DB.prepare(`
    INSERT INTO validation_results (run_id, source_id, subject, ok, errors_json, warnings_json, recorded_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7)
  `).bind(
    runId, sourceId, validation.subject ?? "observation", validation.ok ? 1 : 0,
    JSON.stringify(validation.errors ?? []), JSON.stringify(validation.warnings ?? []), recordedAt
  ).run();
}

/** Per-source collector health for the public evidence-health panel. */
export async function collectorHealth(env) {
  const result = await env.DB.prepare(`
    SELECT s.id AS source_id, s.cdid, s.dataset_id, s.title, s.role, s.indicator_id,
           s.expected_cadence_days, s.geography, s.quality_class,
           (SELECT COUNT(*) FROM source_releases r WHERE r.source_id = s.id) AS releases_observed,
           (SELECT MAX(published_at) FROM source_releases r WHERE r.source_id = s.id) AS last_published_at,
           (SELECT expected_next_release FROM source_releases r WHERE r.source_id = s.id
              ORDER BY published_at DESC LIMIT 1) AS expected_next_release,
           (SELECT outcome FROM collector_results c WHERE c.source_id = s.id
              ORDER BY recorded_at DESC LIMIT 1) AS last_outcome,
           (SELECT failure_class FROM collector_results c WHERE c.source_id = s.id
              ORDER BY recorded_at DESC LIMIT 1) AS last_failure_class,
           (SELECT recorded_at FROM collector_results c WHERE c.source_id = s.id
              ORDER BY recorded_at DESC LIMIT 1) AS last_attempt_at
    FROM sources s
    ORDER BY s.role DESC, s.id
  `).all();

  return (result.results ?? []).map((row) => ({
    sourceId: row.source_id,
    cdid: row.cdid,
    datasetId: row.dataset_id,
    title: row.title,
    role: row.role,
    indicatorId: row.indicator_id,
    geography: row.geography,
    qualityClass: row.quality_class,
    expectedCadenceDays: row.expected_cadence_days,
    releasesObserved: Number(row.releases_observed ?? 0),
    lastPublishedAt: row.last_published_at,
    expectedNextRelease: row.expected_next_release,
    lastOutcome: row.last_outcome,
    lastFailureClass: row.last_failure_class,
    lastAttemptAt: row.last_attempt_at
  }));
}

export async function recentRuns(env, limit = 10) {
  const result = await env.DB.prepare(`
    SELECT id, trigger, started_at, finished_at, status, sources_attempted,
           sources_changed, sources_failed, observations_written, snapshot_id
    FROM ingestion_runs ORDER BY id DESC LIMIT ?1
  `).bind(Math.min(Math.max(1, limit), 50)).all();
  return result.results ?? [];
}
