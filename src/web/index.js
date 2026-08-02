/** Public Worker: static assets and read-only JSON/CSV API. */

import {
  INDICATORS,
  LEVELS,
  METHODOLOGY_STATUS,
  METHODOLOGY_VERSION,
  PUBLICATION_GATES,
  DOMAIN_LABEL
} from "../domain/methodology/v1.js";
import { ONS_SOURCES } from "../collectors/ons/registry.js";
import { GEOGRAPHY_COVERAGE, GEOGRAPHY_LABEL, QUALITY_FACTOR } from "../domain/evidence/states.js";
import { dateInTimeZone, daysBetween } from "../shared/period.js";
import * as repo from "../storage/d1/repository.js";
import { boundedInteger, toCsv } from "./csv.js";

const API_PREFIX = "/api/v1";
const MAX_SNAPSHOT_AGE_DAYS = 2;

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
});

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Disposition, ETag, Warning, X-Snapshot-Age-Days"
});

const CACHE = Object.freeze({
  current: "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
  history: "public, max-age=3600, s-maxage=3600",
  methodology: "public, max-age=86400, s-maxage=86400",
  health: "public, max-age=60, s-maxage=60",
  none: "no-store"
});

const CURRENT_EXPORT_COLUMNS = Object.freeze([
  { key: "snapshotAsOf", label: "snapshot_as_of" },
  { key: "generatedAt", label: "generated_at" },
  { key: "methodologyVersion", label: "methodology_version" },
  { key: "operationalStatus", label: "operational_status" },
  { key: "indicatorId", label: "indicator_id" },
  { key: "title", label: "title" },
  { key: "domain", label: "domain" },
  { key: "weight", label: "weight" },
  { key: "available", label: "available" },
  { key: "value", label: "value" },
  { key: "unit", label: "unit" },
  { key: "pressure", label: "pressure" },
  { key: "contribution", label: "contribution" },
  { key: "confidenceContribution", label: "confidence_contribution" },
  { key: "periodStart", label: "period_start" },
  { key: "periodEnd", label: "period_end" },
  { key: "periodLabel", label: "period_label" },
  { key: "geographyCode", label: "geography_code" },
  { key: "geographyLabel", label: "geography_label" },
  { key: "freshnessStage", label: "freshness_stage" },
  { key: "publishedAt", label: "published_at" },
  { key: "sourceProvider", label: "source_provider" },
  { key: "sourceCdid", label: "source_cdid" },
  { key: "sourceDatasetId", label: "source_dataset_id" },
  { key: "sourceUrl", label: "source_url" },
  { key: "licence", label: "licence" },
  { key: "evidenceSha256", label: "evidence_sha256" },
  { key: "dependencyFingerprint", label: "dependency_fingerprint" },
  { key: "parserVersion", label: "parser_version" },
  { key: "unavailableReason", label: "unavailable_reason" }
]);

const OBSERVATION_EXPORT_COLUMNS = Object.freeze([
  { key: "id", label: "observation_id" },
  { key: "indicatorId", label: "indicator_id" },
  { key: "sourceId", label: "source_id" },
  { key: "cdid", label: "cdid" },
  { key: "datasetId", label: "dataset_id" },
  { key: "rawValue", label: "raw_value" },
  { key: "rawUnit", label: "raw_unit" },
  { key: "transformedValue", label: "transformed_value" },
  { key: "unit", label: "unit" },
  { key: "frequency", label: "frequency" },
  { key: "geography", label: "geography" },
  { key: "seasonalAdjustment", label: "seasonal_adjustment" },
  { key: "periodStart", label: "period_start" },
  { key: "periodEnd", label: "period_end" },
  { key: "periodLabel", label: "period_label" },
  { key: "publishedAt", label: "published_at" },
  { key: "expectedNextRelease", label: "expected_next_release" },
  { key: "retrievedAt", label: "retrieved_at" },
  { key: "state", label: "state" },
  { key: "sourceUrl", label: "source_url" },
  { key: "licence", label: "licence" },
  { key: "evidenceSha256", label: "evidence_sha256" },
  { key: "dependencyFingerprint", label: "dependency_fingerprint" },
  { key: "parserVersion", label: "parser_version" },
  { key: "denominator", label: "denominator_json" },
  { key: "supersedesId", label: "supersedes_id" },
  { key: "createdAt", label: "created_at" }
]);

