import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Bindings } from './env'
import { importLetterboxdExport } from './letterboxd-import'

const migration = readFileSync(
  fileURLToPath(
    new URL('../../../packages/db/migrations/0001_canonical_ledger.sql', import.meta.url).href,
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

function csv(value: string): Uint8Array {
  return strToU8(value.replaceAll('\n', '\r\n'))
}

function count(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
    .count
}

const archive = zipSync({
  'watched.csv': csv(
    'Date,Name,Year,Letterboxd URI\n2025-01-01,Synthetic One,2024,https://boxd.it/film-one\n2025-01-02,Synthetic Two,2023,https://boxd.it/film-two\n',
  ),
  'diary.csv': csv(
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2025-01-03,Synthetic One,2024,https://boxd.it/diary-one,4.5,,,2025-01-02\n2025-02-03,Synthetic One,2024,https://boxd.it/diary-two,4,Yes,,2025-02-02\n',
  ),
  'ratings.csv': csv(
    'Date,Name,Year,Letterboxd URI,Rating\n2025-01-03,Synthetic One,2024,https://boxd.it/film-one,4.5\n2025-01-04,Synthetic Two,2023,https://boxd.it/film-two,3\n',
  ),
  'reviews.csv': csv(
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2025-02-03,Synthetic One,2024,https://boxd.it/diary-two,4,Yes,Synthetic review,,2025-02-02\n',
  ),
})

describe('Letterboxd export import', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket

  beforeEach(() => {
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
  })

  afterEach(() => {
    database.database.close()
  })

  it('preserves the ZIP and imports watched-only and repeated Diary viewings idempotently', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings

    await expect(importLetterboxdExport(bindings, archive)).resolves.toMatchObject({
      alreadyImported: false,
      films: 2,
      archiveEntries: 3,
      unresolvedRecords: 0,
    })
    await expect(importLetterboxdExport(bindings, archive)).resolves.toMatchObject({
      alreadyImported: true,
      films: 0,
      archiveEntries: 0,
    })

    expect(bucket.objects.size).toBe(1)
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(count(database.database, 'media_items')).toBe(2)
    expect(count(database.database, 'external_identities')).toBe(4)
    expect(count(database.database, 'archive_entries')).toBe(3)
    expect(count(database.database, 'sync_runs')).toBe(2)

    expect(
      database.database
        .prepare(
          `SELECT admission_reason, consumed_at_value, consumed_at_precision,
                  rating_value, review_text
           FROM archive_entries ORDER BY consumed_at_value`,
        )
        .all(),
    ).toEqual([
      {
        admission_reason: 'letterboxd_watched_state',
        consumed_at_value: null,
        consumed_at_precision: null,
        rating_value: 3,
        review_text: null,
      },
      {
        admission_reason: 'letterboxd_diary_entry',
        consumed_at_value: '2025-01-02',
        consumed_at_precision: 'day',
        rating_value: 4.5,
        review_text: null,
      },
      {
        admission_reason: 'letterboxd_diary_entry',
        consumed_at_value: '2025-02-02',
        consumed_at_precision: 'day',
        rating_value: 4,
        review_text: 'Synthetic review',
      },
    ])
  })
})
