CREATE TABLE connection_credentials (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  bootstrap_sha256 TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE connection_refresh_leases (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
