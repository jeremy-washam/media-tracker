import type { DatabaseClient, DatabaseValue } from './database'

export interface ChatMediaQuery {
  scope: 'archive' | 'queue' | 'all'
  output: 'items' | 'statistics' | 'both'
  filters: {
    types?: string[] | undefined
    query?: string | undefined
    creator?: string | undefined
    consumed?:
      { from?: string | undefined; toExclusive?: string | undefined; timezone: string } | undefined
    minimumRating?: number | undefined
    minimumOccurrences?: number | undefined
  }
  statistics: {
    measures: ('distinct_items' | 'consumption_occurrences')[]
    groupBy?: 'media_type' | 'year' | 'month' | undefined
  }
  sort: 'consumed_desc' | 'title'
  limit: number
}
const queueRelation = `(EXISTS(SELECT 1 FROM queue_entries q WHERE q.media_item_id=m.id AND q.upstream_state='active') OR EXISTS(SELECT 1 FROM book_library_projection b WHERE b.media_item_id=m.id AND b.in_queue=1) OR EXISTS(SELECT 1 FROM podcast_library_projection p WHERE p.media_item_id=m.id AND p.in_queue=1))`
const activeRelation =
  "EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=m.id AND a.upstream_state='active')"
function like(value: string) {
  return `%${value.replace(/[\\%_]/g, (x) => `\\${x}`)}%`
}
function plainFts(value: string) {
  return (
    value
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 12)
      .map((word) => `"${word}"*`)
      .join(' AND ') ?? null
  )
}
/** Convert an owner calendar boundary to UTC without assigning a date to unknown evidence. */
export function chatCalendarInstant(date: string, timezone: string): string {
  const wanted = Date.parse(`${date}T00:00:00Z`)
  let instant = wanted
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(format.formatToParts(instant).map((x) => [x.type, x.value]))
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    instant += wanted - local
  }
  return new Date(instant).toISOString()
}
const calendarStart =
  "CASE a.consumed_at_precision WHEN 'year' THEN a.consumed_at_value||'-01-01' WHEN 'month' THEN a.consumed_at_value||'-01' ELSE substr(a.consumed_at_value,1,10) END"
