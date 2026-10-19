CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  root_url TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'finished', 'failed')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_limit INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_project_started ON snapshots(project_id, started_at);

CREATE TABLE pages (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  url TEXT NOT NULL,
  depth INTEGER NOT NULL,
  status INTEGER,
  error TEXT,
  redirect_target TEXT,
  redirect_chain JSONB NOT NULL,
  headers JSONB NOT NULL,
  response_time_ms INTEGER NOT NULL,
  content_type TEXT,
  is_html BOOLEAN NOT NULL,
  title TEXT,
  meta_description TEXT,
  canonical TEXT,
  h1 JSONB NOT NULL,
  word_count INTEGER,
  content_hash TEXT,
  blocked_by_robots BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_pages_snapshot_url ON pages(snapshot_id, url);

CREATE TABLE links (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  type TEXT NOT NULL,
  rel TEXT,
  anchor TEXT
);
CREATE INDEX idx_links_snapshot_source ON links(snapshot_id, source_url);

CREATE TABLE site_files (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  kind TEXT NOT NULL CHECK (kind IN ('robots', 'sitemap', 'llms')),
  url TEXT NOT NULL,
  status INTEGER,
  error TEXT
);
CREATE INDEX idx_site_files_snapshot ON site_files(snapshot_id, kind, url);

CREATE TABLE host_probes (
  snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id),
  url TEXT NOT NULL,
  status INTEGER,
  error TEXT,
  is_html BOOLEAN NOT NULL,
  canonical TEXT
);

CREATE TABLE check_results (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  check_id INTEGER NOT NULL,
  severity TEXT NOT NULL,
  theme TEXT NOT NULL,
  count INTEGER NOT NULL,
  examined INTEGER NOT NULL
);
CREATE INDEX idx_check_results_snapshot ON check_results(snapshot_id, check_id);

CREATE TABLE issue_occurrences (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  check_id INTEGER NOT NULL,
  page_url TEXT,
  info JSONB NOT NULL
);
CREATE INDEX idx_issue_occurrences_snapshot ON issue_occurrences(snapshot_id, check_id);
