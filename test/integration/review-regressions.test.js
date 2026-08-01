import test from "node:test";
import assert from "node:assert/strict";

import worker from "../../src/web/index.js";
import { runIngestion } from "../../src/ingest/orchestrator.js";
import { sourceById } from "../../src/collectors/ons/registry.js";
import * as repo from "../../src/storage/d1/repository.js";
import { createFixtureFetch, createTestBucket, createTestDatabase } from "../helpers/bindings.js";
import { fixturesByUrl } from "../helpers/fixtures.js";

async function createEnv() {
  return { DB: await createTestDatabase(), EVIDENCE: createTestBucket() };
}

async function ingest(env, now, fetchImpl) {
  return runIngestion(env, { trigger: "regression", now, fetchImpl });
}

test("unchanged evidence still creates a new dated snapshot on the next day", async () => {
  const env = await createEnv();
  const fixtures = await fixturesByUrl();

  const first = await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(fixtures));
  const sameDay = await ingest(env, "2026-08-01T10:00:00.000Z", createFixtureFetch(fixtures));
  const nextDay = await ingest(env, "2026-08-02T09:00:00.000Z", createFixtureFetch(fixtures));

  assert.equal(first.snapshotCreated, true);
  assert.equal(sameDay.snapshotCreated, false, "same state on the same day deduplicates");
  assert.equal(nextDay.snapshotCreated, true, "time-dependent state advances on a new day");

  const rows = env.DB._raw.prepare("SELECT as_of_date FROM snapshots ORDER BY id").all();
  assert.deepEqual(rows.map((row) => row.as_of_date), ["2026-08-01", "2026-08-02"]);
});

test("freshness can expire without any upstream byte changing", async () => {
  const env = await createEnv();
  const fixtures = await fixturesByUrl();
  await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(fixtures));

  const later = await ingest(env, "2027-03-01T09:00:00.000Z", createFixtureFetch(fixtures));
  assert.equal(later.snapshot.coverage.indicatorsAvailable, 0);
  assert.equal(later.snapshot.confidence.score, 0);
  assert.equal(later.snapshotCreated, true);
});

test("a denominator-only revision produces a new derived observation", async () => {
  const env = await createEnv();
  const fixtures = await fixturesByUrl();
  await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(fixtures));

  const denominator = sourceById("ons-mgrz");
  const numerator = sourceById("ons-bbfw");
  const revised = JSON.parse(fixtures.get(denominator.sourceUrl));
  revised.description.releaseDate = "2026-08-18T23:00:00.000Z";
  revised.months.at(-1).value = String(Number(revised.months.at(-1).value) + 1000);
  fixtures.set(denominator.sourceUrl, JSON.stringify(revised));

  const baseFetch = createFixtureFetch(fixtures);
  const conditionalFetch = async (url, options = {}) => {
    const headers = new Headers(options.headers);
    if (String(url) === numerator.sourceUrl && headers.has("If-None-Match")) {
      return new Response(null, { status: 304 });
    }
    return baseFetch(url, options);
  };

  const result = await ingest(env, "2026-08-19T09:00:00.000Z", conditionalFetch);
  assert.equal(result.written, 1);

  const versions = env.DB._raw.prepare(`
    SELECT transformed_value, dependency_fingerprint, denominator_json, state
    FROM observations WHERE indicator_id = 'industrial_disruption' ORDER BY id
  `).all();
  assert.equal(versions.length, 2);
  assert.notEqual(versions[0].dependency_fingerprint, versions[1].dependency_fingerprint);
  assert.notEqual(versions[0].transformed_value, versions[1].transformed_value);
  assert.notEqual(
    JSON.parse(versions[0].denominator_json).evidenceSha256,
    JSON.parse(versions[1].denominator_json).evidenceSha256
  );
  assert.equal(versions[1].state, "revised");
});

test("snapshot lineage records derived dependency fingerprints", async () => {
  const env = await createEnv();
  await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(await fixturesByUrl()));

  const component = env.DB._raw.prepare(`
    SELECT dependency_fingerprint FROM snapshot_components
    WHERE indicator_id = 'industrial_disruption'
  `).get();
  assert.match(component.dependency_fingerprint, /primary:[0-9a-f]{64}\|denominator:[0-9a-f]{64}/);
});

test("a broken bound D1 returns degraded status and never falls back to fixtures", async () => {
  const brokenDb = {
    prepare() {
      throw new Error("database unavailable");
    }
  };
  const assets = {
    async fetch() {
      return new Response(JSON.stringify({ snapshot: { publication: { status: "published" } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const env = { DB: brokenDb, ASSETS: assets, BOOTSTRAP_MODE: "enabled" };

  const current = await worker.fetch(new Request("https://example.test/api/v1/current"), env);
  const currentBody = await current.json();
  assert.equal(current.status, 503);
  assert.equal(currentBody.provenance.store, "d1");
  assert.equal(currentBody.provenance.kind, "degraded");

  const health = await worker.fetch(new Request("https://example.test/api/v1/health"), env);
  const healthBody = await health.json();
  assert.equal(health.status, 503);
  assert.equal(healthBody.ok, false);
});

test("the removed v0.1 index route remains as a deprecated compatibility alias", async () => {
  const env = await createEnv();
  env.ASSETS = { fetch: async () => new Response("not found", { status: 404 }) };
  await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(await fixturesByUrl()));

  const response = await worker.fetch(new Request("https://example.test/api/v1/index"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("deprecation"), "true");
  const body = await response.json();
  assert.equal(body.publication.status, "suppressed");
});

test("history exposes one latest materialisation per civil day", async () => {
  const env = await createEnv();
  const fixtures = await fixturesByUrl();
  await ingest(env, "2026-08-01T09:00:00.000Z", createFixtureFetch(fixtures));
  await ingest(env, "2026-08-02T09:00:00.000Z", createFixtureFetch(fixtures));

  const history = await repo.snapshotHistory(env, 10);
  assert.deepEqual(history.map((point) => point.date), ["2026-08-01", "2026-08-02"]);
});
