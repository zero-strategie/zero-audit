CREATE TABLE host_probes (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id),
  url TEXT NOT NULL,
  status INTEGER,
  error TEXT,
  is_html INTEGER NOT NULL,
  canonical TEXT
);
