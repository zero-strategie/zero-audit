CREATE TABLE slash_probes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  url TEXT NOT NULL,
  source_page_url TEXT NOT NULL,
  status INTEGER,
  error TEXT,
  is_html INTEGER NOT NULL,
  canonical TEXT
);
CREATE INDEX idx_slash_probes_snapshot ON slash_probes(snapshot_id, source_page_url, url);
