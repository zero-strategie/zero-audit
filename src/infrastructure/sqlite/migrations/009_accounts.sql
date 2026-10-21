CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_email_tokens_email_created ON email_tokens(email, created_at);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id);

ALTER TABLE snapshots ADD COLUMN launched_by TEXT REFERENCES users(id);

-- SQLite cannot drop the UNIQUE(root_url) constraint in place, so the table is rebuilt with the
-- same ids. Foreign keys from snapshots are only checked at commit, when every parent row is back.
PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE projects_backup AS SELECT id, root_url, created_at FROM projects;
DROP TABLE projects;
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  root_url TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
INSERT INTO projects (id, root_url, owner_id, created_at)
SELECT id, root_url, NULL, created_at FROM projects_backup;
DROP TABLE projects_backup;

-- A public project (no owner) is unique per URL; a private one is unique per owner and URL.
CREATE UNIQUE INDEX idx_projects_public_root_url ON projects(root_url) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX idx_projects_owner_root_url ON projects(owner_id, root_url)
  WHERE owner_id IS NOT NULL;
