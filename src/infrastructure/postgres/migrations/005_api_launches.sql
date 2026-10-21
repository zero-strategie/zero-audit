-- Quota journal: no foreign key to users, so that erasing an account does not reset its quotas.
-- email_hash is the SHA-256 of the normalized address.
CREATE TABLE api_launches (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  launched_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_api_launches_launched_at ON api_launches(launched_at);
CREATE INDEX idx_api_launches_email ON api_launches(email_hash, launched_at);
