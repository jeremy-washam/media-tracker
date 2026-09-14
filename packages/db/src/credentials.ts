import type { DatabaseClient } from './database'

export interface EncryptedCredential {
  bootstrapSha256: string
  ciphertext: string
  iv: string
}

/** Tokens are encrypted before crossing this storage boundary. */
export class SqlCredentialStore {
  constructor(private readonly database: DatabaseClient) {}

  async read(connectionId: string): Promise<EncryptedCredential | null> {
    return this.database
      .prepare(
        'SELECT bootstrap_sha256 bootstrapSha256, ciphertext, iv FROM connection_credentials WHERE connection_id = ?',
      )
      .bind(connectionId)
      .first<EncryptedCredential>()
  }

  async write(connectionId: string, credential: EncryptedCredential): Promise<void> {
    const result = await this.database
      .prepare(
        `INSERT INTO connection_credentials (connection_id, bootstrap_sha256, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(connection_id) DO UPDATE SET bootstrap_sha256=excluded.bootstrap_sha256, ciphertext=excluded.ciphertext, iv=excluded.iv, updated_at=excluded.updated_at`,
      )
      .bind(
        connectionId,
        credential.bootstrapSha256,
        credential.ciphertext,
        credential.iv,
        new Date().toISOString(),
      )
      .run()
    if (!result.success) throw new Error('Credential persistence failed')
  }

  async acquire(connectionId: string, owner: string, now: number): Promise<boolean> {
    await this.database
      .prepare(
        `INSERT INTO connection_refresh_leases (connection_id, owner, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(connection_id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at WHERE connection_refresh_leases.expires_at < ?`,
      )
      .bind(connectionId, owner, now + 120_000, now)
      .run()
    const lease = await this.database
      .prepare('SELECT owner FROM connection_refresh_leases WHERE connection_id = ?')
      .bind(connectionId)
      .first<{ owner: string }>()
    return lease?.owner === owner
  }

  async release(connectionId: string, owner: string): Promise<void> {
    await this.database
      .prepare('DELETE FROM connection_refresh_leases WHERE connection_id = ? AND owner = ?')
      .bind(connectionId, owner)
      .run()
  }
}
