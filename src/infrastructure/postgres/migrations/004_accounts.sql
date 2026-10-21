CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_email_tokens_email_created ON email_tokens(email, created_at);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id);

ALTER TABLE snapshots ADD COLUMN launched_by TEXT REFERENCES users(id);

ALTER TABLE projects ADD COLUMN owner_id TEXT REFERENCES users(id);
ALTER TABLE projects DROP CONSTRAINT projects_root_url_key;
-- A public project (no owner) is unique per URL; a private one is unique per owner and URL.
CREATE UNIQUE INDEX idx_projects_public_root_url ON projects(root_url) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX idx_projects_owner_root_url ON projects(owner_id, root_url)
  WHERE owner_id IS NOT NULL;
