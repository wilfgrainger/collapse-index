import { INDEX_VERSION, INDICATORS, LEVELS, METHODOLOGY_SUMMARY } from "./config.js";
import { readCurrentState, readHistory, persistDailySnapshot } from "./repository.js";

const API_PREFIX = "/api/v1";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
};

function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", init.cacheControl ?? "public, max-age=300, s-maxage=300, stale-while-revalidate=900");
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function openApiDocument(url) {
  return {
    openapi: "3.1.0",
    info: {
      title: "UK Stability Monitor API",
      version: INDEX_VERSION,
      description: "Transparent national systemic-pressure index. Higher scores mean greater pressure."
    },
    servers: [{ url: new URL(url).origin }],
    paths: {
      [`${API_PREFIX}/index`]: { get: { summary: "Current index and indicator breakdown", responses: { "200": { description: "Current calculated state" } } } },
      [`${API_PREFIX}/history`]: { get: { summary: "Historical calculated snapshots or labelled prototype backcast", responses: { "200": { description: "History series" } } } },
      [`${API_PREFIX}/methodology`]: { get: { summary: "Indicator definitions and scoring rules", responses: { "200": { description: "Methodology" } } } },
      [`${API_PREFIX}/health`]: { get: { summary: "Service and data-mode health", responses: { "200": { description: "Health state" } } } }
    }
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, { status: 405, cacheControl: "no-store" });
  }

  if (url.pathname === `${API_PREFIX}/index`) {
    const asOf = url.searchParams.get("asOf") ?? new Date().toISOString();
    const state = await readCurrentState(env, asOf);
    return json({ ...state.snapshot, storage: state.storage, warning: state.warning });
  }

  if (url.pathname === `${API_PREFIX}/history`) {
    return json(await readHistory(env), { cacheControl: "public, max-age=3600, s-maxage=3600" });
  }

  if (url.pathname === `${API_PREFIX}/methodology`) {
    return json({
      methodologyVersion: INDEX_VERSION,
      summary: METHODOLOGY_SUMMARY,
      levels: LEVELS,
      indicators: INDICATORS
    }, { cacheControl: "public, max-age=86400, s-maxage=86400" });
  }

  if (url.pathname === `${API_PREFIX}/health`) {
    return json({
      ok: true,
      version: INDEX_VERSION,
      dataMode: env.DATA_MODE ?? "prototype",
      databaseBound: Boolean(env.DB),
      timestamp: new Date().toISOString()
    }, { cacheControl: "no-store" });
  }

  if (url.pathname === `${API_PREFIX}/openapi.json`) {
    return json(openApiDocument(request.url), { cacheControl: "public, max-age=86400, s-maxage=86400" });
  }

  return json({ error: "not_found" }, { status: 404, cacheControl: "no-store" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);

    if (!env.ASSETS) {
      return json({
        error: "assets_binding_missing",
        message: "Run with Wrangler so the static asset binding is available."
      }, { status: 503, cacheControl: "no-store" });
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await persistDailySnapshot(env, new Date(controller.scheduledTime).toISOString());
      console.log("daily index recompute", result);
    })());
  }
};
