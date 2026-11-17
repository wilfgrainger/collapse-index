/**
 * Regression tests for the 0.2.1 review findings
 * (docs/delivery/site-completion/plan.md). Each test names the defect it pins.
 */

import test from "node:test";
import assert from "node:assert/strict";

import worker, { etagMatches, releaseOverdue } from "../../src/web/index.js";
import { runIngestion } from "../../src/ingest/orchestrator.js";
import { parseForSource } from "../../src/collectors/ons/collect.js";
import { sourceById } from "../../src/collectors/ons/registry.js";
import { parseNextRelease } from "../../src/shared/period.js";
import * as repo from "../../src/storage/d1/repository.js";
import { createFixtureFetch, createTestBucket, createTestDatabase } from "../helpers/bindings.js";
import { fixturesByUrl, readFixture } from "../helpers/fixtures.js";

const ORIGIN = "https://monitor.example";
const DAY0 = "2026-08-01T09:00:00.000Z";

async function ingestedEnv(release = "2026-07-live", now = DAY0) {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket(), CLOCK_NOW: now };
  await runIngestion(env, { trigger: "test", now, fetchImpl: createFixtureFetch(await fixturesByUrl(release)) });
  return env;
}

function get(env, path, init = {}) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
}

test("a whitespace-only source cell is blank, never a measured zero", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  const before = parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw));
  raw.months.at(-1).value = "  ";
  const parsed = parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw));
  assert.equal(parsed.blankCount, before.blankCount + 1);
  assert.notEqual(parsed.points.at(-1).value, 0);
  assert.equal(parsed.points.at(-1).periodLabel, "2026 MAY", "the blank month is skipped");
});

test("a non-decimal source cell fails rather than being coerced", async () => {
  const raw = JSON.parse(await readFixture("D7G7"));
  raw.months.at(-1).value = "0x1A";
  assert.throws(() => parseForSource(sourceById("ons-d7g7"), JSON.stringify(raw)), /non-numeric/);
});

test("an impossible announced release date is rejected, not rolled forward", () => {
  assert.equal(parseNextRelease("31 February 2026"), null);
  assert.equal(parseNextRelease("29 February 2028"), "2028-02-29");
  assert.equal(parseNextRelease("19 August 2026"), "2026-08-19");
});

test("the current ETag changes when the same snapshot becomes stale", async () => {
  const env = await ingestedEnv();
  const fresh = await get(env, "/api/v1/current");
  const etag = fresh.headers.get("etag");
  assert.ok(etag);

  const revalidated = await get(env, "/api/v1/current", { headers: { "If-None-Match": etag } });
  assert.equal(revalidated.status, 304);

  env.CLOCK_NOW = "2026-08-10T09:00:00.000Z";
  const later = await get(env, "/api/v1/current", { headers: { "If-None-Match": etag } });
  assert.equal(later.status, 200, "a stale body must not be revalidated as the current one");
  assert.equal((await later.json()).provenance.operationalStatus, "stale");
});

test("weak and listed If-None-Match validators are honoured", async () => {
  assert.equal(etagMatches('W/"abc"', '"abc"'), true);
  assert.equal(etagMatches('"x", W/"abc"', '"abc"'), true);
  assert.equal(etagMatches("*", '"abc"'), true);
  assert.equal(etagMatches('"abd"', '"abc"'), false);

  const env = await ingestedEnv();
  const etag = (await get(env, "/api/v1/current")).headers.get("etag");
  const weak = await get(env, "/api/v1/current", { headers: { "If-None-Match": `W/${etag}` } });
  assert.equal(weak.status, 304);
});

test("a 405 response names the allowed methods", async () => {
  const response = await get(await ingestedEnv(), "/api/v1/current", { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD, OPTIONS");
});

test("a bound but empty D1 is degraded on history and the export manifest", async () => {
  const env = { DB: await createTestDatabase(), CLOCK_NOW: DAY0 };
  for (const path of ["/api/v1/history", "/api/v1/exports/manifest.json"]) {
    const response = await get(env, path);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal((await response.json()).provenance.operationalStatus, "degraded", path);
  }
});

test("a run that never finished degrades health", async () => {
  const env = await ingestedEnv();
  await repo.startRun(env, "crashed", "2026-08-01T09:30:00.000Z");
  env.CLOCK_NOW = "2026-08-01T09:45:00.000Z";
  assert.equal((await get(env, "/api/v1/health")).status, 200, "a run in progress is not yet a failure");

  env.CLOCK_NOW = "2026-08-01T11:00:00.000Z";
  const response = await get(env, "/api/v1/health");
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.match(body.reason, /never finished/);
});

test("a crash during materialisation marks the run failed and leaves no orphan snapshot", async () => {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket() };
  const realBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = async (statements) => {
    if (!/INTO snapshots/.test(statements[0]?.sql ?? "")) return realBatch(statements);
    // Let the snapshot insert run inside the transaction, then fail a component.
    const failing = { run: async () => { throw new Error("simulated component failure"); } };
    return realBatch([statements[0], failing]);
  };

  await assert.rejects(
    runIngestion(env, { trigger: "crash", now: DAY0, fetchImpl: createFixtureFetch(await fixturesByUrl()) }),
    /simulated component failure/
  );

  const runs = env.DB._raw.prepare("SELECT status, summary_json FROM ingestion_runs").all();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "failed");
  assert.match(runs[0].summary_json, /simulated component failure/);
  assert.equal(env.DB._raw.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 0, "the snapshot rolled back with its components");
});

