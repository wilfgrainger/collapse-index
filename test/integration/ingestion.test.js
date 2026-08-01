/**
 * End-to-end ingestion against real migrations and real fixtures.
 *
 * The database here is genuine SQLite running the committed migration files, so
 * these tests prove the schema applies from empty and that idempotency comes
 * from real UNIQUE constraints rather than application-level guesswork.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { runIngestion } from "../../src/ingest/orchestrator.js";
import { ONS_SOURCES, sourceById } from "../../src/collectors/ons/registry.js";
import * as repo from "../../src/storage/d1/repository.js";
import { createFixtureFetch, createTestBucket, createTestDatabase } from "../helpers/bindings.js";
import { fixturesByUrl } from "../helpers/fixtures.js";

const NOW = "2026-08-01T09:00:00.000Z";

async function createEnv() {
  return {
    DB: await createTestDatabase(),
    EVIDENCE: createTestBucket()
  };
}

async function ingest(env, overrides = {}, options = {}) {
  return runIngestion(env, {
    trigger: "test",
    now: options.now ?? NOW,
    fetchImpl: createFixtureFetch(await fixturesByUrl(), overrides)
  });
}

test("migrations apply from an empty database", async () => {
  const db = await createTestDatabase();
  assert.deepEqual(db._migrationsApplied, ["0001_initial.sql", "0002_evidence_model.sql"]);

  const tables = db._raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => row.name);

  for (const expected of [
    "sources", "evidence_objects", "source_releases", "observations", "events",
    "event_reviews", "snapshots", "snapshot_components", "ingestion_runs",
    "collector_results", "validation_results", "methodology_versions"
  ]) {
    assert.ok(tables.includes(expected), `missing table: ${expected}`);
  }
});

test("migration 0002 replaces the v0.1 ingestion_runs shape", async () => {
  // 0001 created this table with different columns; CREATE IF NOT EXISTS alone
  // would have silently kept the old definition.
  const db = await createTestDatabase();
  const columns = db._raw.prepare("PRAGMA table_info(ingestion_runs)").all().map((row) => row.name);
  assert.ok(columns.includes("trigger"), "expected the v2 column set");
  assert.ok(!columns.includes("collector_id"), "the v0.1 column must be gone");
});

test("a full run ingests all four indicators and archives their evidence", async () => {
  const env = await createEnv();
  const result = await ingest(env);

  assert.equal(result.status, "succeeded");
  assert.equal(result.failed, 0);
  assert.equal(result.written, 4, "four indicator observations");

  const observations = await repo.latestObservations(env);
  assert.equal(observations.length, 4);
  assert.deepEqual(
    observations.map((o) => o.indicatorId).sort(),
    ["cpi_inflation", "gdp_per_capita_growth", "industrial_disruption", "labour_market_stress"]
  );

  // Five payloads archived: four indicators plus the employment denominator.
  assert.equal(env.EVIDENCE._objects.size, 5);
  for (const key of env.EVIDENCE._objects.keys()) {
    assert.match(key, /^sources\/ons-[a-z0-9]+\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{64}\/[a-z0-9-]+\.json$/);
  }

  // Every observation points at evidence that actually exists.
  for (const observation of observations) {
    const evidence = await repo.findEvidenceByHash(env, observation.evidenceSha256);
    assert.ok(evidence, `no evidence row for ${observation.indicatorId}`);
    assert.ok(env.EVIDENCE._objects.has(evidence.object_key), "archived object is missing");
  }
});

test("observed values match the published ONS figures", async () => {
  const env = await createEnv();
  await ingest(env);

  const byIndicator = new Map((await repo.latestObservations(env)).map((o) => [o.indicatorId, o]));

  assert.equal(byIndicator.get("cpi_inflation").rawValue, 2.6);
  assert.equal(byIndicator.get("cpi_inflation").periodLabel, "2026 JUN");
  assert.equal(byIndicator.get("labour_market_stress").rawValue, 4.9);
  assert.equal(byIndicator.get("gdp_per_capita_growth").rawValue, 1.0);
  assert.equal(byIndicator.get("industrial_disruption").rawValue, 26);
  assert.ok(Math.abs(byIndicator.get("industrial_disruption").transformedValue - 0.7542) < 0.001);
  assert.equal(byIndicator.get("industrial_disruption").denominator.cdid, "MGRZ");
});

test("a repeated identical run is idempotent", async () => {
  const env = await createEnv();
  const first = await ingest(env);
  const second = await ingest(env);

  assert.equal(second.status, "no_change");
  assert.equal(second.written, 0, "no new observation rows");
  assert.equal(second.snapshotCreated, false, "unchanged evidence creates no snapshot");
  assert.equal(second.fingerprint, first.fingerprint);

  const count = env.DB._raw.prepare("SELECT COUNT(*) AS n FROM observations").get().n;
  assert.equal(count, 4, "still exactly four observation rows");

  const snapshots = env.DB._raw.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n;
  assert.equal(snapshots, 1);

  // Both runs are still recorded: a no-change run is an audit event, not silence.
  const runs = await repo.recentRuns(env, 10);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].status, "no_change");
});

test("re-archiving identical evidence does not duplicate the object", async () => {
  const env = await createEnv();
  await ingest(env);
  const afterFirst = env.EVIDENCE._objects.size;
  await ingest(env);
  assert.equal(env.EVIDENCE._objects.size, afterFirst, "content-addressed keys de-duplicate");
});

test("one failing source does not damage the others", async () => {
  const env = await createEnv();
  const cpi = sourceById("ons-d7g7");

  const result = await ingest(env, {
    [cpi.sourceUrl]: { status: 503, body: "upstream unavailable", headers: { "content-type": "text/plain" } }
  });

  assert.equal(result.status, "partial");
  assert.equal(result.failed, 1);
  assert.equal(result.written, 3, "the other three still wrote");

  const observations = await repo.latestObservations(env);
  assert.ok(!observations.some((o) => o.indicatorId === "cpi_inflation"), "no observation from a failed fetch");
  assert.deepEqual(
    observations.map((o) => o.indicatorId).sort(),
    ["gdp_per_capita_growth", "industrial_disruption", "labour_market_stress"]
  );

  // The failure is recorded with a class, not swallowed.
  const failure = env.DB._raw
    .prepare("SELECT * FROM collector_results WHERE source_id = ? AND outcome = 'failed'")
    .get("ons-d7g7");
  assert.ok(failure, "failure was not audited");
  assert.equal(failure.failure_class, "http_status");
});

test("an HTML error page served with a 200 writes no observation", async () => {
  const env = await createEnv();
  const result = await ingest(env, {
    [sourceById("ons-mgsx").sourceUrl]: {
      status: 200,
      body: "<!DOCTYPE html><html><body>error</body></html>",
      headers: { "content-type": "text/html" }
    }
  });

  assert.equal(result.failed, 1);
  const observations = await repo.latestObservations(env);
  assert.ok(!observations.some((o) => o.indicatorId === "labour_market_stress"));

  const failure = env.DB._raw
    .prepare("SELECT failure_class FROM collector_results WHERE source_id = ? ORDER BY id DESC")
    .get("ons-mgsx");
  assert.equal(failure.failure_class, "content_type", "rejected on MIME, before parsing");
});

test("a failed denominator blocks only its dependent indicator", async () => {
  const env = await createEnv();
  const result = await ingest(env, {
    [sourceById("ons-mgrz").sourceUrl]: { throw: "network down" }
  });

  const observations = await repo.latestObservations(env);
  const ids = observations.map((o) => o.indicatorId).sort();

  assert.ok(!ids.includes("industrial_disruption"), "derived indicator needs its denominator");
  assert.deepEqual(ids, ["cpi_inflation", "gdp_per_capita_growth", "labour_market_stress"]);
  assert.equal(result.failed, 1);
});

test("a previous verified observation survives a later failure", async () => {
  const env = await createEnv();
  await ingest(env);

  await ingest(env, {
    [sourceById("ons-d7g7").sourceUrl]: { status: 500, body: "boom", headers: { "content-type": "text/plain" } }
  });

  const observations = await repo.latestObservations(env);
  const cpi = observations.find((o) => o.indicatorId === "cpi_inflation");
  assert.ok(cpi, "the last good observation must remain");
  assert.equal(cpi.rawValue, 2.6);
});

test("a revised release adds a version instead of overwriting history", async () => {
  const env = await createEnv();
  await ingest(env);

  // Same series, later release date, revised latest value.
  const fixtures = await fixturesByUrl();
  const cpi = sourceById("ons-d7g7");
  const revised = JSON.parse(fixtures.get(cpi.sourceUrl));
  revised.description.releaseDate = "2026-08-19T23:00:00.000Z";
  revised.months.at(-1).value = "3.1";
  fixtures.set(cpi.sourceUrl, JSON.stringify(revised));

  const result = await runIngestion(env, {
    trigger: "test-revision",
    now: "2026-08-20T09:00:00.000Z",
    fetchImpl: createFixtureFetch(fixtures)
  });

  assert.equal(result.written, 1);

  const versions = env.DB._raw
    .prepare("SELECT raw_value, published_at, supersedes_id FROM observations WHERE indicator_id = 'cpi_inflation' ORDER BY id")
    .all();

  assert.equal(versions.length, 2, "the original version is retained");
  assert.equal(versions[0].raw_value, 2.6);
  assert.equal(versions[1].raw_value, 3.1);
  assert.ok(versions[1].supersedes_id, "the revision points at what it replaced");

  const latest = await repo.latestObservations(env);
  assert.equal(latest.find((o) => o.indicatorId === "cpi_inflation").rawValue, 3.1);
});

test("a snapshot records the exact observation version behind every component", async () => {
  const env = await createEnv();
  await ingest(env);

  const components = env.DB._raw
    .prepare("SELECT * FROM snapshot_components ORDER BY indicator_id")
    .all();

  assert.equal(components.length, 10, "all ten indicators, including the unavailable six");

  const available = components.filter((component) => component.available === 1);
  assert.equal(available.length, 4);
  for (const component of available) {
    assert.ok(component.observation_id, `${component.indicator_id} has no observation lineage`);
    const observation = env.DB._raw.prepare("SELECT id FROM observations WHERE id = ?").get(component.observation_id);
    assert.ok(observation, "component points at a real observation version");
  }

  for (const component of components.filter((c) => c.available === 0)) {
    assert.equal(component.contribution, 0);
    assert.ok(component.unavailable_reason, `${component.indicator_id} should say why it is missing`);
  }
});

test("the headline is suppressed with only four of ten indicators", async () => {
  const env = await createEnv();
  const result = await ingest(env);

  assert.equal(result.snapshot.publication.status, "suppressed");
  assert.equal(result.snapshot.publication.headlineScore, null);
  assert.equal(result.snapshot.structural.availableWeight, 0.4);
  assert.equal(result.snapshot.structural.missingWeight, 0.6);

  // 0.12 + 0.08 + 0.10×0.9 + 0.10×0.9 = 0.38
  assert.ok(Math.abs(result.snapshot.confidence.score - 0.38) < 1e-9);
});

test("source declarations are synced into the database", async () => {
  const env = await createEnv();
  await ingest(env);

  const rows = env.DB._raw.prepare("SELECT id, role, cdid FROM sources ORDER BY id").all();
  assert.equal(rows.length, ONS_SOURCES.length);
  assert.equal(rows.filter((row) => row.role === "denominator").length, 1);
});

test("collector health reports releases, outcomes and expected next release", async () => {
  const env = await createEnv();
  await ingest(env);

  const health = await repo.collectorHealth(env);
  assert.equal(health.length, 5);

  const cpi = health.find((entry) => entry.sourceId === "ons-d7g7");
  assert.equal(cpi.releasesObserved, 1);
  assert.equal(cpi.lastOutcome, "changed");
  assert.equal(cpi.expectedNextRelease, "2026-08-19");
  assert.equal(cpi.lastPublishedAt, "2026-07-21T23:00:00.000Z");
});

test("validation results are recorded for every ingested source", async () => {
  const env = await createEnv();
  await ingest(env);

  const rows = env.DB._raw.prepare("SELECT source_id, ok FROM validation_results").all();
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.ok === 1));
});

test("a run where every indicator fails reports failed, not partial", async () => {
  const env = await createEnv();
  const overrides = {};
  for (const source of ONS_SOURCES) {
    overrides[source.sourceUrl] = { status: 403, body: "denied", headers: { "content-type": "text/plain" } };
  }

  const result = await ingest(env, overrides);

  assert.equal(result.status, "failed");
  assert.equal(result.written, 0);
  assert.equal((await repo.latestObservations(env)).length, 0, "a total failure writes nothing");

  // The run is still audited, with a failure class per source.
  const results = env.DB._raw.prepare("SELECT source_id, failure_class FROM collector_results").all();
  assert.equal(results.length, ONS_SOURCES.length);
  assert.ok(results.every((row) => row.failure_class === "http_status"));
});
