import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'
import { SqlCatalogJobsRepository } from './catalog-jobs-repository'

class SqliteStatement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []

  constructor(private readonly statement: StatementSync) {}

  bind(...values: readonly DatabaseValue[]) {
    this.#values = values
    return this
  }

  private values() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }

  async run(): Promise<DatabaseRunResult> {
    this.statement.run(...this.values())
    return { success: true }
  }

  async first<Row>(): Promise<Row | null> {
    return (this.statement.get(...this.values()) as Row | undefined) ?? null
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    return { results: this.statement.all(...this.values()) as Row[], success: true }
  }
}

class SqliteClient implements DatabaseClient {
  constructor(private readonly database: DatabaseSync) {}

  prepare(query: string) {
    return new SqliteStatement(this.database.prepare(query))
  }

  async batch(): Promise<readonly DatabaseRunResult[]> {
    throw new Error('not used')
  }
}

describe('SqlCatalogJobsRepository', () => {
  let database: DatabaseSync
  let repository: SqlCatalogJobsRepository

  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(`
      CREATE TABLE catalog_refresh_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        provider TEXT NOT NULL,
        state TEXT NOT NULL,
        cursor_value TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        requested_count INTEGER NOT NULL DEFAULT 0,
        returned_count INTEGER NOT NULL DEFAULT 0,
        omitted_count INTEGER NOT NULL DEFAULT 0,
        quota_unit_estimate INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TEXT,
        next_attempt_at TEXT,
        safe_error_code TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX catalog_refresh_jobs_one_active_provider_idx
        ON catalog_refresh_jobs(provider) WHERE state IN ('pending','running');
    `)
    repository = new SqlCatalogJobsRepository(new SqliteClient(database))
  })

  afterEach(() => database.close())

  it('returns the existing active provider job when starts race', async () => {
    const first = await repository.create('job-1', 'youtube', '2026-01-01T00:00:00.000Z')
    const second = await repository.create('job-2', 'youtube', '2026-01-01T00:00:01.000Z')
    expect(first.id).toBe('job-1')
    expect(second.id).toBe('job-1')
  })

  it('claims each cursor once until release or lease expiry', async () => {
    await repository.create('job-1', 'tmdb', '2026-01-01T00:00:00.000Z')
    await expect(
      repository.reserve('job-1', null, '2026-01-01T00:00:01.000Z', '2026-01-01T00:05:01.000Z'),
    ).resolves.toBe(true)
    await expect(
      repository.reserve('job-1', null, '2026-01-01T00:00:02.000Z', '2026-01-01T00:05:02.000Z'),
    ).resolves.toBe(false)
    await repository.release('job-1', '2026-01-01T00:00:03.000Z')
    await expect(
      repository.reserve('job-1', null, '2026-01-01T00:00:04.000Z', '2026-01-01T00:05:04.000Z'),
    ).resolves.toBe(true)
  })
})
