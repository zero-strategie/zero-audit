CREATE TABLE site_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  kind TEXT NOT NULL CHECK (kind IN ('robots', 'sitemap', 'llms')),
  url TEXT NOT NULL,
  status INTEGER,
  error TEXT
);
CREATE INDEX idx_site_files_snapshot ON site_files(snapshot_id, kind, url);