const calendarEnd = `date(${calendarStart},CASE a.consumed_at_precision WHEN 'year' THEN '+1 year' WHEN 'month' THEN '+1 month' ELSE '+1 day' END)`
function temporal(input: ChatMediaQuery, overlap = false) {
  const sql: string[] = [],
    values: DatabaseValue[] = [],
    range = input.filters.consumed
  if (range?.from) {
    sql.push(
      `(CASE WHEN a.consumed_at_precision='instant' THEN a.consumed_at_value>=? ELSE ${overlap ? calendarEnd : calendarStart}${overlap ? '>' : '>='}? END)`,
    )
    values.push(chatCalendarInstant(range.from, range.timezone), range.from)
  }
  if (range?.toExclusive) {
    sql.push(
      `(CASE WHEN a.consumed_at_precision='instant' THEN a.consumed_at_value<? ELSE ${overlap ? calendarStart : calendarEnd}${overlap ? '<' : '<='}? END)`,
    )
    values.push(chatCalendarInstant(range.toExclusive, range.timezone), range.toExclusive)
  }
  return { sql: sql.length ? sql.join(' AND ') : '1=1', values }
}
function matching(input: ChatMediaQuery, at: string) {
  const where: string[] = [],
    values: DatabaseValue[] = []
  if (input.filters.types?.length) {
    where.push(`m.type IN (${input.filters.types.map(() => '?').join(',')})`)
    values.push(...input.filters.types)
  }
  if (input.filters.creator) {
    where.push("COALESCE(m.primary_creator_name,'') LIKE ? ESCAPE '\\'")
    values.push(like(input.filters.creator))
  }
  if (input.filters.query) {
    const fts = plainFts(input.filters.query),
      tables = ['book_search', 'movie_search', 'article_search']
    const textSearch = fts
      ? `OR m.id IN (${tables.map((table) => `SELECT media_item_id FROM ${table} WHERE ${table} MATCH ?`).join(' UNION ')}
      UNION SELECT cm.media_item_id FROM article_content_search_map sm JOIN article_content_manifests cm ON cm.id=sm.manifest_id JOIN readwise_documents d ON d.id=cm.readwise_document_id JOIN article_content_search cs ON cs.rowid=sm.rowid WHERE article_content_search MATCH ? AND cm.state='ready' AND d.upstream_state='active' AND COALESCE(cm.source_updated_at,'')=COALESCE(d.updated_at_source,'')
      UNION SELECT vs.media_item_id FROM video_search vs WHERE video_search MATCH ? AND(vs.expires_at IS NULL OR vs.expires_at>?) AND(vs.origin_kind<>'channel' OR vs.origin_key=(SELECT p.channel_id FROM video_library_projection p WHERE p.media_item_id=vs.media_item_id)))`
      : ''
    where.push(
      `(COALESCE(m.title,'') LIKE ? ESCAPE '\\' OR COALESCE(m.primary_creator_name,'') LIKE ? ESCAPE '\\' ${textSearch})`,
    )
    values.push(
      like(input.filters.query),
      like(input.filters.query),
      ...(fts ? [...tables.map(() => fts), fts, fts, at] : []),
    )
  }
  where.push(
    input.scope === 'archive'
      ? activeRelation
      : input.scope === 'queue'
        ? queueRelation
        : `(${activeRelation} OR ${queueRelation})`,
  )
  const dates = temporal(input)
  const rating =
    input.filters.minimumRating !== undefined
      ? 'AND a.rating_value IS NOT NULL AND a.rating_scale_maximum>0 AND a.rating_value*5.0/a.rating_scale_maximum>=?'
      : ''
  const matched: string[] = []
  if (
    input.scope === 'archive' ||
    input.filters.consumed ||
    input.filters.minimumRating !== undefined
  )
    matched.push('EXISTS(SELECT 1 FROM occurrences a WHERE a.media_item_id=m.id)')
  if (input.filters.minimumOccurrences !== undefined)
    matched.push('(SELECT COUNT(*) FROM occurrences a WHERE a.media_item_id=m.id)>=?')
  return {
    sql: `WITH eligible AS(SELECT m.* FROM media_items m WHERE ${where.join(' AND ')}),occurrences AS(SELECT a.* FROM archive_entries a JOIN eligible m ON m.id=a.media_item_id WHERE a.upstream_state='active' AND ${dates.sql} ${rating}),matched AS(SELECT m.* FROM eligible m WHERE ${matched.length ? matched.join(' AND ') : '1=1'})`,
    values: [
      ...values,
      ...dates.values,
      ...(input.filters.minimumRating !== undefined ? [input.filters.minimumRating] : []),
      ...(input.filters.minimumOccurrences !== undefined ? [input.filters.minimumOccurrences] : []),
    ],
  }
}
export class SqlChatMedia {
  constructor(private readonly database: DatabaseClient) {}
  async revision(at = new Date().toISOString()) {
    const row = await this.database
      .prepare(
        'SELECT revision,(SELECT MIN(expires_at) FROM youtube_search_expiry WHERE expires_at>?) deadline FROM chat_library_revision WHERE id=1',
      )
      .bind(at)
      .first<{ revision: number; deadline: string | null }>()
    return `${row?.revision ?? 0}:${row?.deadline ?? ''}`
  }
  async query(input: ChatMediaQuery, offset = 0) {
    const at = new Date().toISOString(),
      { sql, values } = matching(input, at),
      revision = await this.revision(at)
    const totals = await this.database
      .prepare(
        `${sql} SELECT (SELECT COUNT(*) FROM matched) distinct_items,(SELECT COUNT(*) FROM occurrences a JOIN matched m ON m.id=a.media_item_id) consumption_occurrences,(SELECT COUNT(*) FROM archive_entries a JOIN eligible m ON m.id=a.media_item_id WHERE a.upstream_state='active' AND a.consumed_at_value IS NULL) undated_occurrences`,
      )
      .bind(...values)
      .first<Record<string, number>>()
    const overlap = temporal(input, true),
      exact = temporal(input)
    const uncertain = await this.database
      .prepare(
        `${sql} SELECT COUNT(*) count FROM archive_entries a JOIN eligible m ON m.id=a.media_item_id WHERE a.upstream_state='active' AND a.consumed_at_precision IN ('year','month') AND ${overlap.sql} ${input.filters.consumed ? `AND NOT(${exact.sql})` : ''}`,
      )
      .bind(...values, ...overlap.values, ...(input.filters.consumed ? exact.values : []))
      .first<{ count: number }>()
    let items: Record<string, unknown>[] = [],
      more = false
    if (input.output !== 'statistics') {
      const rows = await this.database
        .prepare(
          `${sql} SELECT m.id,m.type,m.title,m.primary_creator_name creator,m.canonical_url url,(SELECT MAX(consumed_at_value) FROM occurrences a WHERE a.media_item_id=m.id) last_consumed_at,(SELECT consumed_at_precision FROM occurrences a WHERE a.media_item_id=m.id ORDER BY consumed_at_value DESC,id LIMIT 1) last_consumed_precision,(SELECT COUNT(*) FROM occurrences a WHERE a.media_item_id=m.id) matching_occurrences FROM matched m ORDER BY ${input.sort === 'title' ? "COALESCE(m.title,'') COLLATE NOCASE,m.id" : 'last_consumed_at DESC,m.id'} LIMIT ? OFFSET ?`,
        )
        .bind(...values, input.limit + 1, offset)
        .all<Record<string, unknown>>()
      items = [...rows.results.slice(0, input.limit)]
      more = rows.results.length > input.limit
    }
    let groups: Record<string, unknown>[] = []
    if (input.output !== 'items' && input.statistics.groupBy) {
      // US daylight rules for the instant-based imports (2007 onward). Historic
      // calendar-only records retain their actual year/month precision.
      const localInstant =
        "datetime(a.consumed_at_value,CASE WHEN julianday(a.consumed_at_value)>=julianday(substr(a.consumed_at_value,1,4)||'-03-01','weekday 0','+7 days','+7 hours') AND julianday(a.consumed_at_value)<julianday(substr(a.consumed_at_value,1,4)||'-11-01','weekday 0','+6 hours') THEN '-4 hours' ELSE '-5 hours' END)"
      const date = `CASE WHEN a.consumed_at_precision='instant' AND substr(a.consumed_at_value,1,4)<'2007' THEN NULL WHEN a.consumed_at_precision='instant' THEN ${localInstant} ELSE a.consumed_at_value END`
      const group =
        input.statistics.groupBy === 'media_type'
          ? 'm.type'
          : input.statistics.groupBy === 'year'
            ? `substr(${date},1,4)`
            : `CASE WHEN a.consumed_at_precision IN ('month','day','instant') THEN substr(${date},1,7) ELSE NULL END`
      const rows = await this.database
        .prepare(
          `${sql} SELECT ${group} label,COUNT(DISTINCT m.id) distinct_items,COUNT(a.id) consumption_occurrences FROM matched m LEFT JOIN occurrences a ON a.media_item_id=m.id GROUP BY label ORDER BY label LIMIT 121`,
        )
        .bind(...values)
        .all<Record<string, unknown>>()
      groups = [...rows.results]
    }
    return {
      items,
      statistics:
        input.output === 'items'
          ? null
          : {
              measures: Object.fromEntries(
                input.statistics.measures.map((name) => [name, totals?.[name] ?? 0]),
              ),
              groups: groups.slice(0, 120),
              groupsTruncated: groups.length > 120,
            },
      more,
      asOf: at,
      revision,
      stable: (await this.revision(at)) === revision,
      coverage: {
        scope: input.scope,
        undatedOccurrences: totals?.undated_occurrences ?? 0,
        uncertainDateOccurrences: uncertain?.count ?? 0,
        limitations: [
          'Counts describe imported active records, not guaranteed complete upstream history.',
          'An item may appear in multiple date groups; their distinct-item counts are not additive.',
          'An Archive occurrence is source-defined; a podcast occurrence may summarize multiple playback observations.',
          'Instant-based calendar groups before 2007 are reported as unknown; later instants use America/New_York daylight boundaries.',
          'Partially overlapping year/month records are excluded from exact counts and reported as uncertain. Unknown dates are never assigned to a period.',
        ],
      },
    }
  }
  async canonical(id: string) {
    return this.database
      .prepare(
        `SELECT id,type,title,subtitle,primary_creator_name creator,description,canonical_url url,published_at_value,published_at_precision FROM media_items m WHERE id=? AND (${activeRelation} OR ${queueRelation})`,
      )
      .bind(id)
      .first<Record<string, unknown>>()
  }
  async history(id: string, offset: number, limit = 20) {
    return (
      await this.database
        .prepare(
          "SELECT id,consumed_at_value,consumed_at_precision,consumed_at_basis,rating_value,rating_scale_minimum,rating_scale_maximum,review_text,source_recorded_at_value,source_recorded_at_precision,connection_id FROM archive_entries WHERE media_item_id=? AND upstream_state='active' ORDER BY consumed_at_value DESC,id LIMIT ? OFFSET ?",
        )
        .bind(id, limit + 1, offset)
        .all<Record<string, unknown>>()
    ).results
  }
  async articlePassages(id: string, query?: string, offset = 0) {
    const fts = query ? plainFts(query) : null
    return (
      await this.database
        .prepare(
          `SELECT m.id manifest_id,m.extracted_object_key,m.extracted_sha256,m.extraction_version,m.coverage,c.ordinal,c.byte_start,c.byte_length,c.sha256 FROM article_content_manifests m JOIN article_content_chunks c ON c.manifest_id=m.id JOIN readwise_documents d ON d.id=m.readwise_document_id WHERE m.media_item_id=? AND m.state='ready' AND d.upstream_state='active' AND COALESCE(m.source_updated_at,'')=COALESCE(d.updated_at_source,'') ${fts ? 'AND EXISTS(SELECT 1 FROM article_content_search_map sm JOIN article_content_search s ON s.rowid=sm.rowid WHERE sm.manifest_id=m.id AND sm.chunk_ordinal=c.ordinal AND article_content_search MATCH ?)' : ''} AND m.id=(SELECT latest.id FROM article_content_manifests latest WHERE latest.media_item_id=m.media_item_id AND latest.readwise_document_id=m.readwise_document_id AND latest.state='ready' ORDER BY latest.acquired_at DESC,latest.id DESC LIMIT 1) ORDER BY m.acquired_at DESC,c.ordinal LIMIT 4 OFFSET ?`,
        )
        .bind(id, ...(fts ? [fts] : []), offset)
        .all<{
          manifest_id: string
          extracted_object_key: string
          extracted_sha256: string
          extraction_version: number
          coverage: string
          ordinal: number
          byte_start: number
          byte_length: number
          sha256: string
        }>()
    ).results
  }
}
