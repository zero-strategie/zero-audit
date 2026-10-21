-- Columns are nullable or defaulted so the previous version's INSERT keeps working (rollback).
ALTER TABLE snapshots DROP CONSTRAINT snapshots_status_check;
ALTER TABLE snapshots
  ADD CONSTRAINT snapshots_status_check CHECK (status IN ('queued', 'running', 'finished', 'failed'));
ALTER TABLE snapshots ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE snapshots ADD COLUMN queued_at TIMESTAMPTZ;
ALTER TABLE snapshots ADD COLUMN heartbeat_at TIMESTAMPTZ;
CREATE INDEX idx_snapshots_status_queued ON snapshots(status, queued_at);

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  heartbeat_at TIMESTAMPTZ NOT NULL
);
