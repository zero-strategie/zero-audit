CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  root_url TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Nullable at the SQL level because SQLite cannot add a NOT NULL foreign key column
-- without a default; every row is filled below and the repository always sets it.
ALTER TABLE snapshots ADD COLUMN project_id TEXT REFERENCES projects(id);

-- Milestone 1 snapshots join the project of their depth 0 page (lowest page id if several).
CREATE TEMP TABLE snapshot_roots AS
SELECT
  s.id AS snapshot_id,
  s.started_at AS started_at,
  COALESCE(
    (SELECT p.url FROM pages p WHERE p.snapshot_id = s.id AND p.depth = 0 ORDER BY p.id LIMIT 1),
    'unknown:'
  ) AS root_url
FROM snapshots s;

INSERT INTO projects (id, root_url, created_at)
SELECT
  lower(
    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
    || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-'
    || hex(randomblob(6))
  ),
  root_url,
  MIN(started_at)
FROM snapshot_roots
GROUP BY root_url;

UPDATE snapshots
SET project_id = (
  SELECT p.id FROM projects p
  JOIN snapshot_roots r ON r.root_url = p.root_url
  WHERE r.snapshot_id = snapshots.id
);

DROP TABLE snapshot_roots;

CREATE INDEX idx_snapshots_project_started ON snapshots(project_id, started_at);
