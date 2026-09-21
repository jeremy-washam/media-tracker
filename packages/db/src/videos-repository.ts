import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

function statement(database: DatabaseClient, query: string, values: readonly DatabaseValue[] = []) {
  return database.prepare(query).bind(...values)
}

function ftsQuery(value: string) {
  return (value.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 12)
    .map((token) => `"${token}"*`)
    .join(' AND ')
}

interface DetailCursor {
  key: string
  generation: number
  primary: string | null
  id: string
}

function detailCursor(value: string | undefined, key: string): DetailCursor | null {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<DetailCursor>
    if (
      parsed.key !== key ||
      !Number.isInteger(parsed.generation) ||
      (parsed.primary !== null && typeof parsed.primary !== 'string') ||
      typeof parsed.id !== 'string'
    )
      throw new Error()
    return parsed as DetailCursor
  } catch {
    throw new TypeError('Invalid Videos pagination cursor')
  }
}

function encodeDetailCursor(value: DetailCursor) {
  return encodeURIComponent(JSON.stringify(value))
}

interface CollectionCursor {
  key: string
  generation: number
  primary: string | number | null
  title: string
  id: string
}

function collectionCursor(value: string | undefined, key: string): CollectionCursor | null {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CollectionCursor>
    if (
      parsed.key !== key ||
      !Number.isInteger(parsed.generation) ||
      (parsed.primary !== null &&
        typeof parsed.primary !== 'string' &&
        typeof parsed.primary !== 'number') ||
      typeof parsed.title !== 'string' ||
      typeof parsed.id !== 'string'
    )
      throw new Error()
    return parsed as CollectionCursor
  } catch {
    throw new TypeError('Invalid Videos pagination cursor')
  }
}

function encodeCollectionCursor(value: CollectionCursor) {
  return encodeURIComponent(JSON.stringify(value))
}

function pageClause(value: CollectionCursor | null, direction: 'asc' | 'desc') {
  if (value === null) return { sql: '1=1', values: [] as DatabaseValue[] }
  const tie = '(normalized_title>? OR (normalized_title=? AND stable_id>?))'
  if (value.primary === null)
    return {
      sql: `sort_value IS NULL AND ${tie}`,
      values: [value.title, value.title, value.id] as DatabaseValue[],
    }
  const operator = direction === 'asc' ? '>' : '<'
  return {
    sql: `(sort_value IS NULL OR sort_value${operator}? OR (sort_value=? AND ${tie}))`,
    values: [value.primary, value.primary, value.title, value.title, value.id] as DatabaseValue[],
  }
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(',')
}

export interface YoutubeWatchProjection {
  sourceRecordId: string
  archiveEntryId: string
  connectionId: string
  mediaItemId: string
  videoId: string
  historicalTitle: string | null
  sourceVideoUrl: string | null
  historicalChannelTitle: string | null
  sourceChannelUrl: string | null
  channelId: string | null
  product: 'youtube' | 'youtube_music' | 'unknown'
  fromGoogleAds: boolean
  occurredAt: string
  occurredAtRaw: string | null
  occurrenceRank: number
  parserVersion: string
  observedAt: string
}

export interface YoutubeSnapshotMembership {
  sourceRecordId: string
  mediaItemId: string
  videoId: string
  queueEntryId: string
  membershipEvidenceId: string
  addedEvidenceId: string | null
  addedAt: string | null
}

export interface YoutubeSnapshotSubscription {
  sourceRecordId: string
  channelId: string
  channelTitle: string | null
  channelUrl: string | null
}

export interface YoutubeComponentProjection {
  kind: 'watch_history' | 'watch_later' | 'playlist_index' | 'subscriptions'
  memberName: string | null
  status: 'complete' | 'invalid' | 'missing'
  recordCount: number
  errorCode: string | null
  snapshotSourceRecordId: string | null
}

export interface YoutubeTakeoutFinalization {
  rawObjectId: string
  connectionId: string
  syncRunId: string
  parserVersion: string
  observedAt: string
  components: readonly YoutubeComponentProjection[]
  watchLater: readonly YoutubeSnapshotMembership[]
  subscriptions: readonly YoutubeSnapshotSubscription[]
}

export interface VideosListInput {
  view: 'archive' | 'queue' | 'channels'
  q?: string
  account?: readonly string[]
  channel?: readonly string[]
  watchedFrom?: string
  watchedTo?: string
  addedFrom?: string
  addedTo?: string
  watchCount?: 'all' | 'once' | 'rewatched'
  overlap?: 'all' | 'overlap' | 'not_overlap'
  format?: readonly (
    'live' | 'upcoming' | 'recorded_live' | 'youtube_music' | 'shorts' | 'premiere'
  )[]
  availability?: readonly string[]
  following?: 'all' | 'following'
  sort?: string
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

type Row = Record<string, null | number | string>

export class SqlVideosRepository {
  constructor(private readonly database: DatabaseClient) {}

  async projectWatches(values: readonly YoutubeWatchProjection[]): Promise<void> {
    const writes: DatabaseStatement[] = []
    for (const value of values) {
      if (value.channelId !== null) {
        writes.push(
          statement(
            this.database,
            `INSERT INTO youtube_channels(channel_id,latest_title,latest_url,first_observed_at,last_observed_at,updated_at)
             VALUES(?,?,?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET
               latest_title=COALESCE(excluded.latest_title,youtube_channels.latest_title),
               latest_url=COALESCE(excluded.latest_url,youtube_channels.latest_url),
               last_observed_at=MAX(youtube_channels.last_observed_at,excluded.last_observed_at),
               updated_at=excluded.updated_at`,
            [
              value.channelId,
              value.historicalChannelTitle,
              value.sourceChannelUrl,
              value.observedAt,
              value.observedAt,
              value.observedAt,
            ],
          ),
        )
        writes.push(
          statement(
            this.database,
            `INSERT INTO youtube_channel_assertions(source_record_id,channel_id,connection_id,assertion_kind,title,url,observed_at)
             VALUES(?,?,?,'watch',?,?,?) ON CONFLICT(source_record_id) DO UPDATE SET
               channel_id=excluded.channel_id,title=excluded.title,url=excluded.url,observed_at=excluded.observed_at`,
            [
              value.sourceRecordId,
              value.channelId,
              value.connectionId,
              value.historicalChannelTitle,
              value.sourceChannelUrl,
              value.observedAt,
            ],
          ),
        )
      }
      writes.push(
        statement(
          this.database,
          `INSERT INTO youtube_watch_observations(
             source_record_id,archive_entry_id,connection_id,media_item_id,video_id,
             historical_title,source_video_url,historical_channel_title,source_channel_url,
             channel_id,product,from_google_ads,occurred_at,occurred_at_raw,occurrence_rank,
             parser_version,observed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(source_record_id) DO UPDATE SET
             archive_entry_id=excluded.archive_entry_id,channel_id=excluded.channel_id,
             historical_title=excluded.historical_title,source_video_url=excluded.source_video_url,
             historical_channel_title=excluded.historical_channel_title,
             source_channel_url=excluded.source_channel_url,product=excluded.product,
             from_google_ads=excluded.from_google_ads,occurred_at=excluded.occurred_at,
             occurred_at_raw=excluded.occurred_at_raw,occurrence_rank=excluded.occurrence_rank,
             parser_version=excluded.parser_version,observed_at=excluded.observed_at`,
          [
            value.sourceRecordId,
            value.archiveEntryId,
            value.connectionId,
            value.mediaItemId,
            value.videoId,
            value.historicalTitle,
            value.sourceVideoUrl,
            value.historicalChannelTitle,
            value.sourceChannelUrl,
            value.channelId,
            value.product,
            value.fromGoogleAds ? 1 : 0,
            value.occurredAt,
            value.occurredAtRaw,
            value.occurrenceRank,
            value.parserVersion,
            value.observedAt,
          ],
        ),
      )
    }
    if (writes.length > 0) await this.database.batch(writes)
  }

