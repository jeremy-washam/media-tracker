import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from './env'
import { importLetterboxdExport } from './letterboxd-import'
import { syncLetterboxdRss } from './letterboxd-rss-sync'

const migration = readFileSync(
  fileURLToPath(
    new URL('../../../packages/db/migrations/0001_canonical_ledger.sql', import.meta.url).href,
  ),
  'utf8',
)
const moviesMigration = readFileSync(
  fileURLToPath(
    new URL('../../../packages/db/migrations/0006_movies_library.sql', import.meta.url).href,
  ),
  'utf8',
)
const nullableMovieSourceMigration = readFileSync(
  fileURLToPath(
    new URL('../../../packages/db/migrations/0007_movies_nullable_source_link.sql', import.meta.url)
      .href,
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
    this.database.exec(`${migration}\n${moviesMigration}\n${nullableMovieSourceMigration}`)
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
  'watchlist.csv': csv('Date,Name,Year,Letterboxd URI\n'),
  'likes/films.csv': csv('Date,Name,Year,Letterboxd URI\n'),
})

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
  <channel>
    <item>
      <link>https://boxd.it/diary-one</link>
      <guid isPermaLink="false">letterboxd-watch-100</guid>
      <pubDate>Wed, 2 Jul 2025 12:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2025-01-02</letterboxd:watchedDate>
      <letterboxd:filmTitle>Synthetic One</letterboxd:filmTitle>
      <letterboxd:filmYear>2024</letterboxd:filmYear>
      <letterboxd:memberRating>4.5</letterboxd:memberRating>
      <tmdb:movieId>100</tmdb:movieId>
    </item>
    <item>
      <link>https://letterboxd.com/example/film/new-film/</link>
      <guid isPermaLink="false">letterboxd-watch-200</guid>
      <pubDate>Thu, 3 Jul 2025 12:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2025-07-02</letterboxd:watchedDate>
      <letterboxd:filmTitle>New RSS Film</letterboxd:filmTitle>
      <letterboxd:filmYear>2025</letterboxd:filmYear>
      <tmdb:movieId>200</tmdb:movieId>
    </item>
    <item>
      <link>https://letterboxd.com/example/film/new-film/rewatch/</link>
      <guid isPermaLink="false">letterboxd-watch-201</guid>
      <pubDate>Fri, 4 Jul 2025 12:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2025-07-03</letterboxd:watchedDate>
      <letterboxd:filmTitle>New RSS Film</letterboxd:filmTitle>
      <letterboxd:filmYear>2025</letterboxd:filmYear>
      <letterboxd:rewatch>Yes</letterboxd:rewatch>
      <tmdb:movieId>200</tmdb:movieId>
    </item>
    <item>
      <guid isPermaLink="false">letterboxd-list-300</guid>
      <pubDate>Thu, 3 Jul 2025 13:00:00 +0000</pubDate>
    </item>
    <item>
      <guid isPermaLink="false">letterboxd-watch-400</guid>
      <pubDate>Thu, 3 Jul 2025 14:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2025-99-99</letterboxd:watchedDate>
      <letterboxd:filmTitle>Malformed Date Film</letterboxd:filmTitle>
      <letterboxd:filmYear>2025</letterboxd:filmYear>
      <tmdb:movieId>400</tmdb:movieId>
    </item>
  </channel>
</rss>`

describe('Letterboxd export import', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket

  beforeEach(() => {
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
  })

  afterEach(() => {
    database.database.close()
    vi.unstubAllGlobals()
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
        rating_value: null,
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

  it('reconciles RSS entries to an imported Diary and skips unchanged feed processing', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      LETTERBOXD_USERNAME: 'example',
    } as unknown as Bindings
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(rss, {
            headers: { 'content-type': 'application/rss+xml' },
          }),
        ),
      ),
    )

    await importLetterboxdExport(bindings, archive)
    await expect(syncLetterboxdRss(bindings)).resolves.toMatchObject({
      unchanged: false,
      feedEntries: 5,
      archiveEntries: 3,
      sourceRecords: 5,
      unresolvedRecords: 1,
    })
    await expect(syncLetterboxdRss(bindings)).resolves.toMatchObject({
      unchanged: true,
      feedEntries: 5,
      archiveEntries: 0,
      sourceRecords: 0,
    })

    expect(bucket.objects.size).toBe(2)
    expect(count(database.database, 'raw_objects')).toBe(3)
    expect(count(database.database, 'media_items')).toBe(3)
    expect(count(database.database, 'archive_entries')).toBe(5)
    expect(count(database.database, 'sync_cursors')).toBe(1)
    expect(
      database.database
        .prepare('SELECT count(*) AS count FROM archive_entries WHERE consumed_at_value = ?')
        .get('2025-01-02'),
    ).toEqual({ count: 1 })
  })
})
