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

function offsetCursor(value: string | undefined, key: string): number {
  if (value === undefined) return 0
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as { offset?: unknown; key?: unknown }
    if (!Number.isInteger(parsed.offset) || (parsed.offset as number) < 0 || parsed.key !== key)
      throw new Error()
    return parsed.offset as number
  } catch {
    throw new TypeError('Invalid Videos pagination cursor')
  }
}

function nextOffsetCursor(offset: number, length: number, total: number, key: string) {
  return offset + length >= total
    ? null
    : encodeURIComponent(JSON.stringify({ offset: offset + length, key }))
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
  format?: readonly ('youtube' | 'youtube_music' | 'mixed' | 'unknown')[]
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
    const relationshipWrites: DatabaseStatement[] = []
    const completionWrites: DatabaseStatement[] = []
    for (const component of input.components) {
      completionWrites.push(
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
        relationshipWrites.push(
          statement(
            this.database,
            `INSERT INTO queue_entries(
               id,media_item_id,connection_id,source_membership_key,relationship_type,
               added_at_value,added_at_precision,added_at_basis,upstream_state,
               first_observed_at,last_observed_at,retired_observed_at,projection_version,
               created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(connection_id,source_membership_key) DO UPDATE SET
               media_item_id=excluded.media_item_id,relationship_type=excluded.relationship_type,
               added_at_value=excluded.added_at_value,added_at_precision=excluded.added_at_precision,
               added_at_basis=excluded.added_at_basis,upstream_state='active',
               last_observed_at=excluded.last_observed_at,retired_observed_at=NULL,
               projection_version=excluded.projection_version,updated_at=excluded.updated_at`,
            [
              value.queueEntryId,
              value.mediaItemId,
              input.connectionId,
              `watch-later:${value.videoId}`,
              'youtube_watch_later',
              value.addedAt,
              value.addedAt === null ? null : 'instant',
              value.addedAt === null ? null : 'source_asserted',
              'active',
              input.observedAt,
              input.observedAt,
              null,
              1,
              input.observedAt,
              input.observedAt,
            ],
          ),
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             VALUES(?,?,?,'membership',?)`,
            [
              value.membershipEvidenceId,
              value.queueEntryId,
              value.sourceRecordId,
              input.observedAt,
            ],
          ),
        )
        if (value.addedEvidenceId !== null && value.addedAt !== null)
          relationshipWrites.push(
            statement(
              this.database,
              `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
               VALUES(?,?,?,'added_time',?)`,
              [value.addedEvidenceId, value.queueEntryId, value.sourceRecordId, input.observedAt],
            ),
          )
      }
      completionWrites.push(
        statement(
          this.database,
          `UPDATE queue_entries SET upstream_state='removed',retired_observed_at=?,last_observed_at=?,updated_at=?
           WHERE connection_id=? AND relationship_type='youtube_watch_later' AND upstream_state='active'
             AND last_observed_at<>?`,
          [
            input.observedAt,
            input.observedAt,
            input.observedAt,
            input.connectionId,
            input.observedAt,
          ],
        ),
      )
      if (watchLater.snapshotSourceRecordId !== null) {
        completionWrites.push(
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             SELECT 'youtube_queue_removal_'||replace(q.id,'youtube_queue_','')||'_'||?,q.id,?,'removal',?
             FROM queue_entries q WHERE q.connection_id=? AND q.relationship_type='youtube_watch_later'
               AND q.retired_observed_at=?`,
            [
              input.rawObjectId,
              watchLater.snapshotSourceRecordId,
              input.observedAt,
              input.connectionId,
              input.observedAt,
            ],
          ),
        )
      }
    }

    const subscriptions = input.components.find((value) => value.kind === 'subscriptions')
    if (subscriptions?.status === 'complete') {
      for (const value of input.subscriptions) {
        relationshipWrites.push(
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
              value.channelTitle,
              value.channelUrl,
              input.observedAt,
              input.observedAt,
              input.observedAt,
            ],
          ),
          statement(
            this.database,
            `INSERT INTO youtube_channel_assertions(source_record_id,channel_id,connection_id,assertion_kind,title,url,observed_at)
             VALUES(?,?,?,'subscription',?,?,?) ON CONFLICT(source_record_id) DO UPDATE SET
               title=excluded.title,url=excluded.url,observed_at=excluded.observed_at`,
            [
              value.sourceRecordId,
              value.channelId,
              input.connectionId,
              value.channelTitle,
              value.channelUrl,
              input.observedAt,
            ],
          ),
          statement(
            this.database,
            `INSERT INTO youtube_channel_subscriptions(
               connection_id,channel_id,source_record_id,provider_subscription_id,channel_title,
               channel_url,subscribed_at,source_kind,upstream_state,first_observed_at,last_observed_at,
               retired_observed_at,parser_version,updated_at)
             VALUES(?,?,?,?,?,?,?,'takeout','active',?,?,NULL,?,?)
             ON CONFLICT(connection_id,channel_id) DO UPDATE SET
               source_record_id=excluded.source_record_id,channel_title=excluded.channel_title,
               channel_url=excluded.channel_url,source_kind='takeout',upstream_state='active',
               last_observed_at=excluded.last_observed_at,retired_observed_at=NULL,
               parser_version=excluded.parser_version,updated_at=excluded.updated_at`,
            [
              input.connectionId,
              value.channelId,
              value.sourceRecordId,
              null,
              value.channelTitle,
              value.channelUrl,
              null,
              input.observedAt,
              input.observedAt,
              input.parserVersion,
              input.observedAt,
            ],
          ),
        )
      }
      completionWrites.push(
        statement(
          this.database,
          `UPDATE youtube_channel_subscriptions SET upstream_state='removed',retired_observed_at=?,
             last_observed_at=?,updated_at=? WHERE connection_id=? AND source_kind='takeout'
             AND upstream_state='active' AND last_observed_at<>?`,
          [
            input.observedAt,
            input.observedAt,
            input.observedAt,
            input.connectionId,
            input.observedAt,
          ],
        ),
      )
    }
    // D1 enforces a batch-wide bind-variable ceiling. Relationship upserts are
    // idempotent, so commit them in bounded batches, then mark component
    // completion and retire absent relationships together only after every
    // current membership is durable.
    for (let offset = 0; offset < relationshipWrites.length; offset += 25)
      await this.database.batch(relationshipWrites.slice(offset, offset + 25))
    if (completionWrites.length > 0) await this.database.batch(completionWrites)
    await this.rebuild(input.observedAt)
  }

  async rebuild(at: string): Promise<void> {
    const generation = Date.parse(at)
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
           COALESCE((SELECT w.historical_title FROM youtube_watch_observations w
             WHERE w.media_item_id=m.id AND w.historical_title IS NOT NULL
             ORDER BY w.occurred_at DESC,w.source_record_id DESC LIMIT 1),m.title,'Untitled video'),
           LOWER(COALESCE((SELECT w.historical_title FROM youtube_watch_observations w
             WHERE w.media_item_id=m.id AND w.historical_title IS NOT NULL
             ORDER BY w.occurred_at DESC,w.source_record_id DESC LIMIT 1),m.title,'Untitled video')),
           (SELECT w.channel_id FROM youtube_watch_observations w WHERE w.media_item_id=m.id
             AND w.channel_id IS NOT NULL ORDER BY w.occurred_at DESC,w.source_record_id DESC LIMIT 1),
           (SELECT w.historical_channel_title FROM youtube_watch_observations w
             WHERE w.media_item_id=m.id AND w.historical_channel_title IS NOT NULL
             ORDER BY w.occurred_at DESC,w.source_record_id DESC LIMIT 1),
           LOWER((SELECT w.historical_channel_title FROM youtube_watch_observations w
             WHERE w.media_item_id=m.id AND w.historical_channel_title IS NOT NULL
             ORDER BY w.occurred_at DESC,w.source_record_id DESC LIMIT 1)),
           COALESCE(i.canonical_url,'https://www.youtube.com/watch?v='||i.external_id),
           NULL,NULL,NULL,'not_configured','not_configured',
           CASE
             WHEN EXISTS(SELECT 1 FROM youtube_watch_observations w WHERE w.media_item_id=m.id AND w.product='youtube')
              AND EXISTS(SELECT 1 FROM youtube_watch_observations w WHERE w.media_item_id=m.id AND w.product='youtube_music') THEN 'mixed'
             WHEN EXISTS(SELECT 1 FROM youtube_watch_observations w WHERE w.media_item_id=m.id AND w.product='youtube_music') THEN 'youtube_music'
             WHEN EXISTS(SELECT 1 FROM youtube_watch_observations w WHERE w.media_item_id=m.id AND w.product='youtube') THEN 'youtube'
             ELSE 'unknown' END,
           EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=m.id AND a.upstream_state='active'
             AND a.admission_reason='youtube_watched_activity'),
           (SELECT COUNT(*) FROM youtube_watch_observations w JOIN archive_entries a ON a.id=w.archive_entry_id
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
         SELECT c.channel_id,COALESCE(c.latest_title,'Channel unavailable'),
           LOWER(COALESCE(c.latest_title,'Channel unavailable')),
           COALESCE(c.latest_url,'https://www.youtube.com/channel/'||c.channel_id),NULL,1,
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
    if (input.format?.length) {
      clauses.push(`p.source_format IN (${placeholders(input.format)})`)
      values.push(...input.format)
    }
    if (input.overlap === 'overlap')
      clauses.push(input.view === 'archive' ? 'p.queue_active=1' : 'p.archive_active=1')
    if (input.overlap === 'not_overlap')
      clauses.push(input.view === 'archive' ? 'p.queue_active=0' : 'p.archive_active=0')
    if (input.watchCount === 'once') clauses.push('p.watch_occurrence_count=1')
    if (input.watchCount === 'rewatched') clauses.push('p.watch_occurrence_count>1')
    if (
      input.view === 'archive' &&
      (input.account?.length || input.watchedFrom || input.watchedTo)
    ) {
      const occurrence = ['w.media_item_id=p.media_item_id']
      if (input.account?.length) {
        occurrence.push(`w.connection_id IN (${placeholders(input.account)})`)
        values.push(...input.account)
      }
      if (input.watchedFrom) {
        occurrence.push('w.occurred_at>=?')
        values.push(input.watchedFrom)
      }
      if (input.watchedTo) {
        occurrence.push('w.occurred_at<=?')
        values.push(`${input.watchedTo}T23:59:59.999Z`)
      }
      clauses.push(
        `EXISTS(SELECT 1 FROM youtube_watch_observations w WHERE ${occurrence.join(' AND ')})`,
      )
    }
    if (input.view === 'queue' && (input.account?.length || input.addedFrom || input.addedTo)) {
      const relationship = [
        'q.media_item_id=p.media_item_id',
        "q.relationship_type='youtube_watch_later'",
        "q.upstream_state='active'",
      ]
      if (input.account?.length) {
        relationship.push(`q.connection_id IN (${placeholders(input.account)})`)
        values.push(...input.account)
      }
      if (input.addedFrom) {
        relationship.push('q.added_at_value>=?')
        values.push(input.addedFrom)
      }
      if (input.addedTo) {
        relationship.push('q.added_at_value<=?')
        values.push(`${input.addedTo}T23:59:59.999Z`)
      }
      clauses.push(`EXISTS(SELECT 1 FROM queue_entries q WHERE ${relationship.join(' AND ')})`)
    }
    return { where: clauses.join(' AND '), values }
  }

  private referenceDate(input: VideosListInput) {
    if (input.view === 'archive') {
      const clauses = ['w.media_item_id=p.media_item_id']
      const values: DatabaseValue[] = []
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
      return {
        sql: `(SELECT MAX(w.occurred_at) FROM youtube_watch_observations w WHERE ${clauses.join(' AND ')})`,
        values,
      }
    }
    const clauses = [
      'q.media_item_id=p.media_item_id',
      "q.relationship_type='youtube_watch_later'",
      "q.upstream_state='active'",
    ]
    const values: DatabaseValue[] = []
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
    return {
      sql: `(SELECT MAX(q.added_at_value) FROM queue_entries q WHERE ${clauses.join(' AND ')})`,
      values,
    }
  }

  async listVideos(input: VideosListInput) {
    const key = JSON.stringify({ ...input, cursor: undefined })
    const requestedCursor = collectionCursor(input.cursor, key)
    if (input.view === 'channels') return this.listChannels(input, requestedCursor, key)
    const { where, values } = this.videoClauses(input)
    const reference = this.referenceDate(input)
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
      `WITH filtered AS (
         SELECT p.*,${reference.sql} reference_date FROM video_library_projection p WHERE ${where}
       ), ordered AS (
         SELECT filtered.*,${order} sort_value,normalized_title stable_title,media_item_id stable_id
         FROM filtered
       ) SELECT * FROM ordered WHERE ${page.sql}
       ORDER BY (sort_value IS NULL),sort_value ${direction.toUpperCase()},normalized_title,stable_id
       LIMIT ?`,
      [...reference.values, ...values, ...orderValues, ...page.values, input.limit + 1],
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
      ...(await this.sharedEnvelope(input.view, where, values)),
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
  ) {
    const counts = await statement(
      this.database,
      `SELECT (SELECT COUNT(*) FROM video_library_projection WHERE archive_active=1) archive,
        (SELECT COUNT(*) FROM video_library_projection WHERE queue_active=1) queue,
        (SELECT COUNT(*) FROM video_channel_projection WHERE library_active=1) channels,
        (SELECT COUNT(*) FROM youtube_watch_observations) occurrences`,
    ).first<{ archive: number; queue: number; channels: number; occurrences: number }>()
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
      occurrenceCount: counts?.occurrences ?? 0,
      facets: { accounts: [...accounts.results], channels: [...channels.results] },
      coverage,
    }
  }

  private async coverage() {
    const rows = await statement(
      this.database,
      `WITH ranked AS (
         SELECT c.component_kind,c.status,
           ROW_NUMBER() OVER(PARTITION BY c.connection_id,c.component_kind
             ORDER BY r.acquired_at DESC,r.id DESC) position
         FROM youtube_takeout_components c JOIN raw_objects r ON r.id=c.raw_object_id
         WHERE c.component_kind IN ('watch_later','subscriptions')
       ) SELECT component_kind,status FROM ranked WHERE position=1 ORDER BY component_kind`,
    ).all<{ component_kind: string; status: string }>()
    const state = (kind: string) => {
      const matches = rows.results.filter((row) => row.component_kind === kind)
      if (matches.length === 0) return 'unknown' as const
      if (matches.some((row) => row.status === 'invalid')) return 'invalid' as const
      if (matches.some((row) => row.status === 'complete')) return 'complete' as const
      return 'missing' as const
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
      format: String(row.source_format),
      inArchive: Number(row.archive_active) === 1,
      inQueue: Number(row.queue_active) === 1,
      watchCount: Number(row.watch_occurrence_count),
      watchAccountCount: Number(row.watch_account_count),
      queueAccountCount: Number(row.queue_account_count),
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
      format: null,
      inArchive: false,
      inQueue: false,
      watchCount: Number(row.watch_occurrence_count),
      watchAccountCount: 0,
      queueAccountCount: 0,
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
    const offset = offsetCursor(cursorValue, key)
    const count = await statement(
      this.database,
      'SELECT COUNT(*) value FROM youtube_watch_observations WHERE media_item_id=?',
      [id],
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `SELECT w.archive_entry_id,w.occurred_at,c.label connection_label,w.historical_title,
         w.historical_channel_title,w.product,w.source_video_url
       FROM youtube_watch_observations w JOIN connections c ON c.id=w.connection_id
       WHERE w.media_item_id=? ORDER BY w.occurred_at DESC,w.archive_entry_id LIMIT ? OFFSET ?`,
      [id, limit, offset],
    ).all<Row>()
    const total = count?.value ?? 0
    return {
      data: rows.results.map((row) => ({
        id: String(row.archive_entry_id),
        occurredAt: String(row.occurred_at),
        connectionLabel: String(row.connection_label),
        historicalTitle: row.historical_title as string | null,
        historicalChannelTitle: row.historical_channel_title as string | null,
        product: String(row.product),
        sourceUrl: row.source_video_url as string | null,
      })),
      nextCursor: nextOffsetCursor(offset, rows.results.length, total, key),
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
    const offset = offsetCursor(cursorValue, key)
    const column = membership === 'archive' ? 'archive_active' : 'queue_active'
    const date = membership === 'archive' ? 'latest_watched_at' : 'latest_queue_added_at'
    const count = await statement(
      this.database,
      `SELECT COUNT(*) value FROM video_library_projection WHERE channel_id=? AND ${column}=1`,
      [channelId],
    ).first<{ value: number }>()
    const rows = await statement(
      this.database,
      `SELECT * FROM video_library_projection WHERE channel_id=? AND ${column}=1
       ORDER BY (${date} IS NULL),${date} DESC,media_item_id LIMIT ? OFFSET ?`,
      [channelId, limit, offset],
    ).all<Row>()
    const total = count?.value ?? 0
    return {
      data: rows.results.map((row) => this.videoRow(row, membership)),
      nextCursor: nextOffsetCursor(offset, rows.results.length, total, key),
      totalCount: total,
    }
  }
}
