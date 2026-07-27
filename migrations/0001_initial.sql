PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS observations (
  indicator_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  published_at TEXT NOT NULL,
  value REAL NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_confidence REAL NOT NULL CHECK (source_confidence >= 0 AND source_confidence <= 1),
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'provisional', 'illustrative', 'withdrawn')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (indicator_id, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_observations_indicator_date
  ON observations (indicator_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  severity REAL NOT NULL CHECK (severity >= 0 AND severity <= 5),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  half_life_hours REAL NOT NULL CHECK (half_life_hours > 0),
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'approved', 'rejected', 'informational')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_occurred_at
  ON events (occurred_at DESC);

CREATE TABLE IF NOT EXISTS snapshots (
  as_of TEXT PRIMARY KEY,
  score REAL NOT NULL,
  base_score REAL NOT NULL,
  event_overlay REAL NOT NULL,
  confidence REAL NOT NULL,
  level TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_generated_at
  ON snapshots (generated_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collector_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  records_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT
);
