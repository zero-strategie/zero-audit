CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'finished', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_limit INTEGER NOT NULL
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  url TEXT NOT NULL,
  depth INTEGER NOT NULL,
  status INTEGER,
  error TEXT,
  redirect_target TEXT,
  redirect_chain TEXT NOT NULL,
  headers TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  content_type TEXT,
  is_html INTEGER NOT NULL,
  title TEXT,
  meta_description TEXT,
  h1 TEXT NOT NULL,
  word_count INTEGER,
  content_hash TEXT
);
CREATE INDEX idx_pages_snapshot_url ON pages(snapshot_id, url);

CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  type TEXT NOT NULL,
  rel TEXT,
  anchor TEXT
);
CREATE INDEX idx_links_snapshot_source ON links(snapshot_id, source_url);

CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  check_id INTEGER NOT NULL,
  severity TEXT NOT NULL,
  theme TEXT NOT NULL,
  count INTEGER NOT NULL,
  examined INTEGER NOT NULL
);
CREATE INDEX idx_check_results_snapshot ON check_results(snapshot_id, check_id);

CREATE TABLE issue_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  check_id INTEGER NOT NULL,
  page_url TEXT,
  info TEXT NOT NULL
);
CREATE INDEX idx_issue_occurrences_snapshot ON issue_occurrences(snapshot_id, check_id);