  async finalizeTakeout(input: YoutubeTakeoutFinalization): Promise<void> {
    const stagingWrites: DatabaseStatement[] = [
      statement(
        this.database,
        'DELETE FROM youtube_watch_later_snapshot_members WHERE raw_object_id=?',
        [input.rawObjectId],
      ),
      statement(
        this.database,
        'DELETE FROM youtube_subscription_snapshot_members WHERE raw_object_id=?',
        [input.rawObjectId],
      ),
    ]
    const finalizationWrites: DatabaseStatement[] = []
    for (const component of input.components) {
      finalizationWrites.push(
        statement(
          this.database,
          `INSERT INTO youtube_takeout_components(
             raw_object_id,connection_id,component_kind,member_name,parser_version,status,
             expected_record_count,processed_record_count,sync_run_id,completed_at,finalized_at,error_code)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(raw_object_id,component_kind) DO UPDATE SET
             member_name=excluded.member_name,parser_version=excluded.parser_version,
             status=excluded.status,expected_record_count=excluded.expected_record_count,
             processed_record_count=excluded.processed_record_count,sync_run_id=excluded.sync_run_id,
             completed_at=excluded.completed_at,finalized_at=excluded.finalized_at,
             error_code=excluded.error_code`,
          [
            input.rawObjectId,
            input.connectionId,
            component.kind,
            component.memberName,
            input.parserVersion,
            component.status,
            component.recordCount,
            component.status === 'complete' ? component.recordCount : 0,
            input.syncRunId,
            component.status === 'complete' ? input.observedAt : null,
            component.status === 'complete' ? input.observedAt : null,
            component.errorCode,
          ],
        ),
      )
    }

    const watchLater = input.components.find((value) => value.kind === 'watch_later')
    if (watchLater?.status === 'complete') {
      for (const value of input.watchLater) {
        stagingWrites.push(
          statement(
            this.database,
            `INSERT INTO youtube_watch_later_snapshot_members(
               raw_object_id,connection_id,video_id,media_item_id,queue_entry_id,source_record_id,
               membership_evidence_id,added_evidence_id,added_at,staged_at)
             VALUES(?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(raw_object_id,video_id) DO UPDATE SET
               media_item_id=excluded.media_item_id,queue_entry_id=excluded.queue_entry_id,
               source_record_id=excluded.source_record_id,
               membership_evidence_id=excluded.membership_evidence_id,
               added_evidence_id=excluded.added_evidence_id,added_at=excluded.added_at,
               staged_at=excluded.staged_at`,
            [
              input.rawObjectId,
              input.connectionId,
              value.videoId,
              value.mediaItemId,
              value.queueEntryId,
              value.sourceRecordId,
              value.membershipEvidenceId,
              value.addedEvidenceId,
              value.addedAt,
              input.observedAt,
            ],
          ),
        )
      }
      finalizationWrites.push(
        statement(
          this.database,
          `INSERT INTO youtube_takeout_component_heads(
             connection_id,component_kind,raw_object_id,acquired_at,finalized_at)
           SELECT ?,'watch_later',r.id,r.acquired_at,? FROM raw_objects r WHERE r.id=?
           ON CONFLICT(connection_id,component_kind) DO UPDATE SET
             raw_object_id=excluded.raw_object_id,acquired_at=excluded.acquired_at,
             finalized_at=excluded.finalized_at
           WHERE excluded.acquired_at>youtube_takeout_component_heads.acquired_at
              OR (excluded.acquired_at=youtube_takeout_component_heads.acquired_at
                  AND excluded.raw_object_id>youtube_takeout_component_heads.raw_object_id)`,
          [input.connectionId, input.observedAt, input.rawObjectId],
        ),
        statement(
          this.database,
          `INSERT INTO queue_entries(
             id,media_item_id,connection_id,source_membership_key,relationship_type,
             added_at_value,added_at_precision,added_at_basis,upstream_state,
             first_observed_at,last_observed_at,retired_observed_at,projection_version,
             created_at,updated_at)
           SELECT s.queue_entry_id,s.media_item_id,s.connection_id,'watch-later:'||s.video_id,
             'youtube_watch_later',s.added_at,
             CASE WHEN s.added_at IS NULL THEN NULL ELSE 'instant' END,
             CASE WHEN s.added_at IS NULL THEN NULL ELSE 'source_asserted' END,
             'active',s.staged_at,s.staged_at,NULL,1,s.staged_at,s.staged_at
           FROM youtube_watch_later_snapshot_members s
           JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
             AND h.component_kind='watch_later' AND h.raw_object_id=s.raw_object_id
           WHERE s.raw_object_id=?
           ON CONFLICT(connection_id,source_membership_key) DO UPDATE SET
             media_item_id=excluded.media_item_id,relationship_type=excluded.relationship_type,
             added_at_value=excluded.added_at_value,added_at_precision=excluded.added_at_precision,
             added_at_basis=excluded.added_at_basis,upstream_state='active',
             last_observed_at=excluded.last_observed_at,retired_observed_at=NULL,
             projection_version=excluded.projection_version,updated_at=excluded.updated_at`,
          [input.rawObjectId],
        ),
        statement(
          this.database,
          `UPDATE queue_entries SET upstream_state='removed',retired_observed_at=?,last_observed_at=?,updated_at=?
           WHERE connection_id=? AND relationship_type='youtube_watch_later' AND upstream_state='active'
             AND EXISTS(SELECT 1 FROM youtube_takeout_component_heads h
               WHERE h.connection_id=? AND h.component_kind='watch_later' AND h.raw_object_id=?)
             AND NOT EXISTS(SELECT 1 FROM youtube_watch_later_snapshot_members s
               WHERE s.raw_object_id=? AND s.connection_id=queue_entries.connection_id
                 AND 'watch-later:'||s.video_id=queue_entries.source_membership_key)`,
          [
            input.observedAt,
            input.observedAt,
            input.observedAt,
            input.connectionId,
            input.connectionId,
            input.rawObjectId,
            input.rawObjectId,
          ],
        ),
        statement(
          this.database,
          `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
           SELECT s.membership_evidence_id,q.id,s.source_record_id,'membership',s.staged_at
           FROM youtube_watch_later_snapshot_members s
           JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
             AND h.component_kind='watch_later' AND h.raw_object_id=s.raw_object_id
           JOIN queue_entries q ON q.connection_id=s.connection_id
             AND q.source_membership_key='watch-later:'||s.video_id
           WHERE s.raw_object_id=?`,
          [input.rawObjectId],
        ),
        statement(
          this.database,
          `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
           SELECT s.added_evidence_id,q.id,s.source_record_id,'added_time',s.staged_at
           FROM youtube_watch_later_snapshot_members s
           JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
             AND h.component_kind='watch_later' AND h.raw_object_id=s.raw_object_id
           JOIN queue_entries q ON q.connection_id=s.connection_id
             AND q.source_membership_key='watch-later:'||s.video_id
           WHERE s.raw_object_id=? AND s.added_evidence_id IS NOT NULL AND s.added_at IS NOT NULL`,
          [input.rawObjectId],
        ),
      )
      if (watchLater.snapshotSourceRecordId !== null) {
        finalizationWrites.push(
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             SELECT 'youtube_queue_removal_'||replace(q.id,'youtube_queue_','')||'_'||?,q.id,?,'removal',?
             FROM queue_entries q WHERE q.connection_id=? AND q.relationship_type='youtube_watch_later'
               AND q.retired_observed_at=?
               AND EXISTS(SELECT 1 FROM youtube_takeout_component_heads h
                 WHERE h.connection_id=? AND h.component_kind='watch_later' AND h.raw_object_id=?)`,
            [
              input.rawObjectId,
              watchLater.snapshotSourceRecordId,
              input.observedAt,
              input.connectionId,
              input.observedAt,
              input.connectionId,
              input.rawObjectId,
            ],
          ),
        )
      }
    }

    const subscriptions = input.components.find((value) => value.kind === 'subscriptions')
    if (subscriptions?.status === 'complete') {
      for (const value of input.subscriptions) {
        stagingWrites.push(
          statement(
            this.database,
            `INSERT INTO youtube_channels(channel_id,latest_title,latest_url,first_observed_at,last_observed_at,updated_at)
             VALUES(?,NULL,NULL,?,?,?) ON CONFLICT(channel_id) DO NOTHING`,
            [value.channelId, input.observedAt, input.observedAt, input.observedAt],
          ),
          statement(
            this.database,
            `INSERT INTO youtube_subscription_snapshot_members(
               raw_object_id,connection_id,channel_id,source_record_id,channel_title,channel_url,staged_at)
             VALUES(?,?,?,?,?,?,?) ON CONFLICT(raw_object_id,channel_id) DO UPDATE SET
               source_record_id=excluded.source_record_id,channel_title=excluded.channel_title,
               channel_url=excluded.channel_url,staged_at=excluded.staged_at`,
            [
              input.rawObjectId,
              input.connectionId,
              value.channelId,
              value.sourceRecordId,
              value.channelTitle,
              value.channelUrl,
              input.observedAt,
            ],
          ),
        )
      }
      finalizationWrites.push(
        statement(
          this.database,
          `INSERT INTO youtube_takeout_component_heads(
             connection_id,component_kind,raw_object_id,acquired_at,finalized_at)
           SELECT ?,'subscriptions',r.id,r.acquired_at,? FROM raw_objects r WHERE r.id=?
           ON CONFLICT(connection_id,component_kind) DO UPDATE SET
             raw_object_id=excluded.raw_object_id,acquired_at=excluded.acquired_at,
             finalized_at=excluded.finalized_at
           WHERE excluded.acquired_at>youtube_takeout_component_heads.acquired_at
              OR (excluded.acquired_at=youtube_takeout_component_heads.acquired_at
                  AND excluded.raw_object_id>youtube_takeout_component_heads.raw_object_id)`,
          [input.connectionId, input.observedAt, input.rawObjectId],
        ),
        statement(
          this.database,
          `UPDATE youtube_channels SET
             latest_title=COALESCE((SELECT s.channel_title
               FROM youtube_subscription_snapshot_members s
               WHERE s.raw_object_id=? AND s.channel_id=youtube_channels.channel_id),latest_title),
             latest_url=COALESCE((SELECT s.channel_url
               FROM youtube_subscription_snapshot_members s
               WHERE s.raw_object_id=? AND s.channel_id=youtube_channels.channel_id),latest_url),
             last_observed_at=MAX(last_observed_at,?),updated_at=?
           WHERE EXISTS(SELECT 1 FROM youtube_subscription_snapshot_members s
             JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
               AND h.component_kind='subscriptions' AND h.raw_object_id=s.raw_object_id
             WHERE s.raw_object_id=? AND s.channel_id=youtube_channels.channel_id)`,
          [
            input.rawObjectId,
            input.rawObjectId,
            input.observedAt,
            input.observedAt,
            input.rawObjectId,
          ],
        ),
        statement(
          this.database,
          `INSERT INTO youtube_channel_assertions(
             source_record_id,channel_id,connection_id,assertion_kind,title,url,observed_at)
           SELECT s.source_record_id,s.channel_id,s.connection_id,'subscription',
             s.channel_title,s.channel_url,s.staged_at
           FROM youtube_subscription_snapshot_members s
           JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
             AND h.component_kind='subscriptions' AND h.raw_object_id=s.raw_object_id
           WHERE s.raw_object_id=?
           ON CONFLICT(source_record_id) DO UPDATE SET
             title=excluded.title,url=excluded.url,observed_at=excluded.observed_at`,
          [input.rawObjectId],
        ),
        statement(
          this.database,
          `INSERT INTO youtube_channel_subscriptions(
             connection_id,channel_id,source_record_id,provider_subscription_id,channel_title,
             channel_url,subscribed_at,source_kind,upstream_state,first_observed_at,last_observed_at,
             retired_observed_at,parser_version,updated_at)
           SELECT s.connection_id,s.channel_id,s.source_record_id,NULL,s.channel_title,s.channel_url,
             NULL,'takeout','active',s.staged_at,s.staged_at,NULL,?,s.staged_at
           FROM youtube_subscription_snapshot_members s
           JOIN youtube_takeout_component_heads h ON h.connection_id=s.connection_id
             AND h.component_kind='subscriptions' AND h.raw_object_id=s.raw_object_id
           WHERE s.raw_object_id=?
           ON CONFLICT(connection_id,channel_id) DO UPDATE SET
             source_record_id=excluded.source_record_id,channel_title=excluded.channel_title,
             channel_url=excluded.channel_url,source_kind='takeout',upstream_state='active',
             last_observed_at=excluded.last_observed_at,retired_observed_at=NULL,
             parser_version=excluded.parser_version,updated_at=excluded.updated_at`,
          [input.parserVersion, input.rawObjectId],
        ),
        statement(
          this.database,
          `UPDATE youtube_channel_subscriptions SET upstream_state='removed',retired_observed_at=?,
             last_observed_at=?,updated_at=? WHERE connection_id=? AND source_kind='takeout'
             AND upstream_state='active'
             AND EXISTS(SELECT 1 FROM youtube_takeout_component_heads h
               WHERE h.connection_id=? AND h.component_kind='subscriptions' AND h.raw_object_id=?)
             AND NOT EXISTS(SELECT 1 FROM youtube_subscription_snapshot_members s
               WHERE s.raw_object_id=? AND s.connection_id=youtube_channel_subscriptions.connection_id
                 AND s.channel_id=youtube_channel_subscriptions.channel_id)`,
          [
            input.observedAt,
            input.observedAt,
            input.observedAt,
            input.connectionId,
            input.connectionId,
            input.rawObjectId,
            input.rawObjectId,
          ],
        ),
      )
    }
    // Candidate rows can be staged in bounded batches without changing visible
    // current state. The final set-based batch advances an authoritative head,
    // activates the complete snapshot, retires absences, and records component
    // completion atomically. A failed/older snapshot therefore changes no
    // active Queue or Following relationship.
    for (let offset = 0; offset < stagingWrites.length; offset += 25)
      await this.database.batch(stagingWrites.slice(offset, offset + 25))
    if (finalizationWrites.length > 0) await this.database.batch(finalizationWrites)
    await this.rebuild(input.observedAt)
  }

  async rebuild(at: string): Promise<void> {
    const generation = Date.parse(at)
    const latestVideoTitle = `(SELECT w.historical_title
      FROM youtube_watch_observations w
      JOIN source_records sr ON sr.id=w.source_record_id
      JOIN raw_objects r ON r.id=sr.raw_object_id
      WHERE w.media_item_id=m.id AND w.historical_title IS NOT NULL
      ORDER BY r.acquired_at DESC,w.source_record_id DESC LIMIT 1)`
    const latestChannelId = `(SELECT w.channel_id
      FROM youtube_watch_observations w
      JOIN source_records sr ON sr.id=w.source_record_id
      JOIN raw_objects r ON r.id=sr.raw_object_id
      WHERE w.media_item_id=m.id AND w.channel_id IS NOT NULL
      ORDER BY r.acquired_at DESC,w.source_record_id DESC LIMIT 1)`
    const latestVideoChannelTitle = `(SELECT a.title
      FROM youtube_channel_assertions a
      JOIN source_records sr ON sr.id=a.source_record_id
      JOIN raw_objects r ON r.id=sr.raw_object_id
      WHERE a.channel_id=${latestChannelId} AND a.title IS NOT NULL
      ORDER BY r.acquired_at DESC,a.source_record_id DESC LIMIT 1)`
    const latestChannelTitle = `(SELECT a.title
      FROM youtube_channel_assertions a
      JOIN source_records sr ON sr.id=a.source_record_id
      JOIN raw_objects r ON r.id=sr.raw_object_id
      WHERE a.channel_id=c.channel_id AND a.title IS NOT NULL
      ORDER BY r.acquired_at DESC,a.source_record_id DESC LIMIT 1)`
    const latestChannelUrl = `(SELECT a.url
      FROM youtube_channel_assertions a
      JOIN source_records sr ON sr.id=a.source_record_id
      JOIN raw_objects r ON r.id=sr.raw_object_id
      WHERE a.channel_id=c.channel_id AND a.url IS NOT NULL
      ORDER BY r.acquired_at DESC,a.source_record_id DESC LIMIT 1)`
    await this.database.batch([
      statement(this.database, 'DELETE FROM video_library_projection'),
      statement(
        this.database,
        `INSERT INTO video_library_projection(
           media_item_id,video_id,display_title,normalized_title,channel_id,
           display_channel_title,normalized_channel_title,canonical_url,image_url,
           published_at,duration_ms,availability_state,metadata_state,source_format,
           archive_active,watch_occurrence_count,watch_account_count,latest_watched_at,
           queue_active,queue_relationship_count,queue_account_count,latest_queue_added_at,
           projection_generation,updated_at)
         SELECT m.id,i.external_id,
           COALESCE(${latestVideoTitle},m.title,'Untitled video'),
           LOWER(COALESCE(${latestVideoTitle},m.title,'Untitled video')),
           ${latestChannelId},
           ${latestVideoChannelTitle},
           LOWER(${latestVideoChannelTitle}),
           COALESCE(i.canonical_url,'https://www.youtube.com/watch?v='||i.external_id),
           NULL,NULL,NULL,'not_configured','not_configured',
           CASE WHEN EXISTS(SELECT 1 FROM youtube_watch_observations w
             WHERE w.media_item_id=m.id AND w.product='youtube_music')
             THEN 'youtube_music' ELSE 'unknown' END,
           EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=m.id AND a.upstream_state='active'
             AND a.admission_reason='youtube_watched_activity'),
           (SELECT COUNT(DISTINCT w.archive_entry_id) FROM youtube_watch_observations w JOIN archive_entries a ON a.id=w.archive_entry_id
             WHERE w.media_item_id=m.id AND a.upstream_state='active'),
           (SELECT COUNT(DISTINCT w.connection_id) FROM youtube_watch_observations w
             JOIN archive_entries a ON a.id=w.archive_entry_id WHERE w.media_item_id=m.id AND a.upstream_state='active'),
           (SELECT MAX(w.occurred_at) FROM youtube_watch_observations w JOIN archive_entries a ON a.id=w.archive_entry_id
             WHERE w.media_item_id=m.id AND a.upstream_state='active'),
           EXISTS(SELECT 1 FROM queue_entries q WHERE q.media_item_id=m.id AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'),
           (SELECT COUNT(*) FROM queue_entries q WHERE q.media_item_id=m.id AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'),
           (SELECT COUNT(DISTINCT q.connection_id) FROM queue_entries q WHERE q.media_item_id=m.id AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'),
           (SELECT MAX(q.added_at_value) FROM queue_entries q WHERE q.media_item_id=m.id AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'),
           ?,?
         FROM media_items m JOIN external_identities i ON i.media_item_id=m.id
         WHERE m.type='video' AND i.namespace='youtube' AND i.external_type='video_id'
           AND i.scope='global' AND i.retired_at IS NULL
           AND (EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=m.id AND a.upstream_state='active'
                 AND a.admission_reason='youtube_watched_activity')
             OR EXISTS(SELECT 1 FROM queue_entries q WHERE q.media_item_id=m.id
                 AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'))`,
        [generation, at],
      ),
      statement(this.database, 'DELETE FROM video_channel_projection'),
      statement(
        this.database,
        `INSERT INTO video_channel_projection(
           channel_id,display_title,normalized_title,canonical_url,image_url,library_active,
           following_active,subscription_count,archive_video_count,watch_occurrence_count,
           latest_watched_at,queue_video_count,projection_generation,updated_at)
         SELECT c.channel_id,
           COALESCE(${latestChannelTitle},c.latest_title,'Channel unavailable'),
           LOWER(COALESCE(${latestChannelTitle},c.latest_title,'Channel unavailable')),
           COALESCE(${latestChannelUrl},c.latest_url,
             'https://www.youtube.com/channel/'||c.channel_id),NULL,1,
           EXISTS(SELECT 1 FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
           (SELECT COUNT(*) FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
           (SELECT COUNT(*) FROM video_library_projection p WHERE p.channel_id=c.channel_id AND p.archive_active=1),
           (SELECT COALESCE(SUM(p.watch_occurrence_count),0) FROM video_library_projection p WHERE p.channel_id=c.channel_id),
           (SELECT MAX(p.latest_watched_at) FROM video_library_projection p WHERE p.channel_id=c.channel_id),
           (SELECT COUNT(*) FROM video_library_projection p WHERE p.channel_id=c.channel_id AND p.queue_active=1),
           ?,? FROM youtube_channels c
         WHERE EXISTS(SELECT 1 FROM video_library_projection p WHERE p.channel_id=c.channel_id
           AND (p.archive_active=1 OR p.queue_active=1))`,
        [generation, at],
      ),
      statement(this.database, 'DELETE FROM video_search'),
      statement(
        this.database,
        `INSERT INTO video_search(media_item_id,titles,channel_titles)
         SELECT p.media_item_id,
           COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_title) FROM youtube_watch_observations w
             WHERE w.media_item_id=p.media_item_id),p.display_title),
           COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_channel_title) FROM youtube_watch_observations w
             WHERE w.media_item_id=p.media_item_id),p.display_channel_title)
         FROM video_library_projection p`,
      ),
      statement(this.database, 'DELETE FROM video_channel_search'),
      statement(
        this.database,
        `INSERT INTO video_channel_search(channel_id,titles)
         SELECT p.channel_id,COALESCE((SELECT GROUP_CONCAT(DISTINCT a.title)
           FROM youtube_channel_assertions a WHERE a.channel_id=p.channel_id),p.display_title)
         FROM video_channel_projection p`,
      ),
    ])
  }

  private videoClauses(input: VideosListInput) {
    const clauses = [input.view === 'archive' ? 'p.archive_active=1' : 'p.queue_active=1']
    const values: DatabaseValue[] = []
    if (input.q) {
      const match = ftsQuery(input.q)
      clauses.push(
        `(${[
          'p.video_id=?',
          'p.canonical_url=?',
          match.length > 0
            ? 'EXISTS(SELECT 1 FROM video_search s WHERE s.media_item_id=p.media_item_id AND video_search MATCH ?)'
            : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
      values.push(input.q, input.q)
      if (match.length > 0) values.push(match)
    }
    if (input.channel?.length) {
      const known = input.channel.filter((value) => value !== '__unknown__')
      clauses.push(
        `(${[
          known.length > 0 ? `p.channel_id IN (${placeholders(known)})` : null,
          input.channel.includes('__unknown__') ? 'p.channel_id IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
      values.push(...known)
    }
    if (input.availability?.length) {
      clauses.push(`p.availability_state IN (${placeholders(input.availability)})`)
      values.push(...input.availability)
    }
    if (input.overlap === 'overlap')
      clauses.push(input.view === 'archive' ? 'p.queue_active=1' : 'p.archive_active=1')
    if (input.overlap === 'not_overlap')
      clauses.push(input.view === 'archive' ? 'p.queue_active=0' : 'p.archive_active=0')
    if (input.watchCount === 'once') clauses.push('p.watch_occurrence_count=1')
    if (input.watchCount === 'rewatched') clauses.push('p.watch_occurrence_count>1')
    if (input.view === 'archive') {
      const occurrence = this.watchPredicate(input, true)
      clauses.push(
        `EXISTS(SELECT 1 FROM youtube_watch_observations w
          JOIN archive_entries a ON a.id=w.archive_entry_id
          WHERE ${occurrence.sql})`,
      )
      values.push(...occurrence.values)
    }
    if (input.view === 'queue') {
      const relationship = this.queuePredicate(input, true)
      clauses.push(`EXISTS(SELECT 1 FROM queue_entries q WHERE ${relationship.sql})`)
      values.push(...relationship.values)
      if (input.format?.length) {
        if (input.format.includes('youtube_music'))
          clauses.push(
            `EXISTS(SELECT 1 FROM youtube_watch_observations fw
              JOIN archive_entries fa ON fa.id=fw.archive_entry_id
              WHERE fw.media_item_id=p.media_item_id AND fa.upstream_state='active'
                AND fw.product='youtube_music')`,
          )
        else clauses.push('1=0')
      }
    }
    return { where: clauses.join(' AND '), values }
  }

  private watchPredicate(input: VideosListInput, correlateMedia: boolean) {
    const clauses = ["a.upstream_state='active'"]
    const values: DatabaseValue[] = []
    if (correlateMedia) clauses.push('w.media_item_id=p.media_item_id')
    if (input.account?.length) {
      clauses.push(`w.connection_id IN (${placeholders(input.account)})`)
      values.push(...input.account)
    }
    if (input.watchedFrom) {
      clauses.push('w.occurred_at>=?')
      values.push(input.watchedFrom)
    }
    if (input.watchedTo) {
      clauses.push('w.occurred_at<=?')
      values.push(`${input.watchedTo}T23:59:59.999Z`)
    }
    if (input.format?.length) {
      if (input.format.includes('youtube_music')) clauses.push("w.product='youtube_music'")
      else clauses.push('1=0')
    }
    return { sql: clauses.join(' AND '), values }
  }

  private queuePredicate(input: VideosListInput, correlateMedia: boolean) {
    const clauses = ["q.relationship_type='youtube_watch_later'", "q.upstream_state='active'"]
    const values: DatabaseValue[] = []
    if (correlateMedia) clauses.push('q.media_item_id=p.media_item_id')
    if (input.account?.length) {
      clauses.push(`q.connection_id IN (${placeholders(input.account)})`)
      values.push(...input.account)
    }
    if (input.addedFrom) {
      clauses.push('q.added_at_value>=?')
      values.push(input.addedFrom)
    }
    if (input.addedTo) {
      clauses.push('q.added_at_value<=?')
      values.push(`${input.addedTo}T23:59:59.999Z`)
    }
    return { sql: clauses.join(' AND '), values }
  }

  private matchingCte(input: VideosListInput) {
    if (input.view === 'archive') {
      const predicate = this.watchPredicate(input, false)
      return {
        sql: `matching AS (
          SELECT w.media_item_id,MAX(w.occurred_at) reference_date,
            COUNT(DISTINCT w.archive_entry_id) matching_watch_count,
            COUNT(DISTINCT w.connection_id) matching_watch_account_count,
            0 matching_queue_count,0 matching_queue_account_count
          FROM youtube_watch_observations w
          JOIN archive_entries a ON a.id=w.archive_entry_id
          WHERE ${predicate.sql} GROUP BY w.media_item_id
        )`,
        values: predicate.values,
      }
    }
    const predicate = this.queuePredicate(input, false)
    return {
      sql: `matching AS (
        SELECT q.media_item_id,MAX(q.added_at_value) reference_date,
          0 matching_watch_count,0 matching_watch_account_count,
          COUNT(*) matching_queue_count,
          COUNT(DISTINCT q.connection_id) matching_queue_account_count
        FROM queue_entries q WHERE ${predicate.sql} GROUP BY q.media_item_id
      )`,
      values: predicate.values,
    }
  }

  async listVideos(input: VideosListInput) {
    const key = JSON.stringify({ ...input, cursor: undefined })
    const requestedCursor = collectionCursor(input.cursor, key)
    if (input.view === 'channels') return this.listChannels(input, requestedCursor, key)
    const { where, values } = this.videoClauses(input)
    const matching = this.matchingCte(input)
    const sort = input.sort ?? (input.view === 'archive' ? 'watchedAt' : 'addedAt')
    const direction =
      input.direction ?? (['title', 'channel', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const orderValues: DatabaseValue[] = []
    const order =
      sort === 'relevance' && input.q
        ? (orderValues.push(input.q, input.q, `${input.q}%`),
          'CASE WHEN video_id=? THEN 0 WHEN LOWER(display_title)=LOWER(?) THEN 1 WHEN LOWER(display_title) LIKE LOWER(?) THEN 2 ELSE 3 END')
        : sort === 'title'
          ? 'normalized_title'
          : sort === 'channel'
            ? 'normalized_channel_title'
            : sort === 'watchCount'
              ? 'watch_occurrence_count'
              : sort === 'publishedAt'
                ? 'published_at'
                : sort === 'duration'
                  ? 'duration_ms'
                  : 'reference_date'
    const generationRow = await statement(
      this.database,
      'SELECT COALESCE(MAX(projection_generation),0) generation FROM video_library_projection',
    ).first<{ generation: number }>()
    const generation = generationRow?.generation ?? 0
    if (requestedCursor !== null && requestedCursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const page = pageClause(requestedCursor, direction)
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM video_library_projection p WHERE ${where}`,
      values,
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `WITH ${matching.sql}, filtered AS (
         SELECT p.*,matching.reference_date,matching.matching_watch_count,
           matching.matching_watch_account_count,matching.matching_queue_count,
           matching.matching_queue_account_count
         FROM video_library_projection p JOIN matching ON matching.media_item_id=p.media_item_id
         WHERE ${where}
       ), ordered AS (
         SELECT filtered.*,${order} sort_value,normalized_title stable_title,media_item_id stable_id
         FROM filtered
       ) SELECT * FROM ordered WHERE ${page.sql}
       ORDER BY (sort_value IS NULL),sort_value ${direction.toUpperCase()},normalized_title,stable_id
       LIMIT ?`,
      [...matching.values, ...values, ...orderValues, ...page.values, input.limit + 1],
    ).all<Row>()
    const total = count?.value ?? 0
    const hasMore = rows.results.length > input.limit
    const visibleRows = rows.results.slice(0, input.limit)
    const last = visibleRows.at(-1)
    return {
      data: visibleRows.map((row) =>
        this.videoRow(row, input.view === 'archive' ? 'archive' : 'queue'),
      ),
      nextCursor:
        hasMore && last
          ? encodeCollectionCursor({
              key,
              generation,
              primary: last.sort_value as string | number | null,
              title: String(last.normalized_title),
              id: String(last.media_item_id),
            })
          : null,
      totalCount: total,
      filteredCount: total,
      ...(await this.sharedEnvelope(input.view, where, values, matching)),
    }
  }

  private async listChannels(
    input: VideosListInput,
    requestedCursor: CollectionCursor | null,
    key: string,
  ) {
    const clauses = ['p.library_active=1']
    const values: DatabaseValue[] = []
    if (input.q) {
      const match = ftsQuery(input.q)
      clauses.push(
        `(${[
          'p.channel_id=?',
          match.length > 0
            ? 'EXISTS(SELECT 1 FROM video_channel_search s WHERE s.channel_id=p.channel_id AND video_channel_search MATCH ?)'
            : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
      values.push(input.q)
      if (match.length > 0) values.push(match)
    }
    if (input.following === 'following') clauses.push('p.following_active=1')
    const where = clauses.join(' AND ')
    const sort = input.sort ?? 'watchCount'
    const direction = input.direction ?? (['channel', 'relevance'].includes(sort) ? 'asc' : 'desc')
    const orderValues: DatabaseValue[] = []
    const order =
      sort === 'relevance' && input.q
        ? (orderValues.push(input.q, input.q),
          'CASE WHEN channel_id=? THEN 0 WHEN LOWER(display_title)=LOWER(?) THEN 1 ELSE 2 END')
        : sort === 'channel'
          ? 'normalized_title'
          : sort === 'watchedAt'
            ? 'latest_watched_at'
            : sort === 'queueCount'
              ? 'queue_video_count'
              : 'watch_occurrence_count'
    const generationRow = await statement(
      this.database,
      'SELECT COALESCE(MAX(projection_generation),0) generation FROM video_channel_projection',
    ).first<{ generation: number }>()
    const generation = generationRow?.generation ?? 0
    if (requestedCursor !== null && requestedCursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const page = pageClause(requestedCursor, direction)
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM video_channel_projection p WHERE ${where}`,
      values,
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `WITH filtered AS (
         SELECT p.* FROM video_channel_projection p WHERE ${where}
       ), ordered AS (
         SELECT filtered.*,${order} sort_value,normalized_title stable_title,channel_id stable_id
         FROM filtered
       ) SELECT * FROM ordered WHERE ${page.sql}
       ORDER BY (sort_value IS NULL),sort_value ${direction.toUpperCase()},normalized_title,stable_id
       LIMIT ?`,
      [...values, ...orderValues, ...page.values, input.limit + 1],
    ).all<Row>()
    const total = count?.value ?? 0
    const hasMore = rows.results.length > input.limit
    const visibleRows = rows.results.slice(0, input.limit)
    const last = visibleRows.at(-1)
    return {
      data: visibleRows.map((row) => this.channelRow(row)),
      nextCursor:
        hasMore && last
          ? encodeCollectionCursor({
              key,
              generation,
              primary: last.sort_value as string | number | null,
              title: String(last.normalized_title),
              id: String(last.channel_id),
            })
          : null,
      totalCount: total,
      filteredCount: total,
      ...(await this.sharedEnvelope('channels', where, values)),
    }
  }

  private async sharedEnvelope(
    view: VideosListInput['view'],
    where: string,
    values: DatabaseValue[],
    matching?: { sql: string; values: DatabaseValue[] },
  ) {
    const counts = await statement(
      this.database,
      `SELECT (SELECT COUNT(*) FROM video_library_projection WHERE archive_active=1) archive,
        (SELECT COUNT(*) FROM video_library_projection WHERE queue_active=1) queue,
        (SELECT COUNT(*) FROM video_channel_projection WHERE library_active=1) channels,
        (SELECT COUNT(DISTINCT archive_entry_id) FROM youtube_watch_observations) occurrences`,
    ).first<{ archive: number; queue: number; channels: number; occurrences: number }>()
    const filteredOccurrences =
      view === 'archive' && matching
        ? await statement(
            this.database,
            `WITH ${matching.sql}
             SELECT COALESCE(SUM(matching.matching_watch_count),0) value
             FROM video_library_projection p JOIN matching ON matching.media_item_id=p.media_item_id
             WHERE ${where}`,
            [...matching.values, ...values],
          ).first<{ value: number }>()
        : null
    const accounts = await statement(
      this.database,
      `SELECT c.id value,c.label label,COUNT(DISTINCT ${view === 'queue' ? 'q.media_item_id' : 'w.media_item_id'}) count
       FROM connections c ${
         view === 'queue'
           ? "JOIN queue_entries q ON q.connection_id=c.id AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'"
           : 'JOIN youtube_watch_observations w ON w.connection_id=c.id'
       } WHERE c.source='youtube' GROUP BY c.id,c.label ORDER BY c.label`,
    ).all<{ value: string; label: string; count: number }>()
    const channels =
      view === 'channels'
        ? { results: [] as { value: string; label: string; count: number }[] }
        : await statement(
            this.database,
            `SELECT COALESCE(p.channel_id,'__unknown__') value,
              COALESCE(MAX(p.display_channel_title),'Channel unavailable') label,COUNT(*) count
             FROM video_library_projection p WHERE ${where}
             GROUP BY COALESCE(p.channel_id,'__unknown__') ORDER BY label LIMIT 500`,
            values,
          ).all<{ value: string; label: string; count: number }>()
    const coverage = await this.coverage()
    return {
      sectionCounts: {
        archive: counts?.archive ?? 0,
        queue: counts?.queue ?? 0,
        channels: counts?.channels ?? 0,
      },
      occurrenceCount: filteredOccurrences?.value ?? counts?.occurrences ?? 0,
      facets: { accounts: [...accounts.results], channels: [...channels.results] },
      coverage,
    }
  }

  private async coverage() {
    const rows = await statement(
      this.database,
      `WITH kinds(component_kind) AS (VALUES ('watch_later'),('subscriptions')),
       ranked AS (
         SELECT c.connection_id,c.component_kind,c.status,
           ROW_NUMBER() OVER(PARTITION BY c.connection_id,c.component_kind
             ORDER BY r.acquired_at DESC,r.id DESC) position
         FROM youtube_takeout_components c JOIN raw_objects r ON r.id=c.raw_object_id
         WHERE c.component_kind IN ('watch_later','subscriptions')
       ) SELECT connections.id connection_id,kinds.component_kind,
         COALESCE(ranked.status,'unknown') status
       FROM connections CROSS JOIN kinds
       LEFT JOIN ranked ON ranked.connection_id=connections.id
         AND ranked.component_kind=kinds.component_kind AND ranked.position=1
       WHERE connections.source='youtube' ORDER BY kinds.component_kind,connections.id`,
    ).all<{ connection_id: string; component_kind: string; status: string }>()
    const state = (kind: string) => {
      const matches = rows.results.filter((row) => row.component_kind === kind)
      if (matches.length === 0) return 'unknown' as const
      if (matches.every((row) => row.status === 'complete')) return 'complete' as const
      if (matches.every((row) => row.status === 'missing')) return 'missing' as const
      if (matches.every((row) => row.status === 'invalid')) return 'invalid' as const
      if (matches.every((row) => row.status === 'unknown')) return 'unknown' as const
      return 'partial' as const
    }
    return {
      watchLater: state('watch_later'),
      subscriptions: state('subscriptions'),
      catalog: 'not_configured' as const,
    }
  }

  private videoRow(row: Row, view: 'archive' | 'queue') {
    return {
      id: String(row.media_item_id),
      kind: 'video' as const,
      title: String(row.display_title),
      channelId: row.channel_id as string | null,
      channelTitle: row.display_channel_title as string | null,
      imageUrl: row.image_url as string | null,
      canonicalUrl: String(row.canonical_url),
      date: (row.reference_date ??
        (view === 'archive' ? row.latest_watched_at : row.latest_queue_added_at)) as string | null,
      publishedAt: row.published_at as string | null,
      durationMs: row.duration_ms as number | null,
      availability: String(row.availability_state),
      formats: row.source_format === 'youtube_music' ? ['youtube_music' as const] : [],
      inArchive: Number(row.archive_active) === 1,
      inQueue: Number(row.queue_active) === 1,
      watchCount: Number(row.watch_occurrence_count),
      matchingWatchCount: Number(row.matching_watch_count ?? row.watch_occurrence_count),
      watchAccountCount: Number(row.watch_account_count),
      matchingWatchAccountCount: Number(
        row.matching_watch_account_count ?? row.watch_account_count,
      ),
      queueAccountCount: Number(row.queue_account_count),
      matchingQueueCount: Number(row.matching_queue_count ?? row.queue_relationship_count),
      matchingQueueAccountCount: Number(
        row.matching_queue_account_count ?? row.queue_account_count,
      ),
      archiveVideoCount: 0,
      queueVideoCount: 0,
      following: false,
      subscriptionCount: 0,
    }
  }

  private channelRow(row: Row) {
    return {
      id: String(row.channel_id),
      kind: 'channel' as const,
      title: String(row.display_title),
      channelId: String(row.channel_id),
      channelTitle: null,
      imageUrl: row.image_url as string | null,
      canonicalUrl: String(row.canonical_url),
      date: row.latest_watched_at as string | null,
      publishedAt: null,
      durationMs: null,
      availability: 'not_configured' as const,
      formats: [],
      inArchive: false,
      inQueue: false,
      watchCount: Number(row.watch_occurrence_count),
      matchingWatchCount: Number(row.watch_occurrence_count),
      watchAccountCount: 0,
      matchingWatchAccountCount: 0,
      queueAccountCount: 0,
      matchingQueueCount: 0,
      matchingQueueAccountCount: 0,
      archiveVideoCount: Number(row.archive_video_count),
      queueVideoCount: Number(row.queue_video_count),
      following: Number(row.following_active) === 1,
      subscriptionCount: Number(row.subscription_count),
    }
  }

  async findVideo(id: string) {
    const row = await statement(
      this.database,
      'SELECT * FROM video_library_projection WHERE media_item_id=?',
      [id],
    ).first<Row>()
    if (row === null) return null
    const relationships = await statement(
      this.database,
      `SELECT c.label connection_label,q.added_at_value added_at FROM queue_entries q
       JOIN connections c ON c.id=q.connection_id WHERE q.media_item_id=?
         AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'
       ORDER BY q.added_at_value DESC,c.label`,
      [id],
    ).all<{ connection_label: string; added_at: string | null }>()
    return {
      ...this.videoRow(row, Number(row.archive_active) === 1 ? 'archive' : 'queue'),
      kind: 'video' as const,
      description: null,
      historyCount: Number(row.watch_occurrence_count),
      queueRelationships: relationships.results.map((value) => ({
        connectionLabel: value.connection_label,
        addedAt: value.added_at,
      })),
      metadataMessage: 'YouTube Data API metadata is not configured.',
    }
  }

  async findChannel(id: string) {
    const row = await statement(
      this.database,
      'SELECT * FROM video_channel_projection WHERE channel_id=? AND library_active=1',
      [id],
    ).first<Row>()
    if (row === null) return null
    const following = await statement(
      this.database,
      `SELECT c.label connection_label FROM youtube_channel_subscriptions s
       JOIN connections c ON c.id=s.connection_id WHERE s.channel_id=? AND s.upstream_state='active'
       ORDER BY c.label`,
      [id],
    ).all<{ connection_label: string }>()
    return {
      ...this.channelRow(row),
      kind: 'channel' as const,
      followingRelationships: following.results.map((value) => ({
        connectionLabel: value.connection_label,
      })),
      metadataMessage: 'YouTube Data API metadata is not configured.',
    }
  }

  async listHistory(id: string, limit: number, cursorValue?: string) {
    const key = JSON.stringify({ id, limit })
    const cursor = detailCursor(cursorValue, key)
    const generationRow = await statement(
      this.database,
      'SELECT COUNT(*) generation FROM youtube_watch_observations WHERE media_item_id=?',
      [id],
    ).first<{ generation: number }>()
    const generation = generationRow?.generation ?? 0
    if (cursor !== null && cursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const count = await statement(
      this.database,
      'SELECT COUNT(DISTINCT archive_entry_id) value FROM youtube_watch_observations WHERE media_item_id=?',
      [id],
    ).first<{ value: number }>()
    const page =
      cursor === null
        ? { sql: '1=1', values: [] as DatabaseValue[] }
        : {
            sql: '(occurred_at<? OR (occurred_at=? AND archive_entry_id>?))',
            values: [cursor.primary!, cursor.primary!, cursor.id] as DatabaseValue[],
          }
    const rows = await statement(
      this.database,
      `WITH ranked AS (
         SELECT w.*,ROW_NUMBER() OVER(PARTITION BY w.archive_entry_id
           ORDER BY r.acquired_at DESC,w.parser_version DESC,w.source_record_id DESC) position
         FROM youtube_watch_observations w
         JOIN source_records sr ON sr.id=w.source_record_id
         JOIN raw_objects r ON r.id=sr.raw_object_id
         WHERE w.media_item_id=?
       ), history AS (
         SELECT ranked.*,c.label connection_label FROM ranked
         JOIN connections c ON c.id=ranked.connection_id WHERE ranked.position=1
       ) SELECT archive_entry_id,occurred_at,connection_label,historical_title,
         historical_channel_title,product,source_video_url FROM history
       WHERE ${page.sql} ORDER BY occurred_at DESC,archive_entry_id LIMIT ?`,
      [id, ...page.values, limit + 1],
    ).all<Row>()
    const total = count?.value ?? 0
    const hasMore = rows.results.length > limit
    const visibleRows = rows.results.slice(0, limit)
    const last = visibleRows.at(-1)
    return {
      data: visibleRows.map((row) => ({
        id: String(row.archive_entry_id),
        occurredAt: String(row.occurred_at),
        connectionLabel: String(row.connection_label),
        historicalTitle: row.historical_title as string | null,
        historicalChannelTitle: row.historical_channel_title as string | null,
        product: String(row.product),
        sourceUrl: row.source_video_url as string | null,
      })),
      nextCursor:
        hasMore && last
          ? encodeDetailCursor({
              key,
              generation,
              primary: String(last.occurred_at),
              id: String(last.archive_entry_id),
            })
          : null,
      totalCount: total,
    }
  }

  async listChannelVideos(
    channelId: string,
    membership: 'archive' | 'queue',
    limit: number,
    cursorValue?: string,
  ) {
    const key = JSON.stringify({ channelId, membership, limit })
    const cursor = detailCursor(cursorValue, key)
    const column = membership === 'archive' ? 'archive_active' : 'queue_active'
    const date = membership === 'archive' ? 'latest_watched_at' : 'latest_queue_added_at'
    const generationRow = await statement(
      this.database,
      'SELECT COALESCE(MAX(projection_generation),0) generation FROM video_library_projection',
    ).first<{ generation: number }>()
    const generation = generationRow?.generation ?? 0
    if (cursor !== null && cursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const page =
      cursor === null
        ? { sql: '1=1', values: [] as DatabaseValue[] }
        : cursor.primary === null
          ? {
              sql: `${date} IS NULL AND media_item_id>?`,
              values: [cursor.id] as DatabaseValue[],
            }
          : {
              sql: `(${date} IS NULL OR ${date}<? OR (${date}=? AND media_item_id>?))`,
              values: [cursor.primary, cursor.primary, cursor.id] as DatabaseValue[],
            }
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM video_library_projection WHERE channel_id=? AND ${column}=1`,
      [channelId],
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `SELECT * FROM video_library_projection WHERE channel_id=? AND ${column}=1
       AND ${page.sql} ORDER BY (${date} IS NULL),${date} DESC,media_item_id LIMIT ?`,
      [channelId, ...page.values, limit + 1],
    ).all<Row>()
    const total = count?.value ?? 0
    const hasMore = rows.results.length > limit
    const visibleRows = rows.results.slice(0, limit)
    const last = visibleRows.at(-1)
    return {
      data: visibleRows.map((row) => this.videoRow(row, membership)),
      nextCursor:
        hasMore && last
          ? encodeDetailCursor({
              key,
              generation,
              primary: last[date] as string | null,
              id: String(last.media_item_id),
            })
          : null,
      totalCount: total,
    }
  }
}