test("a payload whose newest period is older than the stored one is quarantined", async () => {
  const env = await ingestedEnv("2026-11-live", "2026-11-16T09:00:00.000Z");
  const fixtures = await fixturesByUrl("2026-11-live");
  const cpi = sourceById("ons-d7g7");
  const regressed = JSON.parse(fixtures.get(cpi.sourceUrl));
  regressed.months.pop(); // ONS withdraws its newest month
  regressed.description.releaseDate = "2026-11-17T07:00:00.000Z";
  fixtures.set(cpi.sourceUrl, JSON.stringify(regressed));

  const result = await runIngestion(env, { trigger: "regress", now: "2026-11-17T09:00:00.000Z", fetchImpl: createFixtureFetch(fixtures) });
  const latest = await repo.latestObservations(env);
  const current = latest.find((o) => o.indicatorId === "cpi_inflation");
  assert.equal(current.periodEnd, "2026-09-30", "the current value does not move back in time");
  assert.equal(current.rawValue, 3.5);
  const detail = result.details.find?.((d) => d.sourceId === cpi.id) ?? result.details[cpi.id];
  assert.equal(detail?.failureClass ?? detail?.outcome, "quarantine");
});

test("an expired indicator publishes zero contribution while keeping its audit values", async () => {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket() };
  const fixtures = createFixtureFetch(await fixturesByUrl());
  await runIngestion(env, { trigger: "t", now: DAY0, fetchImpl: fixtures });
  const later = await runIngestion(env, { trigger: "t", now: "2028-03-01T09:00:00.000Z", fetchImpl: fixtures });
  for (const indicator of later.snapshot.indicators) {
    assert.equal(indicator.available, false);
    assert.equal(indicator.contribution, 0, `${indicator.id} contributes nothing once expired`);
  }
  assert.equal(later.snapshot.structural.observedPressure, 0);
});

test("evidence health discloses an overdue source release without changing scoring", async () => {
  const env = await ingestedEnv("2026-11-live", "2026-11-16T09:00:00.000Z");
  const body = await (await get(env, "/api/v1/evidence-health")).json();
  const byCdid = Object.fromEntries(body.collectors.map((c) => [c.cdid, c]));
  assert.equal(byCdid.N3Y6.expectedNextRelease, "2026-11-12");
  assert.equal(byCdid.N3Y6.releaseOverdue, true, "due 12 Nov, last published 30 Sep");
  assert.equal(byCdid.D7G7.releaseOverdue, false, "due 18 Nov");
  const gdp = body.indicators.find((i) => i.id === "gdp_per_capita_growth");
  assert.equal(gdp.freshness.stage, "current", "freshness still follows methodology v1");

  assert.equal(releaseOverdue({ expectedNextRelease: "2026-11-12", lastPublishedAt: "2026-11-12T06:00:00Z" }, "2026-11-16T09:00:00Z"), false);
  assert.equal(releaseOverdue({ expectedNextRelease: null, lastPublishedAt: null }, "2026-11-16T09:00:00Z"), false);
});

test("robots.txt and sitemap.xml use absolute request-origin URLs and list every page", async () => {
  const env = { ASSETS: { fetch: () => new Response("asset") } };
  const robots = await get(env, "/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), new RegExp(`Sitemap: ${ORIGIN}/sitemap.xml`));

  const sitemap = await (await get(env, "/sitemap.xml")).text();
  for (const page of ["/", "/methodology", "/evidence", "/history", "/about", "/indicator?id=cpi_inflation"]) {
    assert.ok(sitemap.includes(`<loc>${ORIGIN}${page}</loc>`), page);
  }
  assert.equal((await get(env, "/robots.txt", { method: "HEAD" })).status, 200);
});

test("the OpenAPI document declares path and query parameters and honest 503s", async () => {
  const body = await (await get(await ingestedEnv(), "/api/v1/openapi.json")).json();
  const indicator = body.paths["/api/v1/indicators/{id}"].get;
  assert.deepEqual(indicator.parameters.map((p) => [p.name, p.in, p.required]), [["id", "path", true]]);
  assert.ok(indicator.responses[404]);
  assert.equal(body.paths["/api/v1/methodology"].get.responses[503], undefined);
  assert.ok(body.paths["/api/v1/current"].get.responses[304]);
  assert.equal(body.paths["/api/v1/history"].get.parameters[0].name, "limit");
  assert.ok(body.paths["/api/v1/openapi.json"]);
});
