import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Bindings } from './env'
import { continueYoutubeTakeoutImport, importYoutubeTakeout } from './youtube-import'

const migration = [
  '0001_canonical_ledger.sql',
  '0002_rotating_credentials.sql',
  '0003_books_library.sql',
  '0004_books_review_facts.sql',
  '0005_books_format_projection.sql',
  '0006_movies_library.sql',
  '0007_movies_nullable_source_link.sql',
  '0008_articles_library.sql',
  '0009_article_content_search_map.sql',
  '0010_article_content_jobs.sql',
  '0011_article_current_availability.sql',
  '0012_article_content_reliability.sql',
  '0013_article_content_attempts.sql',
  '0014_podcasts_library.sql',
  '0015_songs_library.sql',
  '0016_videos_takeout_library.sql',
  '0017_videos_snapshot_safety.sql',
  '0018_videos_snapshot_head_backfill.sql',
  '0019_provider_catalog_caches.sql',
  '0020_tmdb_match_evidence.sql',
  '0026_youtube_clock_safe_publication.sql',
  '0027_compact_archive_evidence.sql',
  '0028_evidence_view_parent_guard.sql',
]
  .map((name) =>
    readFileSync(
      fileURLToPath(new URL(`../../../packages/db/migrations/${name}`, import.meta.url).href),
      'utf8',
    ),
  )
  .join('\n')

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
  batchCalls = 0
  failOnBatchCall: number | null = null
  largestBatch = 0

  constructor() {
    this.database.exec(migration)
  }

  prepare(query: string): D1SqliteStatement {
    return new D1SqliteStatement(this.database.prepare(query))
  }

  async batch(statements: readonly D1SqliteStatement[]): Promise<readonly { success: true }[]> {
    this.batchCalls += 1
    this.largestBatch = Math.max(this.largestBatch, statements.length)
    if (this.batchCalls === this.failOnBatchCall) throw new Error('Synthetic D1 failure')
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

  async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
    const bytes = this.objects.get(key)
    if (bytes === undefined) return null
    return {
      async arrayBuffer() {
        return bytes.slice().buffer
      },
    }
  }
}

function count(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
    .count
}

const html = `<!doctype html>
<div class="outer-cell"><div class="content-cell">
Watched&nbsp;<a href="https://www.youtube.com/watch?v=synthVideo1">Synthetic Video</a><br>
<a href="https://www.youtube.com/channel/UC1234567890abcdefghijAB">Synthetic Channel</a><br>
Jan 1, 2026, 12:00:00 PM PST
</div></div>
<div class="outer-cell"><div class="content-cell">
Watched&nbsp;<a href="https://music.youtube.com/watch?v=synthVideo1">Historical Title</a><br>
<a href="https://www.youtube.com/channel/UC1234567890abcdefghijAB">Synthetic Channel</a><br>
Jan 2, 2026, 12:00:00 PM PST
</div></div>
<div class="outer-cell"><div class="content-cell">
Watched a video that has been removed<br>Jan 3, 2026, 12:00:00 PM PST
</div></div>
<div class="outer-cell"><div class="content-cell">
Viewed&nbsp;<a href="https://www.youtube.com/watch?v=not-a-watch">Not a Watch</a><br>
Jan 4, 2026, 12:00:00 PM PST
</div></div>`

const watchLater = `Video ID,Playlist Video Creation Timestamp
futureVid01,2026-01-05T00:00:00+00:00
`
const subscriptions = `Channel Id,Channel Url,Channel Title
UC1234567890abcdefghijAB,https://www.youtube.com/channel/UC1234567890abcdefghijAB,Synthetic Channel
`
const playlists = `Playlist ID,Add new videos to top,Playlist Title (Original),Playlist Title (Original) Language,Playlist Create Timestamp,Playlist Update Timestamp,Playlist Video Order,Playlist Visibility
WL,true,Watch later,en,2020-01-01T00:00:00+00:00,2026-01-05T00:00:00+00:00,Manual,Private
`

const archive = zipSync({
  'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(html),
  'Takeout/YouTube and YouTube Music/playlists/Watch later-videos.csv': strToU8(watchLater),
  'Takeout/YouTube and YouTube Music/playlists/playlists.csv': strToU8(playlists),
  'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv': strToU8(subscriptions),
})

