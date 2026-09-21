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
import { SqlSpotifyLibraryRepository } from './spotify-library-repository'

const migrations = Array.from({ length: 15 }, (_, index) => {
  const number = String(index + 1).padStart(4, '0')
  const names = [
    'canonical_ledger',
    'rotating_credentials',
    'books_library',
    'books_review_facts',
    'books_format_projection',
    'movies_library',
    'movies_nullable_source_link',
    'articles_library',
    'article_content_search_map',
    'article_content_jobs',
    'article_current_availability',
    'article_content_reliability',
    'article_content_attempts',
    'podcasts_library',
    'songs_library',
  ]
  return readFileSync(
    new URL(`../migrations/${number}_${names[index]}.sql`, import.meta.url),
    'utf8',
  )
}).join('\n')

class Statement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []
  constructor(private readonly value: StatementSync) {}
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
    this.value.run(...this.values())
    return { success: true }
  }
  async first<Row>(): Promise<Row | null> {
    return (this.value.get(...this.values()) as Row | undefined) ?? null
  }
  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    return { results: this.value.all(...this.values()) as Row[], success: true }
  }
  execute() {
    this.value.run(...this.values())
  }
}
class Client implements DatabaseClient {
  constructor(private readonly database: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this.database.prepare(sql))
  }
  async batch(values: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    this.database.exec('BEGIN')
    try {
      for (const value of values) (value as Statement).execute()
      this.database.exec('COMMIT')
      return values.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

function seed(database: DatabaseSync) {
  database.exec(`
    INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('spotify','spotify','Spotify','connected','complete','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('run','spotify','backfill','running','2026-01-01T00:00:00Z');
    INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status) VALUES('raw','spotify','run','export','export','raw/export.zip','${'a'.repeat(64)}','application/zip',1,'2026-01-01T00:00:00Z','processed');
    INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,observed_at,parser_version,disposition,upstream_state) VALUES
      ('pod-record','raw','spotify','history','$[0]','2026-01-01T00:00:00Z','test','normalized','active'),
      ('saved-record','raw','spotify','saved','$[1]','2026-01-01T00:00:00Z','test','normalized','active'),
      ('song-record','raw','spotify','history','$[2]','2026-01-01T00:00:00Z','test','normalized','active');
    INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES
      ('episode','podcast_episode','Episode','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
      ('song','song','Track','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
  `)
}

describe('Spotify library repository', () => {
  let database: DatabaseSync
  let repository: SqlSpotifyLibraryRepository
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(migrations)
    seed(database)
    repository = new SqlSpotifyLibraryRepository(new Client(database))
  })
  afterEach(() => database.close())

  it('keeps a saved episode out of Queue when Archive already proves consumption', async () => {
    database.exec(
      `INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,upstream_state,created_at,updated_at) VALUES('archive','episode','spotify','episode:1','spotify_positive_playback','active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    )
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: null,
        showUri: null,
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: null,
        publishedPrecision: null,
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-01T01:00:00Z')
    expect(
      database
        .prepare(`SELECT COUNT(*) count FROM queue_entries WHERE upstream_state='active'`)
        .get(),
    ).toEqual({ count: 0 })
  })

  it('admits an explicit zero-progress saved episode to Queue', async () => {
    await repository.upsertSavedShows([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        id: 'spotify_show_show1',
        showId: 'show1',
        showUri: 'spotify:show:show1',
        addedAt: '2025-12-01T00:00:00Z',
        observedAt: '2026-01-01T00:00:00Z',
        name: 'Show',
        publisher: 'Publisher',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/show/show1',
        languages: ['en'],
        totalEpisodes: 10,
      },
    ])
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: 'spotify_show_show1',
        showUri: 'spotify:show:show1',
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: null,
        publishedPrecision: null,
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-01T01:00:00Z')
    expect(database.prepare(`SELECT upstream_state FROM queue_entries`).get()).toEqual({
      upstream_state: 'active',
    })
    await expect(
      repository.listPodcasts({ view: 'queue', duration: ['under30'], limit: 10 }),
    ).resolves.toMatchObject({
      filteredCount: 1,
      data: [expect.objectContaining({ following: true })],
    })
    await expect(
      repository.listPodcasts({ view: 'queue', duration: ['over2hours'], limit: 10 }),
    ).resolves.toMatchObject({ filteredCount: 0 })
    await expect(repository.listPodcasts({ view: 'following', limit: 10 })).resolves.toMatchObject({
      data: [expect.objectContaining({ queueEpisodeCount: 1 })],
    })
  })

  it('includes independent Reader podcast Archive items without putting them in Queue', async () => {
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES('readwise','readwise','Readwise','connected','complete','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO media_items(id,type,title,primary_creator_name,created_at,updated_at)
      VALUES('reader-podcast','podcast_episode','Reader Episode','Reader Show','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES('reader-podcast-archive','reader-podcast','readwise','reader-document:1','readwise_archive_state','2026-01-03','day','inferred','active','2026-01-03T00:00:00Z','2026-01-03T00:00:00Z');
    `)
    await repository.rebuildPodcastProjection()
    await repository.rebuildSearch()

    const archive = await repository.listPodcasts({ view: 'archive', limit: 10 })
    expect(archive.data).toContainEqual(
      expect.objectContaining({
        id: 'reader-podcast',
        title: 'Reader Episode',
        subtitle: 'Reader Show',
        inArchive: true,
        inQueue: false,
      }),
    )
    await expect(repository.findPodcast('reader-podcast')).resolves.toMatchObject({
      id: 'reader-podcast',
      title: 'Reader Episode',
    })
    await expect(repository.listPodcastHistory('reader-podcast', 10)).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          occurredAt: '2026-01-03',
          observedMs: null,
          source: 'reader',
        }),
      ],
    })
  })

  it('matches imprecise podcast publication dates by interval intersection', async () => {
    await repository.upsertSavedEpisodes([
      {
        connectionId: 'spotify',
        sourceRecordId: 'saved-record',
        mediaItemId: 'episode',
        episodeUri: 'spotify:episode:1',
        episodeId: '1',
        addedAt: '2026-01-01T00:00:00Z',
        resumePositionMs: 0,
        fullyPlayed: false,
        observedAt: '2026-01-01T00:00:00Z',
        title: 'Episode',
        showId: null,
        showUri: null,
        showName: 'Show',
        description: null,
        imageUrl: null,
        canonicalUrl: 'https://open.spotify.com/episode/1',
        publishedAt: '1969',
        publishedPrecision: 'year',
        durationMs: 1000,
      },
    ])
    await repository.finalizeSavedEpisodes('spotify', ['spotify:episode:1'], '2026-01-02T00:00:00Z')

    await expect(
      repository.listPodcasts({
        view: 'queue',
        publishedFrom: '1969-12-31',
        publishedTo: '1969-12-31',
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 1 })
    await expect(
      repository.listPodcasts({ view: 'queue', publishedFrom: '1970-01-01', limit: 10 }),
    ).resolves.toMatchObject({ filteredCount: 0 })
  })

  it('counts every song observation without a playback threshold and remains idempotent', async () => {
    const value = {
      id: 'observation',
      sourceRecordId: 'song-record',
      connectionId: 'spotify',
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      occurredAt: '2026-01-01T00:00:00Z',
      millisecondsPlayed: 0,
      sourceKind: 'export' as const,
      skipped: true,
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album',
      reasonStart: null,
      reasonEnd: null,
      parserVersion: 'test',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    await repository.projectHistory({ podcasts: [], songs: [value] })
    await repository.projectHistory({ podcasts: [], songs: [value] })
    const page = await repository.listMusic({ view: 'tracks', limit: 10 })
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      playbackCount: 1,
      observedMs: 0,
      observedDurationKnown: true,
      title: 'Track',
    })
    await expect(repository.listTracksNeedingMetadata()).resolves.toEqual([
      { mediaItemId: 'song', trackId: '1', trackUri: 'spotify:track:1' },
    ])
    await repository.markTrackMetadataUnavailable(['song'], '2026-01-02T00:00:00Z')
    await expect(repository.listTracksNeedingMetadata()).resolves.toEqual([])
  })

  it('uses matching occurrence scope for Music source and date aggregates', async () => {
    database.exec(
      `INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,observed_at,parser_version,disposition,upstream_state) VALUES('recent-record','raw','spotify','recent','$[3]','2026-02-01T00:00:00Z','test','normalized','active')`,
    )
    const base = {
      connectionId: 'spotify',
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      skipped: null,
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album',
      reasonStart: null,
      reasonEnd: null,
      parserVersion: 'test',
      updatedAt: '2026-02-01T00:00:00Z',
    }
    await repository.projectHistory({
      podcasts: [],
      songs: [
        {
          ...base,
          id: 'export-observation',
          sourceRecordId: 'song-record',
          occurredAt: '2026-01-01T00:00:00Z',
          millisecondsPlayed: 500,
          sourceKind: 'export',
        },
        {
          ...base,
          id: 'recent-observation',
          sourceRecordId: 'recent-record',
          occurredAt: '2026-02-01T00:00:00Z',
          millisecondsPlayed: null,
          sourceKind: 'recent_api',
        },
      ],
    })
    await repository.applyTrackMetadata({
      mediaItemId: 'song',
      trackUri: 'spotify:track:1',
      trackId: '1',
      title: 'Track',
      artists: [{ id: 'artist', uri: 'spotify:artist:artist', name: 'Artist' }],
      album: {
        id: 'album',
        uri: 'spotify:album:album',
        name: 'Album',
        albumType: 'album',
        releaseDate: '2026',
        releaseDatePrecision: 'year',
        imageUrl: null,
        artists: [{ id: 'artist', uri: 'spotify:artist:artist', name: 'Artist' }],
      },
      canonicalUrl: 'https://open.spotify.com/track/1',
      durationMs: 1000,
      explicit: false,
      isrc: null,
      observedAt: '2026-02-01T00:00:00Z',
    })
    const recentTracks = await repository.listMusic({
      view: 'tracks',
      source: 'recent_api',
      limit: 10,
    })
    expect(recentTracks.data[0]).toMatchObject({
      playbackCount: 1,
      observedMs: 0,
      observedDurationKnown: false,
    })
    await expect(
      repository.listMusic({
        view: 'tracks',
        source: 'recent_api',
        playbackCount: 'once',
        metadata: 'current',
        explicit: 'no',
        artist: ['artist'],
        album: ['album'],
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 1 })
    const albums = await repository.listMusic({
      view: 'albums',
      source: 'export',
      from: '2026-01-01',
      to: '2026-01-31',
      limit: 10,
    })
    expect(albums.data[0]).toMatchObject({ playbackCount: 1, observedMs: 500 })
    await expect(
      repository.listMusic({
        view: 'albums',
        albumType: 'album',
        artist: ['artist'],
        playbackCount: 'once',
        limit: 10,
      }),
    ).resolves.toMatchObject({ filteredCount: 0 })
    const artists = await repository.listMusic({ view: 'artists', source: 'recent_api', limit: 10 })
    expect(artists.data[0]).toMatchObject({ playbackCount: 1, observedDurationKnown: false })
  })
})
