import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'
import { SqlSpotifyCatalogJobsRepository } from './spotify-catalog-jobs-repository'

class Statement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []
  constructor(private readonly statement: StatementSync) {}
  bind(...values: readonly DatabaseValue[]) {
    this.#values = values
    return this
  }
  values() {
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
class Client implements DatabaseClient {
  constructor(private readonly database: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this.database.prepare(sql))
  }
  async batch(): Promise<readonly DatabaseRunResult[]> {
    throw new Error('Not used')
  }
}

describe('SqlSpotifyCatalogJobsRepository', () => {
  let database: DatabaseSync
  let jobs: SqlSpotifyCatalogJobsRepository
  const at = '2026-01-01T00:00:00.000Z'
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(
      `CREATE TABLE connections(id TEXT PRIMARY KEY); CREATE TABLE sync_runs(id TEXT PRIMARY KEY);`,
    )
    database.exec(
      readFileSync(
        new URL('../migrations/0022_spotify_catalog_backfill.sql', import.meta.url),
        'utf8',
      ),
    )
    database.exec(
      "INSERT INTO connections VALUES('connection'); INSERT INTO sync_runs VALUES('run');",
    )
    jobs = new SqlSpotifyCatalogJobsRepository(new Client(database))
  })
  afterEach(() => database.close())

  it('keeps a single active job and leases each phase once', async () => {
    await jobs.create({ id: 'job', connectionId: 'connection', syncRunId: 'run', at })
    expect(await jobs.findActive()).toMatchObject({ id: 'job', phase: 'tracks' })
    expect(await jobs.reserve('job', 'tracks', at, '2026-01-01T00:05:00.000Z')).toBe(true)
    expect(await jobs.reserve('job', 'tracks', at, '2026-01-01T00:05:00.000Z')).toBe(false)
    await jobs.advance('job', { phase: 'episodes', requested: 1, returned: 1, unavailable: 0, at })
    expect(await jobs.reserve('job', 'tracks', at, '2026-01-01T00:05:00.000Z')).toBe(false)
    expect(await jobs.reserve('job', 'episodes', at, '2026-01-01T00:05:00.000Z')).toBe(true)
    await jobs.advance('job', { phase: 'episodes', requested: 2, returned: 1, unavailable: 1, at })
    await jobs.defer('job', at, '2026-01-01T00:15:00.000Z', 'spotify_http_429')
    expect(await jobs.reserve('job', 'episodes', at, '2026-01-01T00:05:00.000Z')).toBe(false)
    expect(
      await jobs.reserve('job', 'episodes', '2026-01-01T00:15:00.000Z', '2026-01-01T00:20:00.000Z'),
    ).toBe(true)
    expect(await jobs.find('job')).toMatchObject({
      requestedCount: 3,
      returnedCount: 2,
      unavailableCount: 1,
    })
  })
})
