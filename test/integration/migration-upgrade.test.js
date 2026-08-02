import test from "node:test";
import assert from "node:assert/strict";

import { applyTestMigration, createTestDatabase } from "../helpers/bindings.js";

const PRIMARY_HASH = "a".repeat(64);
const DENOMINATOR_HASH = "b".repeat(64);

test("migration 0003 upgrades a populated v0.2 database without losing lineage", async () => {
  const db = await createTestDatabase({ through: "0002_evidence_model.sql" });

  db._raw.exec(`
    INSERT INTO sources (
      id, role, indicator_id, provider, cdid, dataset_id, title, source_url,
      licence, geography, quality_class, frequency, unit,
      expected_cadence_days, grace_days, hard_expiry_days
    ) VALUES (
      'ons-bbfw', 'indicator', 'industrial_disruption', 'ONS', 'BBFW', 'LMS',
      'Working days lost', 'https://www.ons.gov.uk/example/data', 'OGL v3.0',
      'UK', 'official', 'monthly', 'thousands', 31, 14, 120
    );

    INSERT INTO evidence_objects (
      sha256, object_key, source_id, mime, byte_size, source_url,
      published_at, retrieved_at, archived
    ) VALUES (
      '${PRIMARY_HASH}', 'sources/ons-bbfw/example.json', 'ons-bbfw',
      'application/json', 100, 'https://www.ons.gov.uk/example/data',
      '2026-07-15T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1
    );

    INSERT INTO observations (
      id, indicator_id, source_id, cdid, dataset_id, raw_value, raw_unit,
      transformed_value, unit, frequency, geography, period_start, period_end,
      period_label, published_at, retrieved_at, source_url, licence,
      evidence_sha256, parser_version, state, denominator_json
    ) VALUES (
      7, 'industrial_disruption', 'ons-bbfw', 'BBFW', 'LMS', 26, 'thousands',
      0.75, 'days per 1000', 'monthly', 'UK', '2026-05-01', '2026-05-31',
      '2026 MAY', '2026-07-15T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
      'https://www.ons.gov.uk/example/data', 'OGL v3.0', '${PRIMARY_HASH}',
      'ons-timeseries@1.0.0', 'verified',
      '{"sourceId":"ons-mgrz","evidenceSha256":"${DENOMINATOR_HASH}"}'
    );

    INSERT INTO snapshots (
      id, as_of_date, methodology_version, publication_status, observed_pressure,
      available_weight, missing_weight, range_low, range_high, acute_overlay,
      confidence, evidence_fingerprint, payload_json, generated_at
    ) VALUES (
      3, '2026-08-01', '1.0.0-alpha.1', 'suppressed', 9.5,
      0.4, 0.6, 9.5, 69.5, 0, 0.38, 'legacy-evidence', '{}',
      '2026-08-01T09:00:00.000Z'
    );

    INSERT INTO snapshot_components (
      snapshot_id, indicator_id, observation_id, weight, pressure,
      contribution, confidence_contribution, available
    ) VALUES (3, 'industrial_disruption', 7, 0.1, 15, 1.5, 0.09, 1);

    INSERT INTO ingestion_runs (
      id, trigger, started_at, finished_at, status, snapshot_id
    ) VALUES (
      11, 'cron', '2026-08-01T09:00:00.000Z',
      '2026-08-01T09:00:01.000Z', 'succeeded', 3
    );
  `);

  await applyTestMigration(db, "0003_review_correctness.sql");

  const observation = db._raw.prepare(`
    SELECT id, dependency_fingerprint, denominator_json FROM observations WHERE id = 7
  `).get();
  assert.equal(
    observation.dependency_fingerprint,
    `primary:${PRIMARY_HASH}|denominator:${DENOMINATOR_HASH}`
  );

  const snapshot = db._raw.prepare(`
    SELECT id, state_fingerprint, evidence_fingerprint FROM snapshots WHERE id = 3
  `).get();
  assert.equal(snapshot.evidence_fingerprint, "legacy-evidence");
  assert.match(snapshot.state_fingerprint, /^2026-08-01\|1\.0\.0-alpha\.1\|legacy-evidence\|legacy:3$/);

  const component = db._raw.prepare(`
    SELECT observation_id, dependency_fingerprint
    FROM snapshot_components WHERE snapshot_id = 3 AND indicator_id = 'industrial_disruption'
  `).get();
  assert.equal(component.observation_id, 7);
  assert.equal(component.dependency_fingerprint, observation.dependency_fingerprint);

  const run = db._raw.prepare("SELECT snapshot_id FROM ingestion_runs WHERE id = 11").get();
  assert.equal(run.snapshot_id, 3);
  assert.deepEqual(db._raw.prepare("PRAGMA foreign_key_check").all(), []);
});
