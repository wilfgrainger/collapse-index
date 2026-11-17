/**
 * Two-release validation against real, unmodified ONS payloads.
 *
 * SOURCE_REGISTER.md requires every collector to be validated across at least
 * two published releases, including a revision where one exists. The
 * `2026-07-live` capture is the first release; `2026-11-live` is the second.
 * Between them ONS revised N3Y6 (GDP per head growth, 2025) from 1.0 to 0.9,
 * which exercises the same-period revision path with genuine upstream data.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { runIngestion } from "../../src/ingest/orchestrator.js";
import { ONS_SOURCES } from "../../src/collectors/ons/registry.js";
import { parseForSource } from "../../src/collectors/ons/collect.js";
import * as repo from "../../src/storage/d1/repository.js";
import { createFixtureFetch, createTestBucket, createTestDatabase } from "../helpers/bindings.js";
import { fixturesByUrl, readFixture } from "../helpers/fixtures.js";

const FIRST = { release: "2026-07-live", now: "2026-08-01T09:00:00.000Z" };
const SECOND = { release: "2026-11-live", now: "2026-11-16T09:00:00.000Z" };

async function ingestBoth() {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket() };
  const first = await runIngestion(env, {
    trigger: "test-first-release",
    now: FIRST.now,
    fetchImpl: createFixtureFetch(await fixturesByUrl(FIRST.release))
  });
  const second = await runIngestion(env, {
    trigger: "test-second-release",
    now: SECOND.now,
    fetchImpl: createFixtureFetch(await fixturesByUrl(SECOND.release))
  });
  return { env, first, second };
}

test("every collector parses its second real release with unchanged identity", async () => {
  for (const source of ONS_SOURCES) {
    const before = parseForSource(source, await readFixture(source.cdid, FIRST.release));
    const after = parseForSource(source, await readFixture(source.cdid, SECOND.release));
    assert.equal(after.meta.cdid, source.cdid);
    assert.equal(after.meta.datasetId, source.datasetId);
    assert.equal(after.meta.unit, before.meta.unit, `${source.cdid} unit is stable across releases`);
    assert.equal(after.meta.rollingThreeMonth, before.meta.rollingThreeMonth, `${source.cdid} period semantics`);
    assert.ok(after.points.at(-1).periodEnd >= before.points.at(-1).periodEnd, `${source.cdid} does not go backwards`);
  }
});

test("the second release yields the published headline values", async () => {
  const expected = {
    D7G7: { label: "2026 SEP", value: 3.5 },
    MGSX: { label: "2026 JUL", value: 4.7, start: "2026-06-01", end: "2026-08-31" },
    N3Y6: { label: "2025", value: 0.9 },
    BBFW: { label: "2026 AUG", value: 23 },
    MGRZ: { label: "2026 JUL", value: 34577 }
  };
  for (const source of ONS_SOURCES) {
    const latest = parseForSource(source, await readFixture(source.cdid, SECOND.release)).points.at(-1);
    const want = expected[source.cdid];
    assert.equal(latest.periodLabel, want.label, source.cdid);
    assert.equal(latest.value, want.value, source.cdid);
    if (want.start) {
      assert.equal(latest.periodStart, want.start);
      assert.equal(latest.periodEnd, want.end);
    }
  }
});

test("a real upstream revision to N3Y6 adds a revised version and keeps the original", async () => {
  const { env } = await ingestBoth();
  const versions = env.DB._raw
    .prepare(
      "SELECT raw_value, period_end, state, supersedes_id FROM observations WHERE indicator_id = 'gdp_per_capita_growth' ORDER BY id"
    )
    .all();

  assert.equal(versions.length, 2, "the 1.0 first estimate is retained");
  assert.equal(versions[0].raw_value, 1.0);
  assert.equal(versions[1].raw_value, 0.9);
  assert.equal(versions[0].period_end, versions[1].period_end, "same reference period");
  assert.equal(versions[1].state, "revised");
  assert.ok(versions[1].supersedes_id, "the revision points at what it replaced");
});

test("new reference periods are added as new observations, not revisions", async () => {
  const { env } = await ingestBoth();
  const latest = await repo.latestObservations(env);
  const byIndicator = Object.fromEntries(latest.map((o) => [o.indicatorId, o]));

  assert.equal(byIndicator.cpi_inflation.rawValue, 3.5);
  assert.equal(byIndicator.cpi_inflation.periodEnd, "2026-09-30");
  assert.equal(byIndicator.labour_market_stress.rawValue, 4.7);
  assert.equal(byIndicator.industrial_disruption.periodEnd, "2026-08-31");
  assert.notEqual(byIndicator.cpi_inflation.evidenceState, "revised");
});

test("collector maturity reaches two observed releases for every source", async () => {
  const { env } = await ingestBoth();
  const health = await repo.collectorHealth(env);
  assert.equal(health.length, ONS_SOURCES.length);
  for (const entry of health) {
    assert.ok(entry.releasesObserved >= 2, `${entry.sourceId} has ${entry.releasesObserved} releases`);
  }
});

test("the second release changes evidence but the headline stays suppressed", async () => {
  const { second } = await ingestBoth();
  assert.equal(second.written, 4, "every indicator contributed a new or revised observation");
  assert.equal(second.snapshot.publication.status, "suppressed");
  assert.equal(second.snapshot.structural.availableWeight, 0.4, "no weight is redistributed");
});
