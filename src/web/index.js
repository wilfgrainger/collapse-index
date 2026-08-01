/**
 * Public Worker: static assets and the read-only JSON API (WP8).
 *
 * This Worker never calculates from source data and never writes. It returns
 * the last materialised snapshot, or — when no database is bound — the bundled
 * capture generated from the committed ONS fixtures. Both paths declare which
 * one produced the response, because "where did this number come from" must be
 * answerable from the response itself.
 */

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

function json(payload, { status = 200, cacheControl = CACHE.current, etag = null } = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
    ...SECURITY_HEADERS
  });
  if (etag) headers.set("ETag", etag);
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, { status, headers });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Resolves the current snapshot and states plainly which store answered.
 */
async function resolveCurrent(env) {
  if (repo.hasDatabase(env)) {
    try {
      const latest = await repo.latestSnapshot(env);
      if (latest) {
        return {
          snapshot: latest.snapshot,
          provenance: {
            store: "d1",
            kind: "materialised-snapshot",
            generatedAt: latest.generatedAt,
            evidenceFingerprint: latest.fingerprint
          }
        };
      }
    } catch (error) {
      console.error("snapshot read failed", error?.message);
    }
  }

  // Bundled capture: real ONS evidence, frozen at the recorded retrieval time.
  const bootstrap = await loadBootstrap(env);
  if (bootstrap) {
    return {
      snapshot: bootstrap.snapshot,
      provenance: {
        store: "bundled-fixture-capture",
        kind: "frozen-capture",
        generatedAt: bootstrap.snapshot?.generatedAt ?? null,
        capturedAt: bootstrap.capturedAt ?? null,
        note:
          "No database is bound, so this response is derived from committed ONS payload fixtures " +
          "rather than live ingestion. The evidence hashes are real; the retrieval date is frozen."
      }
    };
  }

  return { snapshot: null, provenance: { store: "none", kind: "unavailable" } };
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
    }
  }

  return base;
}

function openApiDocument(origin) {
  const path = (summary) => ({ get: { summary, responses: { 200: { description: summary } } } });
  return {
    openapi: "3.1.0",
    info: {
      title: "UK Stability Monitor API",
      version: METHODOLOGY_VERSION,
      description:
        "Read-only access to the UK Stability Monitor. Measures observable systemic pressure; " +
        "it is not a prediction of state failure. No mutation routes exist."
    },
    servers: [{ url: origin }],
    paths: {
      [`${API_PREFIX}/current`]: path("Current snapshot: pressure, confidence, gates and indicators"),
      [`${API_PREFIX}/history`]: path("Materialised snapshot history"),
      [`${API_PREFIX}/indicators/{id}`]: path("One indicator with its definition and observation history"),
      [`${API_PREFIX}/evidence-health`]: path("Collector health, freshness and publication gates"),
      [`${API_PREFIX}/methodology`]: path("Weights, curves, gates and levels"),
      [`${API_PREFIX}/sources`]: path("Source register with exact series identifiers"),
      [`${API_PREFIX}/health`]: path("Service health and binding state")
    }
  };
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
      status: 405, cacheControl: CACHE.none
    });
  }

  if (pathname === `${API_PREFIX}/current`) {
    const { snapshot, provenance } = await resolveCurrent(env);
    if (!snapshot) {
      return json({ error: "no_snapshot", message: "No snapshot or bundled capture is available." }, {
        status: 503, cacheControl: CACHE.none
      });
    }
    const etag = `"${provenance.evidenceFingerprint ?? snapshot.generatedAt}-${METHODOLOGY_VERSION}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE.current } });
    }
    return json({ ...snapshot, provenance }, { cacheControl: CACHE.current, etag });
  }

  if (pathname === `${API_PREFIX}/history`) {
    if (repo.hasDatabase(env)) {
      try {
        const points = await repo.snapshotHistory(env, Number(url.searchParams.get("limit") ?? 365));
        if (points.length > 0) {
          return json({ seriesKind: "materialised-snapshots", points }, { cacheControl: CACHE.history });
        }
      } catch (error) {
        console.error("history read failed", error?.message);
      }
    }
    return json({
      seriesKind: "unavailable",
      points: [],
      note:
        "No calculated history exists yet. A reproducible backcast requires source histories and " +
        "is release 0.3; no illustrative series is served in its place."
    }, { cacheControl: CACHE.history });
  }

  const indicatorMatch = /^\/api\/v1\/indicators\/([a-z0-9_]+)$/.exec(pathname);
  if (indicatorMatch) {
    const id = indicatorMatch[1];
    const definition = INDICATORS.find((indicator) => indicator.id === id);
    if (!definition) {
      return json({ error: "not_found", message: `Unknown indicator: ${id}` }, {
        status: 404, cacheControl: CACHE.none
      });
    }
    const { snapshot, provenance } = await resolveCurrent(env);
    const current = snapshot?.indicators?.find((indicator) => indicator.id === id) ?? null;

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
          evidenceSha256: observation.evidenceSha256
        }));
      } catch (error) {
        console.error("indicator history read failed", error?.message);
      }
    }

    return json({ definition, current, history, provenance }, { cacheControl: CACHE.current });
  }

  if (pathname === `${API_PREFIX}/evidence-health`) {
    return json(await evidenceHealthDocument(env), { cacheControl: CACHE.health });
  }

  if (pathname === `${API_PREFIX}/methodology`) {
    return json(methodologyDocument(), { cacheControl: CACHE.methodology });
  }

  if (pathname === `${API_PREFIX}/sources`) {
    return json(sourcesDocument(), { cacheControl: CACHE.methodology });
  }

  if (pathname === `${API_PREFIX}/health`) {
    return json({
      ok: true,
      methodologyVersion: METHODOLOGY_VERSION,
      stage: METHODOLOGY_STATUS.stage,
      commit: env.GIT_SHA ?? "unknown",
      bindings: { database: repo.hasDatabase(env), assets: Boolean(env.ASSETS) },
      timestamp: new Date().toISOString()
    }, { cacheControl: CACHE.none });
  }

  if (pathname === `${API_PREFIX}/openapi.json`) {
    return json(openApiDocument(url.origin), { cacheControl: CACHE.methodology });
  }

  return json({ error: "not_found" }, { status: 404, cacheControl: CACHE.none });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (!env.ASSETS) {
      return json({ error: "assets_binding_missing" }, { status: 503, cacheControl: CACHE.none });
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
