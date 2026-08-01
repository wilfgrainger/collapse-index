/**
 * Scheduled ingestion (WP7).
 *
 * Ordering and isolation are the two things that matter here:
 *
 *   * one source failing must never damage another source's observation, so
 *     every collector runs inside its own try/catch and writes its own audit row
 *   * a failed fetch, parse or validation writes NO observation — the previous
 *     verified value simply stays current and ages, which the freshness model
 *     already knows how to express
 *
 * A run that finds nothing new is a success, not a no-op to hide: it is
 * recorded as `no_change` and creates no snapshot.
 */

import { ONS_SOURCES, SOURCE_ROLE, sourceById } from "../collectors/ons/registry.js";
import { parseForSource, buildObservation, isMaterialChange } from "../collectors/ons/collect.js";
import { fetchSourcePayload } from "../collectors/ons/client.js";
import { archiveEvidence } from "../storage/r2/archive.js";
import { calculateSnapshot } from "../domain/scoring/structural.js";
import { toFailureSummary } from "../shared/errors.js";
import * as repo from "../storage/d1/repository.js";

/** Denominators first: derived indicators cannot be built without them. */
function ingestionOrder(sources) {
  return [...sources].sort((a, b) => {
    if (a.role === b.role) return a.id.localeCompare(b.id);
    return a.role === SOURCE_ROLE.DENOMINATOR ? -1 : 1;
  });
}

/**
 * Fetches, archives and parses one source.
 * Returns a result record; never throws.
 */
async function collectSource(env, source, { runId, now, fetchImpl, conditional = true }) {
  const startedAt = Date.now();
  const base = { sourceId: source.id, recordedAt: now };

  try {
    const previousEvidence = conditional ? await repo.latestEvidenceForSource(env, source.id) : null;

    const payload = await fetchSourcePayload(source.sourceUrl, {
      fetchImpl,
      etag: previousEvidence?.etag ?? undefined,
      lastModified: previousEvidence?.last_modified ?? undefined
    });

    if (payload.notModified) {
      return {
        ...base,
        outcome: "not_modified",
        durationMs: Date.now() - startedAt,
        parsed: null,
        payload: null
      };
    }

    const parsed = parseForSource(source, payload.text);

    // De-duplication is a hash lookup: identical bytes are already archived.
    const known = await repo.findEvidenceByHash(env, payload.sha256);
    const archive = await archiveEvidence(env.EVIDENCE, {
      source,
      payload,
      publishedAt: parsed.meta.releaseDate,
      alreadyArchived: Boolean(known?.archived)
    });

    await repo.recordEvidence(env, {
      sha256: payload.sha256,
      key: archive.key,
      sourceId: source.id,
      mime: payload.mime,
      byteSize: payload.byteLength,
      sourceUrl: source.sourceUrl,
      publishedAt: parsed.meta.releaseDate,
      retrievedAt: payload.retrievedAt,
      etag: payload.etag,
      lastModified: payload.lastModified,
      archived: true
    });

    await repo.recordRelease(env, {
      sourceId: source.id,
      publishedAt: parsed.meta.releaseDate,
      expectedNextRelease: parsed.meta.expectedNextRelease,
      evidenceSha256: payload.sha256,
      seriesTitle: parsed.meta.title,
      declaredUnit: parsed.meta.unit,
      pointCount: parsed.points.length,
      blankCount: parsed.blankCount,
      discoveredAt: now
    });

    return {
      ...base,
      outcome: known ? "unchanged" : "changed",
      evidenceSha256: payload.sha256,
      evidenceKey: archive.key,
      byteSize: payload.byteLength,
      durationMs: Date.now() - startedAt,
      retrievedAt: payload.retrievedAt,
      parsed,
      payload
    };
  } catch (error) {
    const failure = toFailureSummary(error);
    return {
      ...base,
      outcome: "failed",
      failureClass: failure.failureClass,
      message: failure.message,
      details: failure.details,
      durationMs: Date.now() - startedAt,
      parsed: null,
      payload: null
    };
  }
}

/**
 * Runs a full ingestion cycle.
 *
 * @param {object} env Worker bindings (DB, EVIDENCE)
 * @param {object} options { trigger, now, fetchImpl, sources }
 */
