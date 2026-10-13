import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

function statement(database: DatabaseClient, query: string, values: readonly DatabaseValue[] = []) {
  return database.prepare(query).bind(...values)
}

const publishedCatalogTables = [
  [
    'youtube_video_catalog_profiles',
    'youtube_published_video_profiles',
    'media_item_id,video_id,lookup_state,current_title,description,channel_id,channel_title,published_at,duration_ms,category_id,tags_json,caption_available,definition,projection,live_broadcast_content,actual_start_at,actual_end_at,fetched_at,checked_at,expires_at',
  ],
  [
    'youtube_channel_catalog_profiles',
    'youtube_published_channel_profiles',
    'channel_id,current_title,description,custom_url,country,thumbnail_url,fetched_at,checked_at,expires_at',
  ],
  [
    'youtube_categories',
    'youtube_published_categories',
    'category_id,region_code,title,fetched_at,expires_at',
  ],
  [
    'youtube_video_thumbnails',
    'youtube_published_thumbnails',
    'video_id,variant,url,width,height,fetched_at,expires_at',
  ],
] as const

const youtubeSearchRebuildSql = [
  `DELETE FROM video_search`,
  `INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,
   COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_title) FROM youtube_watch_observations w WHERE w.media_item_id=p.media_item_id),p.display_title),
   COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_channel_title) FROM youtube_watch_observations w WHERE w.media_item_id=p.media_item_id),p.display_channel_title,''),
   'owner',p.media_item_id,NULL FROM video_library_projection p`,
  `INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,COALESCE(v.current_title,'')||' '||COALESCE(v.description,'')||' '||COALESCE(v.tags_json,''),
 COALESCE(v.channel_title,''),'video',v.media_item_id,v.expires_at
 FROM video_library_projection p JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id`,
  `INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT DISTINCT p.media_item_id,'',c.current_title||' '||COALESCE(c.custom_url,''),'channel',c.channel_id,CASE WHEN c.channel_id=p.channel_id THEN c.expires_at ELSE MIN(c.expires_at,v.expires_at) END
 FROM video_library_projection p LEFT JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id
 JOIN youtube_published_channel_profiles c ON c.channel_id=p.channel_id OR c.channel_id=v.channel_id`,
  `INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,c.title,'','category',c.category_id,MIN(c.expires_at,v.expires_at)
 FROM video_library_projection p JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id
 JOIN youtube_published_categories c ON c.category_id=v.category_id AND c.region_code='US'`,
  `DELETE FROM video_channel_search`,
  `INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT p.channel_id,COALESCE((SELECT GROUP_CONCAT(DISTINCT a.title) FROM youtube_channel_assertions a WHERE a.channel_id=p.channel_id),p.display_title),
 'owner',p.channel_id,NULL FROM video_channel_projection p`,
  `INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT c.channel_id,c.current_title||' '||COALESCE(c.custom_url,'')||' '||COALESCE(c.description,''),
 'channel',c.channel_id,c.expires_at FROM youtube_published_channel_profiles c`,
  `INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT v.channel_id,COALESCE(v.channel_title,''),'video',v.media_item_id,v.expires_at
 FROM youtube_published_video_profiles v WHERE v.channel_id IS NOT NULL`,
  `DELETE FROM youtube_search_expiry`,
  `INSERT INTO youtube_search_expiry(document_kind,document_rowid,expires_at)
    SELECT 'video',rowid,expires_at FROM video_search WHERE expires_at IS NOT NULL`,
  `INSERT INTO youtube_search_expiry(document_kind,document_rowid,expires_at)
    SELECT 'channel',rowid,expires_at FROM video_channel_search WHERE expires_at IS NOT NULL`,
] as const

const youtubeChannelAggregateSql = `INSERT INTO youtube_published_channel_aggregates(
 channel_id,channel_title,archive_video_count,watch_occurrence_count,latest_watched_at,queue_video_count,projection_generation,updated_at,expires_at)
 SELECT COALESCE(v.channel_id,p.channel_id),MAX(COALESCE(v.channel_title,p.display_channel_title)),
 SUM(p.archive_active),SUM(p.watch_occurrence_count),MAX(p.latest_watched_at),SUM(p.queue_active),MAX(p.projection_generation),MAX(p.updated_at),
 (SELECT MIN(expires_at) FROM youtube_published_video_profiles WHERE channel_id IS NOT NULL AND expires_at>?)
 FROM video_library_projection p LEFT JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id AND v.expires_at>?
 WHERE COALESCE(v.channel_id,p.channel_id) IS NOT NULL AND (p.archive_active=1 OR p.queue_active=1)
 AND EXISTS(SELECT 1 FROM youtube_published_video_profiles WHERE channel_id IS NOT NULL AND expires_at>?)
 GROUP BY COALESCE(v.channel_id,p.channel_id)`

interface DetailCursor {
  key: string
  generation: number | string
  primary: string | null
  id: string
}

