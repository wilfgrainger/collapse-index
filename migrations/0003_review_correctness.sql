-- Migration 0003 — review correctness fixes
--
-- Forward-only upgrade from the merged v0.2 schema. This migration keeps 0002
-- immutable while making derived observations dependency-aware and snapshots
-- append-only by materialised state.

PRAGMA foreign_keys = OFF;

-- ---------------------------------------------------------------------------
-- Observations: include every evidence dependency in idempotency
-- ---------------------------------------------------------------------------

CREATE TABLE observations_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  cdid TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  raw_value REAL NOT NULL,
  raw_unit TEXT NOT NULL,
  transformed_value REAL NOT NULL,
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL,
  geography TEXT NOT NULL,
  seasonal_adjustment TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  period_label TEXT NOT NULL,
  published_at TEXT NOT NULL,
  expected_next_release TEXT,
  retrieved_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  licence TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL REFERENCES evidence_objects(sha256),
  dependency_fingerprint TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('illustrative', 'provisional', 'verified', 'revised', 'withdrawn', 'suppressed')),
  notes TEXT,
  denominator_json TEXT,
  supersedes_id INTEGER REFERENCES observations_v3(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (period_start <= period_end),
  UNIQUE (source_id, period_end, dependency_fingerprint)
);

INSERT INTO observations_v3 (
  id, indicator_id, source_id, cdid, dataset_id,
  raw_value, raw_unit, transformed_value, unit,
  frequency, geography, seasonal_adjustment,
  period_start, period_end, period_label,
  published_at, expected_next_release, retrieved_at,
  source_url, licence, evidence_sha256, dependency_fingerprint,
  parser_version, state, notes, denominator_json, supersedes_id, created_at
)
SELECT
  id, indicator_id, source_id, cdid, dataset_id,
  raw_value, raw_unit, transformed_value, unit,
  frequency, geography, seasonal_adjustment,
  period_start, period_end, period_label,
  published_at, expected_next_release, retrieved_at,
  source_url, licence, evidence_sha256,
  CASE
    WHEN denominator_json IS NOT NULL
      AND json_extract(denominator_json, '$.evidenceSha256') IS NOT NULL
    THEN 'primary:' || evidence_sha256 || '|denominator:' || json_extract(denominator_json, '$.evidenceSha256')
    ELSE 'primary:' || evidence_sha256
  END,
  parser_version, state, notes, denominator_json, supersedes_id, created_at
FROM observations;

-- ---------------------------------------------------------------------------
-- Snapshots: retain same-day state changes without destructive updates
-- ---------------------------------------------------------------------------

CREATE TABLE snapshots_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  as_of_date TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  publication_status TEXT NOT NULL CHECK (publication_status IN ('published', 'suppressed')),
  headline_score REAL,
  level_id TEXT,
  observed_pressure REAL NOT NULL,
  available_weight REAL NOT NULL,
  missing_weight REAL NOT NULL,
  range_low REAL NOT NULL,
  range_high REAL NOT NULL,
  acute_overlay REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  state_fingerprint TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  UNIQUE (as_of_date, methodology_version, state_fingerprint)
);

INSERT INTO snapshots_v3 (
  id, as_of_date, methodology_version, publication_status, headline_score,
  level_id, observed_pressure, available_weight, missing_weight,
  range_low, range_high, acute_overlay, confidence,
  evidence_fingerprint, state_fingerprint, payload_json, generated_at
)
SELECT
  id, as_of_date, methodology_version, publication_status, headline_score,
  level_id, observed_pressure, available_weight, missing_weight,
  range_low, range_high, acute_overlay, confidence,
  evidence_fingerprint,
  as_of_date || '|' || methodology_version || '|' || evidence_fingerprint || '|legacy:' || id,
  payload_json, generated_at
FROM snapshots;

CREATE TABLE snapshot_components_v3 (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots_v3(id) ON DELETE CASCADE,
  indicator_id TEXT NOT NULL,
  observation_id INTEGER REFERENCES observations_v3(id),
  dependency_fingerprint TEXT,
  weight REAL NOT NULL,
  pressure REAL,
  contribution REAL NOT NULL DEFAULT 0,
  confidence_contribution REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL,
  unavailable_reason TEXT,
  PRIMARY KEY (snapshot_id, indicator_id)
);

INSERT INTO snapshot_components_v3 (
  snapshot_id, indicator_id, observation_id, dependency_fingerprint,
  weight, pressure, contribution, confidence_contribution,
  available, unavailable_reason
)
SELECT
  component.snapshot_id,
  component.indicator_id,
  component.observation_id,
  observation.dependency_fingerprint,
  component.weight,
  component.pressure,
  component.contribution,
  component.confidence_contribution,
  component.available,
  component.unavailable_reason
FROM snapshot_components AS component
LEFT JOIN observations_v3 AS observation ON observation.id = component.observation_id;

DROP TABLE snapshot_components;
DROP TABLE observations;
DROP TABLE snapshots;

ALTER TABLE observations_v3 RENAME TO observations;
ALTER TABLE snapshots_v3 RENAME TO snapshots;
ALTER TABLE snapshot_components_v3 RENAME TO snapshot_components;

CREATE INDEX idx_observations_latest ON observations (indicator_id, id DESC);
CREATE INDEX idx_observations_history ON observations (indicator_id, period_end DESC);
CREATE INDEX idx_observations_evidence ON observations (evidence_sha256);
CREATE INDEX idx_observations_dependencies ON observations (dependency_fingerprint);

CREATE INDEX idx_snapshots_date ON snapshots (as_of_date DESC, id DESC);
CREATE INDEX idx_snapshots_evidence ON snapshots (evidence_fingerprint);
CREATE INDEX idx_snapshots_state ON snapshots (state_fingerprint);

PRAGMA foreign_keys = ON;