export async function runIngestion(env, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const trigger = options.trigger ?? "manual";
  const sources = options.sources ?? ONS_SOURCES;
  const fetchImpl = options.fetchImpl;

  await repo.syncSources(env, sources);
  const runId = await repo.startRun(env, trigger, now);

  const results = new Map();

  // --- Phase 1: collect every source in dependency order -------------------
  for (const source of ingestionOrder(sources)) {
    const result = await collectSource(env, source, { runId, now, fetchImpl });
    results.set(source.id, result);
    await repo.recordCollectorResult(env, runId, result);
  }

  // --- Phase 2: re-fetch denominators a changed dependent still needs ------
  // A denominator that answered 304 gave us no points to divide by.
  for (const source of sources) {
    if (!source.requiresDenominator) continue;
    const dependent = results.get(source.id);
    if (!dependent?.parsed) continue;

    const denominator = results.get(source.requiresDenominator);
    if (denominator?.parsed) continue;

    const denominatorSource = sourceById(source.requiresDenominator);
    if (!denominatorSource) continue;

    const refetched = await collectSource(env, denominatorSource, {
      runId, now, fetchImpl, conditional: false
    });
    results.set(denominatorSource.id, refetched);
    await repo.recordCollectorResult(env, runId, refetched);
  }

  // --- Phase 3: build and store observations -------------------------------
  let written = 0;
  let failed = 0;
  let changed = 0;
  const details = {};

  for (const source of sources) {
    if (source.role !== SOURCE_ROLE.INDICATOR) continue;
    const result = results.get(source.id);

    if (!result || result.outcome === "failed") {
      failed += 1;
      details[source.id] = { outcome: "failed", failureClass: result?.failureClass, message: result?.message };
      continue;
    }

    if (!result.parsed) {
      details[source.id] = { outcome: result.outcome, note: "source reported no change" };
      continue;
    }

    try {
      let denominator = null;
      if (source.requiresDenominator) {
        const denominatorResult = results.get(source.requiresDenominator);
        if (!denominatorResult?.parsed) {
          throw new Error(`denominator ${source.requiresDenominator} unavailable`);
        }
        denominator = {
          source: sourceById(source.requiresDenominator),
          parsed: denominatorResult.parsed,
          evidence: { sha256: denominatorResult.evidenceSha256 }
        };
      }

      const { observation, validation } = buildObservation({
        source,
        parsed: result.parsed,
        evidence: {
          sha256: result.evidenceSha256,
          retrievedAt: result.retrievedAt,
          key: result.evidenceKey
        },
        denominator
      });

      await repo.recordValidationResult(env, runId, source.id, validation, now);

      const previous = await repo.latestObservationForSource(env, source.id);
      if (!isMaterialChange(previous, observation)) {
        details[source.id] = { outcome: "unchanged", periodLabel: observation.periodLabel };
        continue;
      }

      const insert = await repo.insertObservation(env, observation, previous?.id ?? null);
      if (insert.inserted) {
        written += 1;
        changed += 1;
        details[source.id] = {
          outcome: "written",
          periodLabel: observation.periodLabel,
          value: observation.transformedValue
        };
      } else {
        details[source.id] = { outcome: "duplicate", periodLabel: observation.periodLabel };
      }
    } catch (error) {
      failed += 1;
      const failure = toFailureSummary(error);
      details[source.id] = { outcome: "failed", ...failure };
      await repo.recordValidationResult(
        env, runId, source.id,
        { subject: "observation", ok: false, errors: [failure], warnings: [] },
        now
      );
    }
  }

  // --- Phase 4: materialise a snapshot only when the evidence moved --------
  const observations = await repo.latestObservations(env);
  const snapshot = calculateSnapshot({
    observations,
    sources: new Map(sources.map((source) => [source.id, source])),
    asOf: now
  });

  const fingerprint = repo.evidenceFingerprint(snapshot);
  const existingSnapshotId = await repo.snapshotExistsForFingerprint(env, fingerprint);

  let snapshotId = existingSnapshotId;
  let snapshotCreated = false;
  if (!existingSnapshotId) {
    const observationIdByIndicator = new Map(
      observations.map((observation) => [observation.indicatorId, observation.id])
    );
    const wrote = await repo.writeSnapshot(env, snapshot, observationIdByIndicator);
    snapshotId = wrote.snapshotId;
    snapshotCreated = true;
  }

  // Status is judged against the indicator sources, not every source. Counting
  // the denominator here would mean a run where every indicator failed reported
  // itself as merely "partial".
  const indicatorCount = sources.filter((source) => source.role === SOURCE_ROLE.INDICATOR).length;
  const attempted = sources.length;
  const status = failed >= indicatorCount ? "failed"
    : failed > 0 ? "partial"
    : changed === 0 ? "no_change"
    : "succeeded";

  await repo.finishRun(env, runId, {
    finishedAt: new Date().toISOString(),
    status,
    attempted,
    changed,
    failed,
    written,
    snapshotId,
    details
  });

  return {
    runId,
    status,
    attempted,
    changed,
    failed,
    written,
    snapshotId,
    snapshotCreated,
    fingerprint,
    details,
    snapshot
  };
}
