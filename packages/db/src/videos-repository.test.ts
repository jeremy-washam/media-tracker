import { fenceCatalogDatabase } from './catalog-fence'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideosQuerySchema } from '../../contracts/src/videos'
import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'
import { SqlVideosRepository, type VideosListInput } from './videos-repository'

const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  .join('\n')

class SqliteStatement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []
  constructor(private readonly statement: StatementSync) {}
  bind(...values: readonly DatabaseValue[]) {
    if (values.length > 100) throw new Error('simulated D1 statement bind-variable ceiling')
    this.#values = values
    return this
  }
  private values() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
  execute() {
    this.statement.run(...this.values())
  }
  bindCount() {
    return this.#values.length
  }
  async run(): Promise<DatabaseRunResult> {
    this.execute()
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
  batchCalls = 0
  failOnBatchCall: number | null = null
  readonly queries: string[] = []

  constructor(private readonly database: DatabaseSync) {}
  prepare(query: string) {
    this.queries.push(query)
    return new SqliteStatement(this.database.prepare(query))
  }
  async batch(statements: readonly DatabaseStatement[]) {
    this.batchCalls += 1
    if (this.batchCalls === this.failOnBatchCall) throw new Error('synthetic batch failure')
    if (
      statements.reduce((total, value) => total + (value as SqliteStatement).bindCount(), 0) > 900
    )
      throw new Error('simulated D1 batch bind-variable ceiling')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const value of statements) (value as SqliteStatement).execute()
      this.database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

const now = '2026-09-20T12:00:00.000Z'
const later = '2026-09-21T12:00:00.000Z'

function input(overrides: Partial<VideosListInput> = {}): VideosListInput {
  return { view: 'archive', limit: 50, ...overrides }
}

it('backfills component heads from the newest existing complete snapshots', () => {
  const existing = new DatabaseSync(':memory:')
  try {
    existing.exec(
      ['0001_canonical_ledger.sql', '0006_movies_library.sql', '0016_videos_takeout_library.sql']
        .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
        .join('\n'),
    )
    existing.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES('youtube-1','youtube','YouTube','connected','complete','${now}','${now}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at) VALUES
        ('run-1','youtube-1','import','succeeded','${now}','${now}'),
        ('run-2','youtube-1','import','succeeded','${later}','${later}');
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status,last_parser_version) VALUES
        ('raw-1','youtube-1','run-1','export','old','old.zip','${'a'.repeat(64)}','application/zip',1,'${now}','processed','youtube-takeout@4'),
        ('raw-2','youtube-1','run-2','export','new','new.zip','${'b'.repeat(64)}','application/zip',1,'${later}','processed','youtube-takeout@4');
      INSERT INTO youtube_takeout_components(raw_object_id,connection_id,component_kind,member_name,parser_version,status,expected_record_count,processed_record_count,sync_run_id,completed_at,finalized_at,error_code) VALUES
        ('raw-1','youtube-1','watch_later','watch-later.csv','youtube-takeout@4','complete',1,1,'run-1','${now}','${now}',NULL),
        ('raw-2','youtube-1','watch_later','watch-later.csv','youtube-takeout@4','complete',0,0,'run-2','${later}','${later}',NULL),
        ('raw-1','youtube-1','subscriptions','subscriptions.csv','youtube-takeout@4','complete',1,1,'run-1','${now}','${now}',NULL),
        ('raw-2','youtube-1','subscriptions','subscriptions.csv','youtube-takeout@4','invalid',0,0,'run-2',NULL,NULL,'invalid_member_row');
    `)
    existing.exec(
      readFileSync(
        new URL('../migrations/0017_videos_snapshot_safety.sql', import.meta.url),
        'utf8',
      ),
    )
    existing.exec(
      readFileSync(
        new URL('../migrations/0018_videos_snapshot_head_backfill.sql', import.meta.url),
        'utf8',
      ),
    )
    existing.exec(
      readFileSync(
        new URL('../migrations/0019_provider_catalog_caches.sql', import.meta.url),
        'utf8',
      ),
    )
    existing.exec(
      readFileSync(new URL('../migrations/0020_tmdb_match_evidence.sql', import.meta.url), 'utf8'),
    )

    expect(
      existing
        .prepare(
          'SELECT component_kind,raw_object_id FROM youtube_takeout_component_heads ORDER BY component_kind',
        )
        .all(),
    ).toEqual([
      { component_kind: 'subscriptions', raw_object_id: 'raw-1' },
      { component_kind: 'watch_later', raw_object_id: 'raw-2' },
    ])
    expect(
      existing
        .prepare(
          "SELECT name FROM pragma_table_info('video_library_projection') WHERE name='catalog_expires_at'",
        )
        .get(),
    ).toEqual({ name: 'catalog_expires_at' })
  } finally {
    existing.close()
  }
})

describe('SqlVideosRepository', () => {
  let database: DatabaseSync
  let client: SqliteClient
  let repository: SqlVideosRepository
  let clockNow: string

  beforeEach(async () => {
    clockNow = now
    database = new DatabaseSync(':memory:')
    database.exec(migrations)
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES
        ('youtube-1','youtube','Primary YouTube','connected','complete','${now}','${now}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at) VALUES
        ('run-1','youtube-1','import','succeeded','${now}','${now}'),
        ('run-2','youtube-1','import','succeeded','${later}','${later}');
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status,last_parser_version) VALUES
        ('raw-1','youtube-1','run-1','export','archive-1','raw/archive-1.zip','${'a'.repeat(64)}','application/zip',1,'${now}','processed','youtube-takeout@4'),
        ('raw-2','youtube-1','run-2','export','archive-2','raw/archive-2.zip','${'b'.repeat(64)}','application/zip',1,'${later}','processed','youtube-takeout@4');
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,source_recorded_at_value,source_recorded_at_precision,source_recorded_at_basis,observed_at,parser_version,disposition,upstream_state) VALUES
        ('watch-1','raw-1','youtube-1','activity','history#1','watch:1','2024-01-02T01:00:00.000Z','instant','source_asserted','${now}','youtube-takeout@4','normalized','active'),
        ('watch-2','raw-1','youtube-1','activity','history#2','watch:2','2025-01-02T01:00:00.000Z','instant','source_asserted','${now}','youtube-takeout@4','normalized','active'),
        ('watch-3','raw-1','youtube-1','activity','history#3','watch:3','2023-01-02T01:00:00.000Z','instant','source_asserted','${now}','youtube-takeout@4','normalized','active'),
        ('queue-2','raw-1','youtube-1','watch_later_item','watch-later#1','queue:video-2','2026-01-02T01:00:00.000Z','instant','source_asserted','${now}','youtube-takeout@4','normalized','active'),
        ('subscription-1','raw-1','youtube-1','subscription','subscriptions#1','subscription:channel-1',NULL,NULL,NULL,'${now}','youtube-takeout@4','normalized','active'),
        ('queue-snapshot','raw-1','youtube-1','watch_later_snapshot','$watch-later','snapshot:queue',NULL,NULL,NULL,'${now}','youtube-takeout@4','normalized','active');
      INSERT INTO media_items(id,type,title,canonical_url,created_at,updated_at) VALUES
        ('video-1','video','Current first','https://www.youtube.com/watch?v=video-1','${now}','${now}'),
        ('video-2','video','Queued only','https://www.youtube.com/watch?v=video-2','${now}','${now}'),
        ('video-3','video','No exact channel','https://www.youtube.com/watch?v=video-3','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,connection_id,canonical_url,first_observed_source_record_id,last_observed_source_record_id) VALUES
        ('identity-1','video-1','youtube','video_id','video-1','global',NULL,'https://www.youtube.com/watch?v=video-1','watch-1','watch-2'),
        ('identity-2','video-2','youtube','video_id','video-2','global',NULL,'https://www.youtube.com/watch?v=video-2','queue-2','queue-2'),
        ('identity-3','video-3','youtube','video_id','video-3','global',NULL,'https://www.youtube.com/watch?v=video-3','watch-3','watch-3');
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at) VALUES
        ('archive-1','video-1','youtube-1','identity-1','watch:1','youtube_watched_activity','2024-01-02T01:00:00.000Z','instant','source_asserted','active','${now}','${now}'),
        ('archive-2','video-1','youtube-1','identity-1','watch:2','youtube_watched_activity','2025-01-02T01:00:00.000Z','instant','source_asserted','active','${now}','${now}'),
        ('archive-3','video-3','youtube-1','identity-3','watch:3','youtube_watched_activity','2023-01-02T01:00:00.000Z','instant','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at) VALUES
        ('evidence-1','archive-1','watch-1','admission','${now}'),
        ('evidence-2','archive-2','watch-2','admission','${now}'),
        ('evidence-3','archive-3','watch-3','admission','${now}');
    `)
    client = new SqliteClient(database)
    repository = new SqlVideosRepository(client, () => clockNow)
    await repository.projectWatches([
      {
        sourceRecordId: 'watch-1',
        archiveEntryId: 'archive-1',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Earlier first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Channel One',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube',
        fromGoogleAds: false,
        occurredAt: '2024-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: now,
      },
      {
        sourceRecordId: 'watch-2',
        archiveEntryId: 'archive-2',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Latest first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Channel One',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube_music',
        fromGoogleAds: false,
        occurredAt: '2025-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: now,
      },
      {
        sourceRecordId: 'watch-3',
        archiveEntryId: 'archive-3',
        connectionId: 'youtube-1',
        mediaItemId: 'video-3',
        videoId: 'video-3',
        historicalTitle: 'Label only video',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-3',
        historicalChannelTitle: 'Label Only',
        sourceChannelUrl: null,
        channelId: null,
        product: 'youtube',
        fromGoogleAds: false,
        occurredAt: '2023-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: now,
      },
    ])
    await repository.finalizeTakeout({
      rawObjectId: 'raw-1',
      connectionId: 'youtube-1',
      syncRunId: 'run-1',
      parserVersion: 'youtube-takeout@4',
      observedAt: now,
      components: [
        {
          kind: 'watch_history',
          memberName: 'watch-history.html',
          status: 'complete',
          recordCount: 3,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
        {
          kind: 'watch_later',
          memberName: 'Watch later-videos.csv',
          status: 'complete',
          recordCount: 1,
          errorCode: null,
          snapshotSourceRecordId: 'queue-snapshot',
        },
        {
          kind: 'playlist_index',
          memberName: 'playlists.csv',
          status: 'complete',
          recordCount: 1,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
        {
          kind: 'subscriptions',
          memberName: 'subscriptions.csv',
          status: 'complete',
          recordCount: 1,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
      ],
      watchLater: [
        {
          sourceRecordId: 'queue-2',
          mediaItemId: 'video-2',
          videoId: 'video-2',
          queueEntryId: 'youtube-queue-2',
          membershipEvidenceId: 'queue-membership-2',
          addedEvidenceId: 'queue-added-2',
          addedAt: '2026-01-02T01:00:00.000Z',
        },
      ],
      subscriptions: [
        {
          sourceRecordId: 'subscription-1',
          channelId: 'channel-1',
          channelTitle: 'Channel One',
          channelUrl: 'https://www.youtube.com/channel/channel-1',
        },
      ],
    })
  })

  afterEach(() => database.close())

  async function seedPublishedCatalog() {
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at)
      VALUES('catalog-1','youtube','running','${now}','${now}')`)
    await repository.applyYoutubeCatalogBatch({
      jobId: 'catalog-1',
      at: now,
      expiresAt: '2026-10-20T12:00:00.000Z',
      requested: [
        { mediaItemId: 'video-1', videoId: 'video-1' },
        { mediaItemId: 'video-2', videoId: 'video-2' },
        { mediaItemId: 'video-3', videoId: 'video-3' },
      ],
      videos: [
        {
          mediaItemId: 'video-1',
          videoId: 'video-1',
          title: 'Current Video Title',
          description: 'Current description',
          channelId: 'channel-1',
          channelTitle: 'Current Channel',
          publishedAt: '2020-01-01T00:00:00.000Z',
          durationMs: 120000,
          categoryId: '22',
          tags: ['one', 'two'],
          captionAvailable: true,
          definition: 'hd',
          projection: 'rectangular',
          privacyStatus: 'public',
          uploadStatus: 'processed',
          embeddable: true,
          madeForKids: false,
          regionRestriction: null,
          liveBroadcastContent: 'none',
          scheduledStartAt: null,
          actualStartAt: null,
          actualEndAt: null,
          thumbnails: {
            high: { url: 'https://example.com/high.jpg', width: 480, height: 360 },
            medium: { url: 'https://example.com/medium.jpg', width: 320, height: 180 },
            maxres: { url: 'https://example.com/maxres.jpg', width: 1280, height: 720 },
          },
          fetchedAt: now,
          expiresAt: '2026-10-20T12:00:00.000Z',
          etag: 'etag-1',
        },
        {
          mediaItemId: 'video-3',
          videoId: 'video-3',
          title: 'Current Video Without Channel Details',
          description: '',
          channelId: 'channel-3',
          channelTitle: 'Channel From Video',
          publishedAt: null,
          durationMs: null,
          categoryId: null,
          tags: [],
          captionAvailable: null,
          definition: null,
          projection: null,
          privacyStatus: null,
          uploadStatus: null,
          embeddable: null,
          madeForKids: null,
          regionRestriction: null,
          liveBroadcastContent: null,
          scheduledStartAt: null,
          actualStartAt: null,
          actualEndAt: null,
          thumbnails: {},
          fetchedAt: now,
          expiresAt: '2026-10-20T12:00:00.000Z',
          etag: null,
        },
      ],
      channels: [
        {
          channelId: 'channel-1',
          title: 'Current Channel',
          description: 'Channel description',
          customUrl: '@current',
          publishedAt: '2010-01-01T00:00:00.000Z',
          country: 'US',
          thumbnailUrl: 'https://example.com/channel.jpg',
          fetchedAt: now,
          expiresAt: '2026-10-20T12:00:00.000Z',
          etag: 'channel-etag',
        },
      ],
      categories: [
        {
          categoryId: '22',
          regionCode: 'US',
          title: 'People & Blogs',
          assignable: true,
          fetchedAt: now,
          expiresAt: '2026-10-20T12:00:00.000Z',
        },
      ],
    })
    database.exec("UPDATE catalog_refresh_jobs SET state='succeeded' WHERE id='catalog-1'")
    await repository.rebuild(now)
  }

  it('keeps Archive and Queue independent and rolls up only exact channel identities', async () => {
    const archive = await repository.listVideos(input())
    const queue = await repository.listVideos(input({ view: 'queue' }))
    const channels = await repository.listVideos(input({ view: 'channels' }))
    expect(archive.data.map((item) => item.id)).toEqual(['video-1', 'video-3'])
    expect(queue.data).toHaveLength(1)
    expect(queue.data[0]).toMatchObject({ id: 'video-2', inArchive: false, inQueue: true })
    expect(channels.data).toHaveLength(1)
    expect(channels.data[0]).toMatchObject({ id: 'channel-1', watchCount: 2 })
    expect(
      (
        await repository.listVideos(
          input({ view: 'channels', q: 'Channel One', sort: 'relevance' }),
        )
      ).data[0]?.id,
    ).toBe('channel-1')
  })

  it('uses the latest matching watch as the collection reference while retaining all history', async () => {
    const result = await repository.listVideos(input({ watchedTo: '2024-12-31' }))
    expect(result.data[0]).toMatchObject({
      id: 'video-1',
      date: '2024-01-02T01:00:00.000Z',
      watchCount: 2,
      matchingWatchCount: 1,
      formats: ['youtube_music'],
    })
    expect((await repository.listHistory('video-1', 25)).data).toHaveLength(2)
    expect((await repository.listVideos(input({ q: 'Earlier first' }))).data[0]?.id).toBe('video-1')
    expect(
      (await repository.listVideos(input({ watchedTo: '2024-12-31', format: ['youtube_music'] })))
        .data,
    ).toHaveLength(0)
    expect(
      (await repository.listVideos(input({ format: ['youtube_music'] }))).data[0],
    ).toMatchObject({ id: 'video-1', matchingWatchCount: 1, watchCount: 2 })
  })

  it('evaluates Video and Channel text matches once rather than once per Library row', async () => {
    const prepare = vi.spyOn(client, 'prepare')
    for (const [view, q, expectedId, table, params] of [
      ['archive', 'Earlier', 'video-1', 'video_search', ['Earlier', 'Earlier', '"Earlier"*']],
      ['queue', 'Queued', 'video-2', 'video_search', ['Queued', 'Queued', '"Queued"*']],
      ['channels', 'Channel', 'channel-1', 'video_channel_search', ['Channel', '"Channel"*']],
    ] as const) {
      prepare.mockClear()
      const page = await repository.listVideos(input({ view, q }))
      expect(page.data.map((item) => item.id)).toEqual([expectedId])
      const sql = prepare.mock.calls
        .map(([query]) => query)
        .find(
          (query) =>
            (query.includes('SELECT COUNT(*) value') || query.includes('COUNT(*) FILTER')) &&
            query.includes(table),
        )!
      const plan = database
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(clockNow, ...params)
        .map((row) => row.detail)
        .join('\n')
      expect(plan).toContain('LIST SUBQUERY')
      expect(sql).not.toMatch(/s\.(?:media_item_id|channel_id)=p\./)
    }
    expect((await repository.listVideos(input({ q: 'video-1' }))).data[0]?.id).toBe('video-1')
    expect(
      (await repository.listVideos(input({ q: 'https://www.youtube.com/watch?v=video-1' }))).data[0]
        ?.id,
    ).toBe('video-1')
    expect((await repository.listVideos(input({ q: 'no match anywhere' }))).data).toEqual([])
    prepare.mockRestore()
  })

  it('paginates a contract-valid twelve-token search with eighty channel selections within D1 limits', async () => {
    await seedPublishedCatalog()
    const q = 'one two three four five six seven eight nine ten eleven twelve'
    database
      .prepare(
        `UPDATE youtube_video_catalog_profiles SET current_title=? WHERE lookup_state='current'`,
      )
      .run(q)
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at)
      VALUES('catalog-2','youtube','succeeded','${later}','${later}')`)
    await repository.rebuild(later)
    const selection = input({
      q,
      channel: ['channel-1', 'channel-3', ...Array.from({ length: 78 }, (_, i) => `unused-${i}`)],
      limit: 1,
    })
    expect(VideosQuerySchema.safeParse({ ...selection, section: selection.view }).success).toBe(
      true,
    )
    const first = await repository.listVideos(selection)
    expect(first.data.map((row) => row.id)).toEqual(['video-1'])
    expect(first.nextCursor).not.toBeNull()
    const secondSelection = input({ ...selection, cursor: first.nextCursor! })
    expect(
      VideosQuerySchema.safeParse({ ...secondSelection, section: secondSelection.view }).success,
    ).toBe(true)
    const second = await repository.listVideos(secondSelection)
    expect(second.data.map((row) => row.id)).toEqual(['video-3'])
    expect(second).toMatchObject({ totalCount: 2, filteredCount: 2, nextCursor: null })
  })

  it('bounds repeated account, channel, category and format filters while preserving Archive and Queue results', async () => {
    await seedPublishedCatalog()
    const q = 'one two three four five six seven eight nine ten eleven twelve'
    database
      .prepare(
        `UPDATE youtube_video_catalog_profiles SET current_title=?,lookup_state='current',
      channel_id='channel-1',category_id='22',live_broadcast_content='live' WHERE media_item_id IN ('video-1','video-2')`,
      )
      .run(q)
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at)
      VALUES('catalog-2','youtube','succeeded','${later}','${later}')`)
    await repository.rebuild(later)
    for (const view of ['archive', 'queue'] as const) {
      const selection = input({
        view,
        q,
        sort: 'relevance',
        account: ['youtube-1'],
        channel: ['channel-1'],
        category: ['22'],
        format: ['youtube_music', 'live'],
        ...(view === 'archive'
          ? { watchedFrom: '2023-01-01', watchedTo: '2025-12-31' }
          : { addedFrom: '2026-01-01', addedTo: '2026-12-31' }),
      })
      const expected = await repository.listVideos(selection)
      expect(expected.data.map((row) => row.id)).toEqual([
        view === 'archive' ? 'video-1' : 'video-2',
      ])
      const largeSelection = input({
        ...selection,
        account: [...Array<string>(200).fill('youtube-1'), 'quoted"account'],
        channel: [...Array<string>(200).fill('channel-1'), 'quoted"channel'],
        category: [...Array<string>(200).fill('22'), 'quoted"category'],
        format: [...Array<'live'>(200).fill('live'), 'youtube_music'],
      })
      expect(await repository.listVideos(largeSelection)).toEqual(expected)
    }
  })

  it('guards channel branch scans and counts source membership across publication expiry modes', async () => {
    await seedPublishedCatalog()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at)
      VALUES('catalog-2','youtube','succeeded','${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET expires_at='2026-10-19T00:00:00.000Z' WHERE media_item_id='video-3'`)
    await repository.rebuild(later)
    const prepare = vi.spyOn(client, 'prepare')
    for (const [at, ids, catalog] of [
      [now, ['channel-1', 'channel-3'], 'current'],
      ['2026-10-19T00:00:00.000Z', ['channel-1'], 'partial'],
      ['2026-10-20T12:00:00.000Z', ['channel-1'], 'not_configured'],
    ] as const) {
      clockNow = at
      prepare.mockClear()
      const result = await repository.listVideos(input({ view: 'channels' }))
      expect(result.data.map((row) => row.id)).toEqual(ids)
      expect(result.coverage.catalog).toBe(catalog)
      expect(
        prepare.mock.calls.filter(([sql]) => sql.includes('SELECT COUNT(*) section_channels')),
      ).toHaveLength(1)
      const pageSql = prepare.mock.calls
        .map(([sql]) => sql)
        .find((sql) => sql.includes('FROM paged'))!
      const legacySql = pageSql
        .replace(
          'FROM read_channel_mode mode CROSS JOIN main.video_library_projection p',
          'FROM main.video_library_projection p',
        )
        .replace(
          'FROM read_channel_mode mode CROSS JOIN main.video_channel_projection',
          'FROM main.video_channel_projection',
        )
        .replace(
          'FROM read_channel_mode mode CROSS JOIN youtube_published_channel_aggregates',
          'FROM youtube_published_channel_aggregates',
        )
        .replaceAll('mode.mode=', '(SELECT mode FROM read_channel_mode)=')
      expect(database.prepare(pageSql).all(at, 51)).toEqual(database.prepare(legacySql).all(at, 51))
      const plan = database
        .prepare(`EXPLAIN QUERY PLAN ${pageSql}`)
        .all(at, 51)
        .map((row) => String(row.detail))
      const modeScan = plan.findIndex((detail) => detail === 'SCAN mode')
      const videoScan = plan.findIndex((detail) => /^(?:SCAN|SEARCH) p(?: USING|$)/.test(detail))
      expect(modeScan).toBeGreaterThanOrEqual(0)
      expect(videoScan).toBeGreaterThan(modeScan)
      const coverageSql = prepare.mock.calls
        .map(([sql]) => sql)
        .find((sql) => sql.includes('total_count') && sql.includes('cached_count'))!
      const coveragePlan = database
        .prepare(`EXPLAIN QUERY PLAN ${coverageSql}`)
        .all(at)
        .map((row) => String(row.detail))
      expect(coveragePlan.some((detail) => /^SEARCH (?:vp|cp|category) /.test(detail))).toBe(false)
      const empty = await repository.listVideos(
        input({ view: 'channels', q: 'no matching channel' }),
      )
      expect(empty).toMatchObject({
        data: [],
        totalCount: 0,
        filteredCount: 0,
        sectionCounts: { channels: ids.length },
      })
    }
    prepare.mockRestore()
  })

  it('reuses complete source rollups and grouped facets without changing filtered or expired results', async () => {
    await seedPublishedCatalog()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at)
      VALUES('catalog-2','youtube','succeeded','${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET expires_at='2026-10-19T00:00:00.000Z' WHERE media_item_id='video-3'`)
    await repository.rebuild(later)
    for (const at of [now, '2026-10-19T00:00:00.000Z', '2026-10-20T12:00:00.000Z']) {
      clockNow = at
      for (const view of ['archive', 'queue'] as const) {
        const complete = await repository.listVideos(input({ view }))
        const observations = await repository.listVideos(input({ view, account: ['youtube-1'] }))
        expect(complete).toEqual(observations)
        const dated = await repository.listVideos(
          input({
            view,
            account: ['youtube-1'],
            ...(view === 'archive'
              ? { watchedFrom: '2020-01-01', watchedTo: '2029-12-31' }
              : { addedFrom: '2020-01-01', addedTo: '2029-12-31' }),
          }),
        )
        expect(complete).toEqual(dated)
        const fullOverlay = await repository.listVideos(
          input({
            view,
            channel: ['channel-1', 'channel-3', '__unknown__'],
          }),
        )
        expect(complete).toEqual(fullOverlay)
      }
      for (const format of [['youtube_music'], ['youtube_music', 'live']] as const) {
        const complete = await repository.listVideos(input({ format }))
        const observations = await repository.listVideos(
          input({
            format,
            account: ['youtube-1'],
            watchedFrom: '2020-01-01',
            watchedTo: '2029-12-31',
          }),
        )
        expect(complete).toEqual(observations)
        expect(complete.data[0]).toMatchObject({
          watchCount: 2,
          matchingWatchCount: format.length === 1 ? 1 : 2,
        })
      }
    }
  })

  it('counts overlapping Takeout evidence once per canonical watch occurrence', async () => {
    database.exec(`
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,source_recorded_at_value,source_recorded_at_precision,source_recorded_at_basis,observed_at,parser_version,disposition,upstream_state)
      VALUES('watch-2-overlap','raw-2','youtube-1','activity','history#overlap','watch:2-overlap','2025-01-02T01:00:00.000Z','instant','source_asserted','${later}','youtube-takeout@4','normalized','active')
    `)
    await repository.projectWatches([
      {
        sourceRecordId: 'watch-2-overlap',
        archiveEntryId: 'archive-2',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Latest first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Channel One',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube_music',
        fromGoogleAds: false,
        occurredAt: '2025-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
      },
    ])
    await repository.rebuild(later)

    const complete = await repository.listVideos(input())
    expect(complete.data[0]).toMatchObject({ watchCount: 2, matchingWatchCount: 2 })
    expect(complete).toEqual(await repository.listVideos(input({ account: ['youtube-1'] })))
    expect(await repository.listHistory('video-1', 25)).toMatchObject({ totalCount: 2 })
    expect((await repository.listHistory('video-1', 25)).data).toHaveLength(2)
    database.exec("UPDATE archive_entries SET upstream_state='removed' WHERE id='archive-3'")
    await repository.rebuild(later)
    const active = await repository.listVideos(input())
    expect(active).toMatchObject({ totalCount: 1, occurrenceCount: 2 })
    expect(active.data[0]).toMatchObject({ id: 'video-1', watchCount: 2, matchingWatchCount: 2 })
    expect(active).toEqual(await repository.listVideos(input({ account: ['youtube-1'] })))
  })

  it('paginates collections by stable keys and rejects stale projection generations', async () => {
    const first = await repository.listVideos(input({ limit: 1, sort: 'title', direction: 'asc' }))
    expect(first.nextCursor).not.toBeNull()
    const query = input({ limit: 1, sort: 'title', direction: 'asc' })
    const itemsSpy = vi.spyOn(repository, 'listVideoItems')
    const summarySpy = vi.spyOn(repository, 'summarizeVideos')
    await expect(repository.listVideoItems(query)).resolves.toEqual({
      data: first.data,
      nextCursor: first.nextCursor,
    })
    expect(summarySpy).not.toHaveBeenCalled()
    itemsSpy.mockClear()
    const expectedSummary = Object.fromEntries(
      Object.entries(first).filter(([key]) => key !== 'data' && key !== 'nextCursor'),
    )
    await expect(repository.summarizeVideos(query)).resolves.toEqual(expectedSummary)
    expect(itemsSpy).not.toHaveBeenCalled()
    itemsSpy.mockRestore()
    summarySpy.mockRestore()

    const second = await repository.listVideos(
      input({ limit: 1, sort: 'title', direction: 'asc', cursor: first.nextCursor! }),
    )
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id)
    const legacy = JSON.parse(decodeURIComponent(first.nextCursor!))
    legacy.key = JSON.stringify(input({ limit: 1, sort: 'title', direction: 'asc' }))
    expect(
      (
        await repository.listVideos(
          input({
            limit: 1,
            sort: 'title',
            direction: 'asc',
            cursor: encodeURIComponent(JSON.stringify(legacy)),
          }),
        )
      ).data,
    ).toEqual(second.data)

    await repository.rebuild(later)
    await expect(
      repository.listVideos(
        input({ limit: 1, sort: 'title', direction: 'asc', cursor: first.nextCursor! }),
      ),
    ).rejects.toThrow('stale')
  })

  it('keyset-paginates History and channel Library and rejects their stale cursors', async () => {
    const historyFirst = await repository.listHistory('video-1', 1)
    expect(historyFirst.data.map((item) => item.id)).toEqual(['archive-2'])
    expect(historyFirst.nextCursor).not.toBeNull()
    expect(
      (await repository.listHistory('video-1', 1, historyFirst.nextCursor!)).data.map(
        (item) => item.id,
      ),
    ).toEqual(['archive-1'])

    await repository.projectWatches([
      {
        sourceRecordId: 'watch-3',
        archiveEntryId: 'archive-3',
        connectionId: 'youtube-1',
        mediaItemId: 'video-3',
        videoId: 'video-3',
        historicalTitle: 'Label only video',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-3',
        historicalChannelTitle: 'Channel One',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube',
        fromGoogleAds: false,
        occurredAt: '2023-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
      },
    ])
    await repository.rebuild(later)
    const channelFirst = await repository.listChannelVideos('channel-1', 'archive', 1)
    expect(channelFirst.nextCursor).not.toBeNull()
    const channelSecond = await repository.listChannelVideos(
      'channel-1',
      'archive',
      1,
      channelFirst.nextCursor!,
    )
    expect(channelSecond.data[0]?.id).not.toBe(channelFirst.data[0]?.id)

    database.exec(`
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,source_recorded_at_value,source_recorded_at_precision,source_recorded_at_basis,observed_at,parser_version,disposition,upstream_state)
      VALUES('watch-history-next-chunk','raw-2','youtube-1','activity','history#next','watch:next','2025-01-02T01:00:00.000Z','instant','source_asserted','${later}','youtube-takeout@4','normalized','active')
    `)
    await repository.projectWatches([
      {
        sourceRecordId: 'watch-history-next-chunk',
        archiveEntryId: 'archive-2',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Latest first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Channel One',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube_music',
        fromGoogleAds: false,
        occurredAt: '2025-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
      },
    ])

    await repository.rebuild('2026-09-22T12:00:00.000Z')
    await expect(repository.listHistory('video-1', 1, historyFirst.nextCursor!)).rejects.toThrow(
      'stale',
    )
    await expect(
      repository.listChannelVideos('channel-1', 'archive', 1, channelFirst.nextCursor!),
    ).rejects.toThrow('stale')
  })

  it('chooses channel titles by defined source freshness rather than write order', async () => {
    database.exec(`
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,source_recorded_at_value,source_recorded_at_precision,source_recorded_at_basis,observed_at,parser_version,disposition,upstream_state)
      VALUES('watch-fresh','raw-2','youtube-1','activity','history#fresh','watch:fresh','2025-01-02T01:00:00.000Z','instant','source_asserted','${later}','youtube-takeout@4','normalized','active')
    `)
    await repository.projectWatches([
      {
        sourceRecordId: 'watch-fresh',
        archiveEntryId: 'archive-2',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Fresh first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Fresh Channel Title',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube_music',
        fromGoogleAds: false,
        occurredAt: '2025-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
      },
      {
        sourceRecordId: 'watch-1',
        archiveEntryId: 'archive-1',
        connectionId: 'youtube-1',
        mediaItemId: 'video-1',
        videoId: 'video-1',
        historicalTitle: 'Earlier first title',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=video-1',
        historicalChannelTitle: 'Stale Channel Title',
        sourceChannelUrl: 'https://www.youtube.com/channel/channel-1',
        channelId: 'channel-1',
        product: 'youtube',
        fromGoogleAds: false,
        occurredAt: '2024-01-02T01:00:00.000Z',
        occurredAtRaw: null,
        occurrenceRank: 0,
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
      },
    ])
    database.exec(
      "UPDATE youtube_channel_subscriptions SET upstream_state='removed' WHERE channel_id='channel-1'",
    )
    await repository.rebuild(later)

    expect((await repository.findChannel('channel-1'))?.title).toBe('Fresh Channel Title')
    expect((await repository.findVideo('video-1'))?.title).toBe('Fresh first title')
  })

  it('does not retire Queue or Following from a newer missing component', async () => {
    await repository.finalizeTakeout({
      rawObjectId: 'raw-2',
      connectionId: 'youtube-1',
      syncRunId: 'run-2',
      parserVersion: 'youtube-takeout@4',
      observedAt: later,
      components: [
        {
          kind: 'watch_history',
          memberName: 'watch-history.html',
          status: 'complete',
          recordCount: 0,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
        {
          kind: 'watch_later',
          memberName: null,
          status: 'missing',
          recordCount: 0,
          errorCode: 'member_missing',
          snapshotSourceRecordId: null,
        },
        {
          kind: 'playlist_index',
          memberName: null,
          status: 'missing',
          recordCount: 0,
          errorCode: 'member_missing',
          snapshotSourceRecordId: null,
        },
        {
          kind: 'subscriptions',
          memberName: null,
          status: 'missing',
          recordCount: 0,
          errorCode: 'member_missing',
          snapshotSourceRecordId: null,
        },
      ],
      watchLater: [],
      subscriptions: [],
    })
    const queue = await repository.listVideos(input({ view: 'queue' }))
    const channels = await repository.listVideos(input({ view: 'channels' }))
    expect(queue.data).toHaveLength(1)
    expect(channels.data).toHaveLength(1)
    expect(queue.coverage).toMatchObject({ watchLater: 'missing' })
  })

  it('does not expose staged Queue or Following rows when finalization fails', async () => {
    const subscriptions = Array.from({ length: 30 }, (_, index) => ({
      sourceRecordId: `subscription-staged-${index}`,
      channelId: `channel-staged-${index}`,
      channelTitle: `Staged Channel ${index}`,
      channelUrl: `https://www.youtube.com/channel/channel-staged-${index}`,
    }))
    const insert = database.prepare(`INSERT INTO source_records(
      id,raw_object_id,connection_id,record_type,record_path,source_record_key,observed_at,
      parser_version,disposition,upstream_state) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    for (const [index, value] of subscriptions.entries())
      insert.run(
        value.sourceRecordId,
        'raw-2',
        'youtube-1',
        'subscription',
        `subscriptions#staged-${index}`,
        `subscription:${value.channelId}`,
        later,
        'youtube-takeout@4',
        'normalized',
        'active',
      )

    client.failOnBatchCall = client.batchCalls + 2
    await expect(
      repository.finalizeTakeout({
        rawObjectId: 'raw-2',
        connectionId: 'youtube-1',
        syncRunId: 'run-2',
        parserVersion: 'youtube-takeout@4',
        observedAt: later,
        components: [
          {
            kind: 'subscriptions',
            memberName: 'subscriptions.csv',
            status: 'complete',
            recordCount: subscriptions.length,
            errorCode: null,
            snapshotSourceRecordId: null,
          },
        ],
        watchLater: [],
        subscriptions,
      }),
    ).rejects.toThrow('synthetic batch failure')

    expect(
      database
        .prepare(
          "SELECT channel_id FROM youtube_channel_subscriptions WHERE upstream_state='active'",
        )
        .all(),
    ).toEqual([{ channel_id: 'channel-1' }])
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toHaveLength(1)
  })

  it('does not let an older complete snapshot roll current Queue or Following state backward', async () => {
    await repository.finalizeTakeout({
      rawObjectId: 'raw-2',
      connectionId: 'youtube-1',
      syncRunId: 'run-2',
      parserVersion: 'youtube-takeout@4',
      observedAt: later,
      components: [
        {
          kind: 'watch_later',
          memberName: 'Watch later-videos.csv',
          status: 'complete',
          recordCount: 0,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
        {
          kind: 'subscriptions',
          memberName: 'subscriptions.csv',
          status: 'complete',
          recordCount: 0,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
      ],
      watchLater: [],
      subscriptions: [],
    })
    expect((await repository.listVideos(input({ view: 'queue' }))).data).toHaveLength(0)
    database.exec(
      "UPDATE youtube_channels SET latest_title='Newer Metadata' WHERE channel_id='channel-1'",
    )

    await repository.finalizeTakeout({
      rawObjectId: 'raw-1',
      connectionId: 'youtube-1',
      syncRunId: 'run-1',
      parserVersion: 'youtube-takeout@4',
      observedAt: now,
      components: [
        {
          kind: 'watch_later',
          memberName: 'Watch later-videos.csv',
          status: 'complete',
          recordCount: 1,
          errorCode: null,
          snapshotSourceRecordId: 'queue-snapshot',
        },
        {
          kind: 'subscriptions',
          memberName: 'subscriptions.csv',
          status: 'complete',
          recordCount: 1,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
      ],
      watchLater: [
        {
          sourceRecordId: 'queue-2',
          mediaItemId: 'video-2',
          videoId: 'video-2',
          queueEntryId: 'youtube-queue-2',
          membershipEvidenceId: 'queue-membership-2',
          addedEvidenceId: 'queue-added-2',
          addedAt: '2026-01-02T01:00:00.000Z',
        },
      ],
      subscriptions: [
        {
          sourceRecordId: 'subscription-1',
          channelId: 'channel-1',
          channelTitle: 'Older Snapshot Title',
          channelUrl: 'https://www.youtube.com/channel/channel-1',
        },
      ],
    })

    expect((await repository.listVideos(input({ view: 'queue' }))).data).toHaveLength(0)
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toHaveLength(1)
    expect(
      database
        .prepare(
          'SELECT component_kind,raw_object_id FROM youtube_takeout_component_heads ORDER BY component_kind',
        )
        .all(),
    ).toEqual([
      { component_kind: 'subscriptions', raw_object_id: 'raw-2' },
      { component_kind: 'watch_later', raw_object_id: 'raw-2' },
    ])
    expect(
      database
        .prepare("SELECT latest_title FROM youtube_channels WHERE channel_id='channel-1'")
        .get(),
    ).toEqual({ latest_title: 'Newer Metadata' })
  })

  it('reports partial component coverage across multiple YouTube connections', async () => {
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
      VALUES('youtube-2','youtube','Secondary YouTube','connected','partial','${now}','${now}')
    `)
    expect((await repository.listVideos(input())).coverage).toMatchObject({
      watchLater: 'partial',
    })

    database.exec(`
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at)
      VALUES('run-secondary','youtube-2','import','succeeded','${later}','${later}');
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status,last_parser_version)
      VALUES('raw-secondary','youtube-2','run-secondary','export','secondary','secondary.zip','${'c'.repeat(64)}','application/zip',1,'${later}','processed','youtube-takeout@4');
      INSERT INTO youtube_takeout_components(raw_object_id,connection_id,component_kind,member_name,parser_version,status,expected_record_count,processed_record_count,sync_run_id,error_code) VALUES
        ('raw-secondary','youtube-2','watch_later','watch-later.csv','youtube-takeout@4','invalid',1,0,'run-secondary','invalid_member_row'),
        ('raw-secondary','youtube-2','subscriptions','subscriptions.csv','youtube-takeout@4','invalid',1,0,'run-secondary','invalid_member_row');
    `)
    expect((await repository.listVideos(input())).coverage).toMatchObject({
      watchLater: 'partial',
    })

    database.exec(
      "UPDATE youtube_takeout_components SET status='invalid' WHERE raw_object_id='raw-1' AND component_kind IN ('watch_later','subscriptions')",
    )
    expect((await repository.listVideos(input())).coverage).toMatchObject({
      watchLater: 'invalid',
    })
    database.exec("DELETE FROM youtube_takeout_components WHERE raw_object_id='raw-secondary'")
    expect((await repository.listVideos(input())).coverage).toMatchObject({
      watchLater: 'partial',
    })
  })

  it('finalizes production-sized subscription snapshots in bounded D1 batches', async () => {
    const subscriptions = Array.from({ length: 150 }, (_, index) => ({
      sourceRecordId: `subscription-large-${index}`,
      channelId: `channel-large-${index}`,
      channelTitle: `Channel ${index}`,
      channelUrl: `https://www.youtube.com/channel/channel-large-${index}`,
    }))
    const insert = database.prepare(`INSERT INTO source_records(
      id,raw_object_id,connection_id,record_type,record_path,source_record_key,observed_at,
      parser_version,disposition,upstream_state) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    for (const [index, value] of subscriptions.entries())
      insert.run(
        value.sourceRecordId,
        'raw-2',
        'youtube-1',
        'subscription',
        `subscriptions#${index}`,
        `subscription:${value.channelId}`,
        later,
        'youtube-takeout@4',
        'normalized',
        'active',
      )
    await repository.finalizeTakeout({
      rawObjectId: 'raw-2',
      connectionId: 'youtube-1',
      syncRunId: 'run-2',
      parserVersion: 'youtube-takeout@4',
      observedAt: later,
      components: [
        {
          kind: 'subscriptions',
          memberName: 'subscriptions.csv',
          status: 'complete',
          recordCount: subscriptions.length,
          errorCode: null,
          snapshotSourceRecordId: null,
        },
      ],
      watchLater: [],
      subscriptions,
    })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) count FROM youtube_channel_subscriptions WHERE upstream_state='active'",
        )
        .get(),
    ).toEqual({ count: 150 })
  })

  it('projects returned YouTube metadata and records successful omissions as unavailable', async () => {
    await seedPublishedCatalog()
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Current Video Title',
      description: 'Current description',
      categoryTitle: 'People & Blogs',
      captionAvailable: true,
      imageUrl: 'https://example.com/medium.jpg',
      metadataMessage: null,
    })
    database
      .prepare(
        "UPDATE video_library_projection SET image_url='https://example.com/high.jpg' WHERE video_id='video-1'",
      )
      .run()
    database.exec(
      readFileSync(
        new URL('../migrations/0021_video_thumbnail_preference.sql', import.meta.url),
        'utf8',
      ),
    )
    expect(await repository.findVideo('video-1')).toMatchObject({
      imageUrl: 'https://example.com/medium.jpg',
    })
    expect(await repository.findVideo('video-2')).toMatchObject({ availability: 'unavailable' })
    expect(await repository.findVideo('video-3')).toMatchObject({
      title: 'Current Video Without Channel Details',
      channelTitle: 'Channel From Video',
      availability: 'available',
    })
    expect(
      database
        .prepare("SELECT latest_title FROM youtube_channels WHERE channel_id='channel-3'")
        .get(),
    ).toEqual({ latest_title: null })
    await expect(
      repository.listVideos(
        input({
          published: 'range',
          publishedFrom: '2020-01-01',
          publishedTo: '2020-12-31',
          duration: 'under5',
          availability: 'available',
          category: ['22'],
        }),
      ),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: 'video-1' })],
      facets: { categories: [{ value: '22', label: 'People & Blogs', count: 1 }] },
    })
    expect(
      (await repository.listVideos(input({ view: 'queue', availability: 'unavailable' }))).data.map(
        (item) => item.id,
      ),
    ).toEqual(['video-2'])
    expect((await repository.listVideos(input({ durationUnknown: true }))).data).toEqual([
      expect.objectContaining({ id: 'video-3' }),
    ])
    expect(
      database
        .prepare("SELECT outcome FROM youtube_catalog_request_outcomes WHERE video_id='video-2'")
        .get(),
    ).toEqual({ outcome: 'omitted' })
    database.exec("UPDATE catalog_refresh_jobs SET state='succeeded' WHERE id='catalog-1'")
    await expect(repository.purgeExpiredYoutubeCatalog('2026-09-21T00:00:00.000Z')).resolves.toBe(
      false,
    )
    await expect(repository.purgeExpiredYoutubeCatalog('2026-11-01T00:00:00.000Z')).resolves.toBe(
      true,
    )
    expect(
      database.prepare('SELECT COUNT(*) count FROM youtube_video_catalog_profiles').get(),
    ).toEqual({ count: 0 })
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Latest first title',
      availability: 'stale',
    })
  })

  it('falls back to complete historical rows, filters, facets and search at clock expiry without maintenance writes', async () => {
    await seedPublishedCatalog()
    expect((await repository.listVideos(input({ q: 'Earlier description' }))).data).toHaveLength(1)
    expect(
      (await repository.listVideos(input({ limit: 1, sort: 'title' }))).nextCursor,
    ).not.toBeNull()
    const cursor = (await repository.listVideos(input({ limit: 1, sort: 'title' }))).nextCursor!
    const batches = client.batchCalls
    clockNow = '2026-10-20T12:00:00.000Z'
    const page = await repository.listVideos(input())
    expect(page.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'video-1',
          title: 'Latest first title',
          channelTitle: 'Channel One',
          imageUrl: null,
          durationMs: null,
        }),
        expect.objectContaining({ id: 'video-3', title: 'Label only video', channelId: null }),
      ]),
    )
    expect(page.occurrenceCount).toBe(3)
    expect(page.facets.categories).toEqual([])
    expect(page.coverage.catalog).toBe('not_configured')
    expect((await repository.listVideos(input({ q: 'description' }))).data).toEqual([])
    expect((await repository.listVideos(input({ q: 'Earlier first' }))).data).toHaveLength(1)
    expect((await repository.listVideos(input({ duration: 'under5' }))).data).toEqual([])
    expect((await repository.listVideos(input({ durationUnknown: true }))).data).toHaveLength(2)
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toEqual([
      expect.objectContaining({
        id: 'channel-1',
        title: 'Channel One',
        watchCount: 2,
        imageUrl: null,
      }),
    ])
    expect((await repository.listChannelVideos('channel-1', 'archive', 50)).totalCount).toBe(1)
    expect((await repository.listHistory('video-1', 50)).totalCount).toBe(2)
    expect(await repository.findVideo('video-1')).toMatchObject({
      description: null,
      categoryTitle: null,
      captionAvailable: null,
    })
    expect(client.batchCalls).toBe(batches)
    await expect(repository.listVideos(input({ limit: 1, sort: 'title', cursor }))).rejects.toThrow(
      'stale',
    )
  })

  it('expires channel, thumbnail and category publications independently of a still-current video profile', async () => {
    await seedPublishedCatalog()
    database.exec(
      `INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','succeeded','${later}','${later}')`,
    )
    database.exec(
      "UPDATE youtube_channel_catalog_profiles SET expires_at='2026-10-19T00:00:00.000Z'; UPDATE youtube_video_thumbnails SET expires_at='2026-10-19T00:00:00.000Z'; UPDATE youtube_categories SET expires_at='2026-10-19T00:00:00.000Z'",
    )
    await repository.rebuild(now)
    clockNow = '2026-10-19T00:00:00.000Z'
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Current Video Title',
      description: 'Current description',
      channelTitle: 'Current Channel',
      imageUrl: null,
      categoryTitle: null,
    })
    expect(await repository.findChannel('channel-1')).toMatchObject({
      title: 'Current Channel',
      imageUrl: null,
      description: null,
      customUrl: null,
    })
    expect((await repository.listVideos(input({ q: 'People Blogs' }))).data).toEqual([])
    expect((await repository.listVideos(input({ view: 'channels', q: 'publisher' }))).data).toEqual(
      [],
    )
  })

  it('keeps a valid published cache while a refresh runs or fails and publishes only after success', async () => {
    await seedPublishedCatalog()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','running','${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET current_title='Unpublished replacement',description='Unpublished replacement body';
      UPDATE youtube_channel_catalog_profiles SET current_title='Unpublished channel';`)
    await repository.rebuild(later)
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Current Video Title',
      description: 'Current description',
    })
    expect((await repository.listVideos(input({ q: 'Unpublished' }))).data).toEqual([])
    database.exec("UPDATE catalog_refresh_jobs SET state='failed' WHERE id='catalog-2'")
    await repository.rebuild(later)
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Current Video Title' })
    clockNow = '2026-10-20T12:00:00.000Z'
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Latest first title',
      description: null,
    })
    clockNow = now
    database.exec("UPDATE catalog_refresh_jobs SET state='succeeded' WHERE id='catalog-2'")
    await repository.rebuild(later)
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Unpublished replacement',
      description: 'Unpublished replacement body',
    })
    expect((await repository.listVideos(input({ q: 'Earlier replacement' }))).data).toHaveLength(1)
  })

  it('cleans a bounded aggregate amount of near-expiry cache data without rebuilding owner projections', async () => {
    await seedPublishedCatalog()
    clockNow = '2026-10-19T00:00:00.000Z'
    const ownerBefore = database
      .prepare('SELECT * FROM video_library_projection ORDER BY media_item_id')
      .all()
    const occurrencesBefore = database
      .prepare('SELECT * FROM youtube_watch_observations ORDER BY source_record_id')
      .all()
    let remaining = true,
      total = 0
    for (let i = 0; i < 30 && remaining; i++) {
      const result = await repository.maintainYoutubeCatalog(clockNow, 7)
      expect(result.deletedRows).toBeLessThanOrEqual(7)
      expect(result.deletedRows).toBe(
        Object.values(result.deletedByTable).reduce((a, b) => a + b, 0),
      )
      total += result.deletedRows
      remaining = result.hasMore
    }
    expect(remaining).toBe(false)
    expect(total).toBeGreaterThan(0)
    expect(
      database.prepare('SELECT * FROM video_library_projection ORDER BY media_item_id').all(),
    ).toEqual(ownerBefore)
    expect(
      database.prepare('SELECT * FROM youtube_watch_observations ORDER BY source_record_id').all(),
    ).toEqual(occurrencesBefore)
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Latest first title',
      description: null,
    })
    expect((await repository.listVideos(input({ q: 'Earlier' }))).data).toHaveLength(1)
    await expect(repository.maintainYoutubeCatalog(clockNow, 1001)).rejects.toThrow('limit')
  })

  it('uses one captured clock across rows, details and envelope queries', async () => {
    await seedPublishedCatalog()
    let calls = 0
    const ticking = new SqlVideosRepository(client, () =>
      ++calls === 1 ? now : '2026-11-01T00:00:00.000Z',
    )
    const page = await ticking.listVideos(input({ q: 'Earlier description' }))
    expect(page.data).toEqual([
      expect.objectContaining({ id: 'video-1', title: 'Current Video Title' }),
    ])
    expect(page.facets.categories).toEqual([{ value: '22', label: 'People & Blogs', count: 1 }])
    expect(calls).toBe(1)
    calls = 0
    expect(await ticking.findVideo('video-1')).toMatchObject({
      title: 'Current Video Title',
      description: 'Current description',
    })
    expect(calls).toBe(1)
  })

  it('does not renew cached metadata or thumbnails for a successful unavailable response', async () => {
    await seedPublishedCatalog()
    database.exec(
      `INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','running','${later}','${later}')`,
    )
    await repository.applyYoutubeCatalogBatch({
      jobId: 'catalog-2',
      at: later,
      expiresAt: '2026-10-21T00:00:00.000Z',
      requested: [{ mediaItemId: 'video-1', videoId: 'video-1' }],
      videos: [],
      channels: [],
      categories: [],
    })
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Current Video Title',
      description: 'Current description',
    })
    database.exec("UPDATE catalog_refresh_jobs SET state='succeeded' WHERE id='catalog-2'")
    await repository.rebuild(later)
    expect(await repository.findVideo('video-1')).toMatchObject({
      title: 'Latest first title',
      description: null,
      imageUrl: null,
      availability: 'unavailable',
      historyCount: 2,
    })
    expect((await repository.listVideos(input({ q: 'description' }))).data).toEqual([])
  })

  it('does not republish an unchanged completed job during owner rebuilds', async () => {
    await seedPublishedCatalog()
    const before = database.prepare('SELECT * FROM youtube_publication_state').get()
    const published = database
      .prepare('SELECT * FROM youtube_published_video_profiles ORDER BY media_item_id')
      .all()
    const prepare = vi.spyOn(client, 'prepare')
    database.exec(
      "UPDATE youtube_watch_observations SET historical_title='Updated historical assertion' WHERE source_record_id='watch-2'",
    )
    await repository.rebuild(later)
    expect(
      prepare.mock.calls.some(
        ([sql]) =>
          sql.startsWith('DELETE FROM youtube_published') &&
          !sql.startsWith('DELETE FROM youtube_published_channel_aggregates'),
      ),
    ).toBe(false)
    expect(database.prepare('SELECT * FROM youtube_publication_state').get()).toEqual(before)
    expect(
      database
        .prepare('SELECT * FROM youtube_published_video_profiles ORDER BY media_item_id')
        .all(),
    ).toEqual(published)
    expect((await repository.listVideos(input({ q: 'Updated assertion' }))).data).toHaveLength(1)
    prepare.mockRestore()
  })

  it('pins publication to the exact completed job if a newer job stages then fails before the transaction', async () => {
    await seedPublishedCatalog()
    database.exec(
      `INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','succeeded','${later}','${later}');UPDATE youtube_video_catalog_profiles SET current_title='Intended completed replacement'`,
    )
    const original = client.batch.bind(client)
    const batch = vi.spyOn(client, 'batch').mockImplementationOnce(async (writes) => {
      database.exec(
        `INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-3','youtube','failed','2026-09-22','2026-09-22');UPDATE youtube_video_catalog_profiles SET current_title='Failed newer staging'`,
      )
      return original(writes)
    })
    await repository.rebuild(later)
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Current Video Title' })
    expect((await repository.listVideos(input({ q: 'Failed newer' }))).data).toEqual([])
    expect(
      database.prepare('SELECT last_published_job_id FROM youtube_publication_state').get(),
    ).toEqual({ last_published_job_id: 'catalog-1' })
    batch.mockRestore()
  })

  it('advances cursor revision atomically when maintenance is interrupted between mutation batches', async () => {
    await seedPublishedCatalog()
    clockNow = '2026-10-19T00:00:00.000Z'
    const before = database.prepare('SELECT revision FROM youtube_publication_state').get()!
      .revision as number
    client.failOnBatchCall = client.batchCalls + 2
    await expect(repository.maintainYoutubeCatalog(clockNow, 1000)).rejects.toThrow(
      'synthetic batch failure',
    )
    const after = database.prepare('SELECT revision FROM youtube_publication_state').get()!
      .revision as number
    expect(after).toBeGreaterThan(before)
  })

  it('expires a catalog-only channel association before a longer-lived channel profile and restores owner enrichment', async () => {
    await seedPublishedCatalog()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','succeeded','${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET channel_id='catalog-only',channel_title='Catalog association' WHERE media_item_id='video-1';
      UPDATE youtube_channel_catalog_profiles SET current_title='Owner enrichment only',expires_at='2026-10-25T00:00:00.000Z' WHERE channel_id='channel-1';
      INSERT INTO youtube_channel_catalog_profiles(channel_id,current_title,fetched_at,checked_at,expires_at) VALUES('catalog-only','Catalog exclusive channel','${now}','${now}','2026-10-25T00:00:00.000Z');`)
    await repository.rebuild(later)
    expect((await repository.listVideos(input({ q: 'Catalog exclusive' }))).data).toHaveLength(1)
    expect(await repository.findVideo('video-1')).toMatchObject({
      channelId: 'catalog-only',
      channelTitle: 'Catalog exclusive channel',
    })
    clockNow = '2026-10-20T12:00:00.000Z'
    expect((await repository.listVideos(input({ q: 'Catalog exclusive' }))).data).toEqual([])
    expect((await repository.listVideos(input({ q: 'Owner enrichment' }))).data).toHaveLength(1)
    expect(await repository.findVideo('video-1')).toMatchObject({
      channelId: 'channel-1',
      channelTitle: 'Owner enrichment only',
    })
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toEqual([
      expect.objectContaining({ id: 'channel-1', watchCount: 2 }),
    ])
    expect((await repository.listChannelVideos('catalog-only', 'archive', 50)).totalCount).toBe(0)
  })

  it('uses dynamic channel counts during partial expiry and cached owner counts after all associations expire', async () => {
    await seedPublishedCatalog()
    database.exec(
      `INSERT INTO catalog_refresh_jobs(id,provider,state,created_at,updated_at) VALUES('catalog-2','youtube','succeeded','${later}','${later}');UPDATE youtube_video_catalog_profiles SET expires_at='2026-10-19T00:00:00.000Z' WHERE media_item_id='video-3'`,
    )
    await repository.rebuild(later)
    expect((await repository.listVideos(input({ view: 'channels' }))).totalCount).toBe(2)
    clockNow = '2026-10-19T00:00:00.000Z'
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toEqual([
      expect.objectContaining({ id: 'channel-1', watchCount: 2 }),
    ])
    expect((await repository.listChannelVideos('channel-3', 'archive', 50)).totalCount).toBe(0)
    clockNow = '2026-10-20T12:00:00.000Z'
    expect((await repository.listVideos(input({ view: 'channels' }))).data).toEqual([
      expect.objectContaining({ id: 'channel-1', watchCount: 2 }),
    ])
  })

  it('upgrades a catalog-channel projection into a correct owner-channel baseline before clock expiry', async () => {
    await seedPublishedCatalog()
    const legacy = new DatabaseSync(':memory:')
    try {
      const prior = readdirSync(new URL('../migrations/', import.meta.url))
        .filter((name) => name.endsWith('.sql') && name < '0026')
        .sort()
      legacy.exec(
        prior
          .map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
          .join('\n'),
      )
      for (const table of [
        'connections',
        'sync_runs',
        'raw_objects',
        'source_records',
        'media_items',
        'external_identities',
        'archive_entries',
        'archive_entry_evidence',
        'queue_entries',
        'queue_entry_evidence',
        'youtube_channels',
        'youtube_channel_assertions',
        'youtube_watch_observations',
        'youtube_channel_subscriptions',
        'video_library_projection',
        'video_channel_projection',
        'catalog_refresh_jobs',
        'youtube_video_catalog_profiles',
        'youtube_channel_catalog_profiles',
        'youtube_categories',
        'youtube_video_thumbnails',
        'youtube_catalog_request_outcomes',
      ]) {
        const cols = legacy
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((c) => String(c.name))
        const quoted = cols.map((c) => `"${c}"`).join(',')
        const insert = legacy.prepare(
          `INSERT INTO ${table}(${quoted}) VALUES(${cols.map(() => '?').join(',')})`,
        )
        for (const row of database.prepare(`SELECT ${quoted} FROM ${table}`).all())
          insert.run(...cols.map((c) => row[c]!))
      }
      legacy.exec(`INSERT INTO youtube_channels(channel_id,latest_title,first_observed_at,last_observed_at,updated_at) VALUES('catalog-only','Cached catalog title','${now}','${now}','${now}');
        UPDATE video_library_projection SET channel_id='catalog-only',display_channel_title='Cached catalog title' WHERE media_item_id='video-1';
        UPDATE youtube_video_catalog_profiles SET channel_id='catalog-only',channel_title='Cached catalog title' WHERE media_item_id='video-1';
        DELETE FROM video_channel_projection;
        INSERT INTO video_channel_projection(channel_id,display_title,normalized_title,canonical_url,library_active,following_active,subscription_count,archive_video_count,watch_occurrence_count,latest_watched_at,queue_video_count,projection_generation,updated_at) VALUES('catalog-only','Cached catalog title','cached catalog title','https://www.youtube.com/channel/catalog-only',1,0,0,1,2,'2025-01-02',0,1,'${now}');`)
      const sourceBefore = legacy.prepare('SELECT * FROM source_records ORDER BY id').all()
      legacy.exec(
        readFileSync(
          new URL('../migrations/0026_youtube_clock_safe_publication.sql', import.meta.url),
          'utf8',
        ),
      )
      expect(legacy.prepare('SELECT * FROM source_records ORDER BY id').all()).toEqual(sourceBefore)
      const upgraded = new SqlVideosRepository(
        new SqliteClient(legacy),
        () => '2026-10-22T00:00:00.000Z',
      )
      expect((await upgraded.listVideos(input({ view: 'channels' }))).data).toEqual([
        expect.objectContaining({
          id: 'channel-1',
          title: 'Channel One',
          watchCount: 2,
          archiveVideoCount: 1,
        }),
      ])
      expect(await upgraded.findChannel('catalog-only')).toBeNull()
      expect((await upgraded.listChannelVideos('channel-1', 'archive', 50)).totalCount).toBe(1)
    } finally {
      legacy.close()
    }
  })
  it('completes the owning catalog attempt and publishes its staged cache atomically', async () => {
    await seedPublishedCatalog()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,attempt_count,created_at,updated_at) VALUES('catalog-2','youtube','running',1,'${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET current_title='Atomically published';`)
    const leased = new SqlVideosRepository(
      fenceCatalogDatabase(client, { jobId: 'catalog-2', token: 1, kind: 'catalog' }),
      () => clockNow,
    )
    database.exec(
      "CREATE TRIGGER fail_video_publish BEFORE INSERT ON youtube_published_video_profiles BEGIN SELECT RAISE(ABORT,'synthetic publication failure'); END",
    )
    await expect(leased.rebuild(later, { jobId: 'catalog-2', token: 1 })).rejects.toThrow(
      'synthetic publication failure',
    )
    expect(
      database.prepare("SELECT state FROM catalog_refresh_jobs WHERE id='catalog-2'").get()?.state,
    ).toBe('running')
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Current Video Title' })
    database.exec('DROP TRIGGER fail_video_publish')
    await leased.rebuild(later, { jobId: 'catalog-2', token: 1 })
    expect(
      database.prepare("SELECT state FROM catalog_refresh_jobs WHERE id='catalog-2'").get()?.state,
    ).toBe('succeeded')
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Atomically published' })
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
  })

  it('publishes remapped provider channels without rewriting owner facts, and rolls back late failures', async () => {
    await seedPublishedCatalog()
    const ownerVideos = database
      .prepare('SELECT * FROM video_library_projection ORDER BY media_item_id')
      .all()
    const ownerChannels = database
      .prepare('SELECT * FROM video_channel_projection ORDER BY channel_id')
      .all()
    const evidence = database
      .prepare('SELECT * FROM youtube_watch_observations ORDER BY source_record_id')
      .all()
    const publication = database.prepare('SELECT * FROM youtube_publication_state').get()
    const previousCursor = (await repository.listVideos(input({ limit: 1 }))).nextCursor
    if (!previousCursor) throw new Error('Expected a second archive page')
    database.exec(`
      INSERT INTO catalog_refresh_jobs(id,provider,state,attempt_count,created_at,updated_at)
        VALUES('catalog-2','youtube','running',1,'${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET channel_id='provider-only',channel_title='New provider channel',current_title='New searchable title' WHERE media_item_id='video-1';
      UPDATE youtube_channel_catalog_profiles SET channel_id='provider-only',current_title='New provider channel';
      CREATE TRIGGER no_owner_video_delete BEFORE DELETE ON video_library_projection BEGIN SELECT RAISE(ABORT,'owner video rebuild'); END;
      CREATE TRIGGER no_owner_channel_delete BEFORE DELETE ON video_channel_projection BEGIN SELECT RAISE(ABORT,'owner channel rebuild'); END;
      CREATE TRIGGER fail_expiry_publish BEFORE INSERT ON youtube_search_expiry BEGIN SELECT RAISE(ABORT,'late expiry failure'); END;
    `)
    const leased = new SqlVideosRepository(
      fenceCatalogDatabase(client, { jobId: 'catalog-2', token: 1, kind: 'catalog' }),
      () => clockNow,
    )
    await expect(leased.rebuild(later, { jobId: 'catalog-2', token: 1 })).rejects.toThrow(
      'late expiry failure',
    )
    expect(database.prepare('SELECT * FROM youtube_publication_state').get()).toEqual(publication)
    expect(
      database.prepare("SELECT state FROM catalog_refresh_jobs WHERE id='catalog-2'").get()?.state,
    ).toBe('running')
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Current Video Title' })
    database.exec('DROP TRIGGER fail_expiry_publish')
    await leased.rebuild(later, { jobId: 'catalog-2', token: 1 })
    expect(
      database.prepare('SELECT * FROM video_library_projection ORDER BY media_item_id').all(),
    ).toEqual(ownerVideos)
    expect(
      database.prepare('SELECT * FROM video_channel_projection ORDER BY channel_id').all(),
    ).toEqual(ownerChannels)
    expect(
      database.prepare('SELECT * FROM youtube_watch_observations ORDER BY source_record_id').all(),
    ).toEqual(evidence)
    expect(await repository.findChannel('provider-only')).toMatchObject({
      title: 'New provider channel',
      archiveVideoCount: 1,
      watchCount: 2,
    })
    expect(
      (await repository.listVideos(input({ q: 'searchable' }))).data.map((item) => item.id),
    ).toEqual(['video-1'])
    expect(
      (await repository.listVideos(input({ q: 'Earlier first title' }))).data.map(
        (item) => item.id,
      ),
    ).toContain('video-1')
    await expect(
      repository.listVideos(input({ cursor: previousCursor, limit: 1 })),
    ).rejects.toThrow()
    expect(database.prepare('SELECT COUNT(*) value FROM catalog_write_guards').get()?.value).toBe(0)
    clockNow = '2026-11-01T00:00:00.000Z'
    expect(await repository.findChannel('provider-only')).toBeNull()
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Latest first title' })
  })

  it('rejects a superseded completion lease before changing publication or search', async () => {
    await seedPublishedCatalog()
    const publication = database.prepare('SELECT * FROM youtube_publication_state').get()
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,attempt_count,created_at,updated_at)
      VALUES('catalog-2','youtube','running',2,'${later}','${later}');
      UPDATE youtube_video_catalog_profiles SET current_title='Must stay private';`)
    const stale = new SqlVideosRepository(
      fenceCatalogDatabase(client, { jobId: 'catalog-2', token: 1, kind: 'catalog' }),
      () => clockNow,
    )
    await expect(stale.rebuild(later, { jobId: 'catalog-2', token: 1 })).rejects.toThrow()
    expect(database.prepare('SELECT * FROM youtube_publication_state').get()).toEqual(publication)
    expect(
      database
        .prepare("SELECT state,attempt_count FROM catalog_refresh_jobs WHERE id='catalog-2'")
        .get(),
    ).toEqual({ state: 'running', attempt_count: 2 })
    expect(await repository.findVideo('video-1')).toMatchObject({ title: 'Current Video Title' })
    expect((await repository.listVideos(input({ q: 'private' }))).data).toEqual([])
  })

  it('keeps owner product lookup bounded to one video with the existing media-first index', async () => {
    await repository.rebuild(now)
    const query = client.queries.findLast((sql) =>
      sql.startsWith('INSERT INTO video_library_projection('),
    )
    expect(query).toBeDefined()
    const plan = database
      .prepare(`EXPLAIN QUERY PLAN ${query!}`)
      .all(Date.parse(now), now, now, now, now)
    expect(
      plan.some((row) =>
        String(row.detail).includes(
          'SEARCH w USING COVERING INDEX youtube_watch_rollup_idx (media_item_id=?)',
        ),
      ),
    ).toBe(true)
    expect(plan.some((row) => String(row.detail).includes('youtube_watch_product_idx'))).toBe(false)
  })

  it('atomically publishes a 20,000-video catalog without touching source projections', async () => {
    await seedPublishedCatalog()
    database.exec(`CREATE TEMP TABLE synthetic_numbers(n INTEGER PRIMARY KEY);
      INSERT INTO synthetic_numbers WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM numbers WHERE n<20000) SELECT n FROM numbers;`)
    // Copy synthetic shapes, changing identities and channels rather than building
    // provider/source fixtures through a network or bypassing publication fences.
    const copy = (table: string, changes: Record<string, string>, where: string) => {
      const columns = database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row.name))
      database.exec(
        `INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map((name) => changes[name] ?? `base.${name}`).join(',')} FROM ${table} base CROSS JOIN synthetic_numbers numbers WHERE ${where}`,
      )
    }
    copy('media_items', { id: "'synthetic-'||n" }, "base.id='video-1'")
    copy(
      'video_library_projection',
      { media_item_id: "'synthetic-'||n", video_id: "'synthetic-'||n" },
      "base.media_item_id='video-1'",
    )
    copy(
      'youtube_video_catalog_profiles',
      {
        media_item_id: "'synthetic-'||n",
        video_id: "'synthetic-'||n",
        channel_id: "'catalog-channel-'||(n%4000)",
        current_title: "'Synthetic searchable '||n",
        description: `'${'Synthetic provider description with bounded catalog metadata. '.repeat(20)}'`,
      },
      "base.media_item_id='video-1'",
    )
    copy(
      'youtube_channel_catalog_profiles',
      { channel_id: "'catalog-channel-'||(n-1)" },
      "base.channel_id='channel-1' AND n<=4000",
    )
    copy('youtube_video_thumbnails', { video_id: "'synthetic-'||n" }, "base.video_id='video-1'")
    database.exec(`INSERT INTO catalog_refresh_jobs(id,provider,state,attempt_count,created_at,updated_at) VALUES('catalog-large','youtube','running',1,'${later}','${later}');
      CREATE TRIGGER no_owner_rebuild BEFORE DELETE ON video_library_projection BEGIN SELECT RAISE(ABORT,'unbounded owner rebuild'); END;`)
    const leased = new SqlVideosRepository(
      fenceCatalogDatabase(client, { jobId: 'catalog-large', token: 1, kind: 'catalog' }),
      () => clockNow,
    )
    await leased.rebuild(later, { jobId: 'catalog-large', token: 1 })
    expect(
      database.prepare("SELECT state FROM catalog_refresh_jobs WHERE id='catalog-large'").get()
        ?.state,
    ).toBe('succeeded')
    expect(
      database.prepare('SELECT COUNT(*) value FROM youtube_published_video_profiles').get()?.value,
    ).toBe(20003)
    expect(
      database.prepare('SELECT COUNT(*) value FROM youtube_published_thumbnails').get()?.value,
    ).toBe(60003)
    expect(
      database.prepare('SELECT COUNT(*) value FROM youtube_published_channel_aggregates').get()
        ?.value,
    ).toBe(4002)
    expect(
      database
        .prepare("SELECT COUNT(*) value FROM video_search WHERE video_search MATCH 'searchable'")
        .get()?.value,
    ).toBe(20000)
    expect(
      database
        .prepare("SELECT COUNT(*) value FROM youtube_search_expiry WHERE document_kind='video'")
        .get()?.value,
    ).toBeGreaterThan(40000)
    expect(
      database
        .prepare(
          'SELECT association_revision=channel_aggregate_revision value FROM youtube_publication_state',
        )
        .get()?.value,
    ).toBe(1)
  }, 20000)
})
