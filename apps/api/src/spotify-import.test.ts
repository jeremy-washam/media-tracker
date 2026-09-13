import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from './env'
import {
  continueSpotifyExtendedHistoryImport,
  importSpotifyExtendedHistory,
} from './spotify-import'
import { syncSpotifySavedEpisodes } from './spotify-sync'

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

function seedApiEpisode(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO connections VALUES (
      'spotify-api-connection', 'spotify', 'Spotify API', 'connected', 'partial',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO sync_runs VALUES (
      'spotify-api-run', 'spotify-api-connection', 'reconcile', 'succeeded',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, 1, 1, 0, NULL, NULL
    );
    INSERT INTO raw_objects VALUES (
      'spotify-api-raw', 'spotify-api-connection', 'spotify-api-run', 'api_page',
      'spotify:api:seed', 'raw/spotify/seed.json',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'application/json', 1, '2026-01-01T00:00:00.000Z', 'processed', 'seed@1', NULL
    );
    INSERT INTO source_records VALUES (
      'spotify-api-record', 'spotify-api-raw', 'spotify-api-connection',
      'saved_episode_observation', '$.items[0]', 'spotify:episode:episode123',
      NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', 'seed@1', NULL,
      'normalized', 'active', NULL
    );
    INSERT INTO media_items VALUES (
      'spotify-api-media', 'podcast_episode', 'API title', 'API show', 'API show',
      NULL, 'https://open.spotify.com/episode/episode123', NULL,
      NULL, NULL, NULL, 1000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO external_identities VALUES (
      'spotify-api-identity', 'spotify-api-media', 'spotify', 'episode_uri',
      'spotify:episode:episode123', 'global', NULL,
      'https://open.spotify.com/episode/episode123', 'spotify-api-record',
      'spotify-api-record', NULL
    );
    INSERT INTO archive_entries VALUES (
      'spotify-api-archive', 'spotify-api-media', 'spotify-api-connection',
      'spotify-api-identity', 'episode:spotify:episode:episode123',
      'spotify_positive_resume_position', '2026-01-01T00:00:00.000Z', 'instant',
      'source_asserted', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO archive_entry_evidence VALUES (
      'spotify-api-evidence', 'spotify-api-archive', 'spotify-api-record',
      'admission', '2026-01-01T00:00:00.000Z'
    );
  `)
}

const positive = {
  ts: '2026-01-01T00:00:00Z',
  ms_played: 100,
  episode_name: 'Synthetic Episode',
  episode_show_name: 'Synthetic Show',
  spotify_episode_uri: 'spotify:episode:episode123',
}
const archive = zipSync({
  'Spotify Extended Streaming History/Streaming_History_Audio_2026.json': strToU8(
    JSON.stringify([
      positive,
      {
        ts: '2026-03-01T00:00:00Z',
        ms_played: 0,
        episode_name: 'Untouched Episode',
        spotify_episode_uri: 'spotify:episode:untouched123',
      },
      { ...positive, ts: '2026-02-01T00:00:00Z' },
      { ...positive, ts: '2026-02-01T00:00:00Z' },
      { ts: '2026-01-01T00:00:00Z', ms_played: 500, spotify_track_uri: 'spotify:track:track123' },
    ]),
  ),
})

describe('Spotify Extended Streaming History import', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket

  beforeEach(() => {
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    database.database.close()
  })

  it('resumes bounded chunks and selects the latest play across the entire export', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings

    const first = await importSpotifyExtendedHistory(bindings, archive, { chunkSize: 2 })
    expect(first).toMatchObject({
      alreadyImported: false,
      archiveEpisodes: 0,
      completed: false,
      nextOffset: 2,
      sourceRecords: 2,
      totalArchiveEpisodes: 1,
      totalPodcastSegments: 4,
      unresolvedPodcastSegments: 0,
    })
    await expect(
      importSpotifyExtendedHistory(bindings, archive, { chunkSize: 2 }),
    ).resolves.toMatchObject({
      archiveEpisodes: 1,
      completed: true,
      nextOffset: null,
      sourceRecords: 2,
    })
    await expect(importSpotifyExtendedHistory(bindings, archive)).resolves.toMatchObject({
      alreadyImported: true,
      archiveEpisodes: 0,
      completed: true,
      sourceRecords: 0,
    })

    expect(bucket.objects.size).toBe(2)
    expect([...bucket.objects.entries()].find(([key]) => key.endsWith('.zip'))?.[1]).toEqual(
      archive,
    )
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(count(database.database, 'source_records')).toBe(4)
    expect(count(database.database, 'media_items')).toBe(1)
    expect(count(database.database, 'archive_entries')).toBe(1)
    expect(
      database.database.prepare('SELECT consumed_at_value FROM archive_entries').get(),
    ).toEqual({ consumed_at_value: '2026-02-01T00:00:00.000Z' })
  })

  it('does not advance its durable checkpoint when a chunk transaction fails', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    const first = await importSpotifyExtendedHistory(bindings, archive, { chunkSize: 2 })
    database.failOnBatchCall = database.batchCalls + 3

    await expect(
      continueSpotifyExtendedHistoryImport(bindings, first.importId, { chunkSize: 2 }),
    ).rejects.toThrow('Synthetic D1 failure')
    expect(count(database.database, 'source_records')).toBe(2)
    expect(database.database.prepare('SELECT checkpoint_json FROM sync_cursors').get()).toEqual({
      checkpoint_json: expect.stringContaining('"nextOffset":2'),
    })

    database.failOnBatchCall = null
    await expect(
      continueSpotifyExtendedHistoryImport(bindings, first.importId, { chunkSize: 2 }),
    ).resolves.toMatchObject({ completed: true, archiveEpisodes: 1, sourceRecords: 2 })
    expect(count(database.database, 'source_records')).toBe(4)
    expect(count(database.database, 'archive_entries')).toBe(1)
  })

  it('reconciles into an episode previously created by API polling', async () => {
    seedApiEpisode(database.database)
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings

    await expect(importSpotifyExtendedHistory(bindings, archive)).resolves.toMatchObject({
      completed: true,
      archiveEpisodes: 1,
    })

    expect(count(database.database, 'connections')).toBe(1)
    expect(count(database.database, 'media_items')).toBe(1)
    expect(count(database.database, 'external_identities')).toBe(1)
    expect(count(database.database, 'archive_entries')).toBe(1)
    expect(
      database.database
        .prepare(
          `SELECT id, media_item_id, consumed_identity_id, consumed_at_value
           FROM archive_entries`,
        )
        .get(),
    ).toEqual({
      id: 'spotify-api-archive',
      media_item_id: 'spotify-api-media',
      consumed_identity_id: 'spotify-api-identity',
      consumed_at_value: '2026-02-01T00:00:00.000Z',
    })
    expect(
      database.database
        .prepare(
          `SELECT count(*) AS count FROM archive_entry_evidence
           WHERE archive_entry_id = 'spotify-api-archive'`,
        )
        .get(),
    ).toEqual({ count: 3 })
  })

  it('reconciles API polling into an episode previously created by export import', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      SPOTIFY_CLIENT_ID: 'synthetic-client',
      SPOTIFY_REFRESH_TOKEN: 'synthetic-refresh',
    } as unknown as Parameters<typeof syncSpotifySavedEpisodes>[0]
    await importSpotifyExtendedHistory(bindings, archive)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes('accounts.spotify.com/api/token')) {
          return Response.json({
            access_token: 'synthetic-access',
            expires_in: 3600,
            token_type: 'Bearer',
          })
        }
        return Response.json({
          items: [
            {
              added_at: '2026-03-01T00:00:00Z',
              episode: {
                id: 'episode123',
                uri: 'spotify:episode:episode123',
                name: 'API title',
                description: 'API description',
                duration_ms: 1000,
                external_urls: { spotify: 'https://open.spotify.com/episode/episode123' },
                images: [],
                release_date: '2026-01-01',
                release_date_precision: 'day',
                resume_point: { fully_played: true, resume_position_ms: 1000 },
                show: { id: 'show123', uri: 'spotify:show:show123', name: 'API show' },
              },
            },
          ],
          limit: 50,
          next: null,
          offset: 0,
          total: 1,
        })
      }),
    )

    await expect(syncSpotifySavedEpisodes(bindings)).resolves.toMatchObject({
      archiveEpisodes: 1,
      pages: 1,
      sourceRecords: 1,
    })
    expect(count(database.database, 'connections')).toBe(1)
    expect(count(database.database, 'media_items')).toBe(1)
    expect(count(database.database, 'external_identities')).toBe(1)
    expect(count(database.database, 'archive_entries')).toBe(1)
    expect(count(database.database, 'archive_entry_evidence')).toBe(3)
    expect(
      database.database.prepare('SELECT consumed_at_value FROM archive_entries').get(),
    ).toEqual({ consumed_at_value: '2026-02-01T00:00:00.000Z' })
  })

  it('retains a malformed ZIP as failed raw evidence', async () => {
    const bindings = { DB: database, RAW_BUCKET: bucket } as unknown as Bindings
    await expect(importSpotifyExtendedHistory(bindings, strToU8('not a zip'))).rejects.toThrow()
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(database.database.prepare('SELECT processing_status FROM raw_objects').get()).toEqual({
      processing_status: 'failed',
    })
  })
})
