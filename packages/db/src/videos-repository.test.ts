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
import { SqlVideosRepository, type VideosListInput } from './videos-repository'

const migrations = [
  '0001_canonical_ledger.sql',
  '0006_movies_library.sql',
  '0016_videos_takeout_library.sql',
]
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
  constructor(private readonly database: DatabaseSync) {}
  prepare(query: string) {
    return new SqliteStatement(this.database.prepare(query))
  }
  async batch(statements: readonly DatabaseStatement[]) {
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

describe('SqlVideosRepository', () => {
  let database: DatabaseSync
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
    repository = new SqlVideosRepository(new SqliteClient(database))
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
    const channels = await repository.listVideos(
      input({ view: 'channels', following: 'following' }),
    )
    expect(archive.data.map((item) => item.id)).toEqual(['video-1', 'video-3'])
    expect(queue.data).toHaveLength(1)
    expect(queue.data[0]).toMatchObject({ id: 'video-2', inArchive: false, inQueue: true })
    expect(channels.data).toHaveLength(1)
    expect(channels.data[0]).toMatchObject({ id: 'channel-1', following: true, watchCount: 2 })
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
      format: 'mixed',
    })
    expect((await repository.listHistory('video-1', 25)).data).toHaveLength(2)
    expect((await repository.listVideos(input({ q: 'Earlier first' }))).data[0]?.id).toBe('video-1')
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
    const channels = await repository.listVideos(
      input({ view: 'channels', following: 'following' }),
    )
    expect(queue.data).toHaveLength(1)
    expect(channels.data).toHaveLength(1)
    expect(queue.coverage).toMatchObject({ watchLater: 'missing', subscriptions: 'missing' })
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
})
