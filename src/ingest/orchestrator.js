/** Scheduled ingestion with per-source isolation and daily materialisation. */

import { ONS_SOURCES, SOURCE_ROLE, sourceById } from "../collectors/ons/registry.js";
import { parseForSource, buildObservation, isMaterialChange } from "../collectors/ons/collect.js";
import { fetchSourcePayload } from "../collectors/ons/client.js";
import { archiveEvidence } from "../storage/r2/archive.js";
import { calculateSnapshot } from "../domain/scoring/structural.js";
import { toFailureSummary } from "../shared/errors.js";
import * as repo from "../storage/d1/repository.js";

function ingestionOrder(sources) {
  return [...sources].sort((a, b) => {
    if (a.role === b.role) return a.id.localeCompare(b.id);
    return a.role === SOURCE_ROLE.DENOMINATOR ? -1 : 1;
  });
}

async function collectSource(env, source, { now, fetchImpl, conditional = true }) {
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

export async function runIngestion(env, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const trigger = options.trigger ?? "manual";
  const sources = options.sources ?? ONS_SOURCES;
  const fetchImpl = options.fetchImpl;

  await repo.syncSources(env, sources);
  const runId = await repo.startRun(env, trigger, now);
  const results = new Map();

  for (const source of ingestionOrder(sources)) {
    const result = await collectSource(env, source, { now, fetchImpl });
    results.set(source.id, result);
    await repo.recordCollectorResult(env, runId, result);
  }

  // A changed dependent may need an unconditional denominator fetch after 304.
  for (const source of sources) {
    if (!source.requiresDenominator) continue;
    const dependent = results.get(source.id);
    if (!dependent?.parsed) continue;

    const denominator = results.get(source.requiresDenominator);
    if (denominator?.parsed) continue;

    const denominatorSource = sourceById(source.requiresDenominator);
    if (!denominatorSource) continue;
    const refetched = await collectSource(env, denominatorSource, { now, fetchImpl, conditional: false });
    results.set(denominatorSource.id, refetched);
    await repo.recordCollectorResult(env, runId, refetched);
  }

  // The inverse matters too: a revised denominator changes a derived indicator
  // even when its numerator answered 304. Re-fetch the numerator unconditionally.
  for (const source of sources) {
    if (!source.requiresDenominator) continue;
    const denominator = results.get(source.requiresDenominator);
    const dependent = results.get(source.id);
    if (!denominator?.parsed || dependent?.parsed || dependent?.outcome !== "not_modified") continue;

    const refetched = await collectSource(env, source, { now, fetchImpl, conditional: false });
    results.set(source.id, refetched);
    await repo.recordCollectorResult(env, runId, refetched);
  }

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

      const previous = await repo.latestObservationForSource(env, source.id);
      const { observation, validation } = buildObservation({
        source,
        parsed: result.parsed,
        evidence: {
          sha256: result.evidenceSha256,
          retrievedAt: result.retrievedAt,
          key: result.evidenceKey
        },
        denominator,
        previousObservation: previous
      });

      await repo.recordValidationResult(env, runId, source.id, validation, now);

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
          value: observation.transformedValue,
          state: observation.state
        };
      } else {
        details[source.id] = { outcome: "duplicate", periodLabel: observation.periodLabel };
      }
    } catch (error) {
      failed += 1;
      const failure = toFailureSummary(error);
      details[source.id] = { outcome: "failed", ...failure };
      await repo.recordValidationResult(
        env,
        runId,
        source.id,
        { subject: "observation", ok: false, errors: [failure], warnings: [] },
        now
      );
    }
  }

  // Snapshots are daily materialisations, not evidence objects. Time-dependent
  // freshness and event decay must advance even when upstream bytes do not.
  const observations = await repo.latestObservations(env);
  const snapshot = calculateSnapshot({
    observations,
    sources: new Map(sources.map((source) => [source.id, source])),
    asOf: now
  });

  const fingerprint = repo.evidenceFingerprint(snapshot);
  const stateFingerprint = repo.snapshotStateFingerprint(snapshot);
  const asOfDate = snapshot.asOf.slice(0, 10);
  const existingSnapshotId = await repo.snapshotExistsForState(
    env,
    asOfDate,
    snapshot.methodologyVersion,
    stateFingerprint
  );

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
    stateFingerprint,
    details,
    snapshot
  };
}
