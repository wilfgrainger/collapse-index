/** Public API behaviour. */

import test from "node:test";
import assert from "node:assert/strict";

import worker from "../../src/web/index.js";
import { runIngestion } from "../../src/ingest/orchestrator.js";
import { METHODOLOGY_VERSION } from "../../src/domain/methodology/v1.js";
import { createFixtureFetch, createTestBucket, createTestDatabase } from "../helpers/bindings.js";
import { fixturesByUrl } from "../helpers/fixtures.js";

const ORIGIN = "https://monitor.example";

function createAssets() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/data/bootstrap.json") {
        const { readFile } = await import("node:fs/promises");
        const path = new URL("../../public/data/bootstrap.json", import.meta.url);
        return new Response(await readFile(path, "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("<!DOCTYPE html><html><body>home</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    }
  };
}

async function ingestedEnv() {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket(), ASSETS: createAssets() };
  await runIngestion(env, {
    trigger: "test",
    now: "2026-08-01T09:00:00.000Z",
    fetchImpl: createFixtureFetch(await fixturesByUrl())
  });
  return env;
}

function get(env, path, headers = {}) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, { headers }), env);
}

test("/api/v1/current reports suppression honestly", async () => {
  const env = await ingestedEnv();
  const response = await get(env, "/api/v1/current");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.publication.status, "suppressed");
  assert.equal(body.publication.headlineScore, null);
  assert.equal(body.publication.level, null);
  assert.match(body.publication.reason, /availability/);
  assert.equal(body.structural.availableWeight, 0.4);
  assert.equal(body.structural.missingWeight, 0.6);
  assert.ok(body.structural.range.high > body.structural.range.low);
  assert.ok(body.confidence.percent < 70);
  assert.equal(body.acute.overlay, 0);
  assert.equal(body.provenance.store, "d1");
  assert.equal(body.coverage.indicatorsAvailable, 4);
  assert.equal(body.coverage.missingIndicators.length, 6);
});

test("current output never omits period, geography or source identity", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/current")).json();

  for (const indicator of body.indicators.filter((i) => i.available)) {
    assert.ok(indicator.period?.start);
    assert.ok(indicator.period?.end);
    assert.ok(indicator.geography?.label);
    assert.ok(indicator.source?.cdid);
    assert.ok(indicator.source?.url);
    assert.ok(indicator.source?.licence);
    assert.match(indicator.source.evidenceSha256, /^[0-9a-f]{64}$/);
    assert.ok(indicator.source.dependencyFingerprint);
    assert.ok(indicator.freshness?.publishedAt);
    assert.ok(indicator.freshness?.publishedDate);
  }

  for (const indicator of body.indicators.filter((i) => !i.available)) {
    assert.ok(indicator.reason);
    assert.equal(indicator.contribution, 0);
  }
});

test("the API is read-only", async () => {
  const env = await ingestedEnv();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await worker.fetch(new Request(`${ORIGIN}/api/v1/current`, { method }), env);
    assert.equal(response.status, 405);
  }
  assert.equal(typeof worker.scheduled, "undefined");
});

test("current responses carry an ETag that tracks materialised state", async () => {
  const env = await ingestedEnv();
  const first = await get(env, "/api/v1/current");
  const etag = first.headers.get("etag");
  assert.ok(etag);
  assert.equal((await get(env, "/api/v1/current", { "if-none-match": etag })).status, 304);
});

test("security headers are applied to API and asset responses", async () => {
  const env = await ingestedEnv();
  for (const path of ["/api/v1/current", "/"]) {
    const response = await get(env, path);
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
});

test("/api/v1/evidence-health exposes collectors and gates", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/evidence-health")).json();
  assert.equal(body.collectors.length, 5);
  assert.equal(body.recentRuns.length, 1);
  assert.equal(body.publication.status, "suppressed");
  const cpi = body.collectors.find((collector) => collector.sourceId === "ons-d7g7");
  assert.equal(cpi.lastOutcome, "changed");
  assert.equal(cpi.expectedNextRelease, "2026-08-19");
});

