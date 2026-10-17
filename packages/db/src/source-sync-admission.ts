import type { DatabaseClient } from './database'

/** One source attempt per UTC day, with a global lease across HTTP and cron. */
export class SqlSourceSyncAdmission {
  constructor(private readonly db: DatabaseClient) {}

  async available(source: string, now: number): Promise<boolean> {
    return (
      (await this.db
        .prepare(
          `SELECT 1 FROM source_sync_admission
      WHERE source = ? AND (day = ? OR started_at > ?) LIMIT 1`,
        )
        .bind(source, new Date(now).toISOString().slice(0, 10), now - 23 * 60 * 60_000)
        .first()) === null
    )
  }

  async acquire(owner: string, now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
      INSERT INTO source_sync_lease(id, owner, expires_at) VALUES ('sources', ?, ?)
      ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
      WHERE source_sync_lease.expires_at <= ? RETURNING owner
    `,
      )
      .bind(owner, now + 20 * 60_000, now)
      .all<{ owner: string }>()
    return result.results.length === 1
  }

  async reserve(source: string, now: number, reservation: string): Promise<boolean> {
    const day = new Date(now).toISOString().slice(0, 10)
    const result = await this.db
      .prepare(
        `
      INSERT OR IGNORE INTO source_sync_admission
        (source, day, attempts, started_at, outcome, reservation_json)
      SELECT ?, ?, 1, ?, 'running', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM source_sync_admission WHERE source = ? AND started_at > ?
      ) RETURNING source
    `,
      )
      .bind(source, day, now, reservation, source, now - 23 * 60 * 60_000)
      .all<{ source: string }>()
    return result.results.length === 1
  }

  async finish(
    source: string,
    started: number,
    finished: number,
    outcome: 'succeeded' | 'failed',
    usage: string,
  ) {
    await this.db
      .prepare(
        `UPDATE source_sync_admission SET finished_at = ?, outcome = ?, usage_json = ?
      WHERE source = ? AND day = ? AND started_at = ?`,
      )
      .bind(finished, outcome, usage, source, new Date(started).toISOString().slice(0, 10), started)
      .run()
  }

  async release(owner: string) {
    await this.db
      .prepare('DELETE FROM source_sync_lease WHERE id = ? AND owner = ?')
      .bind('sources', owner)
      .run()
  }
}
