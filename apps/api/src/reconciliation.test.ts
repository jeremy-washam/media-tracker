import { URL as NodeURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { Bindings } from './env'
import { importSpotifyExtendedHistory } from './spotify-import'
import { syncSpotifySavedEpisodes } from './spotify-sync'

const migration = readFileSync(
  new NodeURL('../../../packages/db/migrations/0001_canonical_ledger.sql', import.meta.url),
  'utf8',
)

type SqlValue = ArrayBuffer | null | number | string

class D1SqliteStatement {
  readonly #statement: StatementSync
  #values: readonly SqlValue[] = []

  constructor(
    statement: StatementSync,
    readonly query: string,
  ) {
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
  failBatchContaining: string | null = null
  largestBatch = 0

  constructor() {
    this.database.exec(migration)
    this.database.exec(
      readFileSync(
        new NodeURL(
          '../../../packages/db/migrations/0002_rotating_credentials.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    this.database.exec(
      readFileSync(
        new NodeURL('../../../packages/db/migrations/0003_books_library.sql', import.meta.url),
        'utf8',
      ),
    )
    this.database.exec(
      readFileSync(
        new NodeURL('../../../packages/db/migrations/0004_books_review_facts.sql', import.meta.url),
        'utf8',
      ),
    )
    this.database.exec(
      readFileSync(
        new NodeURL(
          '../../../packages/db/migrations/0005_books_format_projection.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    this.database.exec(
      readFileSync(
        new NodeURL('../../../packages/db/migrations/0006_movies_library.sql', import.meta.url),
        'utf8',
      ),
    )
    this.database.exec(
      readFileSync(
        new NodeURL(
          '../../../packages/db/migrations/0007_movies_nullable_source_link.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    for (const name of [
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
      '0021_video_thumbnail_preference.sql',
      '0022_spotify_catalog_backfill.sql',
      '0023_library_query_indexes.sql',
      '0024_archive_membership_lookup.sql',
      '0026_youtube_clock_safe_publication.sql',
      '0027_compact_archive_evidence.sql',
      '0028_evidence_view_parent_guard.sql',
      '0029_evidence_insert_only_replay.sql',
    ]) {
      this.database.exec(
        readFileSync(
          new NodeURL(`../../../packages/db/migrations/${name}`, import.meta.url),
          'utf8',
        ),
      )
    }
  }

  prepare(query: string): D1SqliteStatement {
    return new D1SqliteStatement(this.database.prepare(query), query)
  }

  async batch(statements: readonly D1SqliteStatement[]): Promise<readonly { success: true }[]> {
    this.batchCalls += 1
    this.largestBatch = Math.max(this.largestBatch, statements.length)
    const failBatchContaining = this.failBatchContaining
    if (
      this.batchCalls === this.failOnBatchCall ||
      (failBatchContaining !== null &&
        statements.some((statement) => statement.query.includes(failBatchContaining)))
    ) {
      throw new Error('Synthetic D1 failure')
    }
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

import { importYoutubeTakeout } from './youtube-import'
import { importLetterboxdExport } from './letterboxd-import'
import { syncLetterboxdRss } from './letterboxd-rss-sync'
import { syncHardcover } from './hardcover-sync'
function csv(value: string) {
  return strToU8(value.replaceAll('\n', '\r\n'))
}
const lbArchive = zipSync({
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

let database: D1SqliteDatabase
let bucket: MemoryBucket
let bindings: Bindings
beforeEach(() => {
  database = new D1SqliteDatabase()
  bucket = new MemoryBucket()
  bindings = {
    DB: database,
    RAW_BUCKET: bucket,
    LETTERBOXD_USERNAME: 'synthetic',
    HARDCOVER_TOKEN: 'synthetic',
    SPOTIFY_CLIENT_ID: 'synthetic',
    SPOTIFY_REFRESH_TOKEN: 'synthetic',
    TOKEN_ENCRYPTION_KEY: btoa('x'.repeat(32)),
  } as unknown as Bindings
})
afterEach(() => {
  vi.unstubAllGlobals()
  database.database.close()
})
it('reconciles overlapping Takeouts without duplicating watches', async () => {
  const html =
    '<div class="outer-cell"><div class="content-cell">Watched&nbsp;<a href="https://www.youtube.com/watch?v=video123abc">Synthetic</a><br>Jan 1, 2026, 12:00:00 PM UTC</div></div>'
  const archive = (suffix: string) =>
    zipSync({
      'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(html + suffix),
    })
  await importYoutubeTakeout(bindings, archive(''))
  await importYoutubeTakeout(bindings, archive('<!-- new export -->'))
  expect(count(database.database, 'archive_entries')).toBe(1)
})
it('retries a failed Letterboxd import and commits the films', async () => {
  database.failOnBatchCall = 4
  await expect(importLetterboxdExport(bindings, lbArchive)).rejects.toThrow()
  database.failOnBatchCall = null
  expect((await importLetterboxdExport(bindings, lbArchive)).alreadyImported).toBe(false)
  expect(count(database.database, 'media_items')).toBe(2)
})
it('reconciles RSS-first then export into the existing film', async () => {
  vi.stubGlobal('fetch', async () => new Response(rss))
  await syncLetterboxdRss(bindings)
  await importLetterboxdExport(bindings, lbArchive)
  expect(
    database.database
      .prepare("SELECT count(*) n FROM media_items WHERE title='Synthetic One'")
      .get(),
  ).toEqual({ n: 1 })
})
it('updates an RSS-created viewing when its watched date changes', async () => {
  vi.stubGlobal('fetch', async () => new Response(rss))
  await syncLetterboxdRss(bindings)
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        rss
          .replace('2025-07-02</letterboxd:watchedDate>', '2025-07-01</letterboxd:watchedDate>')
          .replace('2025-07-03</letterboxd:watchedDate>', '2025-06-30</letterboxd:watchedDate>'),
      ),
  )
  await expect(syncLetterboxdRss(bindings)).resolves.toMatchObject({ unresolvedRecords: 1 })
  expect(
    database.database
      .prepare(
        "SELECT consumed_at_value FROM archive_entries WHERE source_occurrence_key='rss:letterboxd-watch-200'",
      )
      .get(),
  ).toEqual({ consumed_at_value: '2025-07-01' })
  expect(
    database.database
      .prepare(
        `SELECT latest_known_watched_on FROM movie_library_projection
         WHERE media_item_id=(SELECT media_item_id FROM archive_entries
           WHERE source_occurrence_key='rss:letterboxd-watch-200')`,
      )
      .get(),
  ).toEqual({ latest_known_watched_on: '2025-07-01' })
})
it('does not advance the RSS cursor when the Movies projection refresh fails', async () => {
  vi.stubGlobal('fetch', async () => new Response(rss))
  await syncLetterboxdRss(bindings)
  const originalCheckpoint = database.database
    .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='letterboxd-rss'")
    .get() as { checkpoint_json: string }
  const changedRss = rss
    .replace('2025-07-03</letterboxd:watchedDate>', '2025-07-04</letterboxd:watchedDate>')
    .replaceAll('New RSS Film', 'Renamed RSS Film')
  const originalViewing = database.database
    .prepare(
      `SELECT v.source_record_id FROM letterboxd_movie_viewings v
       JOIN archive_entries a ON a.id=v.archive_entry_id
       WHERE a.source_occurrence_key='rss:letterboxd-watch-201'`,
    )
    .get()
  const originalSearch = database.database
    .prepare(
      `SELECT title FROM movie_search WHERE media_item_id=(
        SELECT media_item_id FROM archive_entries
        WHERE source_occurrence_key='rss:letterboxd-watch-201'
      )`,
    )
    .get()
  vi.stubGlobal('fetch', async () => new Response(changedRss))
  database.failBatchContaining = 'INSERT INTO letterboxd_movie_viewings'

  await expect(syncLetterboxdRss(bindings)).rejects.toThrow('Synthetic D1 failure')
  expect(
    database.database
      .prepare(
        "SELECT consumed_at_value FROM archive_entries WHERE source_occurrence_key='rss:letterboxd-watch-201'",
      )
      .get(),
  ).toEqual({ consumed_at_value: '2025-07-04' })
  expect(
    database.database
      .prepare(
        `SELECT title FROM media_items WHERE id=(
          SELECT media_item_id FROM archive_entries
          WHERE source_occurrence_key='rss:letterboxd-watch-201'
        )`,
      )
      .get(),
  ).toEqual({ title: 'Renamed RSS Film' })
  expect(
    database.database
      .prepare(
        `SELECT display_title, latest_known_watched_on FROM movie_library_projection
         WHERE display_title='New RSS Film'`,
      )
      .get(),
  ).toEqual({ display_title: 'New RSS Film', latest_known_watched_on: '2025-07-03' })
  expect(
    database.database
      .prepare(
        `SELECT title FROM movie_search WHERE media_item_id=(
          SELECT media_item_id FROM archive_entries
          WHERE source_occurrence_key='rss:letterboxd-watch-201'
        )`,
      )
      .get(),
  ).toEqual(originalSearch)
  expect(
    database.database
      .prepare(
        `SELECT v.source_record_id FROM letterboxd_movie_viewings v
         JOIN archive_entries a ON a.id=v.archive_entry_id
         WHERE a.source_occurrence_key='rss:letterboxd-watch-201'`,
      )
      .get(),
  ).toEqual(originalViewing)
  expect(
    database.database
      .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='letterboxd-rss'")
      .get(),
  ).toEqual(originalCheckpoint)

  database.failBatchContaining = null
  await expect(syncLetterboxdRss(bindings)).resolves.toMatchObject({ unchanged: false })
  expect(
    database.database
      .prepare(
        `SELECT display_title, latest_known_watched_on FROM movie_library_projection
         WHERE display_title='Renamed RSS Film'`,
      )
      .get(),
  ).toEqual({ display_title: 'Renamed RSS Film', latest_known_watched_on: '2025-07-04' })
  expect(
    database.database
      .prepare(
        `SELECT title FROM movie_search WHERE media_item_id=(
          SELECT media_item_id FROM archive_entries
          WHERE source_occurrence_key='rss:letterboxd-watch-201'
        )`,
      )
      .get(),
  ).toEqual({ title: 'Renamed RSS Film Renamed RSS Film 2025' })
  expect(
    database.database
      .prepare(
        `SELECT v.source_record_id FROM letterboxd_movie_viewings v
         JOIN archive_entries a ON a.id=v.archive_entry_id
         WHERE a.source_occurrence_key='rss:letterboxd-watch-201'`,
      )
      .get(),
  ).not.toEqual(originalViewing)
  expect(
    database.database
      .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='letterboxd-rss'")
      .get(),
  ).not.toEqual(originalCheckpoint)
})
it('reprocesses an identical RSS response when the cursor has an older parser version', async () => {
  vi.stubGlobal('fetch', async () => new Response(rss))
  await syncLetterboxdRss(bindings)
  const row = database.database
    .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='letterboxd-rss'")
    .get() as { checkpoint_json: string }
  const oldCheckpoint = { ...JSON.parse(row.checkpoint_json), parserVersion: 'letterboxd-rss@3' }
  database.database
    .prepare("UPDATE sync_cursors SET checkpoint_json=? WHERE name='letterboxd-rss'")
    .run(JSON.stringify(oldCheckpoint))

  await expect(syncLetterboxdRss(bindings)).resolves.toMatchObject({
    unchanged: false,
    feedEntries: 5,
    sourceRecords: 5,
  })
  const refreshed = database.database
    .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='letterboxd-rss'")
    .get() as { checkpoint_json: string }
  expect(JSON.parse(refreshed.checkpoint_json)).toMatchObject({ parserVersion: 'letterboxd-rss@4' })
})
it('keeps the latest Spotify listen when an older snapshot is imported', async () => {
  const archive = (ts: string) =>
    zipSync({
      'Streaming_History_Audio_2026.json': strToU8(
        JSON.stringify([
          {
            ts,
            ms_played: 100,
            episode_name: 'Synthetic',
            spotify_episode_uri: 'spotify:episode:episode123',
          },
        ]),
      ),
    })
  await importSpotifyExtendedHistory(bindings, archive('2026-02-01T00:00:00Z'))
  await importSpotifyExtendedHistory(bindings, archive('2026-01-01T00:00:00Z'))
  expect(database.database.prepare('SELECT consumed_at_value FROM archive_entries').get()).toEqual({
    consumed_at_value: '2026-02-01T00:00:00.000Z',
  })
})
const book = {
  id: 501,
  book_id: 701,
  edition_id: 801,
  status_id: 3,
  read_count: 1,
  rating: 4,
  review: 'Synthetic review',
  updated_at: '2026-01-01T00:00:00Z',
  book: { id: 701, title: 'Synthetic Book' },
  edition: { id: 801 },
  user_book_reads: [] as {
    id: number
    edition_id: number
    finished_at: string
    finished_at_precision: number
  }[],
}
function stubBook(value: unknown) {
  vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    const query = (JSON.parse(String(init?.body)) as { query: string }).query
    if (query.includes('MediaTrackerMe')) return Response.json({ data: { me: [{ id: 1 }] } })
    if (query.includes('LibraryEditions')) {
      return Response.json({ data: { editions: [{ id: 999, book_id: 701 }] } })
    }
    return Response.json({ data: { user_books: [value] } })
  })
}
it('retires the undated fallback when Hardcover supplies a finished read', async () => {
  stubBook(book)
  await syncHardcover(bindings)
  stubBook({
    ...book,
    user_book_reads: [
      { id: 901, edition_id: 801, finished_at: '2026-01-01', finished_at_precision: 3 },
    ],
  })
  await syncHardcover(bindings)
  expect(
    database.database
      .prepare("SELECT count(*) n FROM archive_entries WHERE upstream_state='active'")
      .get(),
  ).toEqual({ n: 1 })
  expect(count(database.database, 'archive_entries')).toBe(2)
})
it('clearing Hardcover ratings/reviews clears canonical values', async () => {
  stubBook(book)
  await syncHardcover(bindings)
  stubBook({ ...book, rating: null, review: null })
  await syncHardcover(bindings)
  expect(
    database.database.prepare('SELECT rating_value, review_text FROM archive_entries').get(),
  ).toEqual({ rating_value: null, review_text: null })
})
it('preserves the book and reads when a stable Hardcover relationship changes work ID', async () => {
  const reads = [{ id: 901, edition_id: 801, finished_at: '2026-01-01', finished_at_precision: 3 }]
  stubBook({ ...book, user_book_reads: reads })
  await syncHardcover(bindings)
  const original = database.database
    .prepare('SELECT id, media_item_id, consumed_identity_id FROM archive_entries')
    .get()
  stubBook({ ...book, book_id: 702, book: { ...book.book, id: 702 }, user_book_reads: reads })
  await syncHardcover(bindings)
  await syncHardcover(bindings)
  expect(
    database.database
      .prepare('SELECT id, media_item_id, consumed_identity_id FROM archive_entries')
      .get(),
  ).toEqual(original)
  expect(count(database.database, 'media_items')).toBe(1)
  expect(database.database.prepare('SELECT work_id FROM hardcover_book_works').all()).toEqual([
    { work_id: 702 },
  ])
  expect(
    database.database
      .prepare(
        "SELECT retired_at IS NOT NULL retired FROM external_identities WHERE external_type='book_id' AND external_id='701'",
      )
      .get(),
  ).toEqual({ retired: 1 })
  expect(
    database.database
      .prepare("SELECT count(*) n FROM source_records WHERE record_type='user_book'")
      .get(),
  ).toEqual({ n: 3 })
  expect(database.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('retains the prior snapshot when authoritative Hardcover owners disagree', async () => {
  stubBook(book)
  await syncHardcover(bindings)
  stubBook({
    ...book,
    id: 502,
    book_id: 702,
    book: { id: 702, title: 'Another synthetic book' },
    edition_id: 802,
    edition: { id: 802 },
  })
  await syncHardcover(bindings)
  const cursor = database.database
    .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='library-books'")
    .get()
  stubBook({ ...book, book_id: 702, book: { id: 702, title: 'Conflicting synthetic book' } })
  await expect(syncHardcover(bindings)).rejects.toThrow('different local books')
  expect(
    database.database
      .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='library-books'")
      .get(),
  ).toEqual(cursor)
  expect(database.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(count(database.database, 'media_items')).toBe(2)
})

it('preserves a malformed Hardcover page before validation', async () => {
  stubBook({ ...book, id: 'malformed' })
  await expect(syncHardcover(bindings)).rejects.toThrow()
  expect(bucket.objects.size).toBe(1)
})

it('uses the edition belonging to each individual read-through', async () => {
  stubBook({
    ...book,
    user_book_reads: [
      { id: 901, edition_id: 999, finished_at: '2026-01-01', finished_at_precision: 3 },
    ],
  })
  await syncHardcover(bindings)
  expect(
    database.database
      .prepare(
        'SELECT external_id FROM external_identities JOIN archive_entries ON external_identities.id=archive_entries.consumed_identity_id',
      )
      .get(),
  ).toEqual({ external_id: '999' })
})

import app from './app'
import {
  ConnectionsResponseSchema,
  SyncRunsResponseSchema,
  MediaListResponseSchema,
} from '@media-tracker/contracts'
import { refreshStoredSpotifyToken } from './spotify-credentials'

it('stores rotated Spotify tokens before a failed page and uses them on the next sync', async () => {
  const refreshes: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/api/token')) {
      refreshes.push(new URLSearchParams(String(init?.body)).get('refresh_token')!)
      return Response.json({
        access_token: 'synthetic-access',
        expires_in: 3600,
        token_type: 'Bearer',
        refresh_token: 'rotated-secret',
      })
    }
    return Response.json({ items: 'malformed' })
  })
  await expect(syncSpotifySavedEpisodes(bindings)).rejects.toThrow()
  expect(bucket.objects.size).toBe(1)
  await expect(syncSpotifySavedEpisodes(bindings)).rejects.toThrow()
  expect(refreshes).toEqual(['synthetic', 'rotated-secret'])
  const stored = JSON.stringify(
    database.database.prepare('SELECT * FROM connection_credentials').all(),
  )
  expect(stored).not.toContain('rotated-secret')
  expect(stored).not.toContain('synthetic')
  bindings = { ...bindings, SPOTIFY_REFRESH_TOKEN: 'new-authorization' }
  await expect(syncSpotifySavedEpisodes(bindings)).rejects.toThrow()
  expect(refreshes.at(-1)).toBe('new-authorization')
})
it('rejects simultaneous refreshes so only the lease owner rotates credentials', async () => {
  stubBook(book)
  await syncHardcover(bindings)
  const connectionId = (
    database.database.prepare('SELECT id FROM connections').get() as { id: string }
  ).id
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.stubGlobal('fetch', async () => {
    await pending
    return Response.json({ access_token: 'synthetic', expires_in: 3600, token_type: 'Bearer' })
  })
  const first = refreshStoredSpotifyToken(bindings, connectionId)
  await vi.waitFor(() =>
    expect(
      database.database.prepare('SELECT owner FROM connection_refresh_leases').get(),
    ).toBeDefined(),
  )
  await expect(refreshStoredSpotifyToken(bindings, connectionId)).rejects.toThrow('already running')
  release()
  await first
  expect(count(database.database, 'connection_refresh_leases')).toBe(0)
})
function youtubeArchive(count: number, repeats = false) {
  const html = Array.from(
    { length: count },
    (_, i) =>
      `<div class="outer-cell"><div class="content-cell">Watched&nbsp;<a href="https://www.youtube.com/watch?v=${repeats ? 'sameVideo01' : `v${i.toString().padStart(10, '0')}`}">Synthetic</a><br>Jan 1, 2026, 12:00:00 PM UTC</div></div>`,
  ).join('')
  return zipSync({ 'Takeout/YouTube and YouTube Music/history/watch-history.html': strToU8(html) })
}
it('keeps same-timestamp repeat watches across reordered snapshots and chunk boundaries', async () => {
  const first = youtubeArchive(3, true)
  let result = await importYoutubeTakeout(bindings, first, { chunkSize: 1 })
  while (!result.completed) result = await importYoutubeTakeout(bindings, first, { chunkSize: 1 })
  // Resuming an import must reuse its exact export bytes: ZIP timestamps vary.
  const second = youtubeArchive(4, true)
  let next = await importYoutubeTakeout(bindings, second, { chunkSize: 1 })
  while (!next.completed) next = await importYoutubeTakeout(bindings, second, { chunkSize: 1 })
  expect(count(database.database, 'archive_entries')).toBe(4)
  expect(count(database.database, 'source_records')).toBe(15)
})
it('paginates the complete Archive and filters before applying the limit', async () => {
  const zip = youtubeArchive(1005)
  let result = await importYoutubeTakeout(bindings, zip)
  while (!result.completed) result = await importYoutubeTakeout(bindings, zip)
  stubBook(book)
  await syncHardcover(bindings)
  const ids = new Set<string>()
  let cursor: string | undefined
  do {
    const response = await app.request(
      `/api/media?limit=100${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      undefined,
      bindings,
    )
    expect(response.status).toBe(200)
    const page = MediaListResponseSchema.parse(await response.json())
    expect(page.totalCount).toBe(1006)
    for (const item of page.data) {
      expect(ids.has(item.id)).toBe(false)
      ids.add(item.id)
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  expect(ids.size).toBe(1006)
  const response = await app.request('/api/media?type=book&limit=1', undefined, bindings)
  const page = MediaListResponseSchema.parse(await response.json())
  expect(page.data).toHaveLength(1)
  expect(page.data[0]?.type).toBe('book')
  expect(page.filteredCount).toBe(1)
  expect(page.counts.video).toBe(1005)
  const bad = await app.request('/api/media?cursor=invalid', undefined, bindings)
  expect(bad.status).toBe(400)
})
it('reports both YouTube accounts, resumable imports, and persisted sync activity', async () => {
  await importYoutubeTakeout(bindings, youtubeArchive(3), { connectionKey: 'one', chunkSize: 1 })
  await importYoutubeTakeout(bindings, youtubeArchive(3), { connectionKey: 'two' })
  const response = await app.request('/api/connections', undefined, bindings)
  const connections = ConnectionsResponseSchema.parse(await response.json()).data.filter(
    (c) => c.source === 'youtube',
  )
  expect(connections).toHaveLength(2)
  expect(connections[0]?.incompleteImports[0]).toMatchObject({
    nextOffset: 1,
    totalRecords: 3,
    status: 'processing',
  })
  expect(connections[1]?.incompleteImports).toEqual([])
  const runs = SyncRunsResponseSchema.parse(
    await (await app.request('/api/sync-runs?limit=1', undefined, bindings)).json(),
  )
  expect(runs.data).toHaveLength(1)
  expect(runs.nextCursor).not.toBeNull()
  const next = SyncRunsResponseSchema.parse(
    await (
      await app.request(
        `/api/sync-runs?limit=1&cursor=${encodeURIComponent(runs.nextCursor!)}`,
        undefined,
        bindings,
      )
    ).json(),
  )
  expect(next.data[0]?.id).not.toBe(runs.data[0]?.id)
})
it('upgrades an existing schema without modifying ledger records', () => {
  const legacy = new DatabaseSync(':memory:')
  legacy.exec(migration)
  legacy.exec(
    "INSERT INTO connections VALUES('legacy','youtube','Legacy','connected','complete','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')",
  )
  legacy.exec(
    readFileSync(
      new NodeURL('../../../packages/db/migrations/0002_rotating_credentials.sql', import.meta.url),
      'utf8',
    ),
  )
  expect(legacy.prepare('SELECT id FROM connections').get()).toEqual({ id: 'legacy' })
  expect(legacy.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  legacy.close()
})

it('reuses a legacy YouTube occurrence on reprocessing and later snapshots', async () => {
  const zip = youtubeArchive(1)
  await importYoutubeTakeout(bindings, zip)
  const original = database.database.prepare('SELECT id FROM archive_entries').get() as {
    id: string
  }
  // Rebuild the synthetic fixture using the prior parser's IDs and occurrence keys.
  const tables = [
    'connections',
    'sync_runs',
    'raw_objects',
    'source_records',
    'media_items',
    'external_identities',
    'archive_entries',
    'archive_entry_evidence',
    'sync_cursors',
  ]
  const priorCursor = database.database
    .prepare('SELECT connection_id, checkpoint_json FROM sync_cursors')
    .get() as { connection_id: string; checkpoint_json: string }
  const archiveHash = (JSON.parse(priorCursor.checkpoint_json) as { archiveSha256: string })
    .archiveSha256
  const oldCursorId =
    'youtube_cursor_' +
    Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${priorCursor.connection_id}:${archiveHash}`),
      ),
    ).toString('hex')
  const snapshots = tables.map((table) => ({
    table,
    rows: database.database.prepare(`SELECT * FROM ${table}`).all(),
  }))
  database.database.close()
  database = new D1SqliteDatabase()
  bindings = { ...bindings, DB: database as unknown as D1Database }
  for (const { table, rows } of snapshots) {
    for (const row of rows) {
      const columns = Object.keys(row)
      const values = columns.map((column) => {
        const value = row[column]
        if (table === 'sync_cursors' && column === 'id') return oldCursorId
        if (column === 'source_occurrence_key') return 'takeout:legacy:watch:1'
        return typeof value === 'string'
          ? value.replaceAll('youtube-takeout@3', 'youtube-takeout@2').replaceAll('_v3_', '_v2_')
          : value!
      })
      database.database
        .prepare(
          `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        )
        .run(...values)
    }
  }
  await importYoutubeTakeout(bindings, zip)
  expect(database.database.prepare('SELECT id FROM archive_entries').all()).toEqual([original])
  expect(count(database.database, 'source_records')).toBe(5)
})

it('retries Letterboxd after records committed but the connection update failed', async () => {
  database.failOnBatchCall = 5
  await expect(importLetterboxdExport(bindings, lbArchive)).rejects.toThrow()
  const records = count(database.database, 'source_records')
  database.failOnBatchCall = null
  await importLetterboxdExport(bindings, lbArchive)
  expect(count(database.database, 'media_items')).toBe(2)
  expect(count(database.database, 'source_records')).toBe(records)
  expect(database.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
