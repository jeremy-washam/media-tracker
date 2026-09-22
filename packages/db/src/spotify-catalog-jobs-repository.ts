import type { DatabaseClient } from './database'

export interface SpotifyCatalogJob {
  id: string
  connectionId: string
  syncRunId: string
  state: 'pending' | 'running' | 'succeeded' | 'failed'
  phase: 'tracks' | 'episodes'
  attemptCount: number
  requestedCount: number
  returnedCount: number
  unavailableCount: number
  nextAttemptAt: string | null
  safeErrorCode: string | null
  createdAt: string
}

type Row = Record<string, string | number | null>

function job(row: Row): SpotifyCatalogJob {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    syncRunId: String(row.sync_run_id),
    state: String(row.state) as SpotifyCatalogJob['state'],
    phase: String(row.phase) as SpotifyCatalogJob['phase'],
    attemptCount: Number(row.attempt_count),
    requestedCount: Number(row.requested_count),
    returnedCount: Number(row.returned_count),
    unavailableCount: Number(row.unavailable_count),
    nextAttemptAt: row.next_attempt_at as string | null,
    safeErrorCode: row.safe_error_code as string | null,
    createdAt: String(row.created_at),
  }
}

export class SqlSpotifyCatalogJobsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async find(id: string): Promise<SpotifyCatalogJob | null> {
    const row = await this.database
      .prepare('SELECT * FROM spotify_catalog_backfill_jobs WHERE id=?')
      .bind(id)
      .first<Row>()
    return row === null ? null : job(row)
  }

  async findActive(): Promise<SpotifyCatalogJob | null> {
    const row = await this.database
      .prepare(
        "SELECT * FROM spotify_catalog_backfill_jobs WHERE state IN ('pending','running') ORDER BY created_at DESC LIMIT 1",
      )
      .first<Row>()
    return row === null ? null : job(row)
  }

  async create(input: {
    id: string
    connectionId: string
    syncRunId: string
    at: string
  }): Promise<SpotifyCatalogJob> {
    await this.database
      .prepare(
        `INSERT INTO spotify_catalog_backfill_jobs(
      id,connection_id,sync_run_id,state,phase,created_at,updated_at)
      VALUES(?,?,?,'pending','tracks',?,?)`,
      )
      .bind(input.id, input.connectionId, input.syncRunId, input.at, input.at)
      .run()
    const created = await this.find(input.id)
    if (created === null) throw new Error('Spotify catalog job creation failed')
    return created
  }

  async reserve(
    id: string,
    phase: SpotifyCatalogJob['phase'],
    at: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const row = await this.database
      .prepare(
        `UPDATE spotify_catalog_backfill_jobs SET state='running',
      attempt_count=attempt_count+1,lease_expires_at=?,next_attempt_at=NULL,
      safe_error_code=NULL,updated_at=?
      WHERE id=? AND phase=? AND state IN ('pending','running')
      AND (lease_expires_at IS NULL OR lease_expires_at<=?)
      AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING id`,
      )
      .bind(leaseExpiresAt, at, id, phase, at, at)
      .first<{ id: string }>()
    return row !== null
  }

  async advance(
    id: string,
    input: {
      phase: SpotifyCatalogJob['phase']
      requested: number
      returned: number
      unavailable: number
      at: string
    },
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE spotify_catalog_backfill_jobs SET state='pending',phase=?,
      requested_count=requested_count+?,returned_count=returned_count+?,
      unavailable_count=unavailable_count+?,lease_expires_at=NULL,
      next_attempt_at=NULL,updated_at=? WHERE id=? AND state='running'`,
      )
      .bind(input.phase, input.requested, input.returned, input.unavailable, input.at, id)
      .run()
  }

  async defer(id: string, at: string, nextAttemptAt: string, safeErrorCode: string): Promise<void> {
    await this.database
      .prepare(
        `UPDATE spotify_catalog_backfill_jobs SET state='pending',
      lease_expires_at=NULL,next_attempt_at=?,safe_error_code=?,updated_at=?
      WHERE id=? AND state IN ('pending','running')`,
      )
      .bind(nextAttemptAt, safeErrorCode, at, id)
      .run()
  }

  async complete(id: string, at: string): Promise<void> {
    await this.database
      .prepare(
        `UPDATE spotify_catalog_backfill_jobs SET state='succeeded',
      lease_expires_at=NULL,next_attempt_at=NULL,completed_at=?,updated_at=?
      WHERE id=? AND state IN ('pending','running')`,
      )
      .bind(at, at, id)
      .run()
  }

  async fail(id: string, at: string, safeErrorCode: string): Promise<void> {
    await this.database
      .prepare(
        `UPDATE spotify_catalog_backfill_jobs SET state='failed',
      lease_expires_at=NULL,next_attempt_at=NULL,safe_error_code=?,completed_at=?,updated_at=?
      WHERE id=? AND state IN ('pending','running')`,
      )
      .bind(safeErrorCode, at, at, id)
      .run()
  }
}
