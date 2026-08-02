import test from "node:test";
import assert from "node:assert/strict";

import worker from "../../src/web/index.js";
import { runIngestion } from "../../src/ingest/orchestrator.js";
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
      return new Response("not found", { status: 404 });
    }
  };
}

async function ingestedEnv() {
  const env = { DB: await createTestDatabase(), EVIDENCE: createTestBucket(), ASSETS: createAssets() };
  await runIngestion(env, {
    trigger: "export-test",
    now: "2026-08-01T09:00:00.000Z",
    fetchImpl: createFixtureFetch(await fixturesByUrl())
  });
  return env;
}

function request(env, path, options = {}) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, options), env);
}

test("current export publishes all ten indicators with provenance", async () => {
  const response = await request(await ingestedEnv(), "/api/v1/exports/current.csv");
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
  assert.match(response.headers.get("content-disposition") ?? "", /uk-stability-current-2026-08-01\.csv/);
  assert.ok(body.startsWith("\uFEFF"));
  assert.match(body, /"indicator_id"/);
  assert.match(body, /"cpi_inflation"/);
  assert.match(body, /"trust_in_government"/);
  assert.match(body, /[0-9a-f]{64}/);
  assert.equal(body.trimEnd().split("\r\n").length, 11, "header plus ten fixed-weight indicators");
});

test("canonical observation exports retain evidence and denominator lineage", async () => {
  const env = await ingestedEnv();
  const jsonResponse = await request(env, "/api/v1/exports/observations.json");
  const document = await jsonResponse.json();

  assert.equal(jsonResponse.status, 200);
  assert.equal(document.exportKind, "verified-and-revised-observations");
  assert.equal(document.count, 4);
  const derived = document.observations.find((row) => row.indicatorId === "industrial_disruption");
  assert.ok(derived.denominator);
  assert.match(derived.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(derived.dependencyFingerprint, /primary:[0-9a-f]{64}\|denominator:[0-9a-f]{64}/);

  const csvResponse = await request(env, "/api/v1/exports/observations.csv");
  const csv = await csvResponse.text();
  assert.equal(csvResponse.status, 200);
  assert.match(csv, /"denominator_json"/);
  assert.match(csv, /"industrial_disruption"/);
});

test("snapshot exports publish one materialisation per civil day", async () => {
  const env = await ingestedEnv();
  const response = await request(env, "/api/v1/exports/snapshots.json");
  const document = await response.json();

  assert.equal(response.status, 200);
  assert.equal(document.exportKind, "daily-materialised-snapshots");
  assert.equal(document.count, 1);
  assert.equal(document.snapshots[0].date, "2026-08-01");
  assert.equal(document.snapshots[0].status, "suppressed");

  const csvResponse = await request(env, "/api/v1/exports/snapshots.csv");
  assert.match(await csvResponse.text(), /"as_of_date"/);
});

test("export manifest states scope, provenance and limitations", async () => {
  const response = await request(await ingestedEnv(), "/api/v1/exports/manifest.json");
  const document = await response.json();

  assert.equal(response.status, 200);
  assert.equal(document.provenance.store, "d1");
  assert.ok(document.currentSnapshot.evidenceFingerprint);
  assert.match(document.exports.currentCsv, /\/api\/v1\/exports\/current\.csv$/);
  assert.ok(document.limitations.some((note) => /recalculation date/i.test(note)));
  assert.match(document.licence.sourceData, /Open Government Licence/);
});

test("bootstrap mode never masquerades as canonical observation history", async () => {
  const env = { ASSETS: createAssets(), BOOTSTRAP_MODE: "enabled" };
  const current = await request(env, "/api/v1/exports/current.csv");
  assert.equal(current.status, 200, "explicit fixture capture may export its current snapshot");

  for (const path of [
    "/api/v1/exports/observations.json",
    "/api/v1/exports/observations.csv",
    "/api/v1/exports/snapshots.json",
    "/api/v1/exports/snapshots.csv"
  ]) {
    const response = await request(env, path);
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).error, "canonical_history_unavailable");
  }
});

test("HEAD returns API headers without a response body", async () => {
  const env = await ingestedEnv();
  for (const path of ["/api/v1/current", "/api/v1/exports/current.csv", "/api/v1/exports/manifest.json"]) {
    const response = await request(env, path, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), "", path);
    assert.ok(response.headers.get("content-type"), path);
  }
});

test("CORS preflight permits conditional reads and exposes export metadata", async () => {
  const response = await request({}, "/api/v1/exports/current.csv", { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /If-None-Match/);
  assert.match(response.headers.get("access-control-expose-headers") ?? "", /Content-Disposition/);
});