const SNAPSHOT_EXPORT_COLUMNS = Object.freeze([
  { key: "date", label: "as_of_date" },
  { key: "status", label: "publication_status" },
  { key: "headlineScore", label: "headline_score" },
  { key: "level", label: "level" },
  { key: "observedPressure", label: "observed_pressure" },
  { key: "availableWeight", label: "available_weight" },
  { key: "rangeLow", label: "range_low" },
  { key: "rangeHigh", label: "range_high" },
  { key: "confidence", label: "confidence" },
  { key: "methodologyVersion", label: "methodology_version" }
]);

function runtimeNow(env) {
  return env?.CLOCK_NOW ?? new Date().toISOString();
}

function snapshotAgeDays(asOfDate, now) {
  const today = dateInTimeZone(now);
  const age = daysBetween(asOfDate, today);
  return Number.isFinite(age) ? Math.max(0, age) : null;
}

function responseHeaders(contentType, cacheControl, extraHeaders = {}) {
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    ...CORS_HEADERS,
    ...SECURITY_HEADERS,
    ...extraHeaders
  });
}

function json(payload, { status = 200, cacheControl = CACHE.current, etag = null, extraHeaders = {} } = {}) {
  const headers = responseHeaders("application/json; charset=utf-8", cacheControl, extraHeaders);
  if (etag) headers.set("ETag", etag);
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, { status, headers });
}