function detailCursor(value: string | undefined, key: string): DetailCursor | null {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<DetailCursor>
    if (
      parsed.key !== key ||
      !(
        Number.isInteger(parsed.generation) ||
        (typeof parsed.generation === 'string' &&
          /^\d+:\d+:(?:none|[\dTZ:.-]+)$/.test(parsed.generation) &&
          parsed.generation.length < 80)
      ) ||
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
  generation: number | string
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
      !(
        Number.isInteger(parsed.generation) ||
        (typeof parsed.generation === 'string' &&
          /^\d+:\d+:(?:none|[\dTZ:.-]+)$/.test(parsed.generation) &&
          parsed.generation.length < 80)
      ) ||
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

function liveSearchPredicate(
  table: 'video_search' | 'video_channel_search',
  id: string,
  query: string,
) {
  const tokens = (query.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 12)
  const values: DatabaseValue[] = []
  const predicates = tokens.map((token) => {
    values.push(`"${token}"*`)
    return `${id} IN (SELECT s.${table === 'video_search' ? 'media_item_id' : 'channel_id'}
      FROM ${table} s ${table === 'video_search' ? 'JOIN video_library_projection eligible ON eligible.media_item_id=s.media_item_id' : ''}
      WHERE ${table} MATCH ?
      AND (s.expires_at IS NULL OR s.expires_at>(SELECT at FROM read_clock))
      ${table === 'video_search' ? "AND (s.origin_kind<>'channel' OR s.origin_key=eligible.channel_id)" : ''})`
  })
  return { sql: predicates.length ? predicates.join(' AND ') : '0=1', values }
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
  watchedUnknown?: boolean
  addedFrom?: string
  addedTo?: string
  addedUnknown?: boolean
  published?: 'all' | 'range' | 'unknown'
  publishedFrom?: string
  publishedTo?: string
  duration?: 'any' | 'under5' | '5to19' | '20to59' | '60plus'
  durationUnknown?: boolean
  watchCount?: 'all' | 'once' | 'rewatched'
  overlap?: 'all' | 'overlap' | 'not_overlap'
  format?: readonly (
    'live' | 'upcoming' | 'recorded_live' | 'youtube_music' | 'shorts' | 'premiere'
  )[]
  availability?: 'any' | 'available' | 'unavailable' | 'unchecked'
  category?: readonly string[]
  sort?: string
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export interface YoutubeCatalogCandidate {
  mediaItemId: string
  videoId: string
}

export interface YoutubeVideoCatalogProjection {
  mediaItemId: string
  videoId: string
  title: string
  description: string
  channelId: string | null
  channelTitle: string | null
  publishedAt: string | null
  durationMs: number | null
  categoryId: string | null
  tags: readonly string[]
  captionAvailable: boolean | null
  definition: string | null
  projection: string | null
  privacyStatus: string | null
  uploadStatus: string | null
  embeddable: boolean | null
  madeForKids: boolean | null
  regionRestriction: unknown
  liveBroadcastContent: string | null
  scheduledStartAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  thumbnails: Readonly<Record<string, { url: string; width: number | null; height: number | null }>>
  fetchedAt: string
  expiresAt: string
  etag: string | null
}

export interface YoutubeChannelCatalogProjection {
  channelId: string
  title: string
  description: string
  customUrl: string | null
  publishedAt: string | null
  country: string | null
  thumbnailUrl: string | null
  fetchedAt: string
  expiresAt: string
  etag: string | null
}

export interface YoutubeCategoryProjection {
  categoryId: string
  regionCode: string
  title: string
  assignable: boolean
  fetchedAt: string
  expiresAt: string
}

type Row = Record<string, null | number | string>

export class SqlVideosRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private readStatement(query: string, values: readonly DatabaseValue[] = [], at = this.clock()) {
    const ctes = `read_clock(at) AS (VALUES (?)),
      read_generation(revision,deadline) AS (
        SELECT (SELECT revision FROM youtube_publication_state WHERE singleton_id=1),
          COALESCE((SELECT MIN(deadline) FROM (
            SELECT MIN(expires_at) deadline FROM youtube_published_video_profiles WHERE expires_at>(SELECT at FROM read_clock)
            UNION ALL SELECT MIN(expires_at) FROM youtube_published_channel_profiles WHERE expires_at>(SELECT at FROM read_clock)
            UNION ALL SELECT MIN(expires_at) FROM youtube_published_categories WHERE expires_at>(SELECT at FROM read_clock)
            UNION ALL SELECT MIN(expires_at) FROM youtube_published_thumbnails WHERE expires_at>(SELECT at FROM read_clock)
          )),'none')
      ),
      read_channel_mode(mode) AS (
        SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM youtube_published_video_profiles
          WHERE channel_id IS NOT NULL AND expires_at>(SELECT at FROM read_clock)) THEN 'owner'
          WHEN (SELECT association_revision=channel_aggregate_revision FROM youtube_publication_state WHERE singleton_id=1)
            AND EXISTS(SELECT 1 FROM youtube_published_channel_aggregates WHERE expires_at>(SELECT at FROM read_clock)) THEN 'published'
          ELSE 'dynamic' END
      ),
      video_library_projection AS NOT MATERIALIZED (
        SELECT p.media_item_id,p.video_id,
          COALESCE(vp.current_title,p.display_title) display_title,
          LOWER(COALESCE(vp.current_title,p.display_title)) normalized_title,
          COALESCE(vp.channel_id,p.channel_id) channel_id,
          COALESCE(cp.current_title,vp.channel_title,p.display_channel_title) display_channel_title,
          LOWER(COALESCE(cp.current_title,vp.channel_title,p.display_channel_title)) normalized_channel_title,
          p.canonical_url,
          (SELECT t.url FROM youtube_published_thumbnails t WHERE t.video_id=p.video_id
            AND t.expires_at>(SELECT at FROM read_clock)
            ORDER BY CASE t.variant WHEN 'medium' THEN 0 WHEN 'high' THEN 1
              WHEN 'standard' THEN 2 WHEN 'maxres' THEN 3 WHEN 'default' THEN 4 ELSE 5 END,
              COALESCE(t.width,0)*COALESCE(t.height,0) DESC LIMIT 1) image_url,
          vp.published_at,vp.duration_ms,
          CASE WHEN vp.lookup_state='current' THEN 'available'
            WHEN vp.lookup_state='unavailable' THEN 'unavailable'
            WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state IN ('pending','running')) THEN 'pending'
            WHEN EXISTS(SELECT 1 FROM youtube_published_video_profiles WHERE media_item_id=p.media_item_id)
              OR EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state='succeeded') THEN 'stale'
            WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state='failed') THEN 'error'
            ELSE 'not_configured' END availability_state,
          CASE WHEN vp.lookup_state='current' THEN 'current'
            WHEN vp.lookup_state='error' THEN 'error'
            WHEN EXISTS(SELECT 1 FROM youtube_published_video_profiles WHERE media_item_id=p.media_item_id)
              OR EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state='succeeded') THEN 'stale'
            WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state='failed') THEN 'error'
            ELSE 'not_configured' END metadata_state,
          p.source_format,p.archive_active,p.watch_occurrence_count,p.watch_account_count,
          p.latest_watched_at,p.queue_active,p.queue_relationship_count,p.queue_account_count,
          p.latest_queue_added_at,
          CAST(p.projection_generation AS TEXT)||':'||(SELECT revision FROM read_generation)||':'||(SELECT deadline FROM read_generation) projection_generation,p.updated_at,
          CASE WHEN category.category_id IS NOT NULL THEN vp.category_id END category_id,
          category.title category_title,vp.caption_available,vp.definition,
          vp.projection projection_kind,
          CASE WHEN vp.live_broadcast_content='live' THEN 'live'
            WHEN vp.live_broadcast_content='upcoming' THEN 'upcoming'
            WHEN vp.actual_start_at IS NOT NULL AND vp.actual_end_at IS NOT NULL THEN 'recorded_live' END live_state,
          vp.checked_at catalog_checked_at,vp.expires_at catalog_expires_at
        FROM main.video_library_projection p
        LEFT JOIN youtube_published_video_profiles vp ON vp.media_item_id=p.media_item_id
          AND vp.expires_at>(SELECT at FROM read_clock)
        LEFT JOIN youtube_published_channel_profiles cp ON cp.channel_id=COALESCE(vp.channel_id,p.channel_id)
          AND cp.expires_at>(SELECT at FROM read_clock)
        LEFT JOIN youtube_published_categories category ON category.category_id=vp.category_id AND category.region_code='US'
          AND category.expires_at>(SELECT at FROM read_clock)
      ),
      video_channel_groups AS (
SELECT COALESCE(vp.channel_id,p.channel_id) channel_id,
          SUM(p.archive_active) archive_video_count,
          SUM(p.watch_occurrence_count) watch_occurrence_count,MAX(p.latest_watched_at) latest_watched_at,
          SUM(p.queue_active) queue_video_count,MAX(p.projection_generation) projection_generation,
          MAX(p.updated_at) updated_at,MAX(COALESCE(vp.channel_title,p.display_channel_title)) channel_title
          FROM main.video_library_projection p
          LEFT JOIN youtube_published_video_profiles vp ON vp.media_item_id=p.media_item_id
            AND vp.expires_at>(SELECT at FROM read_clock)
          WHERE (SELECT mode FROM read_channel_mode)='dynamic' AND COALESCE(vp.channel_id,p.channel_id) IS NOT NULL AND (p.archive_active=1 OR p.queue_active=1)
          GROUP BY COALESCE(vp.channel_id,p.channel_id) UNION ALL
          SELECT channel_id,archive_video_count,watch_occurrence_count,latest_watched_at,
            queue_video_count,projection_generation,updated_at,display_title
          FROM main.video_channel_projection
          WHERE (SELECT mode FROM read_channel_mode)='owner' AND (archive_video_count>0 OR queue_video_count>0)
          UNION ALL SELECT channel_id,archive_video_count,watch_occurrence_count,latest_watched_at,
            queue_video_count,projection_generation,updated_at,channel_title
          FROM youtube_published_channel_aggregates WHERE (SELECT mode FROM read_channel_mode)='published'

      ),
      video_channel_projection AS NOT MATERIALIZED (
        SELECT grouped.channel_id,
          COALESCE(cp.current_title,grouped.channel_title,owner.display_title,'Channel unavailable') display_title,
          LOWER(COALESCE(cp.current_title,grouped.channel_title,owner.display_title,'Channel unavailable')) normalized_title,
          COALESCE(CASE WHEN cp.custom_url IS NOT NULL THEN 'https://www.youtube.com/'||cp.custom_url END,
            owner.canonical_url,'https://www.youtube.com/channel/'||grouped.channel_id) canonical_url,
          cp.thumbnail_url image_url,1 library_active,
          EXISTS(SELECT 1 FROM youtube_channel_subscriptions s WHERE s.channel_id=grouped.channel_id AND s.upstream_state='active') following_active,
          (SELECT COUNT(*) FROM youtube_channel_subscriptions s WHERE s.channel_id=grouped.channel_id AND s.upstream_state='active') subscription_count,
          grouped.archive_video_count,grouped.watch_occurrence_count,grouped.latest_watched_at,
          grouped.queue_video_count,CAST(grouped.projection_generation AS TEXT)||':'||(SELECT revision FROM read_generation)||':'||(SELECT deadline FROM read_generation) projection_generation,grouped.updated_at
        FROM video_channel_groups grouped
        LEFT JOIN main.video_channel_projection owner ON owner.channel_id=grouped.channel_id
        LEFT JOIN youtube_published_channel_profiles cp ON cp.channel_id=grouped.channel_id
          AND cp.expires_at>(SELECT at FROM read_clock)
      )`
    let publishedQuery = query
    for (const [staged, published] of publishedCatalogTables)
      publishedQuery = publishedQuery.replaceAll(staged, published)
    const sql = publishedQuery.trimStart().startsWith('WITH ')
      ? `WITH ${ctes}, ${publishedQuery.trimStart().slice(5)}`
      : `WITH ${ctes} ${publishedQuery}`
    return statement(this.database, sql, [at, ...values])
  }

  private searchRebuildStatements(): DatabaseStatement[] {
    return youtubeSearchRebuildSql.map((sql) => statement(this.database, sql))
  }

  private async publicationStatements(): Promise<DatabaseStatement[]> {
    const latest = await statement(
      this.database,
      "SELECT id,state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1",
    ).first<{ id: string; state: string }>()
    if (latest && latest.state !== 'succeeded') return []
    const published = await statement(
      this.database,
      'SELECT last_published_job_id FROM youtube_publication_state WHERE singleton_id=1',
    ).first<{ last_published_job_id: string | null }>()
    if (latest && published?.last_published_job_id === latest.id) return []
    // Every statement pins the completed job again inside the transaction. A
    // newer job can stage and fail between the initial read and this batch.
    const guard = latest
      ? "NOT EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state IN ('pending','running')) AND (SELECT id FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1)=? AND (SELECT state FROM catalog_refresh_jobs WHERE id=?)='succeeded'"
      : "NOT EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube')"
    const guardValues: DatabaseValue[] = latest ? [latest.id, latest.id] : []
    const writes = publishedCatalogTables.flatMap(([staged, published, columns]) => [
      statement(this.database, `DELETE FROM ${published} WHERE ${guard}`, guardValues),
      statement(
        this.database,
        `INSERT INTO ${published}(${columns}) SELECT ${columns} FROM ${staged} WHERE ${guard}`,
        guardValues,
      ),
    ])
    writes.push(
      statement(
        this.database,
        `UPDATE youtube_publication_state SET revision=revision+1,association_revision=association_revision+1,last_published_job_id=? WHERE singleton_id=1 AND ${guard}`,
        [latest?.id ?? null, ...guardValues],
      ),
    )
    return writes
  }

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
    const publication = await this.publicationStatements()
    await this.database.batch([
      ...publication,
      statement(this.database, 'DELETE FROM video_library_projection'),
      statement(
        this.database,
        `INSERT INTO video_library_projection(
           media_item_id,video_id,display_title,normalized_title,channel_id,
           display_channel_title,normalized_channel_title,canonical_url,image_url,
           published_at,duration_ms,availability_state,metadata_state,source_format,
           archive_active,watch_occurrence_count,watch_account_count,latest_watched_at,
           queue_active,queue_relationship_count,queue_account_count,latest_queue_added_at,
           projection_generation,updated_at,category_id,category_title,caption_available,
           definition,projection_kind,live_state,catalog_checked_at,catalog_expires_at)
         SELECT m.id,i.external_id,
           COALESCE(vp.current_title,${latestVideoTitle},m.title,'Untitled video'),
           LOWER(COALESCE(vp.current_title,${latestVideoTitle},m.title,'Untitled video')),
           COALESCE(vp.channel_id,${latestChannelId}),
           COALESCE(cp.current_title,vp.channel_title,${latestVideoChannelTitle}),
           LOWER(COALESCE(cp.current_title,vp.channel_title,${latestVideoChannelTitle})),
           COALESCE(i.canonical_url,'https://www.youtube.com/watch?v='||i.external_id),
           (SELECT t.url FROM youtube_video_thumbnails t WHERE t.video_id=i.external_id AND 0
             ORDER BY CASE t.variant
               WHEN 'medium' THEN 0 WHEN 'high' THEN 1 WHEN 'standard' THEN 2
               WHEN 'maxres' THEN 3 WHEN 'default' THEN 4 ELSE 5 END,
               COALESCE(t.width,0)*COALESCE(t.height,0) DESC LIMIT 1),
           vp.published_at,vp.duration_ms,
           CASE WHEN vp.lookup_state='current' THEN 'available'
             WHEN vp.lookup_state='unavailable' THEN 'unavailable'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state IN ('pending','running')) THEN 'pending'
             WHEN EXISTS(SELECT 1 FROM youtube_video_catalog_profiles historical WHERE historical.media_item_id=m.id) THEN 'stale'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state='succeeded') THEN 'stale'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state='failed') THEN 'error'
             ELSE 'not_configured' END,
           CASE WHEN vp.lookup_state='current' THEN 'current'
             WHEN vp.lookup_state='error' THEN 'error'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state IN ('pending','running')) THEN 'missing'
             WHEN EXISTS(SELECT 1 FROM youtube_video_catalog_profiles historical WHERE historical.media_item_id=m.id) THEN 'stale'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state='succeeded') THEN 'stale'
             WHEN EXISTS(SELECT 1 FROM catalog_refresh_jobs j WHERE j.provider='youtube' AND j.state='failed') THEN 'error'
             ELSE 'not_configured' END,
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
           ?,?,vp.category_id,category.title,vp.caption_available,vp.definition,vp.projection,
           CASE WHEN vp.live_broadcast_content='live' THEN 'live'
             WHEN vp.live_broadcast_content='upcoming' THEN 'upcoming'
             WHEN vp.actual_start_at IS NOT NULL AND vp.actual_end_at IS NOT NULL THEN 'recorded_live'
             ELSE NULL END,
           vp.checked_at,vp.expires_at
         FROM media_items m JOIN external_identities i ON i.media_item_id=m.id
         LEFT JOIN youtube_video_catalog_profiles vp ON vp.media_item_id=m.id AND vp.expires_at>? AND 0
         LEFT JOIN youtube_channel_catalog_profiles cp ON cp.channel_id=COALESCE(vp.channel_id,${latestChannelId}) AND cp.expires_at>? AND 0
         LEFT JOIN youtube_categories category ON category.category_id=vp.category_id
           AND category.region_code='US' AND category.expires_at>? AND 0
         WHERE m.type='video' AND i.namespace='youtube' AND i.external_type='video_id'
           AND i.scope='global' AND i.retired_at IS NULL
           AND (EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=m.id AND a.upstream_state='active'
                 AND a.admission_reason='youtube_watched_activity')
             OR EXISTS(SELECT 1 FROM queue_entries q WHERE q.media_item_id=m.id
                 AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'))`,
        [generation, at, at, at, at],
      ),
      statement(this.database, 'DELETE FROM video_channel_projection'),
      statement(
        this.database,
        `INSERT INTO video_channel_projection(
           channel_id,display_title,normalized_title,canonical_url,image_url,library_active,
           following_active,subscription_count,archive_video_count,watch_occurrence_count,
           latest_watched_at,queue_video_count,projection_generation,updated_at)
         SELECT c.channel_id,
           COALESCE(cp.current_title,${latestChannelTitle},'Channel unavailable'),
           LOWER(COALESCE(cp.current_title,${latestChannelTitle},'Channel unavailable')),
           COALESCE(CASE WHEN cp.custom_url IS NOT NULL THEN 'https://www.youtube.com/'||cp.custom_url END,
             ${latestChannelUrl},'https://www.youtube.com/channel/'||c.channel_id),
           cp.thumbnail_url,1,
           EXISTS(SELECT 1 FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
           (SELECT COUNT(*) FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
           (SELECT COUNT(*) FROM video_library_projection p WHERE p.channel_id=c.channel_id AND p.archive_active=1),
           (SELECT COALESCE(SUM(p.watch_occurrence_count),0) FROM video_library_projection p WHERE p.channel_id=c.channel_id),
           (SELECT MAX(p.latest_watched_at) FROM video_library_projection p WHERE p.channel_id=c.channel_id),
           (SELECT COUNT(*) FROM video_library_projection p WHERE p.channel_id=c.channel_id AND p.queue_active=1),
           ?,? FROM youtube_channels c
         LEFT JOIN youtube_channel_catalog_profiles cp ON cp.channel_id=c.channel_id AND cp.expires_at>? AND 0
         WHERE EXISTS(SELECT 1 FROM video_library_projection p WHERE p.channel_id=c.channel_id
           AND (p.archive_active=1 OR p.queue_active=1))`,
        [generation, at, at],
      ),
      statement(this.database, 'DELETE FROM youtube_published_channel_aggregates'),
      statement(this.database, youtubeChannelAggregateSql, [at, at, at]),
      statement(
        this.database,
        'UPDATE youtube_publication_state SET channel_aggregate_revision=association_revision WHERE singleton_id=1',
      ),
      ...this.searchRebuildStatements(),
    ])
  }

  async listYoutubeCatalogCandidates(input: {
    afterMediaItemId?: string
    at: string
    limit: number
  }): Promise<YoutubeCatalogCandidate[]> {
    const rows = await statement(
      this.database,
      `SELECT p.media_item_id,p.video_id FROM video_library_projection p
       LEFT JOIN youtube_video_catalog_profiles profile ON profile.media_item_id=p.media_item_id
       WHERE p.media_item_id>? AND (profile.media_item_id IS NULL OR profile.expires_at<=?)
       ORDER BY p.media_item_id LIMIT ?`,
      [input.afterMediaItemId ?? '', input.at, input.limit],
    ).all<{ media_item_id: string; video_id: string }>()
    return rows.results.map((row) => ({ mediaItemId: row.media_item_id, videoId: row.video_id }))
  }

  async applyYoutubeCatalogBatch(input: {
    jobId: string
    at: string
    expiresAt: string
    requested: readonly YoutubeCatalogCandidate[]
    videos: readonly YoutubeVideoCatalogProjection[]
    channels: readonly YoutubeChannelCatalogProjection[]
    categories: readonly YoutubeCategoryProjection[]
  }): Promise<void> {
    const returned = new Map(input.videos.map((video) => [video.videoId, video]))
    const writes: DatabaseStatement[] = []
    for (const channel of input.channels) {
      writes.push(
        statement(
          this.database,
          `INSERT INTO youtube_channels(channel_id,latest_title,latest_url,first_observed_at,last_observed_at,updated_at)
           VALUES(?,?,?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET
             last_observed_at=excluded.last_observed_at,
             updated_at=excluded.updated_at`,
          [
            channel.channelId,
            null,
            `https://www.youtube.com/channel/${channel.channelId}`,
            input.at,
            input.at,
            input.at,
          ],
        ),
        statement(
          this.database,
          `INSERT INTO youtube_channel_catalog_profiles(channel_id,current_title,description,
             custom_url,published_at,country,thumbnail_url,fetched_at,checked_at,expires_at,etag)
           VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET
             current_title=excluded.current_title,description=excluded.description,
             custom_url=excluded.custom_url,published_at=excluded.published_at,country=excluded.country,
             thumbnail_url=excluded.thumbnail_url,fetched_at=excluded.fetched_at,
             checked_at=excluded.checked_at,expires_at=excluded.expires_at,etag=excluded.etag`,
          [
            channel.channelId,
            channel.title,
            channel.description,
            channel.customUrl,
            channel.publishedAt,
            channel.country,
            channel.thumbnailUrl,
            channel.fetchedAt,
            channel.fetchedAt,
            channel.expiresAt,
            channel.etag,
          ],
        ),
      )
    }
    for (const category of input.categories) {
      writes.push(
        statement(
          this.database,
          `INSERT INTO youtube_categories(category_id,region_code,title,assignable,fetched_at,expires_at)
         VALUES(?,?,?,?,?,?) ON CONFLICT(category_id,region_code) DO UPDATE SET
           title=excluded.title,assignable=excluded.assignable,fetched_at=excluded.fetched_at,
           expires_at=excluded.expires_at`,
          [
            category.categoryId,
            category.regionCode,
            category.title,
            category.assignable ? 1 : 0,
            category.fetchedAt,
            category.expiresAt,
          ],
        ),
      )
    }
    for (const candidate of input.requested) {
      const video = returned.get(candidate.videoId)
      writes.push(
        statement(
          this.database,
          `INSERT INTO youtube_catalog_request_outcomes(job_id,video_id,outcome,checked_at,expires_at)
         VALUES(?,?,?,?,?) ON CONFLICT(job_id,video_id) DO UPDATE SET
           outcome=excluded.outcome,checked_at=excluded.checked_at,expires_at=excluded.expires_at`,
          [
            input.jobId,
            candidate.videoId,
            video === undefined ? 'omitted' : 'returned',
            input.at,
            input.expiresAt,
          ],
        ),
      )
      if (video === undefined) {
        writes.push(
          statement(
            this.database,
            `INSERT INTO youtube_video_catalog_profiles(media_item_id,video_id,lookup_state,
             fetched_at,checked_at,expires_at,safe_error_code)
           VALUES(?,?,'unavailable',?,?,?,NULL) ON CONFLICT(media_item_id) DO UPDATE SET
             video_id=excluded.video_id,lookup_state='unavailable',checked_at=excluded.checked_at,
             expires_at=excluded.expires_at,fetched_at=excluded.fetched_at,safe_error_code=NULL,current_title=NULL,description=NULL,channel_id=NULL,channel_title=NULL,published_at=NULL,duration_ms=NULL,category_id=NULL,tags_json=NULL,caption_available=NULL,definition=NULL,projection=NULL,privacy_status=NULL,upload_status=NULL,embeddable=NULL,made_for_kids=NULL,region_restriction_json=NULL,live_broadcast_content=NULL,scheduled_start_at=NULL,actual_start_at=NULL,actual_end_at=NULL,etag=NULL`,
            [candidate.mediaItemId, candidate.videoId, input.at, input.at, input.expiresAt],
          ),
        )
        writes.push(
          statement(this.database, 'DELETE FROM youtube_video_thumbnails WHERE video_id=?', [
            candidate.videoId,
          ]),
        )
        continue
      }
      if (video.channelId !== null) {
        writes.push(
          statement(
            this.database,
            `INSERT INTO youtube_channels(channel_id,latest_title,latest_url,first_observed_at,
               last_observed_at,updated_at) VALUES(?,?,?,?,?,?)
             ON CONFLICT(channel_id) DO UPDATE SET
               latest_url=COALESCE(youtube_channels.latest_url,excluded.latest_url),
               last_observed_at=excluded.last_observed_at,updated_at=excluded.updated_at`,
            [
              video.channelId,
              null,
              `https://www.youtube.com/channel/${video.channelId}`,
              input.at,
              input.at,
              input.at,
            ],
          ),
        )
      }
      writes.push(
        statement(
          this.database,
          `INSERT INTO youtube_video_catalog_profiles(media_item_id,video_id,lookup_state,current_title,
           description,channel_id,channel_title,published_at,duration_ms,category_id,tags_json,
           caption_available,definition,projection,privacy_status,upload_status,embeddable,
           made_for_kids,region_restriction_json,live_broadcast_content,scheduled_start_at,
           actual_start_at,actual_end_at,fetched_at,checked_at,expires_at,etag,safe_error_code)
         VALUES(?,?,'current',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
         ON CONFLICT(media_item_id) DO UPDATE SET video_id=excluded.video_id,lookup_state='current',
           current_title=excluded.current_title,description=excluded.description,
           channel_id=excluded.channel_id,channel_title=excluded.channel_title,
           published_at=excluded.published_at,duration_ms=excluded.duration_ms,
           category_id=excluded.category_id,tags_json=excluded.tags_json,
           caption_available=excluded.caption_available,definition=excluded.definition,
           projection=excluded.projection,privacy_status=excluded.privacy_status,
           upload_status=excluded.upload_status,embeddable=excluded.embeddable,
           made_for_kids=excluded.made_for_kids,region_restriction_json=excluded.region_restriction_json,
           live_broadcast_content=excluded.live_broadcast_content,
           scheduled_start_at=excluded.scheduled_start_at,actual_start_at=excluded.actual_start_at,
           actual_end_at=excluded.actual_end_at,fetched_at=excluded.fetched_at,
           checked_at=excluded.checked_at,expires_at=excluded.expires_at,etag=excluded.etag,
           safe_error_code=NULL`,
          [
            candidate.mediaItemId,
            video.videoId,
            video.title,
            video.description,
            video.channelId,
            video.channelTitle,
            video.publishedAt,
            video.durationMs,
            video.categoryId,
            JSON.stringify(video.tags),
            video.captionAvailable === null ? null : video.captionAvailable ? 1 : 0,
            video.definition,
            video.projection,
            video.privacyStatus,
            video.uploadStatus,
            video.embeddable === null ? null : video.embeddable ? 1 : 0,
            video.madeForKids === null ? null : video.madeForKids ? 1 : 0,
            video.regionRestriction === null ? null : JSON.stringify(video.regionRestriction),
            video.liveBroadcastContent,
            video.scheduledStartAt,
            video.actualStartAt,
            video.actualEndAt,
            video.fetchedAt,
            input.at,
            video.expiresAt,
            video.etag,
          ],
        ),
      )
      writes.push(
        statement(this.database, 'DELETE FROM youtube_video_thumbnails WHERE video_id=?', [
          video.videoId,
        ]),
      )
      for (const [variant, thumbnail] of Object.entries(video.thumbnails)) {
        writes.push(
          statement(
            this.database,
            `INSERT INTO youtube_video_thumbnails(video_id,variant,url,width,height,fetched_at,expires_at)
           VALUES(?,?,?,?,?,?,?)`,
            [
              video.videoId,
              variant,
              thumbnail.url,
              thumbnail.width,
              thumbnail.height,
              video.fetchedAt,
              video.expiresAt,
            ],
          ),
        )
      }
    }
    for (let offset = 0; offset < writes.length; offset += 50)
      await this.database.batch(writes.slice(offset, offset + 50))
  }

  /**
   * Delete at most `limit` logical cache/bookkeeping rows, never owner history.
   * Cleanup starts two days before logical expiry to leave bounded maintenance
   * headroom under the provider's 30-day deadline. Cache richness may disappear
   * early; request-time clocks reject expired publications even if this job fails.
   * FTS/internal index writes are additional to this logical deletion budget.
   */
  async maintainYoutubeCatalog(
    at: string,
    limit = 1000,
  ): Promise<{
    deletedRows: number
    deletedByTable: Record<string, number>
    hasMore: boolean
  }> {
    if (!Number.isInteger(limit) || limit < 2 || limit > 1000)
      throw new TypeError('YouTube maintenance limit must be between 2 and 1000')
    const cleanupAt = new Date(Date.parse(at) + 2 * 24 * 60 * 60 * 1000).toISOString()
    const tables = [
      ...publishedCatalogTables.map(([, published]) => published),
      'youtube_published_channel_aggregates',
      'youtube_catalog_request_outcomes',
      'youtube_video_thumbnails',
      'youtube_video_catalog_profiles',
      'youtube_channel_catalog_profiles',
      'youtube_categories',
    ]
    let remaining = limit
    const deletedByTable: Record<string, number> = {}
    const documents = await statement(
      this.database,
      'SELECT document_kind,document_rowid FROM youtube_search_expiry WHERE expires_at<=? ORDER BY expires_at,document_kind,document_rowid LIMIT ?',
      [cleanupAt, Math.floor(remaining / 2) + 1],
    ).all<{ document_kind: 'video' | 'channel'; document_rowid: number }>()
    const visible = documents.results.slice(0, Math.floor(remaining / 2))
    let hasMore = documents.results.length > visible.length
    for (const kind of ['video', 'channel'] as const) {
      const ids = visible
        .filter((row) => row.document_kind === kind)
        .map((row) => row.document_rowid)
      if (!ids.length) continue
      const table = kind === 'video' ? 'video_search' : 'video_channel_search'
      for (let offset = 0; offset < ids.length; offset += 40) {
        const chunk = ids.slice(offset, offset + 40)
        await this.database.batch([
          statement(
            this.database,
            `DELETE FROM ${table} WHERE expires_at<=? AND rowid IN (${placeholders(chunk)})`,
            [cleanupAt, ...chunk],
          ),
          statement(
            this.database,
            `DELETE FROM youtube_search_expiry WHERE expires_at<=? AND document_kind=? AND document_rowid IN (${placeholders(chunk)})`,
            [cleanupAt, kind, ...chunk],
          ),
          statement(
            this.database,
            'UPDATE youtube_publication_state SET revision=revision+1 WHERE singleton_id=1',
          ),
        ])
      }
      deletedByTable[table] = ids.length
      deletedByTable.youtube_search_expiry =
        (deletedByTable.youtube_search_expiry ?? 0) + ids.length
      remaining -= ids.length * 2
    }
    for (const table of tables) {
      const candidates = await statement(
        this.database,
        `SELECT rowid id FROM ${table} WHERE expires_at<=? ORDER BY expires_at,rowid LIMIT ?`,
        [cleanupAt, Math.max(remaining, 1) + 1],
      ).all<{ id: number }>()
      const ids = candidates.results.slice(0, remaining).map((row) => row.id)
      if (candidates.results.length > ids.length) hasMore = true
      if (ids.length) {
        await this.database.batch([
          statement(
            this.database,
            `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<=? ORDER BY expires_at,rowid LIMIT ?)`,
            [cleanupAt, ids.length],
          ),
          statement(
            this.database,
            `UPDATE youtube_publication_state SET revision=revision+1${table === 'youtube_published_video_profiles' || table === 'youtube_published_channel_aggregates' ? ',association_revision=association_revision+1' : ''} WHERE singleton_id=1`,
          ),
        ])
        deletedByTable[table] = ids.length
        remaining -= ids.length
      }
    }
    return { deletedRows: limit - remaining, deletedByTable, hasMore }
  }

  async purgeExpiredYoutubeCatalog(at: string, limit = 1000): Promise<boolean> {
    return (await this.maintainYoutubeCatalog(at, limit)).deletedRows > 0
  }

  private videoClauses(input: VideosListInput) {
    const clauses = [input.view === 'archive' ? 'p.archive_active=1' : 'p.queue_active=1']
    const values: DatabaseValue[] = []
    if (input.q) {
      const search = liveSearchPredicate('video_search', 'p.media_item_id', input.q)
      clauses.push(`(p.video_id=? OR p.canonical_url=? OR (${search.sql}))`)
      values.push(input.q, input.q, ...search.values)
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
    if (input.published === 'unknown') clauses.push('p.published_at IS NULL')
    if (input.published === 'range') {
      clauses.push('p.published_at IS NOT NULL')
      if (input.publishedFrom) {
        clauses.push('SUBSTR(p.published_at,1,10)>=?')
        values.push(input.publishedFrom)
      }
      if (input.publishedTo) {
        clauses.push('SUBSTR(p.published_at,1,10)<=?')
        values.push(input.publishedTo)
      }
    }
    if (input.duration && input.duration !== 'any') {
      const bucket = {
        under5: 'p.duration_ms<300000',
        '5to19': 'p.duration_ms>=300000 AND p.duration_ms<1200000',
        '20to59': 'p.duration_ms>=1200000 AND p.duration_ms<3600000',
        '60plus': 'p.duration_ms>=3600000',
      }[input.duration]
      clauses.push(
        input.durationUnknown
          ? `((${bucket}) OR p.duration_ms IS NULL)`
          : `p.duration_ms IS NOT NULL AND ${bucket}`,
      )
    } else if (input.durationUnknown) clauses.push('p.duration_ms IS NULL')
    if (input.availability && input.availability !== 'any') {
      if (input.availability === 'available') clauses.push("p.availability_state='available'")
      if (input.availability === 'unavailable') clauses.push("p.availability_state='unavailable'")
      if (input.availability === 'unchecked')
        clauses.push("p.availability_state IN ('not_configured','pending','stale','error')")
    }
    if (input.category?.length) {
      clauses.push(`p.category_id IN (${placeholders(input.category)})`)
      values.push(...input.category)
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
      const formats = this.formatClauses(input, occurrence)
      if (formats.sql) {
        clauses.push(formats.sql)
        values.push(...formats.values)
      }
    }
    if (input.view === 'queue') {
      const relationship = this.queuePredicate(input, true)
      clauses.push(`EXISTS(SELECT 1 FROM queue_entries q WHERE ${relationship.sql})`)
      values.push(...relationship.values)
      if (input.format?.length) {
        const alternatives: string[] = []
        if (input.format.includes('youtube_music'))
          alternatives.push(
            `EXISTS(SELECT 1 FROM youtube_watch_observations fw
              JOIN archive_entries fa ON fa.id=fw.archive_entry_id
              WHERE fw.media_item_id=p.media_item_id AND fa.upstream_state='active'
                AND fw.product='youtube_music')`,
          )
        const live = input.format.filter((value) =>
          ['live', 'upcoming', 'recorded_live'].includes(value),
        )
        if (live.length) alternatives.push(`p.live_state IN (${placeholders(live)})`)
        clauses.push(`(${alternatives.length ? alternatives.join(' OR ') : '1=0'})`)
        values.push(...live)
      }
    }
    return { where: clauses.join(' AND '), values }
  }

  private formatClauses(
    input: VideosListInput,
    occurrence: { sql: string; values: DatabaseValue[] },
  ) {
    if (!input.format?.length) return { sql: '', values: [] as DatabaseValue[] }
    const alternatives: string[] = []
    const values: DatabaseValue[] = []
    if (input.format.includes('youtube_music')) {
      alternatives.push(
        `EXISTS(SELECT 1 FROM youtube_watch_observations fw
          JOIN archive_entries fa ON fa.id=fw.archive_entry_id
          WHERE ${occurrence.sql.replaceAll('w.', 'fw.').replaceAll('a.', 'fa.')}
            AND fw.product='youtube_music')`,
      )
      values.push(...occurrence.values)
    }
    const live = input.format.filter((value) =>
      ['live', 'upcoming', 'recorded_live'].includes(value),
    )
    if (live.length) {
      alternatives.push(`p.live_state IN (${placeholders(live)})`)
      values.push(...live)
    }
    return { sql: `(${alternatives.length ? alternatives.join(' OR ') : '1=0'})`, values }
  }

  private watchPredicate(input: VideosListInput, correlateMedia: boolean) {
    const clauses = ["a.upstream_state='active'"]
    const values: DatabaseValue[] = []
    if (correlateMedia) clauses.push('w.media_item_id=p.media_item_id')
    if (input.account?.length) {
      clauses.push(`w.connection_id IN (${placeholders(input.account)})`)
      values.push(...input.account)
    }
    const dates: string[] = []
    if (input.watchedFrom) {
      dates.push('w.occurred_at>=?')
      values.push(input.watchedFrom)
    }
    if (input.watchedTo) {
      dates.push('w.occurred_at<=?')
      values.push(`${input.watchedTo}T23:59:59.999Z`)
    }
    if (dates.length || input.watchedUnknown) {
      clauses.push(
        `(${[
          dates.length ? `(${dates.join(' AND ')})` : null,
          input.watchedUnknown ? 'w.occurred_at IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
    }
    const liveFormats = input.format?.filter((value) => value !== 'youtube_music') ?? []
    if (input.format?.includes('youtube_music') && liveFormats.length === 0) {
      clauses.push("w.product='youtube_music'")
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
    const dates: string[] = []
    if (input.addedFrom) {
      dates.push('q.added_at_value>=?')
      values.push(input.addedFrom)
    }
    if (input.addedTo) {
      dates.push('q.added_at_value<=?')
      values.push(`${input.addedTo}T23:59:59.999Z`)
    }
    if (dates.length || input.addedUnknown) {
      clauses.push(
        `(${[
          dates.length ? `(${dates.join(' AND ')})` : null,
          input.addedUnknown ? 'q.added_at_value IS NULL' : null,
        ]
          .filter(Boolean)
          .join(' OR ')})`,
      )
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
          FROM youtube_watch_observations w INDEXED BY youtube_watch_rollup_idx
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

  private usesCatalogFilters(input: VideosListInput) {
    return Boolean(
      input.q ||
      input.channel?.length ||
      (input.published && input.published !== 'all') ||
      (input.duration && input.duration !== 'any') ||
      input.durationUnknown ||
      (input.availability && input.availability !== 'any') ||
      input.category?.length ||
      input.format?.some((format) => format !== 'youtube_music'),
    )
  }

  async listVideos(input: VideosListInput) {
    const at = this.clock()
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const key = JSON.stringify({ ...input, cursor: undefined })
    const requestedCursor = collectionCursor(input.cursor, key)
    if (input.view === 'channels') return this.listChannels(input, requestedCursor, key, at)
    const { where, values } = this.videoClauses(input)
    const matching = this.matchingCte(input)
    const ownerOnly = !this.usesCatalogFilters(input)
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
    const generationRow = await read(
      `SELECT CAST(COALESCE(MAX(projection_generation),0) AS TEXT)||':'||(SELECT revision FROM read_generation)||':'||(SELECT deadline FROM read_generation) generation FROM main.video_library_projection`,
    ).first<{ generation: number | string }>()
    const generation = generationRow?.generation ?? 0
    if (requestedCursor !== null && requestedCursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const page = pageClause(requestedCursor, direction)
    const count = await read(
      `SELECT COUNT(*) value FROM ${ownerOnly ? 'main.video_library_projection' : 'video_library_projection'} p WHERE ${where}`,
      values,
    ).first<{ value: number }>()
    const orderFields =
      sort === 'relevance' && input.q
        ? ',p.video_id,p.display_title'
        : sort === 'channel'
          ? ',p.normalized_channel_title'
          : sort === 'watchCount'
            ? ',p.watch_occurrence_count'
            : sort === 'publishedAt'
              ? ',p.published_at'
              : sort === 'duration'
                ? ',p.duration_ms'
                : ''
    const ownerKeys =
      ownerOnly && !['title', 'channel', 'relevance', 'publishedAt', 'duration'].includes(sort)
    const rows = await read(
      `WITH ${matching.sql}, filtered AS (
         SELECT p.media_item_id,${ownerKeys ? 'LOWER(COALESCE(vp.current_title,p.display_title))' : 'p.normalized_title'} normalized_title${orderFields},matching.reference_date,matching.matching_watch_count,
           matching.matching_watch_account_count,matching.matching_queue_count,
           matching.matching_queue_account_count
         FROM ${ownerKeys ? 'main.video_library_projection p LEFT JOIN youtube_published_video_profiles vp ON vp.media_item_id=p.media_item_id AND vp.expires_at>(SELECT at FROM read_clock)' : 'video_library_projection p'} JOIN matching ON matching.media_item_id=p.media_item_id
         WHERE ${where}
       ), ordered AS (
         SELECT filtered.*,${order} sort_value,normalized_title stable_title,media_item_id stable_id
         FROM filtered
       ), paged AS (
         SELECT * FROM ordered WHERE ${page.sql}
         ORDER BY (sort_value IS NULL),sort_value ${direction.toUpperCase()},normalized_title,stable_id LIMIT ?
       ) SELECT p.*,paged.reference_date,paged.matching_watch_count,paged.matching_watch_account_count,
         paged.matching_queue_count,paged.matching_queue_account_count,paged.sort_value
       FROM paged JOIN video_library_projection p ON p.media_item_id=paged.media_item_id
       ORDER BY (paged.sort_value IS NULL),paged.sort_value ${direction.toUpperCase()},paged.normalized_title,paged.stable_id`,
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
      ...(await this.sharedEnvelope(input.view, where, values, matching, at, undefined, ownerOnly)),
    }
  }

  private async listChannels(
    input: VideosListInput,
    requestedCursor: CollectionCursor | null,
    key: string,
    at: string,
  ) {
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const clauses = ['p.library_active=1']
    const values: DatabaseValue[] = []
    if (input.q) {
      const search = liveSearchPredicate('video_channel_search', 'p.channel_id', input.q)
      clauses.push(`(p.channel_id=? OR (${search.sql}))`)
      values.push(input.q, ...search.values)
    }
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
    const generationRow = await read(
      `SELECT CAST(COALESCE(MAX(projection_generation),0) AS TEXT)||':'||(SELECT revision FROM read_generation)||':'||(SELECT deadline FROM read_generation) generation FROM main.video_library_projection`,
    ).first<{ generation: number | string }>()
    const generation = generationRow?.generation ?? 0
    if (requestedCursor !== null && requestedCursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const page = pageClause(requestedCursor, direction)
    const orderFields =
      sort === 'relevance' && input.q
        ? ',p.display_title'
        : sort === 'watchedAt'
          ? ',p.latest_watched_at'
          : sort === 'queueCount'
            ? ',p.queue_video_count'
            : sort === 'channel'
              ? ''
              : ',p.watch_occurrence_count'
    const rows = await read(
      `WITH filtered AS (
         SELECT p.channel_id,p.normalized_title${orderFields},COUNT(*) OVER() total_count FROM video_channel_projection p WHERE ${where}
       ), ordered AS (
         SELECT filtered.*,${order} sort_value,normalized_title stable_title,channel_id stable_id
         FROM filtered
       ), paged AS (
         SELECT * FROM ordered WHERE ${page.sql}
         ORDER BY (sort_value IS NULL),sort_value ${direction.toUpperCase()},normalized_title,stable_id LIMIT ?
       ) SELECT p.*,paged.total_count,paged.sort_value,(SELECT COUNT(*) FROM video_channel_groups) section_channels
       FROM paged JOIN video_channel_projection p ON p.channel_id=paged.channel_id
       ORDER BY (paged.sort_value IS NULL),paged.sort_value ${direction.toUpperCase()},paged.normalized_title,paged.stable_id`,
      [...values, ...orderValues, ...page.values, input.limit + 1],
    ).all<Row>()
    const emptyPageCount = rows.results.length
      ? null
      : await read(
          `SELECT COUNT(*) value FROM video_channel_projection p WHERE ${where}`,
          values,
        ).first<{ value: number }>()
    const total = Number(rows.results[0]?.total_count ?? emptyPageCount?.value ?? 0)
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
      ...(await this.sharedEnvelope(
        'channels',
        where,
        values,
        undefined,
        at,
        rows.results[0]?.section_channels as number | undefined,
      )),
    }
  }

  private async sharedEnvelope(
    view: VideosListInput['view'],
    where: string,
    values: DatabaseValue[],
    matching?: { sql: string; values: DatabaseValue[] },
    at = this.clock(),
    knownChannels?: number,
    ownerOnly = false,
  ) {
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const counts = await read(
      `SELECT (SELECT COUNT(*) FROM main.video_library_projection WHERE archive_active=1) archive,
        (SELECT COUNT(*) FROM main.video_library_projection WHERE queue_active=1) queue,
        ${knownChannels === undefined ? '(SELECT COUNT(*) FROM video_channel_projection WHERE library_active=1)' : '?'} channels,
        (SELECT COUNT(DISTINCT archive_entry_id) FROM youtube_watch_observations) occurrences`,
      knownChannels === undefined ? [] : [knownChannels],
    ).first<{ archive: number; queue: number; channels: number; occurrences: number }>()
    const filteredOccurrences =
      view === 'archive' && matching
        ? await read(
            `WITH ${matching.sql}
             SELECT COALESCE(SUM(matching.matching_watch_count),0) value
             FROM ${ownerOnly ? 'main.video_library_projection' : 'video_library_projection'} p JOIN matching ON matching.media_item_id=p.media_item_id
             WHERE ${where}`,
            [...matching.values, ...values],
          ).first<{ value: number }>()
        : null
    const accounts = await read(
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
        : await read(
            `SELECT COALESCE(p.channel_id,'__unknown__') value,
              COALESCE(MAX(p.display_channel_title),'Channel unavailable') label,COUNT(*) count
             FROM video_library_projection p WHERE ${where}
             GROUP BY COALESCE(p.channel_id,'__unknown__') ORDER BY label LIMIT 500`,
            values,
          ).all<{ value: string; label: string; count: number }>()
    const categories =
      view === 'channels'
        ? { results: [] as { value: string; label: string; count: number }[] }
        : await read(
            `SELECT p.category_id value,MAX(p.category_title) label,COUNT(*) count
             FROM video_library_projection p WHERE ${where} AND p.category_id IS NOT NULL
             GROUP BY p.category_id ORDER BY label LIMIT 100`,
            values,
          ).all<{ value: string; label: string; count: number }>()
    const coverage = await this.coverage(at)
    return {
      sectionCounts: {
        archive: counts?.archive ?? 0,
        queue: counts?.queue ?? 0,
        channels: counts?.channels ?? 0,
      },
      occurrenceCount: filteredOccurrences?.value ?? counts?.occurrences ?? 0,
      facets: {
        accounts: [...accounts.results],
        channels: [...channels.results],
        categories: [...categories.results],
      },
      coverage,
    }
  }

  private async coverage(at = this.clock()) {
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const rows = await read(
      `WITH kinds(component_kind) AS (VALUES ('watch_later')),
       ranked AS (
         SELECT c.connection_id,c.component_kind,c.status,
           ROW_NUMBER() OVER(PARTITION BY c.connection_id,c.component_kind
             ORDER BY r.acquired_at DESC,r.id DESC) position
         FROM youtube_takeout_components c JOIN raw_objects r ON r.id=c.raw_object_id
         WHERE c.component_kind='watch_later'
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
    const catalog = await read(
      `SELECT
         (SELECT COUNT(*) FROM video_library_projection) total_count,
         (SELECT COUNT(*) FROM youtube_video_catalog_profiles
           WHERE expires_at>(SELECT at FROM read_clock)) cached_count,
         EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state IN ('pending','running')) active_job,
         EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE provider='youtube' AND state='failed') failed_job`,
    ).first<{ total_count: number; cached_count: number; active_job: number; failed_job: number }>()
    const catalogState =
      catalog?.active_job === 1
        ? ('pending' as const)
        : (catalog?.total_count ?? 0) > 0 && catalog?.cached_count === catalog?.total_count
          ? ('current' as const)
          : (catalog?.cached_count ?? 0) > 0
            ? ('partial' as const)
            : catalog?.failed_job === 1
              ? ('error' as const)
              : ('not_configured' as const)
    return { watchLater: state('watch_later'), catalog: catalogState }
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
      formats: [
        ...(row.source_format === 'youtube_music' ? ['youtube_music' as const] : []),
        ...(row.live_state === 'live' ||
        row.live_state === 'upcoming' ||
        row.live_state === 'recorded_live'
          ? [row.live_state]
          : []),
      ],
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
    }
  }

  async findVideo(id: string) {
    const at = this.clock()
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const row = await read(
      `SELECT p.*,vp.description,p.category_id catalog_category_id,
         vp.caption_available catalog_caption_available,vp.definition catalog_definition,
         vp.projection catalog_projection,vp.checked_at catalog_checked_at
       FROM video_library_projection p
       LEFT JOIN youtube_video_catalog_profiles vp ON vp.media_item_id=p.media_item_id AND vp.expires_at>?
       WHERE p.media_item_id=?`,
      [at, id],
    ).first<Row>()
    if (row === null) return null
    const relationships = await read(
      `SELECT c.label connection_label,q.added_at_value added_at FROM queue_entries q
       JOIN connections c ON c.id=q.connection_id WHERE q.media_item_id=?
         AND q.relationship_type='youtube_watch_later' AND q.upstream_state='active'
       ORDER BY q.added_at_value DESC,c.label`,
      [id],
    ).all<{ connection_label: string; added_at: string | null }>()
    return {
      ...this.videoRow(row, Number(row.archive_active) === 1 ? 'archive' : 'queue'),
      kind: 'video' as const,
      description: row.description as string | null,
      categoryId: (row.catalog_category_id ?? row.category_id) as string | null,
      categoryTitle: row.category_title as string | null,
      captionAvailable:
        row.catalog_caption_available === null ? null : Number(row.catalog_caption_available) === 1,
      definition: row.catalog_definition as string | null,
      projection: row.catalog_projection as string | null,
      catalogCheckedAt: row.catalog_checked_at as string | null,
      historyCount: Number(row.watch_occurrence_count),
      queueRelationships: relationships.results.map((value) => ({
        connectionLabel: value.connection_label,
        addedAt: value.added_at,
      })),
      metadataMessage:
        row.metadata_state === 'current'
          ? null
          : `YouTube metadata is ${String(row.metadata_state).replaceAll('_', ' ')}.`,
    }
  }

  async findChannel(id: string) {
    const at = this.clock()
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const row = await read(
      `SELECT p.*,cp.description,cp.custom_url,cp.country,cp.checked_at catalog_checked_at
       FROM video_channel_projection p
       LEFT JOIN youtube_channel_catalog_profiles cp ON cp.channel_id=p.channel_id AND cp.expires_at>?
       WHERE p.channel_id=? AND p.library_active=1`,
      [at, id],
    ).first<Row>()
    if (row === null) return null
    return {
      ...this.channelRow(row),
      kind: 'channel' as const,
      description: row.description as string | null,
      customUrl: row.custom_url as string | null,
      country: row.country as string | null,
      catalogCheckedAt: row.catalog_checked_at as string | null,
      metadataMessage:
        row.catalog_checked_at === null ? 'YouTube channel metadata is not available.' : null,
    }
  }

  async listHistory(id: string, limit: number, cursorValue?: string) {
    const at = this.clock()
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const key = JSON.stringify({ id, limit })
    const cursor = detailCursor(cursorValue, key)
    const generationRow = await read(
      'SELECT COUNT(*) generation FROM youtube_watch_observations WHERE media_item_id=?',
      [id],
    ).first<{ generation: number | string }>()
    const generation = generationRow?.generation ?? 0
    if (cursor !== null && cursor.generation !== generation)
      throw new TypeError('Videos pagination cursor is stale')
    const count = await read(
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
    const rows = await read(
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
    const at = this.clock()
    const read = (query: string, values: readonly DatabaseValue[] = []) =>
      this.readStatement(query, values, at)

    const key = JSON.stringify({ channelId, membership, limit })
    const cursor = detailCursor(cursorValue, key)
    const column = membership === 'archive' ? 'archive_active' : 'queue_active'
    const date = membership === 'archive' ? 'latest_watched_at' : 'latest_queue_added_at'
    const generationRow = await read(
      `SELECT CAST(COALESCE(MAX(projection_generation),0) AS TEXT)||':'||(SELECT revision FROM read_generation)||':'||(SELECT deadline FROM read_generation) generation FROM main.video_library_projection`,
    ).first<{ generation: number | string }>()
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
    const count = await read(
      `SELECT COUNT(*) value FROM video_library_projection WHERE channel_id=? AND ${column}=1`,
      [channelId],
    ).first<{ value: number }>()
    const rows = await read(
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
