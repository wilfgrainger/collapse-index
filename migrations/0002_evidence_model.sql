-- Migration 0002 — evidence model v2 (WP2)
--
-- Replaces the v0.1 prototype tables with an immutable, auditable evidence
-- model. The prototype tables held only hand-entered concept-brief values
-- explicitly marked provisional or illustrative, which ROADMAP.md release 0.2
-- requires removing from headline eligibility. No production D1 database
-- existed at the time of this migration (wrangler.jsonc bound no d1_databases),
-- so nothing observed is lost.
--
-- Design rules encoded here:
--   * observations are append-only; a revision inserts a new row and points at
--     the row it supersedes
--   * an observation cannot exist without the evidence object it came from
--   * a snapshot records the exact observation version behind every component

PRAGMA foreign_keys = ON;

-- All four v0.1 tables are dropped, not just the obviously incompatible ones.
-- `ingestion_runs` matters especially: 0001 created it with a different shape,
-- and the CREATE ... IF NOT EXISTS below would silently keep the old columns.
DROP TABLE IF EXISTS observations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS ingestion_runs;

-- ---------------------------------------------------------------------------
-- Source identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('indicator', 'denominator')),
  indicator_id TEXT,
  provider TEXT NOT NULL,
  cdid TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  licence TEXT NOT NULL,
  geography TEXT NOT NULL,
  quality_class TEXT NOT NULL,
  frequency TEXT NOT NULL,
  unit TEXT NOT NULL,
  expected_cadence_days INTEGER NOT NULL,
  grace_days INTEGER NOT NULL,
  hard_expiry_days INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_series ON sources (cdid, dataset_id);

-- ---------------------------------------------------------------------------
-- Archived evidence
-- ---------------------------------------------------------------------------

-- One row per distinct payload. The hash is the identity: an unchanged source
-- re-fetched tomorrow maps to the same row, which is what makes a repeated run
-- idempotent and stops the R2 archive growing without new information.
CREATE TABLE IF NOT EXISTS evidence_objects (
  sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64),
  object_key TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  source_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence_objects (source_id, retrieved_at DESC);

-- Release discovery: what the source said about itself on each retrieval.
CREATE TABLE IF NOT EXISTS source_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES sources(id),
  published_at TEXT NOT NULL,
  expected_next_release TEXT,
  evidence_sha256 TEXT NOT NULL REFERENCES evidence_objects(sha256),
  series_title TEXT,
  declared_unit TEXT,
  point_count INTEGER,
  blank_count INTEGER,
  discovered_at TEXT NOT NULL,
  UNIQUE (source_id, published_at, evidence_sha256)
);

CREATE INDEX IF NOT EXISTS idx_source_releases_source ON source_releases (source_id, published_at DESC);

-- ---------------------------------------------------------------------------
-- Observations (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS observations (
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
  parser_version TEXT NOT NULL,

  state TEXT NOT NULL CHECK (state IN ('illustrative', 'provisional', 'verified', 'revised', 'withdrawn', 'suppressed')),
  notes TEXT,
  denominator_json TEXT,
  supersedes_id INTEGER REFERENCES observations(id),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (period_start <= period_end),

  -- Idempotency: the same evidence describing the same period is one fact.
  UNIQUE (source_id, period_end, evidence_sha256)
);

-- Serves "latest verified observation per indicator" as a bounded index scan.
CREATE INDEX IF NOT EXISTS idx_observations_latest ON observations (indicator_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_observations_history ON observations (indicator_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_observations_evidence ON observations (evidence_sha256);

-- ---------------------------------------------------------------------------
-- Acute events (schema only; release 0.4 implements the review workflow)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  event_class TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  closed_at TEXT,
  severity REAL NOT NULL CHECK (severity >= 1 AND severity <= 5),
  evidence_confidence REAL NOT NULL CHECK (evidence_confidence >= 0 AND evidence_confidence <= 1),
  geographic_reach REAL NOT NULL CHECK (geographic_reach >= 0 AND geographic_reach <= 1),
  system_breadth REAL NOT NULL CHECK (system_breadth >= 0 AND system_breadth <= 1),
  half_life_hours INTEGER NOT NULL CHECK (half_life_hours IN (24, 72, 168)),
  review_status TEXT NOT NULL CHECK (review_status IN ('candidate', 'approved', 'rejected', 'expired')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_active ON events (review_status, occurred_at DESC);

-- Every review decision is retained, including rejections.
CREATE TABLE IF NOT EXISTS event_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id),
  decision TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  rationale TEXT NOT NULL,
  corroborating_sources_json TEXT NOT NULL,
  decided_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Snapshots and lineage
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS snapshots (
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
  payload_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  UNIQUE (as_of_date, methodology_version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON snapshots (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_fingerprint ON snapshots (evidence_fingerprint);

-- Exactly which observation version stood behind each component.
CREATE TABLE IF NOT EXISTS snapshot_components (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  indicator_id TEXT NOT NULL,
  observation_id INTEGER REFERENCES observations(id),
  weight REAL NOT NULL,
  pressure REAL,
  contribution REAL NOT NULL DEFAULT 0,
  confidence_contribution REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL,
  unavailable_reason TEXT,
  PRIMARY KEY (snapshot_id, indicator_id)
);

-- ---------------------------------------------------------------------------
-- Operational audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'no_change', 'partial', 'failed')),
  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_changed INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  observations_written INTEGER NOT NULL DEFAULT 0,
  snapshot_id INTEGER REFERENCES snapshots(id),
  summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started ON ingestion_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS collector_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('changed', 'unchanged', 'not_modified', 'skipped', 'failed')),
  failure_class TEXT,
  message TEXT,
  evidence_sha256 TEXT,
  http_status INTEGER,
  byte_size INTEGER,
  duration_ms INTEGER,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collector_results_source ON collector_results (source_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS validation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  ok INTEGER NOT NULL,
  errors_json TEXT,
  warnings_json TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_results_source ON validation_results (source_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS methodology_versions (
  version TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  published_at TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  notes TEXT
);
