-- The status CHECK cannot be altered in place, so snapshots is rebuilt with the same ids. Child
-- tables reference it by id: their foreign keys are only checked at commit, when every row is back.
-- The new columns are nullable or defaulted so the previous version's INSERT keeps working.
PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE snapshots_backup AS
SELECT id, project_id, launched_by, status, started_at, finished_at, pages_crawled, pages_limit
FROM snapshots;
DROP TABLE snapshots;
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'finished', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_limit INTEGER NOT NULL,
  project_id TEXT REFERENCES projects(id),
  launched_by TEXT REFERENCES users(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT,
  heartbeat_at TEXT
);
INSERT INTO snapshots (id, status, started_at, finished_at, pages_crawled, pages_limit, project_id, launched_by)
SELECT id, status, started_at, finished_at, pages_crawled, pages_limit, project_id, launched_by
FROM snapshots_backup;
DROP TABLE snapshots_backup;

CREATE INDEX idx_snapshots_project_started ON snapshots(project_id, started_at);
CREATE INDEX idx_snapshots_status_queued ON snapshots(status, queued_at);

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  heartbeat_at TEXT NOT NULL
);
