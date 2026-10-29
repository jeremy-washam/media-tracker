import type { DatabaseClient } from './database'

export type CatalogProvider = 'tmdb' | 'youtube'
export type CatalogJobState = 'pending' | 'running' | 'succeeded' | 'failed'

export interface CatalogJobRecord {
  id: string
  provider: CatalogProvider
  state: CatalogJobState
  cursor: string | null
  attemptCount: number
  requestedCount: number
  returnedCount: number
  omittedCount: number
  quotaUnitEstimate: number
  safeErrorCode: string | null
}

type Row = Record<string, null | number | string>

export class SqlCatalogJobsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findActive(provider: CatalogProvider): Promise<CatalogJobRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT * FROM catalog_refresh_jobs
         WHERE provider=? AND state IN ('pending','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(provider)
      .first<Row>()
    return row === null ? null : catalogJob(row)
  }

  async create(id: string, provider: CatalogProvider, at: string): Promise<CatalogJobRecord> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO catalog_refresh_jobs(
           id,provider,state,cursor_value,attempt_count,requested_count,returned_count,
           omitted_count,quota_unit_estimate,created_at,updated_at)
         VALUES(?,?,'pending',NULL,0,0,0,0,0,?,?)`,
      )
      .bind(id, provider, at, at)
      .run()
    const created = await this.find(id)
    if (created !== null) return created
    const active = await this.findActive(provider)
    if (active === null) throw new Error('Catalog job creation did not produce an active job')
    return active
  }

  async find(id: string): Promise<CatalogJobRecord | null> {
    const row = await this.database
      .prepare('SELECT * FROM catalog_refresh_jobs WHERE id=?')
      .bind(id)
      .first<Row>()
    return row === null ? null : catalogJob(row)
  }

  async reserve(
    id: string,
    cursor: string | null,
    at: string,
    leaseExpiresAt: string,
  ): Promise<number | null> {
    const row = await this.database
      .prepare(
        `UPDATE catalog_refresh_jobs SET state='running',attempt_count=attempt_count+1,
           started_at=COALESCE(started_at,?),lease_expires_at=?,safe_error_code=NULL,updated_at=?
         WHERE id=? AND state IN ('pending','running')
           AND COALESCE(cursor_value,'')=COALESCE(?,'')
           AND (lease_expires_at IS NULL OR lease_expires_at<=?)
         RETURNING attempt_count`,
      )
      .bind(at, leaseExpiresAt, at, id, cursor, at)
      .first<{ attempt_count: number }>()
    return row?.attempt_count ?? null
  }

  async release(id: string, leaseToken: number, at: string): Promise<boolean> {
    const row = await this.database
      .prepare(
        `UPDATE catalog_refresh_jobs SET state='pending',lease_expires_at=NULL,updated_at=?
         WHERE id=? AND state='running' AND attempt_count=? RETURNING id`,
      )
      .bind(at, id, leaseToken)
      .first<{ id: string }>()
    return row !== null
  }

  async advance(
    id: string,
    leaseToken: number,
    input: {
      cursor: string
      requested: number
      returned: number
      omitted: number
      quotaUnits: number
      at: string
    },
  ): Promise<boolean> {
    const row = await this.database
      .prepare(
        `UPDATE catalog_refresh_jobs SET state='pending',cursor_value=?,requested_count=requested_count+?,
           returned_count=returned_count+?,omitted_count=omitted_count+?,
           quota_unit_estimate=quota_unit_estimate+?,lease_expires_at=NULL,updated_at=?
           WHERE id=? AND state='running' AND attempt_count=? RETURNING id`,
      )
      .bind(
        input.cursor,
        input.requested,
        input.returned,
        input.omitted,
        input.quotaUnits,
        input.at,
        id,
        leaseToken,
      )
      .first<{ id: string }>()
    return row !== null
  }

  async complete(id: string, leaseToken: number, at: string): Promise<boolean> {
    const row = await this.database
      .prepare(
        `UPDATE catalog_refresh_jobs SET state='succeeded',lease_expires_at=NULL,
           completed_at=?,updated_at=? WHERE id=? AND state='running' AND attempt_count=? RETURNING id`,
      )
      .bind(at, at, id, leaseToken)
      .first<{ id: string }>()
    return row !== null
  }

  async fail(id: string, leaseToken: number, safeErrorCode: string, at: string): Promise<boolean> {
    const row = await this.database
      .prepare(
        `UPDATE catalog_refresh_jobs SET state='failed',lease_expires_at=NULL,
           safe_error_code=?,completed_at=?,updated_at=? WHERE id=? AND state='running' AND attempt_count=? RETURNING id`,
      )
      .bind(safeErrorCode, at, at, id, leaseToken)
      .first<{ id: string }>()
    return row !== null
  }
}

function catalogJob(row: Row): CatalogJobRecord {
  return {
    id: String(row.id),
    provider: String(row.provider) as CatalogProvider,
    state: String(row.state) as CatalogJobState,
    cursor: row.cursor_value as string | null,
    attemptCount: Number(row.attempt_count),
    requestedCount: Number(row.requested_count),
    returnedCount: Number(row.returned_count),
    omittedCount: Number(row.omitted_count),
    quotaUnitEstimate: Number(row.quota_unit_estimate),
    safeErrorCode: row.safe_error_code as string | null,
  }
}