describe('YouTube Takeout import', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket

  beforeEach(() => {
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
  })

  afterEach(() => {
    database.database.close()
  })

  it('preserves exact source bytes and imports only timestamped watches idempotently', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings

    await expect(importYoutubeTakeout(bindings, archive)).resolves.toMatchObject({
      alreadyImported: false,
      activityCards: 4,
      videos: 2,
      archiveEntries: 2,
      sourceRecords: 11,
      unresolvedRecords: 1,
      ignoredRecords: 1,
      watchLaterRecords: 1,
      queueEntries: 1,
      subscriptionRecords: 1,
      channels: 1,
    })
    await expect(importYoutubeTakeout(bindings, archive)).resolves.toMatchObject({
      alreadyImported: true,
      archiveEntries: 0,
      sourceRecords: 0,
    })

    expect(bucket.objects.size).toBe(1)
    expect([...bucket.objects.values()][0]).toEqual(archive)
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(count(database.database, 'source_records')).toBe(11)
    expect(count(database.database, 'media_items')).toBe(2)
    expect(count(database.database, 'external_identities')).toBe(2)
    expect(count(database.database, 'archive_entries')).toBe(2)
    expect(count(database.database, 'archive_entry_evidence')).toBe(6)
    expect(count(database.database, 'queue_entries')).toBe(1)
    expect(count(database.database, 'youtube_channel_subscriptions')).toBe(1)
    expect(count(database.database, 'video_library_projection')).toBe(2)
    expect(count(database.database, 'video_channel_projection')).toBe(1)
    expect(count(database.database, 'sync_runs')).toBe(1)

    expect(
      database.database
        .prepare(
          `SELECT source_occurrence_key, consumed_at_value, consumed_at_precision,
                  consumed_at_basis, admission_reason
           FROM archive_entries ORDER BY consumed_at_value`,
        )
        .all(),
    ).toEqual([
      {
        source_occurrence_key: 'watch:synthVideo1:2026-01-01T20:00:00.000Z:0',
        consumed_at_value: '2026-01-01T20:00:00.000Z',
        consumed_at_precision: 'instant',
        consumed_at_basis: 'source_asserted',
        admission_reason: 'youtube_watched_activity',
      },
      {
        source_occurrence_key: 'watch:synthVideo1:2026-01-02T20:00:00.000Z:0',
        consumed_at_value: '2026-01-02T20:00:00.000Z',
        consumed_at_precision: 'instant',
        consumed_at_basis: 'source_asserted',
        admission_reason: 'youtube_watched_activity',
      },
    ])
    expect(
      database.database
        .prepare(
          `SELECT disposition, count(*) AS count FROM source_records
           GROUP BY disposition ORDER BY disposition`,
        )
        .all(),
    ).toEqual([
      { disposition: 'ignored', count: 1 },
      { disposition: 'normalized', count: 9 },
      { disposition: 'unresolved', count: 1 },
    ])
  })

  it('keeps account lineages separate while sharing the global video identity', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings

    await importYoutubeTakeout(bindings, archive, {
      connectionKey: 'account-one',
      connectionLabel: 'YouTube account one',
    })
    await importYoutubeTakeout(bindings, archive, {
      connectionKey: 'account-two',
      connectionLabel: 'YouTube account two',
    })

    expect(count(database.database, 'connections')).toBe(2)
    expect(count(database.database, 'raw_objects')).toBe(2)
    expect(count(database.database, 'media_items')).toBe(2)
    expect(count(database.database, 'external_identities')).toBe(2)
    expect(count(database.database, 'archive_entries')).toBe(4)
    expect(count(database.database, 'queue_entries')).toBe(2)
  })

  it('reprocesses a completed v4 raw object under parser v5', async () => {
    let bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    await importYoutubeTakeout(bindings, archive)
    const retained = ['connections', 'sync_runs', 'raw_objects', 'sync_cursors'].map((table) => ({
      table,
      rows: database.database.prepare(`SELECT * FROM ${table}`).all(),
    }))
    database.database.close()
    database = new D1SqliteDatabase()
    bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    for (const { table, rows } of retained)
      for (const row of rows) {
        const columns = Object.keys(row)
        const values = columns.map((column) => {
          const value = row[column]
          if (table === 'sync_cursors' && column === 'id') return `${String(value)}_legacy_v4`
          if (table === 'sync_cursors' && column === 'name')
            return String(value).replace('youtube-takeout@5', 'youtube-takeout@4')
          if (table === 'raw_objects' && column === 'last_parser_version')
            return 'youtube-takeout@4'
          return value!
        })
        database.database
          .prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...values)
      }

    await expect(importYoutubeTakeout(bindings, archive)).resolves.toMatchObject({
      alreadyImported: false,
      completed: true,
    })
    expect(database.database.prepare('SELECT last_parser_version FROM raw_objects').get()).toEqual({
      last_parser_version: 'youtube-takeout@5',
    })
    expect(
      database.database
        .prepare("SELECT count(*) count FROM sync_cursors WHERE name LIKE '%youtube-takeout@5'")
        .get(),
    ).toEqual({ count: 1 })
  })

  it('resumes from the last atomic chunk and safely retries a failed chunk', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    const options = { chunkSize: 2 }

    const first = await importYoutubeTakeout(bindings, archive, options)
    expect(first).toMatchObject({
      completed: false,
      nextOffset: 2,
      sourceRecords: 2,
      archiveEntries: 2,
    })
    expect(count(database.database, 'source_records')).toBe(2)
    expect(count(database.database, 'archive_entries')).toBe(2)

    database.failOnBatchCall = database.batchCalls + 2
    await expect(continueYoutubeTakeoutImport(bindings, first.importId, options)).rejects.toThrow(
      'Synthetic D1 failure',
    )
    expect(count(database.database, 'source_records')).toBe(2)
    expect(count(database.database, 'archive_entries')).toBe(2)
    expect(database.database.prepare('SELECT checkpoint_json FROM sync_cursors').get()).toEqual({
      checkpoint_json: expect.stringContaining('"nextOffset":2'),
    })

    database.failOnBatchCall = null
    await expect(
      continueYoutubeTakeoutImport(bindings, first.importId, options),
    ).resolves.toMatchObject({
      completed: false,
      nextOffset: 4,
      sourceRecords: 2,
      archiveEntries: 0,
    })
    const third = await continueYoutubeTakeoutImport(bindings, first.importId, options)
    expect(third).toMatchObject({
      completed: false,
      nextOffset: 6,
      sourceRecords: 2,
      archiveEntries: 0,
      watchLaterRecords: 1,
      subscriptionRecords: 1,
    })
    await expect(
      continueYoutubeTakeoutImport(bindings, first.importId, options),
    ).resolves.toMatchObject({
      completed: true,
      nextOffset: null,
      sourceRecords: 5,
      archiveEntries: 0,
      queueEntries: 1,
    })

    expect(count(database.database, 'source_records')).toBe(11)
    expect(count(database.database, 'archive_entries')).toBe(2)
    expect(count(database.database, 'archive_entry_evidence')).toBe(6)
    expect(
      database.database
        .prepare(
          `SELECT count(*) AS runs, sum(source_record_count) AS source_records,
                  sum(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded
           FROM sync_runs`,
        )
        .get(),
    ).toEqual({ runs: 4, source_records: 11, succeeded: 4 })
  })

  it('bounds each D1 transaction for exports larger than one chunk', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    const largeHistory = Array.from(
      { length: 205 },
      (_, index) => `<div class="outer-cell"><div class="content-cell">
Watched&nbsp;<a href="https://www.youtube.com/watch?v=v${index.toString().padStart(10, '0')}">Video</a><br>
Jan 1, 2026, 12:00:00 PM UTC
</div></div>`,
    ).join('\n')
    const largeArchive = zipSync({
      'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(largeHistory),
    })

    let result = await importYoutubeTakeout(bindings, largeArchive)
    while (!result.completed) {
      result = await continueYoutubeTakeoutImport(bindings, result.importId)
    }

    expect(count(database.database, 'source_records')).toBe(209)
    expect(count(database.database, 'media_items')).toBe(205)
    expect(count(database.database, 'archive_entries')).toBe(205)
    expect(database.largestBatch).toBeLessThanOrEqual(703)
  })

  it('retains current Queue and Following state when a newer snapshot has malformed rows', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    await importYoutubeTakeout(bindings, archive)
    const malformedSnapshot = zipSync({
      'Takeout/YouTube and YouTube Music/playlists/Watch later-videos.csv': strToU8(
        `Video ID,Playlist Video Creation Timestamp\ninvalid-id!,2026-02-30T00:00:00+00:00\n`,
      ),
      'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv': strToU8(
        `Channel Id,Channel Url,Channel Title\nZZ1234567890abcdefghijAB,https://example.com/not-youtube,Broken row\n`,
      ),
    })

    await expect(importYoutubeTakeout(bindings, malformedSnapshot)).resolves.toMatchObject({
      completed: true,
      queueEntries: 1,
      channels: 0,
    })
    expect(
      database.database
        .prepare(
          "SELECT count(*) count FROM queue_entries WHERE upstream_state='active' AND relationship_type='youtube_watch_later'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      database.database
        .prepare(
          "SELECT count(*) count FROM youtube_channel_subscriptions WHERE upstream_state='active'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      database.database
        .prepare(
          `SELECT component_kind,status FROM youtube_takeout_components
           WHERE raw_object_id=(SELECT id FROM raw_objects ORDER BY acquired_at DESC,id DESC LIMIT 1)
             AND component_kind IN ('watch_later','subscriptions') ORDER BY component_kind`,
        )
        .all(),
    ).toEqual([
      { component_kind: 'subscriptions', status: 'invalid' },
      { component_kind: 'watch_later', status: 'invalid' },
    ])
  })

  it('retains a malformed uploaded ZIP as failed raw evidence', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    const malformed = strToU8('not a zip')

    await expect(importYoutubeTakeout(bindings, malformed)).rejects.toThrow(
      'not a valid Google Takeout ZIP export',
    )
    expect(bucket.objects.size).toBe(1)
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(
      database.database
        .prepare('SELECT processing_status, last_parser_version FROM raw_objects')
        .get(),
    ).toEqual({ processing_status: 'failed', last_parser_version: 'youtube-takeout@5' })
    expect(
      database.database.prepare('SELECT status, failed_record_count FROM sync_runs').get(),
    ).toEqual({ status: 'failed', failed_record_count: 1 })
  })
})
