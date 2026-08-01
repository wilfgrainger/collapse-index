/** Public Worker: static assets and read-only JSON API. */

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

const API_PREFIX = "/api/v1";

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

const CACHE = Object.freeze({
  current: "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
  history: "public, max-age=3600, s-maxage=3600",
  methodology: "public, max-age=86400, s-maxage=86400",
  health: "public, max-age=60, s-maxage=60",
  none: "no-store"
});

function json(payload, { status = 200, cacheControl = CACHE.current, etag = null, extraHeaders = {} } = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
    ...SECURITY_HEADERS,
    ...extraHeaders
  });
  if (etag) headers.set("ETag", etag);
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, { status, headers });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
          provenance: { store: "d1", kind: "degraded", reason: "database is bound but contains no materialised snapshot" }
        };
      }
      return {
        snapshot: latest.snapshot,
        provenance: {
          store: "d1",
          kind: "materialised-snapshot",
          generatedAt: latest.generatedAt,
          asOfDate: latest.asOfDate,
          evidenceFingerprint: latest.fingerprint,
          stateFingerprint: latest.stateFingerprint
        }
      };
    } catch (error) {
      console.error("snapshot read failed", error?.message);
      return {
        snapshot: null,
        provenance: { store: "d1", kind: "degraded", reason: "database read failed" }
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
      base.provenance = { store: "d1", kind: "degraded", reason: "evidence health read failed" };
    }
  }

  return base;
}

function openApiDocument(origin) {
  const path = (summary, options = {}) => ({
    get: {
      summary,
      ...(options.deprecated ? { deprecated: true } : {}),
      responses: { 200: { description: summary }, 503: { description: "Evidence store unavailable" } }
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
      [`${API_PREFIX}/health`]: path("Service health and binding state")
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
    timestamp: new Date().toISOString()
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
        const today = dateInTimeZone(result.timestamp);
        result.snapshot = {
          asOfDate: latest.asOfDate,
          generatedAt: latest.generatedAt,
          ageDays: daysBetween(latest.asOfDate, today)
        };
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

async function handleCurrent(request, env, compatibility = false) {
  const { snapshot, provenance } = await resolveCurrent(env);
  if (!snapshot) {
    return json({ error: "evidence_store_unavailable", provenance }, {
      status: 503,
      cacheControl: CACHE.none,
      extraHeaders: compatibility ? { Deprecation: "true", Link: `</api/v1/current>; rel="successor-version"` } : {}
    });
  }
  const etag = `"${provenance.stateFingerprint ?? provenance.evidenceFingerprint ?? snapshot.generatedAt}-${METHODOLOGY_VERSION}"`;
  if (request.headers.get("if-none-match") === etag) {
    const headers = new Headers({ ETag: etag, "Cache-Control": CACHE.current, ...SECURITY_HEADERS });
    if (compatibility) {
      headers.set("Deprecation", "true");
      headers.set("Link", `</api/v1/current>; rel="successor-version"`);
    }
    return new Response(null, { status: 304, headers });
  }
  return json({ ...snapshot, provenance }, {
    cacheControl: CACHE.current,
    etag,
    extraHeaders: compatibility ? { Deprecation: "true", Link: `</api/v1/current>; rel="successor-version"` } : {}
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
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

  if (pathname === `${API_PREFIX}/history`) {
    if (repo.hasDatabase(env)) {
      try {
        const points = await repo.snapshotHistory(env, Number(url.searchParams.get("limit") ?? 365));
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

    return json({ definition, current, history, provenance }, { cacheControl: CACHE.current });
  }

  if (pathname === `${API_PREFIX}/evidence-health`) {
    const document = await evidenceHealthDocument(env);
    const degraded = document.provenance?.kind === "degraded";
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
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (!env.ASSETS) return json({ error: "assets_binding_missing" }, { status: 503, cacheControl: CACHE.none });
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