test("/api/v1/methodology publishes weights, curves and gates", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/methodology")).json();
  assert.equal(body.methodologyVersion, METHODOLOGY_VERSION);
  assert.equal(body.indicators.length, 10);
  assert.ok(Math.abs(body.indicators.reduce((sum, indicator) => sum + indicator.weight, 0) - 1) < 1e-9);
  assert.equal(body.indicators.filter((i) => i.collectorImplemented).length, 4);
  for (const indicator of body.indicators) {
    assert.ok(indicator.breakpoints.length >= 2);
    assert.ok(indicator.rationale);
  }
  assert.equal(body.publicationGates.minAvailableWeight, 0.9);
});

test("/api/v1/sources lists exact series and the gaps", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/sources")).json();
  assert.equal(body.sources.length, 5);
  assert.deepEqual(body.sources.map((source) => source.cdid).sort(), ["BBFW", "D7G7", "MGRZ", "MGSX", "N3Y6"]);
  assert.equal(body.plannedIndicatorsWithoutCollectors.length, 6);
});

test("/api/v1/indicators/:id returns definition, current value and history", async () => {
  const env = await ingestedEnv();
  const body = await (await get(env, "/api/v1/indicators/cpi_inflation")).json();
  assert.equal(body.definition.id, "cpi_inflation");
  assert.equal(body.current.value, 2.6);
  assert.equal(body.history.length, 1);
  assert.equal(body.history[0].periodLabel, "2026 JUN");
  assert.ok(body.history[0].dependencyFingerprint);

  const missing = await (await get(env, "/api/v1/indicators/trust_in_government")).json();
  assert.equal(missing.current.available, false);
  assert.equal(missing.history.length, 0);
});

test("an unknown indicator returns 404, and path traversal does not match", async () => {
  const env = await ingestedEnv();
  assert.equal((await get(env, "/api/v1/indicators/nonsense")).status, 404);
  assert.equal((await get(env, "/api/v1/indicators/../../etc/passwd")).status, 404);
  assert.equal((await get(env, "/api/v1/nope")).status, 404);
});

test("history serves calculated snapshots and never an illustrative stand-in", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/history")).json();
  assert.equal(body.seriesKind, "materialised-snapshots");
  assert.equal(body.points.length, 1);
  assert.equal(body.points[0].status, "suppressed");
  assert.equal(body.points[0].headlineScore, null);
});

test("with no database, history is empty rather than invented", async () => {
  const body = await (await get({ ASSETS: createAssets() }, "/api/v1/history")).json();
  assert.equal(body.seriesKind, "unavailable");
  assert.deepEqual(body.points, []);
});

test("bootstrap fallback is explicit and clearly labelled", async () => {
  const env = { ASSETS: createAssets(), BOOTSTRAP_MODE: "enabled" };
  const response = await get(env, "/api/v1/current");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.provenance.store, "bundled-fixture-capture");
  assert.match(body.provenance.note, /explicit bootstrap mode/i);
  assert.equal(body.publication.status, "suppressed");
  const cpi = body.indicators.find((indicator) => indicator.id === "cpi_inflation");
  assert.equal(cpi.value, 2.6);
  assert.match(cpi.source.evidenceSha256, /^[0-9a-f]{64}$/);
});

test("without an explicit bootstrap mode, an unbound service is degraded", async () => {
  const response = await get({ ASSETS: createAssets() }, "/api/v1/current");
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.provenance.kind, "unavailable");
});

test("/api/v1/health reports real operational state", async () => {
  const healthyResponse = await get(await ingestedEnv(), "/api/v1/health");
  const healthy = await healthyResponse.json();
  assert.equal(healthyResponse.status, 200);
  assert.equal(healthy.ok, true);
  assert.equal(healthy.bindings.database, true);
  assert.ok(healthy.snapshot.asOfDate);

  const bootstrapResponse = await get({ ASSETS: createAssets(), BOOTSTRAP_MODE: "enabled" }, "/api/v1/health");
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrapResponse.status, 200);
  assert.equal(bootstrap.status, "bootstrap");
  assert.equal(bootstrap.bindings.database, false);
});

test("the OpenAPI document describes only read routes and the compatibility alias", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/openapi.json")).json();
  for (const [path, operations] of Object.entries(body.paths)) {
    assert.deepEqual(Object.keys(operations), ["get"], `${path} exposes a non-GET operation`);
  }
  assert.equal(body.paths["/api/v1/index"].get.deprecated, true);
});
