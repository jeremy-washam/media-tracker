import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  constructor(private readonly database: DatabaseSync) {}
  prepare(query: string) {
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

  beforeEach(async () => {
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
    repository = new SqlVideosRepository(client)
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

    expect((await repository.listVideos(input())).data[0]?.watchCount).toBe(2)
    expect(await repository.listHistory('video-1', 25)).toMatchObject({ totalCount: 2 })
    expect((await repository.listHistory('video-1', 25)).data).toHaveLength(2)
  })

  it('paginates collections by stable keys and rejects stale projection generations', async () => {
    const first = await repository.listVideos(input({ limit: 1, sort: 'title', direction: 'asc' }))
    expect(first.nextCursor).not.toBeNull()
    const second = await repository.listVideos(
      input({ limit: 1, sort: 'title', direction: 'asc', cursor: first.nextCursor! }),
    )
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id)
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
    database.prepare("DELETE FROM youtube_channels WHERE channel_id='channel-3'").run()
    await repository.rebuild(now)
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
    ).toEqual({ latest_title: 'Channel From Video' })
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
})