function csv(payload, filename, { status = 200, cacheControl = CACHE.history, extraHeaders = {} } = {}) {
  const headers = responseHeaders("text/csv; charset=utf-8", cacheControl, {
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...extraHeaders
  });
  return new Response(payload, { status, headers });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withoutBodyForHead(request, response) {
  if (request.method !== "HEAD") return response;
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function bootstrapEnabled(env) {
  return env?.BOOTSTRAP_MODE === "enabled";
}

async function loadBootstrap(env) {
  if (!env.ASSETS) return null;
  try {
    const response = await env.ASSETS.fetch(new Request("https://assets.local/data/bootstrap.json"));
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function resolveCurrent(env) {
  if (repo.hasDatabase(env)) {
    try {
      const latest = await repo.latestSnapshot(env);
      if (!latest) {
        return {
          snapshot: null,
          provenance: { store: "d1", kind: "degraded", operationalStatus: "degraded", reason: "database is bound but contains no materialised snapshot" }
        };
      }

      const ageDays = snapshotAgeDays(latest.asOfDate, runtimeNow(env));
      const operationalStatus = ageDays !== null && ageDays > MAX_SNAPSHOT_AGE_DAYS ? "stale" : "current";
      return {
        snapshot: latest.snapshot,
        provenance: {
          store: "d1",
          kind: "materialised-snapshot",
          operationalStatus,
          generatedAt: latest.generatedAt,
          asOfDate: latest.asOfDate,
          ageDays,
          maxAgeDays: MAX_SNAPSHOT_AGE_DAYS,
          evidenceFingerprint: latest.fingerprint,
          stateFingerprint: latest.stateFingerprint,
          ...(operationalStatus === "stale"
            ? { warning: `The latest daily materialisation is ${ageDays} days old.` }
            : {})
        }
      };
    } catch (error) {
      console.error("snapshot read failed", error?.message);
      return {
        snapshot: null,
        provenance: { store: "d1", kind: "degraded", operationalStatus: "degraded", reason: "database read failed" }
      };
    }
  }

  if (bootstrapEnabled(env)) {
    const bootstrap = await loadBootstrap(env);
    if (bootstrap) {
      return {
        snapshot: bootstrap.snapshot,
        provenance: {
          store: "bundled-fixture-capture",
          kind: "frozen-capture",
          operationalStatus: "bootstrap",
          generatedAt: bootstrap.snapshot?.generatedAt ?? null,
          capturedAt: bootstrap.capturedAt ?? null,
          note: "Explicit bootstrap mode is enabled. This response comes from committed ONS payload fixtures rather than live ingestion."
        }
      };
    }
  }

  return {
    snapshot: null,
    provenance: {
      store: "none",
      kind: "unavailable",
      operationalStatus: "degraded",
      reason: "no database is bound and bootstrap mode is disabled"
    }
  };
}

function methodologyDocument() {
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    status: METHODOLOGY_STATUS,
    outputs: {
      observedPressure: "Fixed-weight sum of measured indicator pressure. Not renormalised for missing data.",
      acuteOverlay: `Reviewed, decaying disruption contribution, capped at ${PUBLICATION_GATES.acuteOverlayCap} points.`,
      headlineScore: "Published only when the availability and confidence gates both pass.",
      confidence: "Evidence health: Σ(weight × quality × freshness × geographic coverage)."
    },
    publicationGates: PUBLICATION_GATES,
    levels: LEVELS,
    domains: DOMAIN_LABEL,
    qualityFactors: QUALITY_FACTOR,
    geographyCoverage: GEOGRAPHY_COVERAGE,
    indicators: INDICATORS.map((indicator) => ({
      id: indicator.id,
      title: indicator.title,
      domain: indicator.domain,
      weight: indicator.weight,
      unit: indicator.unit,
      direction: indicator.direction,
      description: indicator.description,
      breakpoints: indicator.breakpoints,
      rationale: indicator.rationale,
      collectorImplemented: indicator.sourceId !== null,
      sourceId: indicator.sourceId
    }))
  };
}

function sourcesDocument() {
  return {
    licenceNote: "ONS content is used under the Open Government Licence v3.0.",
    sources: ONS_SOURCES.map((source) => ({
      id: source.id,
      role: source.role,
      indicatorId: source.indicatorId,
      provider: source.provider,
      cdid: source.cdid,
      datasetId: source.datasetId,
      title: source.title,
      sourceUrl: source.sourceUrl,
      licence: source.licence,
      geography: { code: source.geography, label: GEOGRAPHY_LABEL[source.geography] },
      qualityClass: source.qualityClass,
      frequency: source.frequency,
      unit: source.unit,
      expectedCadenceDays: source.expectedCadenceDays,
      hardExpiryDays: source.hardExpiryDays,
      requiresDenominator: source.requiresDenominator ?? null,
      notes: source.notes
    })),
    plannedIndicatorsWithoutCollectors: INDICATORS
      .filter((indicator) => indicator.sourceId === null)
      .map((indicator) => ({ id: indicator.id, title: indicator.title, weight: indicator.weight }))
  };
}

async function evidenceHealthDocument(env) {
  const { snapshot, provenance } = await resolveCurrent(env);
  const base = {
    methodologyVersion: METHODOLOGY_VERSION,
    provenance,
    publication: snapshot?.publication ?? null,
    confidence: snapshot?.confidence ?? null,
    coverage: snapshot?.coverage ?? null,
    indicators: (snapshot?.indicators ?? []).map((indicator) => ({
      id: indicator.id,
      title: indicator.title,
      weight: indicator.weight,
      available: indicator.available,
      reason: indicator.reason,
      freshness: indicator.freshness ?? null,
      geography: indicator.geography ?? null,
      factors: indicator.factors ?? null,
      source: indicator.source
        ? {
            cdid: indicator.source.cdid,
            datasetId: indicator.source.datasetId,
            url: indicator.source.url,
            evidenceSha256: indicator.source.evidenceSha256,
            dependencyFingerprint: indicator.source.dependencyFingerprint,
            parserVersion: indicator.source.parserVersion
          }
        : null
    })),
    collectors: [],
    recentRuns: []
  };

  if (repo.hasDatabase(env)) {
    try {
      base.collectors = await repo.collectorHealth(env);
      base.recentRuns = await repo.recentRuns(env, 10);
    } catch (error) {
      console.error("evidence health read failed", error?.message);
      base.provenance = { store: "d1", kind: "degraded", operationalStatus: "degraded", reason: "evidence health read failed" };
    }
  }

  return base;
}

function exportLinks(origin) {
  return {
    currentCsv: `${origin}${API_PREFIX}/exports/current.csv`,
    observationsJson: `${origin}${API_PREFIX}/exports/observations.json`,
    observationsCsv: `${origin}${API_PREFIX}/exports/observations.csv`,
    snapshotsJson: `${origin}${API_PREFIX}/exports/snapshots.json`,
    snapshotsCsv: `${origin}${API_PREFIX}/exports/snapshots.csv`,
    manifest: `${origin}${API_PREFIX}/exports/manifest.json`
  };
}

function openApiDocument(origin) {
  const path = (summary, options = {}) => ({
    get: {
      summary,
      ...(options.deprecated ? { deprecated: true } : {}),
      responses: { 200: { description: summary }, 503: { description: "Evidence store unavailable or stale" } }
    }
  });
  return {
    openapi: "3.1.0",
    info: {
      title: "UK Stability Monitor API",
      version: METHODOLOGY_VERSION,
      description: "Read-only access to observable systemic pressure. It is not a prediction of state failure."
    },
    servers: [{ url: origin }],
    paths: {
      [`${API_PREFIX}/current`]: path("Current snapshot: pressure, confidence, gates and indicators"),
      [`${API_PREFIX}/index`]: path("Compatibility alias for /api/v1/current", { deprecated: true }),
      [`${API_PREFIX}/history`]: path("Materialised snapshot history"),
      [`${API_PREFIX}/indicators/{id}`]: path("One indicator with its definition and observation history"),
      [`${API_PREFIX}/evidence-health`]: path("Collector health, freshness and publication gates"),
      [`${API_PREFIX}/methodology`]: path("Weights, curves, gates and levels"),
      [`${API_PREFIX}/sources`]: path("Source register with exact series identifiers"),
      [`${API_PREFIX}/health`]: path("Service health and binding state"),
      [`${API_PREFIX}/exports/manifest.json`]: path("Machine-readable export catalogue and scope notes"),
      [`${API_PREFIX}/exports/current.csv`]: path("Current ten-indicator snapshot as CSV"),
      [`${API_PREFIX}/exports/observations.json`]: path("Verified and revised observation history as JSON"),
      [`${API_PREFIX}/exports/observations.csv`]: path("Verified and revised observation history as CSV"),
      [`${API_PREFIX}/exports/snapshots.json`]: path("Daily materialised snapshot history as JSON"),
      [`${API_PREFIX}/exports/snapshots.csv`]: path("Daily materialised snapshot history as CSV")
    }
  };
}

async function healthDocument(env) {
  const result = {
    ok: true,
    status: "healthy",
    methodologyVersion: METHODOLOGY_VERSION,
    stage: METHODOLOGY_STATUS.stage,
    commit: env.GIT_SHA ?? "unknown",
    bindings: {
      database: repo.hasDatabase(env),
      assets: Boolean(env.ASSETS),
      bootstrapMode: bootstrapEnabled(env)
    },
    snapshot: null,
    latestRun: null,
    timestamp: runtimeNow(env)
  };

  if (repo.hasDatabase(env)) {
    try {
      const latest = await repo.latestSnapshot(env);
      const runs = await repo.recentRuns(env, 1);
      result.latestRun = runs[0] ?? null;
      if (!latest) {
        result.ok = false;
        result.status = "degraded";
        result.reason = "database is readable but no snapshot exists";
      } else {
        const ageDays = snapshotAgeDays(latest.asOfDate, result.timestamp);
        result.snapshot = {
          asOfDate: latest.asOfDate,
          generatedAt: latest.generatedAt,
          ageDays,
          maxAgeDays: MAX_SNAPSHOT_AGE_DAYS
        };
        if (ageDays !== null && ageDays > MAX_SNAPSHOT_AGE_DAYS) {
          result.ok = false;
          result.status = "degraded";
          result.reason = `latest daily materialisation is ${ageDays} days old`;
        }
      }
      if (result.latestRun?.status === "failed") {
        result.ok = false;
        result.status = "degraded";
        result.reason = "latest ingestion run failed";
      }
    } catch (error) {
      console.error("health read failed", error?.message);
      result.ok = false;
      result.status = "degraded";
      result.reason = "database read failed";
    }
  } else if (bootstrapEnabled(env)) {
    const bootstrap = await loadBootstrap(env);
    result.status = bootstrap ? "bootstrap" : "degraded";
    result.ok = Boolean(bootstrap);
    if (!bootstrap) result.reason = "bootstrap mode enabled but fixture capture is unavailable";
  } else {
    result.ok = false;
    result.status = "degraded";
    result.reason = "no database is bound and bootstrap mode is disabled";
  }

  return result;
}

function currentExtraHeaders(provenance, compatibility) {
  const headers = {};
  if (compatibility) {
    headers.Deprecation = "true";
    headers.Link = `</api/v1/current>; rel="successor-version"`;
  }
  if (provenance?.operationalStatus === "stale") {
    headers.Warning = `110 - "Snapshot is ${provenance.ageDays} days old"`;
    headers["X-Snapshot-Age-Days"] = String(provenance.ageDays);
  }
  return headers;
}

function currentExportRows(snapshot, provenance) {
  return (snapshot.indicators ?? []).map((indicator) => ({
    snapshotAsOf: snapshot.asOf,
    generatedAt: snapshot.generatedAt,
    methodologyVersion: snapshot.methodologyVersion,
    operationalStatus: provenance.operationalStatus,
    indicatorId: indicator.id,
    title: indicator.title,
    domain: indicator.domain,
    weight: indicator.weight,
    available: indicator.available,
    value: indicator.value,
    unit: indicator.unit,
    pressure: indicator.pressure,
    contribution: indicator.contribution,
    confidenceContribution: indicator.confidenceContribution,
    periodStart: indicator.period?.start,
    periodEnd: indicator.period?.end,
    periodLabel: indicator.period?.label,
    geographyCode: indicator.geography?.code,
    geographyLabel: indicator.geography?.label,
    freshnessStage: indicator.freshness?.stage,
    publishedAt: indicator.freshness?.publishedAt,
    sourceProvider: indicator.source?.provider,
    sourceCdid: indicator.source?.cdid,
    sourceDatasetId: indicator.source?.datasetId,
    sourceUrl: indicator.source?.url,
    licence: indicator.source?.licence,
    evidenceSha256: indicator.source?.evidenceSha256,
    dependencyFingerprint: indicator.source?.dependencyFingerprint,
    parserVersion: indicator.source?.parserVersion,
    unavailableReason: indicator.reason
  }));
}

async function observationExportRows(env, limitPerIndicator) {
  const groups = await Promise.all(
    INDICATORS.map((indicator) => repo.observationHistory(env, indicator.id, limitPerIndicator))
  );
  return groups.flat().sort((a, b) =>
    a.indicatorId.localeCompare(b.indicatorId) ||
    a.periodEnd.localeCompare(b.periodEnd) ||
    a.id - b.id
  );
}

function snapshotExportRows(points) {
  return points.map((point) => ({
    ...point,
    rangeLow: point.range?.low,
    rangeHigh: point.range?.high
  }));
}

async function handleCurrent(request, env, compatibility = false) {
  const { snapshot, provenance } = await resolveCurrent(env);
  const extraHeaders = currentExtraHeaders(provenance, compatibility);
  if (!snapshot) {
    return json({ error: "evidence_store_unavailable", provenance }, {
      status: 503,
      cacheControl: CACHE.none,
      extraHeaders
    });
  }
  const etag = `"${provenance.stateFingerprint ?? provenance.evidenceFingerprint ?? snapshot.generatedAt}-${METHODOLOGY_VERSION}"`;
  if (request.headers.get("if-none-match") === etag) {
    const headers = responseHeaders("application/json; charset=utf-8", CACHE.current, { ETag: etag, ...extraHeaders });
    return new Response(null, { status: 304, headers });
  }
  return json({ ...snapshot, provenance }, { cacheControl: CACHE.current, etag, extraHeaders });
}

async function handleExports(request, env, url) {
  const { pathname } = url;
  const links = exportLinks(url.origin);

  if (pathname === `${API_PREFIX}/exports/manifest.json`) {
    const { snapshot, provenance } = await resolveCurrent(env);
    return json({
      product: "UK Stability Monitor",
      methodologyVersion: METHODOLOGY_VERSION,
      generatedAt: runtimeNow(env),
      provenance,
      currentSnapshot: snapshot
        ? {
            asOf: snapshot.asOf,
            generatedAt: snapshot.generatedAt,
            publicationStatus: snapshot.publication?.status,
            evidenceFingerprint: provenance.evidenceFingerprint,
            stateFingerprint: provenance.stateFingerprint
          }
        : null,
      exports: links,
      scope: {
        currentCsv: "All ten fixed-weight indicators in the latest materialised or explicit bootstrap snapshot.",
        observations: "Verified and revised observation versions stored in D1; bootstrap fixtures are not presented as canonical history.",
        snapshots: "Latest materialisation for each civil day and methodology version stored in D1."
      },
      limitations: [
        "A daily snapshot is a recalculation date, not a claim that every official statistic changed that day.",
        "Observation exports currently include verified and revised states because those are the public analytical history.",
        "Raw archived payloads remain private in R2; each public observation exposes the SHA-256 needed to verify the archived bytes."
      ],
      licence: {
        code: "MIT",
        sourceData: "Open Government Licence v3.0; source attribution is retained per observation."
      }
    }, { cacheControl: CACHE.health });
  }

  if (pathname === `${API_PREFIX}/exports/current.csv`) {
    const { snapshot, provenance } = await resolveCurrent(env);
    if (!snapshot) return json({ error: "evidence_store_unavailable", provenance }, { status: 503, cacheControl: CACHE.none });
    return csv(
      toCsv(CURRENT_EXPORT_COLUMNS, currentExportRows(snapshot, provenance)),
      `uk-stability-current-${snapshot.asOf.slice(0, 10)}.csv`,
      { cacheControl: CACHE.current, extraHeaders: currentExtraHeaders(provenance, false) }
    );
  }

  const isObservations = pathname === `${API_PREFIX}/exports/observations.json` || pathname === `${API_PREFIX}/exports/observations.csv`;
  const isSnapshots = pathname === `${API_PREFIX}/exports/snapshots.json` || pathname === `${API_PREFIX}/exports/snapshots.csv`;
  if (!isObservations && !isSnapshots) return null;

  if (!repo.hasDatabase(env)) {
    return json({
      error: "canonical_history_unavailable",
      message: "Canonical observation and snapshot exports require a readable D1 database. Bootstrap fixtures are never presented as historical records.",
      exports: links
    }, { status: 503, cacheControl: CACHE.none });
  }

  try {
    if (isObservations) {
      const limitPerIndicator = boundedInteger(url.searchParams.get("limit_per_indicator"), 500, { max: 500 });
      const rows = await observationExportRows(env, limitPerIndicator);
      if (pathname.endsWith(".csv")) {
        return csv(toCsv(OBSERVATION_EXPORT_COLUMNS, rows), "uk-stability-observations.csv");
      }
      return json({
        exportKind: "verified-and-revised-observations",
        methodologyVersion: METHODOLOGY_VERSION,
        generatedAt: runtimeNow(env),
        limitPerIndicator,
        count: rows.length,
        observations: rows
      }, { cacheControl: CACHE.history });
    }

    const limit = boundedInteger(url.searchParams.get("limit"), 2000, { max: 2000 });
    const points = await repo.snapshotHistory(env, limit);
    const rows = snapshotExportRows(points);
    if (pathname.endsWith(".csv")) {
      return csv(toCsv(SNAPSHOT_EXPORT_COLUMNS, rows), "uk-stability-snapshots.csv");
    }
    return json({
      exportKind: "daily-materialised-snapshots",
      methodologyVersion: METHODOLOGY_VERSION,
      generatedAt: runtimeNow(env),
      count: points.length,
      snapshots: points
    }, { cacheControl: CACHE.history });
  } catch (error) {
    console.error("export read failed", error?.message);
    return json({ error: "evidence_store_unavailable" }, { status: 503, cacheControl: CACHE.none });
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
        ...SECURITY_HEADERS
      }
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed", message: "This API is read-only." }, {
      status: 405,
      cacheControl: CACHE.none
    });
  }

  if (pathname === `${API_PREFIX}/current`) return handleCurrent(request, env, false);
  if (pathname === `${API_PREFIX}/index`) return handleCurrent(request, env, true);
  if (pathname.startsWith(`${API_PREFIX}/exports/`)) {
    const exportResponse = await handleExports(request, env, url);
    if (exportResponse) return exportResponse;
  }

  if (pathname === `${API_PREFIX}/history`) {
    if (repo.hasDatabase(env)) {
      try {
        const points = await repo.snapshotHistory(env, boundedInteger(url.searchParams.get("limit"), 365, { max: 2000 }));
        if (points.length > 0) {
          return json({ seriesKind: "materialised-snapshots", points }, { cacheControl: CACHE.history });
        }
      } catch (error) {
        console.error("history read failed", error?.message);
        return json({ error: "evidence_store_unavailable" }, { status: 503, cacheControl: CACHE.none });
      }
    }
    return json({ seriesKind: "unavailable", points: [], note: "No calculated history exists yet; no illustrative series is served in its place." }, { cacheControl: CACHE.history });
  }

  const indicatorMatch = /^\/api\/v1\/indicators\/([a-z0-9_]+)$/.exec(pathname);
  if (indicatorMatch) {
    const id = indicatorMatch[1];
    const definition = INDICATORS.find((indicator) => indicator.id === id);
    if (!definition) return json({ error: "not_found", message: `Unknown indicator: ${id}` }, { status: 404, cacheControl: CACHE.none });

    const { snapshot, provenance } = await resolveCurrent(env);
    if (!snapshot) return json({ error: "evidence_store_unavailable", definition, provenance }, { status: 503, cacheControl: CACHE.none });
    const current = snapshot.indicators?.find((indicator) => indicator.id === id) ?? null;

    let history = [];
    if (repo.hasDatabase(env)) {
      try {
        history = (await repo.observationHistory(env, id, 60)).map((observation) => ({
          periodLabel: observation.periodLabel,
          periodStart: observation.periodStart,
          periodEnd: observation.periodEnd,
          value: observation.transformedValue,
          unit: observation.unit,
          publishedAt: observation.publishedAt,
          state: observation.state,
          evidenceSha256: observation.evidenceSha256,
          dependencyFingerprint: observation.dependencyFingerprint,
          denominator: observation.denominator
        }));
      } catch (error) {
        console.error("indicator history read failed", error?.message);
        return json({ error: "evidence_store_unavailable", definition, provenance }, { status: 503, cacheControl: CACHE.none });
      }
    }

    return json({ definition, current, history, provenance }, { cacheControl: CACHE.current, extraHeaders: currentExtraHeaders(provenance, false) });
  }

  if (pathname === `${API_PREFIX}/evidence-health`) {
    const document = await evidenceHealthDocument(env);
    const degraded = document.provenance?.operationalStatus === "degraded" || document.provenance?.operationalStatus === "stale";
    return json(document, { status: degraded ? 503 : 200, cacheControl: degraded ? CACHE.none : CACHE.health });
  }
  if (pathname === `${API_PREFIX}/methodology`) return json(methodologyDocument(), { cacheControl: CACHE.methodology });
  if (pathname === `${API_PREFIX}/sources`) return json(sourcesDocument(), { cacheControl: CACHE.methodology });
  if (pathname === `${API_PREFIX}/health`) {
    const health = await healthDocument(env);
    return json(health, { status: health.ok ? 200 : 503, cacheControl: CACHE.none });
  }
  if (pathname === `${API_PREFIX}/openapi.json`) return json(openApiDocument(url.origin), { cacheControl: CACHE.methodology });

  return json({ error: "not_found" }, { status: 404, cacheControl: CACHE.none });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withoutBodyForHead(request, await handleApi(request, env));
    }
    if (!env.ASSETS) return json({ error: "assets_binding_missing" }, { status: 503, cacheControl: CACHE.none });
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
