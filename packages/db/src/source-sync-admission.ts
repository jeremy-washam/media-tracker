import type { DatabaseClient } from './database'

/** One source attempt per UTC day, with a global lease across HTTP and cron. */
export class SqlSourceSyncAdmission {
  constructor(private readonly db: DatabaseClient) {}

  async withinAllowance(): Promise<boolean> {
    // Lifetime allocation, deliberately not reset by a deploy, new day or new
    // grant. Unknown/failed database work retains the complete reservation.
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) jobs,
      COALESCE(SUM(CASE WHEN outcome='running' OR usage_json IS NULL OR COALESCE(json_extract(usage_json,'$.failedOperations'),0)>0 OR COALESCE(json_extract(usage_json,'$.unmeasuredNonFirstStatements'),0)>0
        THEN 2000000 ELSE COALESCE(json_extract(usage_json,'$.rowsWritten'),2000000) END),0) writes,
      COALESCE(SUM(CASE WHEN outcome='running' OR usage_json IS NULL OR COALESCE(json_extract(usage_json,'$.failedOperations'),0)>0 OR COALESCE(json_extract(usage_json,'$.unmeasuredNonFirstStatements'),0)>0
        THEN 200000000 ELSE COALESCE(json_extract(usage_json,'$.rowsRead'),200000000) END),0) reads,
      COALESCE(SUM(CASE WHEN outcome='running' THEN 67108864 ELSE COALESCE(json_extract(usage_json,'$.bytes'),67108864) END),0) bytes,
      COALESCE(SUM(CASE WHEN outcome='running' THEN 128 ELSE COALESCE(json_extract(usage_json,'$.requests'),128) END),0) requests
      FROM source_sync_admission`,
      )
      .first<{ jobs: number; writes: number; reads: number; bytes: number; requests: number }>()
    return (
      row !== null &&
      row.jobs < 365 &&
      row.writes + 2_000_000 <= 10_000_000 &&
      row.reads + 200_000_000 <= 1_000_000_000 &&
      row.bytes + 67_108_864 <= 2_000_000_000 &&
      row.requests + 128 <= 20_000
    )
  }

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

  async retryable(source: string, now: number) {
    return this.db
      .prepare(
        `SELECT started_at, reservation_json, usage_json FROM source_sync_admission
      WHERE source = ? AND day = ? AND outcome = 'failed' AND attempts < 3 AND usage_json IS NOT NULL`,
      )
      .bind(source, new Date(now).toISOString().slice(0, 10))
      .first<{ started_at: number; reservation_json: string; usage_json: string }>()
  }

  async claimRetry(source: string, started: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE source_sync_admission SET attempts = attempts + 1, outcome = 'running', finished_at = NULL
      WHERE source = ? AND day = ? AND started_at = ? AND attempts < 3 AND outcome = 'failed'
      RETURNING source`,
      )
      .bind(source, new Date(started).toISOString().slice(0, 10), started)
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
