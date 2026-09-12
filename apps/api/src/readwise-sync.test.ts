import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from './env'
import { syncReadwiseArchive } from './readwise-sync'

const migration = readFileSync(
  fileURLToPath(
    new URL('../../../packages/db/migrations/0001_canonical_ledger.sql', import.meta.url).href,
  ),
  'utf8',
)
const readerPage = readFileSync(
  fileURLToPath(
    new URL('../../../packages/test-fixtures/readwise/archive-page.json', import.meta.url).href,
  ),
  'utf8',
)

type SqlValue = ArrayBuffer | null | number | string

class D1SqliteStatement {
  readonly #statement: StatementSync
  #values: readonly SqlValue[] = []

  constructor(statement: StatementSync) {
    this.#statement = statement
  }

  bind(...values: readonly SqlValue[]): D1SqliteStatement {
    this.#values = values
    return this
  }

  async first<Row>(): Promise<Row | null> {
    return (this.#statement.get(...this.#nodeValues()) as Row | undefined) ?? null
  }

  async all<Row>(): Promise<{ results: Row[]; success: true }> {
    return { results: this.#statement.all(...this.#nodeValues()) as Row[], success: true }
  }

  async run(): Promise<{ success: true }> {
    this.execute()
    return { success: true }
  }

  execute(): void {
    this.#statement.run(...this.#nodeValues())
  }

  #nodeValues() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
}

class D1SqliteDatabase {
  readonly database = new DatabaseSync(':memory:')

  constructor() {
    this.database.exec(migration)
  }

  prepare(query: string): D1SqliteStatement {
    return new D1SqliteStatement(this.database.prepare(query))
  }

  async batch(statements: readonly D1SqliteStatement[]): Promise<readonly { success: true }[]> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) statement.execute()
      this.database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>()

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<object> {
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.objects.set(key, bytes.slice())
    return {}
  }
}

function count(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
    .count
}

describe('Readwise Archive sync', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket

  beforeEach(() => {
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(JSON.parse(readerPage), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    database.database.close()
    vi.unstubAllGlobals()
  })

  it('stores raw evidence and exposes eligible Archive media idempotently', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
    } as unknown as Bindings

    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({
      pages: 1,
      sourceRecords: 7,
      archiveItems: 5,
    })
    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({
      pages: 1,
      sourceRecords: 7,
      archiveItems: 5,
    })

    expect(bucket.objects.size).toBe(1)
    expect(count(database.database, 'raw_objects')).toBe(2)
    expect(count(database.database, 'source_records')).toBe(14)
    expect(count(database.database, 'media_items')).toBe(5)
    expect(count(database.database, 'external_identities')).toBe(5)
    expect(count(database.database, 'archive_entries')).toBe(5)
    expect(count(database.database, 'archive_entry_evidence')).toBe(10)
    expect(count(database.database, 'sync_cursors')).toBe(1)

    expect(
      database.database
        .prepare('SELECT count(*) AS count FROM source_records WHERE disposition = ?')
        .get('ignored'),
    ).toEqual({ count: 4 })
    expect(
      database.database
        .prepare('SELECT consumed_at_basis FROM archive_entries GROUP BY consumed_at_basis')
        .all(),
    ).toEqual([{ consumed_at_basis: 'inferred' }])
  })
})
