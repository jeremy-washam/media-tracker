import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

type ArticleSubtype = 'article' | 'newsletter' | 'pdf' | 'rss'
type ArticleSection = 'archive' | 'queue' | 'feed'
type TemporalPrecision = 'year' | 'month' | 'day' | 'instant'
type TemporalBasis = 'source_asserted' | 'inferred'

export interface ReaderArticleDocumentProjection {
  id: string
  connectionId: string
  documentId: string
  mediaItemId: string
  externalIdentityId: string
  sourceRecordId: string
  snapshotRunId: string | null
  observedAt: string
  readerUrl: string | null
  sourceUrl: string | null
  rawCategory: string
  subtype: ArticleSubtype
  currentLocation: string
  title: string | null
  author: string | null
  publication: string | null
  acquisitionSource: string | null
  summary: string | null
  imageUrl: string | null
  documentNote: string | null
  wordCount: number | null
  readingTimeRaw: string | null
  readingTimeMinutes: number | null
  listeningTimeRaw: string | null
  readingProgress: number | null
  progressValid: boolean
  publishedAt: Temporal | null
  createdAt: string | null
  savedAt: string | null
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  lastMovedAt: string | null
  updatedAt: string | null
  tags: readonly { key: string; name: string; type: string | null; created: string | null }[]
}

export interface ReaderArticleRetirementProjection {
  connectionId: string
  documentId: string
  sourceRecordId: string
  snapshotRunId: string | null
  observedAt: string
  rawCategory: string
  currentLocation: string
}

export interface ReaderHighlightContainerProjection {
  id: string
  connectionId: string
  userBookId: number
  externalId: string | null
  source: string | null
  title: string | null
  author: string | null
  category: string | null
  sourceUrl: string | null
  documentNote: string | null
  deleted: boolean
  sourceUpdatedAt: string | null
  sourceRecordId: string
  observedAt: string
  highlights: readonly {
    id: string
    highlightId: number
    deleted: boolean
    text: string | null
    note: string | null
    location: number | null
    endLocation: number | null
    locationType: string | null
    color: string | null
    favorite: boolean
    discard: boolean
    highlightedAt: string | null
    createdAt: string | null
    updatedAt: string | null
    readerUrl: string | null
  }[]
}

export interface ArticleContentTarget {
  connectionId: string
  documentId: string
  readwiseDocumentId: string
  mediaItemId: string
  sourceUpdatedAt: string | null
}

export interface ArticleContentProjection extends ArticleContentTarget {
  manifestId: string
  rawObjectKey: string
  rawSha256: string
  extractedObjectKey: string
  extractedSha256: string
  acquiredAt: string
  processedAt: string
  coverage: 'full' | 'partial'
  chunks: readonly {
    ordinal: number
    byteStart: number
    byteLength: number
    sha256: string
    text: string
  }[]
}

export interface Temporal {
  value: string
  precision: TemporalPrecision
  basis: TemporalBasis
}

export interface ArticlesListInput {
  section: ArticleSection
  q?: string
  types: readonly ArticleSubtype[]
  authors: readonly string[]
  publications: readonly string[]
  publishedFrom?: string
  publishedTo?: string
  publishedUnknown: boolean
  readingTimes: readonly ('under5' | '5to15' | '16to30' | '31to60' | 'over60' | 'unknown')[]
  progress: readonly ('notOpened' | 'openedZero' | 'inProgress' | 'complete' | 'unknown')[]
  archivedFrom?: string
  archivedTo?: string
  archivedUnknown: boolean
  currentStates: readonly ('archive' | 'inbox' | 'later' | 'shortlist' | 'feed' | 'unknown')[]
  queueStates: readonly ('inbox' | 'later' | 'shortlist')[]
  addedFrom?: string
  addedTo?: string
  addedUnknown: boolean
  arrivedFrom?: string
  arrivedTo?: string
  arrivedUnknown: boolean
  opened: readonly ('opened' | 'notOpened')[]
  history: readonly ('archived' | 'notArchived')[]
  sort?:
    | 'archivedAt'
    | 'addedAt'
    | 'arrivedAt'
    | 'queueState'
    | 'publishedAt'
    | 'title'
    | 'author'
    | 'publication'
    | 'readingTime'
    | 'relevance'
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export interface ArticleCollectionRecord {
  id: string
  title: string
  subtype: ArticleSubtype
  imageUrl: string | null
  author: string | null
  publication: string | null
  publishedAt: Temporal | null
  readingTime: { raw: string | null; minutes: number | null }
  progress: { value: number | null; valid: boolean }
  opened: boolean
  archive: { active: boolean; count: number; latestAt: string | null }
  queue: { active: boolean; state: 'inbox' | 'later' | 'shortlist' | null; addedAt: string | null }
  feed: { active: boolean; arrivedAt: string | null }
  currentAvailable: boolean
  searchExcerpt: {
    source: 'summary' | 'note' | 'highlight' | 'text'
    text: string | null
  } | null
}

export interface ArticlesPageRecord {
  data: ArticleCollectionRecord[]
  nextCursor: string | null
  sectionCounts: { archive: number; queue: number; feed: number }
  totalCount: number
  filteredCount: number
  occurrenceCount: number | null
  facets: {
    types: Array<{ value: string; label: string; count: number }>
    authors: Array<{ value: string; label: string; count: number }>
    publications: Array<{ value: string; label: string; count: number }>
    readingTimes: Array<{ value: string; label: string; count: number }>
    progress: Array<{ value: string; label: string; count: number }>
    currentStates: Array<{ value: string; label: string; count: number }>
    queueStates: Array<{ value: string; label: string; count: number }>
    opened: Array<{ value: string; label: string; count: number }>
    history: Array<{ value: string; label: string; count: number }>
    publishedUnknown: number
    readingTimeUnknown: number
    progressUnknown: number
    dateUnknown: number
  }
  capabilities: { fullTextSearch: boolean; highlights: boolean }
  coverage: {
    allLocationsBackfilled: boolean
    highlightsBackfilled: boolean
    fullTextPolicy: 'archive_queue' | 'disabled'
    lastSuccessfulSyncAt: string | null
  }
}

export interface ArticleDetailRecord extends ArticleCollectionRecord {
  sourceCategory: string
  currentLocation: string
  acquisitionSource: string | null
  summary: string | null
  wordCount: number | null
  documentNote: string | null
  highlightDocumentNote: string | null
  tags: Array<{ key: string; name: string; type: string | null }>
  dates: {
    createdAt: string | null
    savedAt: string | null
    firstOpenedAt: string | null
    lastOpenedAt: string | null
    lastMovedAt: string | null
    updatedAt: string | null
    observedAt: string
  }
  annotations: { active: number; deleted: number; discarded: number }
  content: {
    available: boolean
    state: 'pending' | 'ready' | 'failed' | 'expired' | null
    coverage: 'full' | 'partial' | null
    failureClass: string | null
  }
  links: { original: string | null; reader: string | null }
  readerRelationships: Array<{
    documentId: string
    location: string
    available: boolean
    readerUrl: string | null
  }>
  source: {
    connectionLabel: string
    coverage: 'complete' | 'partial' | 'best_effort'
    sourceRefreshedAt: string
  }
}

function statement(
  database: DatabaseClient,
  query: string,
  values: readonly DatabaseValue[] = [],
): DatabaseStatement {
  return database.prepare(query).bind(...values)
}

function normalized(value: string | null): string | null {
  const trimmed = value?.normalize('NFKC').trim().toLocaleLowerCase('en-US')
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function ftsQuery(value: string): string | null {
  const tokens = value
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["*:^(){}[\]]/g, '').trim())
    .filter(Boolean)
  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
}

function fieldFtsQuery(fields: readonly string[], query: string): string {
  return `${fields.length === 1 ? fields[0] : `{${fields.join(' ')}}`} : (${query})`
}

function likePrefix(value: string): string {
  return `${value.replace(/[\\%_]/g, (part) => `\\${part}`)}%`
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(',')
}

function temporalParts(value: Temporal | null): [string | null, string | null, string | null] {
  return value === null ? [null, null, null] : [value.value, value.precision, value.basis]
}

function queueState(location: string): 'inbox' | 'later' | 'shortlist' | null {
  if (location === 'new') return 'inbox'
  if (location === 'later' || location === 'shortlist') return location
  return null
}

interface ArticleRow {
  media_item_id: string
  display_title: string
  normalized_title: string
  subtype: ArticleSubtype
  image_url: string | null
  author: string | null
  publication: string | null
  published_at_value: string | null
  published_at_precision: TemporalPrecision | null
  reading_time_raw: string | null
  reading_time_minutes: number | null
  reading_progress: number | null
  progress_valid: number
  opened: number
  in_archive: number
  archive_occurrence_count: number
  latest_archive_at: string | null
  effective_archive_at?: string | null
  in_queue: number
  queue_state: 'inbox' | 'later' | 'shortlist' | null
  queue_added_at: string | null
  in_feed: number
  feed_arrived_at: string | null
  current_available: number
  search_summary?: string | null
  search_notes?: string | null
  search_highlights?: string | null
}

function excerpt(value: string | null | undefined, query: string): string | null {
  if (!value) return null
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
  const haystack = value.toLocaleLowerCase('en-US')
  let match = haystack.indexOf(normalizedQuery)
  if (match < 0) {
    for (const token of normalizedQuery.split(/\s+/).filter(Boolean)) {
      match = haystack.indexOf(token)
      if (match >= 0) break
    }
  }
  if (match < 0) return null
  const start = Math.max(0, match - 70)
  const end = Math.min(value.length, start + 180)
  const text = value.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < value.length ? '…' : ''}`
}

function collectionRecord(row: ArticleRow, query?: string): ArticleCollectionRecord {
  const searchExcerpt =
    query === undefined
      ? null
      : ((
          [
            ['summary', row.search_summary],
            ['note', row.search_notes],
            ['highlight', row.search_highlights],
          ] as const
        )
          .map(([source, value]) => ({ source, text: excerpt(value, query) }))
          .find((candidate) => candidate.text !== null) ?? { source: 'text' as const, text: null })
  return {
    id: row.media_item_id,
    title: row.display_title,
    subtype: row.subtype,
    imageUrl: safeHttpUrl(row.image_url),
    author: row.author,
    publication: row.publication,
    publishedAt:
      row.published_at_value === null || row.published_at_precision === null
        ? null
        : {
            value: row.published_at_value,
            precision: row.published_at_precision,
            basis: 'source_asserted',
          },
    readingTime: { raw: row.reading_time_raw, minutes: row.reading_time_minutes },
    progress: {
      value: row.progress_valid === 1 ? row.reading_progress : null,
      valid: row.progress_valid === 1,
    },
    opened: row.opened === 1,
    archive: {
      active: row.in_archive === 1,
      count: row.archive_occurrence_count,
      latestAt: row.effective_archive_at ?? row.latest_archive_at,
    },
    queue: {
      active: row.in_queue === 1,
      state: row.queue_state,
      addedAt: row.queue_added_at,
    },
    feed: { active: row.in_feed === 1, arrivedAt: row.feed_arrived_at },
    currentAvailable: row.current_available === 1,
    searchExcerpt,
  }
}

function dateFilter(
  column: string,
  from: string | undefined,
  to: string | undefined,
  includeUnknown: boolean,
): { sql: string[]; values: DatabaseValue[] } {
  if (from === undefined && to === undefined)
    return includeUnknown ? { sql: [`${column} IS NULL`], values: [] } : { sql: [], values: [] }
  const range = [`${column} IS NOT NULL`]
  const values: DatabaseValue[] = []
  if (from !== undefined) {
    range.push(`${column} >= ?`)
    values.push(from)
  }
  if (to !== undefined) {
    range.push(`${column} < ?`)
    values.push(nextCalendarDay(to))
  }
  const predicate = range.join(' AND ')
  return {
    sql: [includeUnknown ? `((${predicate}) OR ${column} IS NULL)` : `(${predicate})`],
    values,
  }
}

function nextCalendarDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

function archiveOccurrencePredicate(
  input: ArticlesListInput,
  alias = 'ae',
): { sql: string; values: DatabaseValue[]; active: boolean } {
  const base = [
    `${alias}.media_item_id=p.media_item_id`,
    `${alias}.connection_id=p.connection_id`,
    `${alias}.admission_reason='readwise_archive_state'`,
    `${alias}.upstream_state='active'`,
  ]
  const values: DatabaseValue[] = []
  const hasRange = input.archivedFrom !== undefined || input.archivedTo !== undefined
  if (!hasRange && !input.archivedUnknown) return { sql: base.join(' AND '), values, active: false }
  if (!hasRange) {
    base.push(`${alias}.consumed_at_value IS NULL`)
    return { sql: base.join(' AND '), values, active: true }
  }
  const range = [`${alias}.consumed_at_value IS NOT NULL`]
  if (input.archivedFrom !== undefined) {
    range.push(`${alias}.consumed_at_value >= ?`)
    values.push(input.archivedFrom)
  }
  if (input.archivedTo !== undefined) {
    range.push(`${alias}.consumed_at_value < ?`)
    values.push(nextCalendarDay(input.archivedTo))
  }
  base.push(
    input.archivedUnknown
      ? `((${range.join(' AND ')}) OR ${alias}.consumed_at_value IS NULL)`
      : `(${range.join(' AND ')})`,
  )
  return { sql: base.join(' AND '), values, active: true }
}

function publishedFilter(input: ArticlesListInput): { sql: string[]; values: DatabaseValue[] } {
  if (input.publishedFrom === undefined && input.publishedTo === undefined)
    return input.publishedUnknown
      ? { sql: ['p.published_at_value IS NULL'], values: [] }
      : { sql: [], values: [] }
  const low = `CASE p.published_at_precision
    WHEN 'year' THEN p.published_at_value || '-01-01'
    WHEN 'month' THEN p.published_at_value || '-01'
    ELSE substr(p.published_at_value,1,10) END`
  const high = `CASE p.published_at_precision
    WHEN 'year' THEN p.published_at_value || '-12-31'
    WHEN 'month' THEN date(p.published_at_value || '-01','+1 month','-1 day')
    ELSE substr(p.published_at_value,1,10) END`
  const range = ['p.published_at_value IS NOT NULL']
  const values: DatabaseValue[] = []
  if (input.publishedFrom !== undefined) {
    range.push(`${high} >= ?`)
    values.push(input.publishedFrom)
  }
  if (input.publishedTo !== undefined) {
    range.push(`${low} <= ?`)
    values.push(input.publishedTo)
  }
  const predicate = range.join(' AND ')
  return {
    sql: [
      input.publishedUnknown
        ? `((${predicate}) OR p.published_at_value IS NULL)`
        : `(${predicate})`,
    ],
    values,
  }
}

type OmittedFacet =
  | 'types'
  | 'authors'
  | 'publications'
  | 'published'
  | 'readingTime'
  | 'progress'
  | 'currentState'
  | 'queueState'
  | 'opened'
  | 'history'
  | 'date'
function filters(
  input: ArticlesListInput,
  omit?: OmittedFacet,
): { sql: string; values: DatabaseValue[] } {
  const clauses = [
    input.section === 'archive'
      ? 'p.in_archive=1'
      : input.section === 'queue'
        ? 'p.in_queue=1'
        : 'p.in_feed=1',
  ]
  const values: DatabaseValue[] = []
  if (omit !== 'types' && input.types.length > 0) {
    clauses.push(`p.subtype IN (${placeholders(input.types)})`)
    values.push(...input.types)
  }
  if (omit !== 'authors' && input.authors.length > 0) {
    clauses.push(`p.author_key IN (${placeholders(input.authors)})`)
    values.push(...input.authors.map((value) => normalized(value) ?? value))
  }
  if (omit !== 'publications' && input.publications.length > 0) {
    clauses.push(`p.publication_key IN (${placeholders(input.publications)})`)
    values.push(...input.publications.map((value) => normalized(value) ?? value))
  }
  if (omit !== 'published') {
    const published = publishedFilter(input)
    clauses.push(...published.sql)
    values.push(...published.values)
  }
  if (omit !== 'readingTime') {
    const ranges = input.readingTimes.map((value) => {
      if (value === 'unknown') return 'p.reading_time_minutes IS NULL'
      if (value === 'under5') return 'p.reading_time_minutes < 5'
      if (value === '5to15') return '(p.reading_time_minutes >= 5 AND p.reading_time_minutes < 16)'
      if (value === '16to30')
        return '(p.reading_time_minutes >= 16 AND p.reading_time_minutes < 31)'
      if (value === '31to60')
        return '(p.reading_time_minutes >= 31 AND p.reading_time_minutes <= 60)'
      return 'p.reading_time_minutes > 60'
    })
    if (ranges.length > 0) clauses.push(`(${ranges.join(' OR ')})`)
  }
  if (omit !== 'progress') {
    const states = input.progress.map((value) => {
      if (value === 'notOpened') return 'p.opened=0'
      if (value === 'openedZero')
        return '(p.opened=1 AND p.progress_valid=1 AND p.reading_progress=0)'
      if (value === 'inProgress')
        return '(p.progress_valid=1 AND p.reading_progress>0 AND p.reading_progress<1)'
      if (value === 'complete') return '(p.progress_valid=1 AND p.reading_progress>=1)'
      return 'p.progress_valid=0'
    })
    if (states.length > 0) clauses.push(`(${states.join(' OR ')})`)
  }
  if (input.section === 'archive') {
    if (omit !== 'date') {
      const occurrence = archiveOccurrencePredicate(input)
      if (occurrence.active) {
        clauses.push(`EXISTS (SELECT 1 FROM archive_entries ae WHERE ${occurrence.sql})`)
        values.push(...occurrence.values)
      }
    }
    if (omit !== 'currentState' && input.currentStates.length > 0) {
      const states = input.currentStates.map((value) => {
        if (value === 'unknown')
          return `(p.current_available=0 OR EXISTS (SELECT 1 FROM readwise_documents current_unknown
            WHERE current_unknown.media_item_id=p.media_item_id
              AND current_unknown.connection_id=p.connection_id
              AND current_unknown.subtype IS NOT NULL AND current_unknown.upstream_state='active'
              AND current_unknown.current_location NOT IN ('archive','new','later','shortlist','feed')))`
        return `EXISTS (SELECT 1 FROM readwise_documents current_match
          WHERE current_match.media_item_id=p.media_item_id
            AND current_match.connection_id=p.connection_id
            AND current_match.subtype IS NOT NULL AND current_match.upstream_state='active'
            AND current_match.current_location='${value === 'inbox' ? 'new' : value}')`
      })
      clauses.push(`(${states.join(' OR ')})`)
    }
  }
  if (input.section === 'queue') {
    if (omit !== 'queueState' && input.queueStates.length > 0) {
      clauses.push(
        `(${input.queueStates
          .map(
            (value) =>
              `p.${value === 'inbox' ? 'queue_inbox' : value === 'later' ? 'queue_later' : 'queue_shortlist'}=1`,
          )
          .join(' OR ')})`,
      )
    }
    if (omit !== 'date') {
      const date = dateFilter(
        'p.queue_added_at',
        input.addedFrom,
        input.addedTo,
        input.addedUnknown,
      )
      clauses.push(...date.sql)
      values.push(...date.values)
    }
  }
  if (input.section === 'feed') {
    if (omit !== 'date') {
      const date = dateFilter(
        'p.feed_arrived_at',
        input.arrivedFrom,
        input.arrivedTo,
        input.arrivedUnknown,
      )
      clauses.push(...date.sql)
      values.push(...date.values)
    }
    if (omit !== 'opened' && input.opened.length === 1)
      clauses.push(`p.opened=${input.opened[0] === 'opened' ? 1 : 0}`)
    if (omit !== 'history' && input.history.length === 1)
      clauses.push(`p.in_archive=${input.history[0] === 'archived' ? 1 : 0}`)
  }
  const search = input.q === undefined ? null : ftsQuery(input.q)
  if (search !== null) {
    clauses.push(`(EXISTS (SELECT 1 FROM article_search s
      WHERE s.media_item_id=p.media_item_id AND article_search MATCH ?)
      OR EXISTS (SELECT 1 FROM article_content_search cs
        JOIN article_content_search_map sm ON sm.rowid=cs.rowid
        JOIN article_content_manifests cm ON cm.id=sm.manifest_id
        WHERE cm.media_item_id=p.media_item_id AND cm.state='ready'
          AND article_content_search MATCH ?))`)
    values.push(search, search)
  }
  return { sql: clauses.join(' AND '), values }
}

interface CollectionCursor {
  v: 2
  fingerprint: string
  projectionVersion: number
  contentIndexVersion: number
  nullRank: number
  sortValue: string | number | null
  normalizedTitle: string
  mediaItemId: string
  checksum: string
}

function queryFingerprint(input: ArticlesListInput, sort: string, direction: string): string {
  return JSON.stringify({ ...input, cursor: undefined, sort, direction })
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

async function encodeCursor(cursor: Omit<CollectionCursor, 'checksum'>): Promise<string> {
  const serialized = JSON.stringify(cursor)
  return encodeURIComponent(JSON.stringify({ ...cursor, checksum: await digestText(serialized) }))
}

async function decodeCursor(
  value: string | undefined,
  fingerprint: string,
  projectionVersion: number,
  contentIndexVersion: number,
): Promise<CollectionCursor | null> {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CollectionCursor>
    const { checksum, ...unsigned } = parsed
    if (
      parsed.v !== 2 ||
      parsed.fingerprint !== fingerprint ||
      parsed.projectionVersion !== projectionVersion ||
      parsed.contentIndexVersion !== contentIndexVersion ||
      (parsed.nullRank !== 0 && parsed.nullRank !== 1) ||
      typeof parsed.normalizedTitle !== 'string' ||
      typeof parsed.mediaItemId !== 'string' ||
      typeof checksum !== 'string' ||
      checksum !== (await digestText(JSON.stringify(unsigned)))
    )
      throw new Error()
    return parsed as CollectionCursor
  } catch {
    throw new TypeError('Invalid Articles pagination cursor')
  }
}

interface DetailCursor {
  v: 1
  kind: 'history' | 'highlights'
  parentId: string
  values: Array<string | number | null>
  checksum: string
}

async function encodeDetailCursor(cursor: Omit<DetailCursor, 'checksum'>): Promise<string> {
  const serialized = JSON.stringify(cursor)
  return encodeURIComponent(JSON.stringify({ ...cursor, checksum: await digestText(serialized) }))
}

async function decodeDetailCursor(
  value: string | undefined,
  kind: DetailCursor['kind'],
  parentId: string,
  valueCount: number,
): Promise<DetailCursor | null> {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<DetailCursor>
    const { checksum, ...unsigned } = parsed
    if (
      parsed.v !== 1 ||
      parsed.kind !== kind ||
      parsed.parentId !== parentId ||
      !Array.isArray(parsed.values) ||
      parsed.values.length !== valueCount ||
      typeof checksum !== 'string' ||
      checksum !== (await digestText(JSON.stringify(unsigned)))
    )
      throw new Error()
    return parsed as DetailCursor
  } catch {
    throw new TypeError(`Invalid Article ${kind} cursor`)
  }
}

export class SqlArticlesRepository {
  constructor(private readonly database: DatabaseClient) {}

  async applyDocumentsPage(documents: readonly ReaderArticleDocumentProjection[]): Promise<void> {
    for (const document of documents) {
      const existing = await statement(
        this.database,
        'SELECT id FROM readwise_documents WHERE connection_id=? AND document_id=?',
        [document.connectionId, document.documentId],
      ).first<{ id: string }>()
      const id = existing?.id ?? document.id
      const published = temporalParts(document.publishedAt)
      const statements: DatabaseStatement[] = [
        statement(
          this.database,
          `INSERT INTO readwise_documents(
            id,connection_id,document_id,media_item_id,external_identity_id,reader_url,source_url,
            raw_category,subtype,current_location,upstream_state,title,normalized_title,author,author_key,
            publication,publication_key,acquisition_source,summary,image_url,document_note,word_count,
            reading_time_raw,reading_time_minutes,reading_time_parser_version,listening_time_raw,
            reading_progress,progress_valid,published_at_value,published_at_precision,published_at_basis,
            created_at_source,saved_at,first_opened_at,last_opened_at,last_moved_at,updated_at_source,
            last_source_record_id,last_observed_at,last_snapshot_run_id,projection_version)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
           ON CONFLICT(connection_id,document_id) DO UPDATE SET
            media_item_id=excluded.media_item_id,external_identity_id=excluded.external_identity_id,
            reader_url=excluded.reader_url,source_url=excluded.source_url,raw_category=excluded.raw_category,
            subtype=excluded.subtype,current_location=excluded.current_location,upstream_state='active',
            title=excluded.title,normalized_title=excluded.normalized_title,author=excluded.author,
            author_key=excluded.author_key,publication=excluded.publication,
            publication_key=excluded.publication_key,acquisition_source=excluded.acquisition_source,
            summary=excluded.summary,image_url=excluded.image_url,document_note=excluded.document_note,
            word_count=excluded.word_count,reading_time_raw=excluded.reading_time_raw,
            reading_time_minutes=excluded.reading_time_minutes,
            reading_time_parser_version=excluded.reading_time_parser_version,
            listening_time_raw=excluded.listening_time_raw,reading_progress=excluded.reading_progress,
            progress_valid=excluded.progress_valid,published_at_value=excluded.published_at_value,
            published_at_precision=excluded.published_at_precision,published_at_basis=excluded.published_at_basis,
            created_at_source=excluded.created_at_source,saved_at=excluded.saved_at,
            first_opened_at=excluded.first_opened_at,last_opened_at=excluded.last_opened_at,
            last_moved_at=excluded.last_moved_at,updated_at_source=excluded.updated_at_source,
            last_source_record_id=excluded.last_source_record_id,last_observed_at=excluded.last_observed_at,
            last_snapshot_run_id=excluded.last_snapshot_run_id,projection_version=readwise_documents.projection_version+1`,
          [
            id,
            document.connectionId,
            document.documentId,
            document.mediaItemId,
            document.externalIdentityId,
            document.readerUrl,
            document.sourceUrl,
            document.rawCategory,
            document.subtype,
            document.currentLocation,
            'active',
            document.title,
            normalized(document.title),
            document.author,
            normalized(document.author),
            document.publication,
            normalized(document.publication),
            document.acquisitionSource,
            document.summary,
            document.imageUrl,
            document.documentNote,
            document.wordCount,
            document.readingTimeRaw,
            document.readingTimeMinutes,
            2,
            document.listeningTimeRaw,
            document.readingProgress,
            document.progressValid ? 1 : 0,
            ...published,
            document.createdAt,
            document.savedAt,
            document.firstOpenedAt,
            document.lastOpenedAt,
            document.lastMovedAt,
            document.updatedAt,
            document.sourceRecordId,
            document.observedAt,
            document.snapshotRunId,
          ],
        ),
        statement(
          this.database,
          `UPDATE readwise_document_tags SET upstream_state='removed',last_observed_at=?
           WHERE readwise_document_id=?`,
          [document.observedAt, id],
        ),
        statement(
          this.database,
          `UPDATE archive_entries SET upstream_state='active',updated_at=?
           WHERE media_item_id=? AND connection_id=? AND admission_reason='readwise_archive_state'`,
          [document.observedAt, document.mediaItemId, document.connectionId],
        ),
      ]
      for (const tag of document.tags) {
        statements.push(
          statement(
            this.database,
            `INSERT INTO readwise_tags(connection_id,tag_key,display_name,source_record_id,upstream_state,first_observed_at,last_observed_at)
             VALUES(?,?,?,?,'active',?,?)
             ON CONFLICT(connection_id,tag_key) DO UPDATE SET display_name=excluded.display_name,
               source_record_id=excluded.source_record_id,upstream_state='active',last_observed_at=excluded.last_observed_at`,
            [
              document.connectionId,
              tag.key,
              tag.name,
              document.sourceRecordId,
              document.observedAt,
              document.observedAt,
            ],
          ),
          statement(
            this.database,
            `INSERT INTO readwise_document_tags(readwise_document_id,tag_key,source_type,created_value,upstream_state,source_record_id,first_observed_at,last_observed_at)
             VALUES(?,?,?,?,'active',?,?,?)
             ON CONFLICT(readwise_document_id,tag_key) DO UPDATE SET source_type=excluded.source_type,
               created_value=excluded.created_value,upstream_state='active',source_record_id=excluded.source_record_id,
               last_observed_at=excluded.last_observed_at`,
            [
              id,
              tag.key,
              tag.type,
              tag.created,
              document.sourceRecordId,
              document.observedAt,
              document.observedAt,
            ],
          ),
        )
      }
      const state = queueState(document.currentLocation)
      const queue = await statement(
        this.database,
        'SELECT id FROM queue_entries WHERE connection_id=? AND source_membership_key=?',
        [document.connectionId, `reader-document:${document.documentId}`],
      ).first<{ id: string }>()
      if (state !== null) {
        const queueId = queue?.id ?? `${id}:queue`
        statements.push(
          statement(
            this.database,
            `INSERT INTO queue_entries(id,media_item_id,connection_id,source_membership_key,relationship_type,
              added_at_value,added_at_precision,added_at_basis,upstream_state,first_observed_at,last_observed_at,
              retired_observed_at,projection_version,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,'active',?,?,NULL,1,?,?)
             ON CONFLICT(connection_id,source_membership_key) DO UPDATE SET media_item_id=excluded.media_item_id,
               relationship_type=excluded.relationship_type,added_at_value=excluded.added_at_value,
               added_at_precision=excluded.added_at_precision,added_at_basis=excluded.added_at_basis,
               upstream_state='active',last_observed_at=excluded.last_observed_at,retired_observed_at=NULL,
               projection_version=queue_entries.projection_version+1,updated_at=excluded.updated_at`,
            [
              queueId,
              document.mediaItemId,
              document.connectionId,
              `reader-document:${document.documentId}`,
              `readwise_${state}`,
              document.savedAt,
              document.savedAt === null ? null : 'instant',
              document.savedAt === null ? null : 'source_asserted',
              document.observedAt,
              document.observedAt,
              document.observedAt,
              document.observedAt,
            ],
          ),
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             VALUES(?,?,?,?,?)`,
            [
              `${queueId}:membership:${document.sourceRecordId}`,
              queueId,
              document.sourceRecordId,
              'membership',
              document.observedAt,
            ],
          ),
        )
      } else if (queue !== null) {
        statements.push(
          statement(
            this.database,
            `UPDATE queue_entries SET upstream_state='removed',last_observed_at=?,retired_observed_at=?,
              projection_version=projection_version+1,updated_at=? WHERE id=?`,
            [document.observedAt, document.observedAt, document.observedAt, queue.id],
          ),
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             VALUES(?,?,?,?,?)`,
            [
              `${queue.id}:removal:${document.sourceRecordId}`,
              queue.id,
              document.sourceRecordId,
              'removal',
              document.observedAt,
            ],
          ),
        )
      }
      await this.database.batch(statements)
    }
  }

  async retireArticleDocuments(
    documents: readonly ReaderArticleRetirementProjection[],
  ): Promise<void> {
    for (const document of documents) {
      const existing = await statement(
        this.database,
        'SELECT id FROM readwise_documents WHERE connection_id=? AND document_id=? AND subtype IS NOT NULL',
        [document.connectionId, document.documentId],
      ).first<{ id: string }>()
      if (existing === null) continue
      const queue = await statement(
        this.database,
        'SELECT id FROM queue_entries WHERE connection_id=? AND source_membership_key=? AND upstream_state=?',
        [document.connectionId, `reader-document:${document.documentId}`, 'active'],
      ).first<{ id: string }>()
      const statements: DatabaseStatement[] = [
        statement(
          this.database,
          `UPDATE readwise_documents SET raw_category=?,subtype=NULL,current_location=?,upstream_state='active',
            last_source_record_id=?,last_observed_at=?,last_snapshot_run_id=?,projection_version=projection_version+1
           WHERE id=?`,
          [
            document.rawCategory,
            document.currentLocation,
            document.sourceRecordId,
            document.observedAt,
            document.snapshotRunId,
            existing.id,
          ],
        ),
        statement(
          this.database,
          `UPDATE readwise_document_tags SET upstream_state='removed',last_observed_at=?
           WHERE readwise_document_id=?`,
          [document.observedAt, existing.id],
        ),
      ]
      if (queue !== null) {
        statements.push(
          statement(
            this.database,
            `UPDATE queue_entries SET upstream_state='removed',last_observed_at=?,retired_observed_at=?,
              projection_version=projection_version+1,updated_at=? WHERE id=?`,
            [document.observedAt, document.observedAt, document.observedAt, queue.id],
          ),
          statement(
            this.database,
            `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
             VALUES(?,?,?,?,?)`,
            [
              `${queue.id}:removal:${document.sourceRecordId}`,
              queue.id,
              document.sourceRecordId,
              'removal',
              document.observedAt,
            ],
          ),
        )
      }
      await this.database.batch(statements)
    }
  }

  async finalizeDocumentsSnapshot(input: {
    connectionId: string
    syncRunId: string
    snapshotSourceRecordId: string
    completedAt: string
    parserVersion: string
  }): Promise<void> {
    const unseen = await statement(
      this.database,
      `SELECT q.id FROM queue_entries q JOIN readwise_documents d
        ON d.connection_id=q.connection_id AND q.source_membership_key='reader-document:' || d.document_id
       WHERE q.connection_id=? AND q.upstream_state='active'
         AND (d.last_snapshot_run_id IS NULL OR d.last_snapshot_run_id<>?)`,
      [input.connectionId, input.syncRunId],
    ).all<{ id: string }>()
    const statements: DatabaseStatement[] = [
      statement(
        this.database,
        `UPDATE readwise_documents SET upstream_state='unknown',projection_version=projection_version+1
         WHERE connection_id=? AND (last_snapshot_run_id IS NULL OR last_snapshot_run_id<>?)`,
        [input.connectionId, input.syncRunId],
      ),
      statement(
        this.database,
        `UPDATE queue_entries SET upstream_state='removed',retired_observed_at=?,last_observed_at=?,
          projection_version=projection_version+1,updated_at=?
         WHERE id IN (SELECT q.id FROM queue_entries q JOIN readwise_documents d
           ON d.connection_id=q.connection_id AND q.source_membership_key='reader-document:' || d.document_id
           WHERE q.connection_id=? AND (d.last_snapshot_run_id IS NULL OR d.last_snapshot_run_id<>?))`,
        [
          input.completedAt,
          input.completedAt,
          input.completedAt,
          input.connectionId,
          input.syncRunId,
        ],
      ),
      statement(
        this.database,
        `INSERT INTO readwise_projection_state(connection_id,documents_snapshot_run_id,
          documents_snapshot_completed_at,documents_parser_version,incremental_watermark,
          full_text_policy,content_acquisition_version,content_index_version,projection_version)
         VALUES(?,?,?,?,?,'archive_queue',1,1,0)
         ON CONFLICT(connection_id) DO UPDATE SET documents_snapshot_run_id=excluded.documents_snapshot_run_id,
          documents_snapshot_completed_at=excluded.documents_snapshot_completed_at,
          documents_parser_version=excluded.documents_parser_version,
          incremental_watermark=excluded.incremental_watermark`,
        [
          input.connectionId,
          input.syncRunId,
          input.completedAt,
          input.parserVersion,
          input.completedAt,
        ],
      ),
    ]
    for (const row of unseen.results) {
      statements.push(
        statement(
          this.database,
          `INSERT OR IGNORE INTO queue_entry_evidence(id,queue_entry_id,source_record_id,role,linked_at)
           VALUES(?,?,?,?,?)`,
          [
            `${row.id}:removal:${input.snapshotSourceRecordId}`,
            row.id,
            input.snapshotSourceRecordId,
            'removal',
            input.completedAt,
          ],
        ),
      )
    }
    await this.database.batch(statements)
  }

  async applyHighlightContainers(
    containers: readonly ReaderHighlightContainerProjection[],
  ): Promise<void> {
    for (const container of containers) {
      const linkedDocument =
        container.source?.toLowerCase() === 'reader' && container.externalId !== null
          ? await statement(
              this.database,
              'SELECT id FROM readwise_documents WHERE connection_id=? AND document_id=?',
              [container.connectionId, container.externalId],
            ).first<{ id: string }>()
          : null
      const existing = await statement(
        this.database,
        'SELECT id FROM readwise_highlight_containers WHERE connection_id=? AND user_book_id=?',
        [container.connectionId, container.userBookId],
      ).first<{ id: string }>()
      const id = existing?.id ?? container.id
      const statements: DatabaseStatement[] = [
        statement(
          this.database,
          `INSERT INTO readwise_highlight_containers(id,connection_id,user_book_id,external_id,
            readwise_document_id,title,author,source,category,source_url,document_note,upstream_state,
            source_record_id,source_updated_at,last_observed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?)
           ON CONFLICT(connection_id,user_book_id) DO UPDATE SET external_id=excluded.external_id,
            readwise_document_id=excluded.readwise_document_id,title=excluded.title,author=excluded.author,
            source=excluded.source,category=excluded.category,source_url=excluded.source_url,
            document_note=excluded.document_note,upstream_state=excluded.upstream_state,
            source_record_id=excluded.source_record_id,source_updated_at=excluded.source_updated_at,
            last_observed_at=excluded.last_observed_at`,
          [
            id,
            container.connectionId,
            container.userBookId,
            container.externalId,
            linkedDocument?.id ?? null,
            container.title,
            container.author,
            container.source,
            container.category,
            container.sourceUrl,
            container.documentNote,
            container.deleted ? 'removed' : 'active',
            container.sourceRecordId,
            container.sourceUpdatedAt,
            container.observedAt,
          ],
        ),
        statement(
          this.database,
          `UPDATE readwise_highlights SET upstream_state='removed',last_observed_at=? WHERE container_id=?`,
          [container.observedAt, id],
        ),
      ]
      for (const highlight of container.highlights) {
        statements.push(
          statement(
            this.database,
            `INSERT INTO readwise_highlights(id,connection_id,highlight_id,container_id,text,note,
              location,end_location,location_type,color,is_favorite,is_discard,upstream_state,
              highlighted_at,created_at_source,updated_at_source,reader_url,source_record_id,last_observed_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(connection_id,highlight_id) DO UPDATE SET container_id=excluded.container_id,
              text=excluded.text,note=excluded.note,location=excluded.location,end_location=excluded.end_location,
              location_type=excluded.location_type,color=excluded.color,is_favorite=excluded.is_favorite,
              is_discard=excluded.is_discard,upstream_state=excluded.upstream_state,
              highlighted_at=excluded.highlighted_at,created_at_source=excluded.created_at_source,
              updated_at_source=excluded.updated_at_source,reader_url=excluded.reader_url,
              source_record_id=excluded.source_record_id,last_observed_at=excluded.last_observed_at`,
            [
              highlight.id,
              container.connectionId,
              highlight.highlightId,
              id,
              highlight.deleted || container.deleted || highlight.discard ? null : highlight.text,
              highlight.deleted || container.deleted || highlight.discard ? null : highlight.note,
              highlight.location,
              highlight.endLocation,
              highlight.locationType,
              highlight.color,
              highlight.favorite ? 1 : 0,
              highlight.discard ? 1 : 0,
              highlight.deleted || container.deleted ? 'removed' : 'active',
              highlight.highlightedAt,
              highlight.createdAt,
              highlight.updatedAt,
              highlight.readerUrl,
              container.sourceRecordId,
              container.observedAt,
            ],
          ),
        )
      }
      await this.database.batch(statements)
    }
  }

  async finalizeHighlightsSnapshot(input: {
    connectionId: string
    syncRunId: string
    completedAt: string
    parserVersion: string
  }): Promise<void> {
    await statement(
      this.database,
      `INSERT INTO readwise_projection_state(connection_id,highlights_snapshot_run_id,
        highlights_snapshot_completed_at,highlights_parser_version,full_text_policy,
        content_acquisition_version,content_index_version,projection_version)
       VALUES(?,?,?,?,'archive_queue',1,1,0)
       ON CONFLICT(connection_id) DO UPDATE SET highlights_snapshot_run_id=excluded.highlights_snapshot_run_id,
        highlights_snapshot_completed_at=excluded.highlights_snapshot_completed_at,
        highlights_parser_version=excluded.highlights_parser_version`,
      [input.connectionId, input.syncRunId, input.completedAt, input.parserVersion],
    ).run()
  }

  /** Reserve a small current-source batch; failed deliveries have a finite
   * acquisition allowance per source version. Existing manifests/evidence stay
   * retained when a new source version makes another job eligible. */
  async reserveContentTargets(
    connectionId: string,
    reservationId: string,
    createdAt: string,
    limit = 20,
  ): Promise<ArticleContentTarget[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('Article content reservation limit must be between 1 and 100')
    const staleBefore = new Date(Date.parse(createdAt) - 30 * 60 * 1_000).toISOString()
    const rows = await statement(
      this.database,
      `SELECT d.connection_id,d.document_id,d.id readwise_document_id,d.media_item_id,d.updated_at_source
       FROM readwise_documents d JOIN article_library_projection p ON p.media_item_id=d.media_item_id
       LEFT JOIN article_content_jobs j ON j.idempotency_key=
         'readwise-content:'||d.connection_id||':'||d.document_id||':'||COALESCE(d.updated_at_source,'unknown')||':a1:e1'
       WHERE d.connection_id=? AND d.upstream_state='active' AND (p.in_archive=1 OR p.in_queue=1)
         AND (NOT EXISTS (SELECT 1 FROM article_content_manifests m
           WHERE m.readwise_document_id=d.id AND m.state='ready'
             AND COALESCE(m.source_updated_at,'')=COALESCE(d.updated_at_source,''))
           OR NOT EXISTS (SELECT 1 FROM article_content_raw_acquisitions ra
             WHERE ra.readwise_document_id=d.id AND ra.processing_status='processed'))
         AND (j.idempotency_key IS NULL OR (j.status<>'completed' AND j.attempt_count<3 AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
           AND COALESCE(j.failure_class,'') NOT IN ('content_unavailable','no_indexable_text','content_too_large')
           AND (j.status='failed' OR j.updated_at IS NULL OR j.updated_at<? OR EXISTS (
             SELECT 1 FROM sync_runs r WHERE r.id=j.reservation_id AND r.status='failed'))))
       ORDER BY d.document_id LIMIT ?`,
      [connectionId, createdAt, staleBefore, limit],
    ).all<{
      connection_id: string
      document_id: string
      readwise_document_id: string
      media_item_id: string
      updated_at_source: string | null
    }>()
    const targets: ArticleContentTarget[] = []
    for (const row of rows.results) {
      const idempotencyKey = `readwise-content:${row.connection_id}:${row.document_id}:${row.updated_at_source ?? 'unknown'}:a1:e1`
      const reserved = await statement(
        this.database,
        `INSERT INTO article_content_jobs(idempotency_key,connection_id,readwise_document_id,document_id,source_updated_at,reservation_id,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,'pending',?,?)
         ON CONFLICT(idempotency_key) DO UPDATE SET reservation_id=excluded.reservation_id,
           status='pending',updated_at=excluded.updated_at,failure_class=NULL,next_attempt_at=NULL
         WHERE article_content_jobs.status<>'completed' AND article_content_jobs.attempt_count<3
           AND (article_content_jobs.next_attempt_at IS NULL OR article_content_jobs.next_attempt_at<=?)
           AND COALESCE(article_content_jobs.failure_class,'') NOT IN ('content_unavailable','no_indexable_text','content_too_large')
           AND (article_content_jobs.status='failed' OR article_content_jobs.updated_at IS NULL
             OR article_content_jobs.updated_at<? OR EXISTS (SELECT 1 FROM sync_runs r
               WHERE r.id=article_content_jobs.reservation_id AND r.status='failed'))
         RETURNING idempotency_key`,
        [
          idempotencyKey,
          row.connection_id,
          row.readwise_document_id,
          row.document_id,
          row.updated_at_source,
          reservationId,
          createdAt,
          createdAt,
          createdAt,
          staleBefore,
        ],
      ).first<{ idempotency_key: string }>()
      if (reserved !== null)
        targets.push({
          connectionId: row.connection_id,
          documentId: row.document_id,
          readwiseDocumentId: row.readwise_document_id,
          mediaItemId: row.media_item_id,
          sourceUpdatedAt: row.updated_at_source,
        })
    }
    return targets
  }

  async findContentTarget(
    connectionId: string,
    documentId: string,
  ): Promise<ArticleContentTarget | null> {
    const row = await statement(
      this.database,
      `SELECT d.connection_id,d.document_id,d.id readwise_document_id,d.media_item_id,d.updated_at_source
       FROM readwise_documents d JOIN article_library_projection p ON p.media_item_id=d.media_item_id
       WHERE d.connection_id=? AND d.document_id=? AND d.upstream_state='active'
         AND (p.in_archive=1 OR p.in_queue=1)`,
      [connectionId, documentId],
    ).first<{
      connection_id: string
      document_id: string
      readwise_document_id: string
      media_item_id: string
      updated_at_source: string | null
    }>()
    return row === null
      ? null
      : {
          connectionId: row.connection_id,
          documentId: row.document_id,
          readwiseDocumentId: row.readwise_document_id,
          mediaItemId: row.media_item_id,
          sourceUpdatedAt: row.updated_at_source,
        }
  }

  async recordContentRawAcquisition(input: {
    id: string
    idempotencyKey: string
    attemptNumber: number
    connectionId: string
    readwiseDocumentId: string
    storageKey: string
    sha256: string
    contentType: string
    byteLength: number
    acquiredAt: string
    status: 'pending' | 'processed' | 'failed'
    error?: string | null
  }): Promise<void> {
    await statement(
      this.database,
      `INSERT INTO article_content_raw_acquisitions(id,idempotency_key,attempt_number,connection_id,
        readwise_document_id,storage_key,sha256,content_type,byte_length,acquired_at,
        processing_status,processing_error)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        processing_status=excluded.processing_status,processing_error=excluded.processing_error`,
      [
        input.id,
        input.idempotencyKey,
        input.attemptNumber,
        input.connectionId,
        input.readwiseDocumentId,
        input.storageKey,
        input.sha256,
        input.contentType,
        input.byteLength,
        input.acquiredAt,
        input.status,
        input.error ?? null,
      ],
    ).run()
  }

  async beginContent(content: Omit<ArticleContentProjection, 'chunks'>): Promise<void> {
    await statement(
      this.database,
      `INSERT INTO article_content_manifests(id,readwise_document_id,media_item_id,content_kind,
        raw_object_key,raw_sha256,extracted_object_key,extracted_sha256,source_updated_at,
        extraction_version,state,coverage,language,acquired_at,processed_at,policy_version,failure_class)
       VALUES(?,?,?,'reader_html',?,?,?,?,?,1,'pending',?,NULL,?,NULL,1,NULL)
       ON CONFLICT(id) DO UPDATE SET raw_object_key=excluded.raw_object_key,
        raw_sha256=excluded.raw_sha256,extracted_object_key=excluded.extracted_object_key,
        extracted_sha256=excluded.extracted_sha256,
        state=CASE WHEN article_content_manifests.state='ready' THEN 'ready' ELSE 'pending' END,
        coverage=excluded.coverage,failure_class=NULL`,
      [
        content.manifestId,
        content.readwiseDocumentId,
        content.mediaItemId,
        content.rawObjectKey,
        content.rawSha256,
        content.extractedObjectKey,
        content.extractedSha256,
        content.sourceUpdatedAt,
        content.coverage,
        content.acquiredAt,
      ],
    ).run()
  }

  async applyContentChunkBatch(
    manifestId: string,
    chunks: ArticleContentProjection['chunks'],
  ): Promise<void> {
    for (const chunk of chunks) {
      await statement(
        this.database,
        `INSERT INTO article_content_chunks(manifest_id,ordinal,byte_start,byte_length,sha256)
         VALUES(?,?,?,?,?) ON CONFLICT(manifest_id,ordinal) DO UPDATE SET
          byte_start=excluded.byte_start,byte_length=excluded.byte_length,sha256=excluded.sha256`,
        [manifestId, chunk.ordinal, chunk.byteStart, chunk.byteLength, chunk.sha256],
      ).run()
      const map = await statement(
        this.database,
        `INSERT INTO article_content_search_map(manifest_id,chunk_ordinal) VALUES(?,?)
         ON CONFLICT(manifest_id,chunk_ordinal) DO UPDATE SET manifest_id=excluded.manifest_id
         RETURNING rowid`,
        [manifestId, chunk.ordinal],
      ).first<{ rowid: number }>()
      if (map !== null)
        await statement(
          this.database,
          `INSERT OR REPLACE INTO article_content_search(rowid,manifest_id,chunk_ordinal,content)
           VALUES(?,?,?,?)`,
          [map.rowid, manifestId, chunk.ordinal, chunk.text],
        ).run()
    }
  }

  async hasContentChunkRange(manifestId: string, expectedCount: number): Promise<boolean> {
    if (!Number.isInteger(expectedCount) || expectedCount < 1)
      throw new RangeError('Content chunk count must be a positive integer')
    const row = await statement(
      this.database,
      `SELECT COUNT(*) chunk_count,MIN(c.ordinal) first_ordinal,MAX(c.ordinal) last_ordinal,
         COUNT(s.rowid) indexed_count
       FROM article_content_chunks c
       LEFT JOIN article_content_search_map m ON m.manifest_id=c.manifest_id AND m.chunk_ordinal=c.ordinal
       LEFT JOIN article_content_search s ON s.rowid=m.rowid
       WHERE c.manifest_id=?`,
      [manifestId],
    ).first<{
      chunk_count: number
      first_ordinal: number | null
      last_ordinal: number | null
      indexed_count: number
    }>()
    return (
      row?.chunk_count === expectedCount &&
      row.first_ordinal === 0 &&
      row.last_ordinal === expectedCount - 1 &&
      row.indexed_count === expectedCount
    )
  }

  async findContentManifest(manifestId: string): Promise<{
    id: string
    connectionId: string
    readwiseDocumentId: string
    mediaItemId: string
    extractedObjectKey: string
    state: 'pending' | 'ready' | 'failed'
  } | null> {
    const row = await statement(
      this.database,
      `SELECT m.id,d.connection_id,m.readwise_document_id,m.media_item_id,m.extracted_object_key,m.state
       FROM article_content_manifests m JOIN readwise_documents d ON d.id=m.readwise_document_id
       WHERE m.id=? AND m.state IN ('pending','ready','failed')`,
      [manifestId],
    ).first<{
      id: string
      connection_id: string
      readwise_document_id: string
      media_item_id: string
      extracted_object_key: string
      state: 'pending' | 'ready' | 'failed'
    }>()
    return row === null
      ? null
      : {
          id: row.id,
          connectionId: row.connection_id,
          readwiseDocumentId: row.readwise_document_id,
          mediaItemId: row.media_item_id,
          extractedObjectKey: row.extracted_object_key,
          state: row.state,
        }
  }

  async resumeContentManifest(manifestId: string): Promise<void> {
    await statement(
      this.database,
      `UPDATE article_content_manifests SET state='pending',failure_class=NULL,processed_at=NULL
       WHERE id=? AND state='failed'`,
      [manifestId],
    ).run()
  }

  async finalizeContent(
    manifestId: string,
    idempotencyKey: string,
    processedAt: string,
  ): Promise<void> {
    const manifest = await statement(
      this.database,
      'SELECT readwise_document_id,media_item_id FROM article_content_manifests WHERE id=?',
      [manifestId],
    ).first<{ readwise_document_id: string; media_item_id: string }>()
    if (manifest === null) return
    await this.database.batch([
      statement(
        this.database,
        `UPDATE article_content_manifests SET state='expired'
         WHERE readwise_document_id=? AND id<>? AND state='ready'
           AND EXISTS(SELECT 1 FROM article_content_manifests target
             JOIN readwise_documents d ON d.id=target.readwise_document_id
             WHERE target.id=? AND target.source_updated_at IS d.updated_at_source)`,
        [manifest.readwise_document_id, manifestId, manifestId],
      ),
      statement(
        this.database,
        `UPDATE article_content_manifests SET state=CASE WHEN EXISTS(
           SELECT 1 FROM readwise_documents d
           WHERE d.id=article_content_manifests.readwise_document_id
             AND article_content_manifests.source_updated_at IS d.updated_at_source
         ) THEN 'ready' ELSE 'expired' END,processed_at=?,failure_class=NULL WHERE id=?`,
        [processedAt, manifestId],
      ),
      statement(
        this.database,
        `UPDATE article_library_projection SET content_available=EXISTS(
           SELECT 1 FROM article_content_manifests m
           WHERE m.media_item_id=article_library_projection.media_item_id AND m.state='ready'
         ) WHERE media_item_id=?`,
        [manifest.media_item_id],
      ),
      statement(
        this.database,
        `UPDATE article_content_jobs SET status='completed',completed_at=?,updated_at=?,failure_class=NULL
         WHERE idempotency_key=?`,
        [processedAt, processedAt, idempotencyKey],
      ),
      statement(
        this.database,
        `UPDATE readwise_projection_state SET content_index_version=content_index_version+1
         WHERE connection_id=(SELECT connection_id FROM readwise_documents WHERE id=?)`,
        [manifest.readwise_document_id],
      ),
    ])
  }

  async failContentJob(
    idempotencyKey: string,
    failedAt: string,
    failureClass: string,
  ): Promise<void> {
    await this.database.batch([
      statement(
        this.database,
        `UPDATE article_content_manifests SET state='failed',processed_at=?,failure_class=?
         WHERE state='pending' AND readwise_document_id=(SELECT readwise_document_id
           FROM article_content_jobs WHERE idempotency_key=?)
           AND COALESCE(source_updated_at,'')=COALESCE((SELECT source_updated_at
             FROM article_content_jobs WHERE idempotency_key=?),'')`,
        [failedAt, failureClass, idempotencyKey, idempotencyKey],
      ),
      statement(
        this.database,
        `UPDATE article_content_jobs SET status='failed',updated_at=?,failure_class=? WHERE idempotency_key=? AND status<>'completed'`,
        [failedAt, failureClass, idempotencyKey],
      ),
    ])
  }

  async deferContentJob(
    idempotencyKey: string,
    failedAt: string,
    nextAttemptAt: string,
  ): Promise<void> {
    await statement(
      this.database,
      `UPDATE article_content_jobs SET status='failed',updated_at=?,next_attempt_at=?,failure_class='rate_limited'
       WHERE idempotency_key=? AND status<>'completed'`,
      [failedAt, nextAttemptAt, idempotencyKey],
    ).run()
  }

  async startContentJob(idempotencyKey: string, attemptedAt: string): Promise<number | null> {
    const row = await statement(
      this.database,
      `UPDATE article_content_jobs SET status='pending',last_attempt_at=?,updated_at=?,next_attempt_at=NULL,
        attempt_count=attempt_count+1 WHERE idempotency_key=? AND status<>'completed' AND attempt_count<3 AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING attempt_count`,
      [attemptedAt, attemptedAt, idempotencyKey, attemptedAt],
    ).first<{ attempt_count: number }>()
    return row?.attempt_count ?? null
  }

  async completeContentJob(idempotencyKey: string, completedAt: string): Promise<void> {
    await statement(
      this.database,
      `UPDATE article_content_jobs SET status='completed',completed_at=?,updated_at=?,failure_class=NULL
       WHERE idempotency_key=?`,
      [completedAt, completedAt, idempotencyKey],
    ).run()
  }

  async applyContent(content: ArticleContentProjection): Promise<void> {
    await this.beginContent(content)
    for (let index = 0; index < content.chunks.length; index += 12)
      await this.applyContentChunkBatch(content.manifestId, content.chunks.slice(index, index + 12))
    await this.finalizeContent(content.manifestId, '__test_without_job__', content.processedAt)
  }

  async rebuildProjection(input: {
    connectionId: string
    syncRunId: string
    rebuiltAt: string
  }): Promise<void> {
    const state = await statement(
      this.database,
      'SELECT projection_version FROM readwise_projection_state WHERE connection_id=?',
      [input.connectionId],
    ).first<{ projection_version: number }>()
    const version = (state?.projection_version ?? 0) + 1
    await this.database.batch([
      statement(
        this.database,
        'DELETE FROM article_search WHERE media_item_id IN (SELECT media_item_id FROM article_library_projection WHERE connection_id=?)',
        [input.connectionId],
      ),
      statement(this.database, 'DELETE FROM article_library_projection WHERE connection_id=?', [
        input.connectionId,
      ]),
      statement(
        this.database,
        `INSERT INTO article_library_projection(
          media_item_id,connection_id,readwise_document_id,display_title,imported_title,normalized_title,
          subtype,image_url,author,author_key,publication,publication_key,published_at_value,published_at_precision,
          reading_time_raw,reading_time_minutes,reading_progress,progress_valid,opened,in_archive,
          archive_occurrence_count,latest_archive_at,has_unknown_archive_date,in_queue,queue_state,
          queue_inbox,queue_later,queue_shortlist,queue_added_at,in_feed,feed_arrived_at,current_location,current_available,
          tag_count,active_highlight_count,content_available,source_refreshed_at,projection_version)
         WITH ranked AS (
           SELECT d.*, ROW_NUMBER() OVER (PARTITION BY d.media_item_id ORDER BY
             CASE d.upstream_state WHEN 'active' THEN 0 ELSE 1 END,
             CASE d.current_location WHEN 'archive' THEN 0 WHEN 'shortlist' THEN 1 WHEN 'later' THEN 2
               WHEN 'new' THEN 3 WHEN 'feed' THEN 4 ELSE 5 END,
             d.saved_at DESC,d.document_id) rank
           FROM readwise_documents d WHERE d.connection_id=? AND d.subtype IS NOT NULL
         ), chosen AS (SELECT * FROM ranked WHERE rank=1), facts AS (
           SELECT d.*,
             (SELECT COUNT(*) FROM archive_entries a WHERE a.media_item_id=d.media_item_id
               AND a.connection_id=d.connection_id AND a.admission_reason='readwise_archive_state'
               AND a.upstream_state='active') archive_count,
             (SELECT MAX(a.consumed_at_value) FROM archive_entries a WHERE a.media_item_id=d.media_item_id
               AND a.connection_id=d.connection_id AND a.admission_reason='readwise_archive_state'
               AND a.upstream_state='active') latest_archive,
             EXISTS(SELECT 1 FROM archive_entries a WHERE a.media_item_id=d.media_item_id
               AND a.connection_id=d.connection_id AND a.admission_reason='readwise_archive_state'
               AND a.upstream_state='active' AND a.consumed_at_value IS NULL) unknown_archive,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location IN ('new','later','shortlist')) in_any_queue,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location='new') in_inbox,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location='later') in_later,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location='shortlist') in_shortlist,
             (SELECT x.saved_at FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location IN ('new','later','shortlist') ORDER BY
                 CASE x.current_location WHEN 'shortlist' THEN 0 WHEN 'later' THEN 1 ELSE 2 END,
                 x.saved_at DESC,x.document_id LIMIT 1) queue_added,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location='feed') in_any_feed,
             (SELECT MAX(x.saved_at) FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               AND x.current_location='feed') feed_arrived,
             (SELECT x.current_location FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active'
               ORDER BY CASE x.current_location WHEN 'shortlist' THEN 0 WHEN 'later' THEN 1 WHEN 'new' THEN 2
                 WHEN 'feed' THEN 3 WHEN 'archive' THEN 4 ELSE 5 END,x.saved_at DESC,x.document_id LIMIT 1) active_location,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.upstream_state='active') any_current,
             EXISTS(SELECT 1 FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL AND x.first_opened_at IS NOT NULL) any_opened,
             (SELECT COUNT(DISTINCT t.tag_key) FROM readwise_document_tags t
               JOIN readwise_documents x ON x.id=t.readwise_document_id
               WHERE x.media_item_id=d.media_item_id AND x.connection_id=d.connection_id
                 AND x.subtype IS NOT NULL AND t.upstream_state='active') tags,
             (SELECT COUNT(*) FROM readwise_highlights h JOIN readwise_highlight_containers c ON c.id=h.container_id
               JOIN readwise_documents x ON x.id=c.readwise_document_id
               WHERE x.media_item_id=d.media_item_id AND x.connection_id=d.connection_id
                 AND h.upstream_state='active' AND h.is_discard=0) highlights,
             EXISTS(SELECT 1 FROM article_content_manifests m JOIN readwise_documents x ON x.id=m.readwise_document_id
               WHERE x.media_item_id=d.media_item_id AND x.connection_id=d.connection_id AND m.state='ready') content,
             (SELECT MAX(x.last_observed_at) FROM readwise_documents x WHERE x.media_item_id=d.media_item_id
               AND x.connection_id=d.connection_id AND x.subtype IS NOT NULL) refreshed_at
           FROM chosen d
         )
         SELECT media_item_id,connection_id,id,COALESCE(title,'Untitled article'),title,
           COALESCE(normalized_title,'untitled article'),subtype,image_url,author,author_key,publication,
           publication_key,published_at_value,published_at_precision,reading_time_raw,reading_time_minutes,
           reading_progress,progress_valid,any_opened,
           CASE WHEN archive_count>0 THEN 1 ELSE 0 END,archive_count,latest_archive,unknown_archive,
           in_any_queue,CASE WHEN in_shortlist THEN 'shortlist' WHEN in_later THEN 'later'
             WHEN in_inbox THEN 'inbox' END,in_inbox,in_later,in_shortlist,queue_added,
           in_any_feed,feed_arrived,COALESCE(active_location,current_location),any_current,
           tags,highlights,content,refreshed_at,?
         FROM facts WHERE archive_count>0 OR in_any_queue OR in_any_feed`,
        [input.connectionId, version],
      ),
      statement(
        this.database,
        `INSERT INTO article_search(media_item_id,title,author,publication,summary,document_notes,highlight_text,highlight_notes)
         SELECT p.media_item_id,p.display_title,
           COALESCE((SELECT GROUP_CONCAT(DISTINCT d.author) FROM readwise_documents d
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id),''),
           COALESCE((SELECT GROUP_CONCAT(DISTINCT d.publication) FROM readwise_documents d
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id),''),
           COALESCE((SELECT GROUP_CONCAT(DISTINCT d.summary) FROM readwise_documents d
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id),''),
           COALESCE((SELECT GROUP_CONCAT(DISTINCT d.document_note) FROM readwise_documents d
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id),'') || ' ' ||
           COALESCE((SELECT GROUP_CONCAT(DISTINCT hc.document_note) FROM readwise_highlight_containers hc
             JOIN readwise_documents d ON d.id=hc.readwise_document_id
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id
               AND hc.upstream_state='active'),''),
           COALESCE((SELECT GROUP_CONCAT(h.text,' ') FROM readwise_highlights h
             JOIN readwise_highlight_containers hc ON hc.id=h.container_id
             JOIN readwise_documents d ON d.id=hc.readwise_document_id
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id
               AND hc.upstream_state='active' AND h.upstream_state='active' AND h.is_discard=0),''),
           COALESCE((SELECT GROUP_CONCAT(h.note,' ') FROM readwise_highlights h
             JOIN readwise_highlight_containers hc ON hc.id=h.container_id
             JOIN readwise_documents d ON d.id=hc.readwise_document_id
             WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id
               AND hc.upstream_state='active' AND h.upstream_state='active' AND h.is_discard=0),'')
         FROM article_library_projection p WHERE p.connection_id=?`,
        [input.connectionId],
      ),
      statement(
        this.database,
        `UPDATE readwise_projection_state SET projection_run_id=?,projection_rebuilt_at=?,projection_version=?
         WHERE connection_id=?`,
        [input.syncRunId, input.rebuiltAt, version, input.connectionId],
      ),
    ])
  }

  async listArticles(input: ArticlesListInput): Promise<ArticlesPageRecord> {
    const [page, summary] = await Promise.all([
      this.listArticleItems(input),
      this.summarizeArticles(input),
    ])
    return { ...page, ...summary }
  }

  async listArticleItems(
    input: ArticlesListInput,
  ): Promise<Pick<ArticlesPageRecord, 'data' | 'nextCursor'>> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Articles limit must be an integer from 1 through 100')
    }
    const sort =
      input.sort ??
      (input.q
        ? 'relevance'
        : input.section === 'archive'
          ? 'archivedAt'
          : input.section === 'queue'
            ? 'addedAt'
            : 'arrivedAt')
    const direction =
      input.direction ??
      (sort === 'title' || sort === 'author' || sort === 'publication' || sort === 'queueState'
        ? 'asc'
        : sort === 'relevance'
          ? 'asc'
          : 'desc')
    const archiveDisplay = archiveOccurrencePredicate(input, 'display_occurrence')
    const archiveDisplaySql =
      input.section === 'archive' && archiveDisplay.active
        ? `(SELECT MAX(display_occurrence.consumed_at_value) FROM archive_entries display_occurrence WHERE ${archiveDisplay.sql})`
        : 'p.latest_archive_at'
    const search = input.q ? ftsQuery(input.q) : null
    const relevanceValues: DatabaseValue[] = []
    const relevanceSort =
      input.q && search
        ? `CASE
            WHEN base.normalized_title=? THEN 0
            WHEN base.normalized_title LIKE ? ESCAPE '\\' THEN 1
            WHEN EXISTS (SELECT 1 FROM article_search s WHERE s.media_item_id=base.media_item_id AND article_search MATCH ?) THEN 2
            WHEN EXISTS (SELECT 1 FROM article_search s WHERE s.media_item_id=base.media_item_id AND article_search MATCH ?) THEN 3
            WHEN EXISTS (SELECT 1 FROM article_search s WHERE s.media_item_id=base.media_item_id AND article_search MATCH ?) THEN 4
            WHEN EXISTS (SELECT 1 FROM article_search s WHERE s.media_item_id=base.media_item_id AND article_search MATCH ?) THEN 5
            WHEN EXISTS (SELECT 1 FROM article_search s WHERE s.media_item_id=base.media_item_id AND article_search MATCH ?) THEN 6
            WHEN EXISTS (SELECT 1 FROM article_content_search cs JOIN article_content_search_map sm ON sm.rowid=cs.rowid
              JOIN article_content_manifests cm ON cm.id=sm.manifest_id
              WHERE cm.media_item_id=base.media_item_id AND cm.state='ready' AND article_content_search MATCH ?) THEN 7
            ELSE 8 END`
        : '0'
    if (input.q && search) {
      relevanceValues.push(
        normalized(input.q) ?? input.q,
        likePrefix(normalized(input.q) ?? input.q),
        fieldFtsQuery(['title'], search),
        fieldFtsQuery(['author', 'publication'], search),
        fieldFtsQuery(['summary'], search),
        fieldFtsQuery(['document_notes'], search),
        fieldFtsQuery(['highlight_text', 'highlight_notes'], search),
        search,
      )
    }
    const sortColumn = {
      archivedAt: 'base.effective_archive_at',
      addedAt:
        input.section === 'archive'
          ? '(SELECT d.saved_at FROM readwise_documents d WHERE d.id=base.readwise_document_id)'
          : 'base.queue_added_at',
      arrivedAt: 'base.feed_arrived_at',
      queueState:
        "CASE base.queue_state WHEN 'shortlist' THEN 0 WHEN 'later' THEN 1 WHEN 'inbox' THEN 2 END",
      publishedAt: 'base.published_at_value',
      title: 'base.normalized_title',
      author: 'base.author_key',
      publication: 'base.publication_key',
      readingTime: 'base.reading_time_minutes',
      relevance: relevanceSort,
    }[sort]
    const where = filters(input)
    const projection = await this.database
      .prepare(
        `SELECT COALESCE(MAX(p.projection_version),0) version,
          COALESCE(MAX(s.content_index_version),0) content_index_version
         FROM article_library_projection p LEFT JOIN readwise_projection_state s ON s.connection_id=p.connection_id`,
      )
      .first<{ version: number; content_index_version: number }>()
    const version = projection?.version ?? 0
    const contentIndexVersion = projection?.content_index_version ?? 0
    const fingerprint = await digestText(queryFingerprint(input, sort, direction))
    const cursor = await decodeCursor(input.cursor, fingerprint, version, contentIndexVersion)
    const cursorPredicate =
      cursor === null
        ? ''
        : `WHERE (sort_null_rank>? OR (sort_null_rank=? AND
            (sort_value ${direction === 'asc' ? '>' : '<'} ? OR
              (sort_value IS ? AND (normalized_title>? OR
                (normalized_title=? AND media_item_id>?))))))`
    const cursorValues: DatabaseValue[] =
      cursor === null
        ? []
        : [
            cursor.nullRank,
            cursor.nullRank,
            cursor.sortValue,
            cursor.sortValue,
            cursor.normalizedTitle,
            cursor.normalizedTitle,
            cursor.mediaItemId,
          ]
    const rows = await statement(
      this.database,
      `WITH base AS (
         SELECT p.*,${archiveDisplaySql} effective_archive_at,
           search_metadata.summary search_summary,search_metadata.document_notes search_notes,
           TRIM(COALESCE(search_metadata.highlight_text,'') || ' ' || COALESCE(search_metadata.highlight_notes,'')) search_highlights
         FROM article_library_projection p
         LEFT JOIN article_search search_metadata ON search_metadata.media_item_id=p.media_item_id
         WHERE ${where.sql}
       ), sorted AS (
         SELECT base.*,${sortColumn} sort_value,
           ${sort === 'relevance' ? '0' : `CASE WHEN ${sortColumn} IS NULL OR ${sortColumn}='' THEN 1 ELSE 0 END`} sort_null_rank
         FROM base
       )
       SELECT * FROM sorted ${cursorPredicate}
       ORDER BY sort_null_rank,sort_value ${direction.toUpperCase()},normalized_title,media_item_id LIMIT ?`,
      [
        ...archiveDisplay.values,
        ...where.values,
        ...(sort === 'relevance' ? relevanceValues : []),
        ...cursorValues,
        input.limit + 1,
      ],
    ).all<ArticleRow & { sort_value: string | number | null; sort_null_rank: number }>()
    const page = rows.results.slice(0, input.limit)
    return {
      data: page.map((row) => collectionRecord(row, input.q)),
      nextCursor:
        rows.results.length > input.limit && page.length > 0
          ? await encodeCursor({
              v: 2,
              fingerprint,
              projectionVersion: version,
              contentIndexVersion,
              nullRank: page.at(-1)!.sort_null_rank,
              sortValue: page.at(-1)!.sort_value,
              normalizedTitle: page.at(-1)!.normalized_title,
              mediaItemId: page.at(-1)!.media_item_id,
            })
          : null,
    }
  }

  async summarizeArticles(
    input: ArticlesListInput,
  ): Promise<Omit<ArticlesPageRecord, 'data' | 'nextCursor'>> {
    const where = filters(input)
    const archiveCount = archiveOccurrencePredicate(input, 'count_occurrence')
    const count = await statement(
      this.database,
      `SELECT COUNT(*) count,COALESCE(SUM((SELECT COUNT(*) FROM archive_entries count_occurrence WHERE ${archiveCount.sql})),0) occurrences FROM article_library_projection p WHERE ${where.sql}`,
      [...archiveCount.values, ...where.values],
    ).first<{ count: number; occurrences: number }>()
    const totals = await this.database
      .prepare(
        'SELECT COALESCE(SUM(in_archive),0) archive,COALESCE(SUM(in_queue),0) queue,COALESCE(SUM(in_feed),0) feed FROM article_library_projection',
      )
      .first<{ archive: number; queue: number; feed: number }>()
    const [
      typeFilter,
      authorFilter,
      publicationFilter,
      publishedFacet,
      timeFacet,
      progressFacet,
      dateFacet,
    ] = [
      filters(input, 'types'),
      filters(input, 'authors'),
      filters(input, 'publications'),
      filters(input, 'published'),
      filters(input, 'readingTime'),
      filters(input, 'progress'),
      filters(input, 'date'),
    ]
    const currentStateFacet = filters(input, 'currentState')
    const queueStateFacet = filters(input, 'queueState')
    const openedFacet = filters(input, 'opened')
    const historyFacet = filters(input, 'history')
    const [
      typeRows,
      authorRows,
      publicationRows,
      publishedUnknown,
      timeUnknown,
      progressUnknown,
      dateUnknown,
    ] = await Promise.all([
      statement(
        this.database,
        `SELECT p.subtype value,p.subtype label,COUNT(*) count FROM article_library_projection p WHERE ${typeFilter.sql} GROUP BY p.subtype ORDER BY p.subtype`,
        typeFilter.values,
      ).all<{ value: string; label: string; count: number }>(),
      statement(
        this.database,
        `SELECT p.author_key value,MAX(p.author) label,COUNT(*) count FROM article_library_projection p WHERE ${authorFilter.sql} AND p.author_key IS NOT NULL GROUP BY p.author_key ORDER BY count DESC,label LIMIT 250`,
        authorFilter.values,
      ).all<{ value: string; label: string; count: number }>(),
      statement(
        this.database,
        `SELECT p.publication_key value,MAX(p.publication) label,COUNT(*) count FROM article_library_projection p WHERE ${publicationFilter.sql} AND p.publication_key IS NOT NULL GROUP BY p.publication_key ORDER BY count DESC,label LIMIT 250`,
        publicationFilter.values,
      ).all<{ value: string; label: string; count: number }>(),
      statement(
        this.database,
        `SELECT COUNT(*) count FROM article_library_projection p WHERE ${publishedFacet.sql} AND p.published_at_value IS NULL`,
        publishedFacet.values,
      ).first<{ count: number }>(),
      statement(
        this.database,
        `SELECT COUNT(*) count FROM article_library_projection p WHERE ${timeFacet.sql} AND p.reading_time_minutes IS NULL`,
        timeFacet.values,
      ).first<{ count: number }>(),
      statement(
        this.database,
        `SELECT COUNT(*) count FROM article_library_projection p WHERE ${progressFacet.sql} AND p.progress_valid=0`,
        progressFacet.values,
      ).first<{ count: number }>(),
      statement(
        this.database,
        `SELECT COUNT(*) count FROM article_library_projection p WHERE ${dateFacet.sql} AND ${
          input.section === 'archive'
            ? "EXISTS (SELECT 1 FROM archive_entries unknown_occurrence WHERE unknown_occurrence.media_item_id=p.media_item_id AND unknown_occurrence.connection_id=p.connection_id AND unknown_occurrence.admission_reason='readwise_archive_state' AND unknown_occurrence.upstream_state='active' AND unknown_occurrence.consumed_at_value IS NULL)"
            : `p.${input.section === 'queue' ? 'queue_added_at' : 'feed_arrived_at'} IS NULL`
        }`,
        dateFacet.values,
      ).first<{ count: number }>(),
    ])
    const [
      readingTimeCounts,
      progressCounts,
      currentStateCounts,
      queueStateCounts,
      openedCounts,
      historyCounts,
    ] = await Promise.all([
      statement(
        this.database,
        `SELECT
            SUM(CASE WHEN p.reading_time_minutes<5 THEN 1 ELSE 0 END) under5,
            SUM(CASE WHEN p.reading_time_minutes>=5 AND p.reading_time_minutes<16 THEN 1 ELSE 0 END) five_to_fifteen,
            SUM(CASE WHEN p.reading_time_minutes>=16 AND p.reading_time_minutes<31 THEN 1 ELSE 0 END) sixteen_to_thirty,
            SUM(CASE WHEN p.reading_time_minutes>=31 AND p.reading_time_minutes<=60 THEN 1 ELSE 0 END) thirty_one_to_sixty,
            SUM(CASE WHEN p.reading_time_minutes>60 THEN 1 ELSE 0 END) over_sixty,
            SUM(CASE WHEN p.reading_time_minutes IS NULL THEN 1 ELSE 0 END) unknown
           FROM article_library_projection p WHERE ${timeFacet.sql}`,
        timeFacet.values,
      ).first<Record<string, number>>(),
      statement(
        this.database,
        `SELECT
            SUM(CASE WHEN p.opened=0 THEN 1 ELSE 0 END) not_opened,
            SUM(CASE WHEN p.opened=1 AND p.progress_valid=1 AND p.reading_progress=0 THEN 1 ELSE 0 END) opened_zero,
            SUM(CASE WHEN p.progress_valid=1 AND p.reading_progress>0 AND p.reading_progress<1 THEN 1 ELSE 0 END) in_progress,
            SUM(CASE WHEN p.progress_valid=1 AND p.reading_progress>=1 THEN 1 ELSE 0 END) complete,
            SUM(CASE WHEN p.progress_valid=0 THEN 1 ELSE 0 END) unknown
           FROM article_library_projection p WHERE ${progressFacet.sql}`,
        progressFacet.values,
      ).first<Record<string, number>>(),
      statement(
        this.database,
        `SELECT
            SUM(EXISTS(SELECT 1 FROM readwise_documents d WHERE d.media_item_id=p.media_item_id
              AND d.connection_id=p.connection_id AND d.subtype IS NOT NULL AND d.upstream_state='active'
              AND d.current_location='archive')) archive,
            SUM(EXISTS(SELECT 1 FROM readwise_documents d WHERE d.media_item_id=p.media_item_id
              AND d.connection_id=p.connection_id AND d.subtype IS NOT NULL AND d.upstream_state='active'
              AND d.current_location='new')) inbox,
            SUM(EXISTS(SELECT 1 FROM readwise_documents d WHERE d.media_item_id=p.media_item_id
              AND d.connection_id=p.connection_id AND d.subtype IS NOT NULL AND d.upstream_state='active'
              AND d.current_location='later')) later,
            SUM(EXISTS(SELECT 1 FROM readwise_documents d WHERE d.media_item_id=p.media_item_id
              AND d.connection_id=p.connection_id AND d.subtype IS NOT NULL AND d.upstream_state='active'
              AND d.current_location='shortlist')) shortlist,
            SUM(EXISTS(SELECT 1 FROM readwise_documents d WHERE d.media_item_id=p.media_item_id
              AND d.connection_id=p.connection_id AND d.subtype IS NOT NULL AND d.upstream_state='active'
              AND d.current_location='feed')) feed,
            SUM(CASE WHEN p.current_available=0 OR EXISTS(SELECT 1 FROM readwise_documents d
              WHERE d.media_item_id=p.media_item_id AND d.connection_id=p.connection_id
                AND d.subtype IS NOT NULL AND d.upstream_state='active'
                AND d.current_location NOT IN ('archive','new','later','shortlist','feed')) THEN 1 ELSE 0 END) unknown
           FROM article_library_projection p WHERE ${currentStateFacet.sql}`,
        currentStateFacet.values,
      ).first<Record<string, number>>(),
      statement(
        this.database,
        `SELECT
            SUM(p.queue_inbox) inbox,
            SUM(p.queue_later) later,
            SUM(p.queue_shortlist) shortlist
           FROM article_library_projection p WHERE ${queueStateFacet.sql}`,
        queueStateFacet.values,
      ).first<Record<string, number>>(),
      statement(
        this.database,
        `SELECT SUM(CASE WHEN p.opened=1 THEN 1 ELSE 0 END) opened,
            SUM(CASE WHEN p.opened=0 THEN 1 ELSE 0 END) not_opened
           FROM article_library_projection p WHERE ${openedFacet.sql}`,
        openedFacet.values,
      ).first<Record<string, number>>(),
      statement(
        this.database,
        `SELECT SUM(CASE WHEN p.in_archive=1 THEN 1 ELSE 0 END) archived,
            SUM(CASE WHEN p.in_archive=0 THEN 1 ELSE 0 END) not_archived
           FROM article_library_projection p WHERE ${historyFacet.sql}`,
        historyFacet.values,
      ).first<Record<string, number>>(),
    ])
    const option = (value: string, label: string, countValue: number | undefined) => ({
      value,
      label,
      count: countValue ?? 0,
    })
    const coverage = await this.database
      .prepare(
        `SELECT documents_snapshot_completed_at,highlights_snapshot_completed_at,full_text_policy,
          (SELECT MAX(sr.finished_at) FROM sync_runs sr JOIN connections c ON c.id=sr.connection_id
           WHERE c.source='readwise' AND sr.status='succeeded') last_successful_sync_at
         FROM readwise_projection_state ORDER BY documents_snapshot_completed_at DESC LIMIT 1`,
      )
      .first<{
        documents_snapshot_completed_at: string | null
        highlights_snapshot_completed_at: string | null
        full_text_policy: 'archive_queue' | 'disabled'
        last_successful_sync_at: string | null
      }>()
    return {
      sectionCounts: {
        archive: totals?.archive ?? 0,
        queue: totals?.queue ?? 0,
        feed: totals?.feed ?? 0,
      },
      totalCount:
        input.section === 'archive'
          ? (totals?.archive ?? 0)
          : input.section === 'queue'
            ? (totals?.queue ?? 0)
            : (totals?.feed ?? 0),
      filteredCount: count?.count ?? 0,
      occurrenceCount: input.section === 'archive' ? (count?.occurrences ?? 0) : null,
      facets: {
        types: [...typeRows.results],
        authors: [...authorRows.results],
        publications: [...publicationRows.results],
        readingTimes: [
          option('under5', 'Under 5 min', readingTimeCounts?.under5),
          option('5to15', '5–15 min', readingTimeCounts?.five_to_fifteen),
          option('16to30', '16–30 min', readingTimeCounts?.sixteen_to_thirty),
          option('31to60', '31–60 min', readingTimeCounts?.thirty_one_to_sixty),
          option('over60', 'Over 60 min', readingTimeCounts?.over_sixty),
          option('unknown', 'Unknown', readingTimeCounts?.unknown),
        ],
        progress: [
          option('notOpened', 'Not opened', progressCounts?.not_opened),
          option('openedZero', 'Opened at 0%', progressCounts?.opened_zero),
          option('inProgress', 'In progress', progressCounts?.in_progress),
          option('complete', '100%', progressCounts?.complete),
          option('unknown', 'Unknown', progressCounts?.unknown),
        ],
        currentStates: [
          option('archive', 'Archive', currentStateCounts?.archive),
          option('inbox', 'Inbox', currentStateCounts?.inbox),
          option('later', 'Later', currentStateCounts?.later),
          option('shortlist', 'Shortlist', currentStateCounts?.shortlist),
          option('feed', 'Feed', currentStateCounts?.feed),
          option('unknown', 'Unavailable / unknown', currentStateCounts?.unknown),
        ],
        queueStates: [
          option('inbox', 'Inbox', queueStateCounts?.inbox),
          option('later', 'Later', queueStateCounts?.later),
          option('shortlist', 'Shortlist', queueStateCounts?.shortlist),
        ],
        opened: [
          option('opened', 'Opened', openedCounts?.opened),
          option('notOpened', 'Not opened', openedCounts?.not_opened),
        ],
        history: [
          option('archived', 'Archived before', historyCounts?.archived),
          option('notArchived', 'No Archive history', historyCounts?.not_archived),
        ],
        publishedUnknown: publishedUnknown?.count ?? 0,
        readingTimeUnknown: timeUnknown?.count ?? 0,
        progressUnknown: progressUnknown?.count ?? 0,
        dateUnknown: dateUnknown?.count ?? 0,
      },
      capabilities: {
        fullTextSearch:
          (
            await this.database
              .prepare("SELECT COUNT(*) count FROM article_content_manifests WHERE state='ready'")
              .first<{ count: number }>()
          )?.count !== 0,
        highlights:
          coverage?.highlights_snapshot_completed_at !== null &&
          coverage?.highlights_snapshot_completed_at !== undefined,
      },
      coverage: {
        allLocationsBackfilled: coverage?.documents_snapshot_completed_at != null,
        highlightsBackfilled: coverage?.highlights_snapshot_completed_at != null,
        fullTextPolicy: coverage?.full_text_policy ?? 'archive_queue',
        lastSuccessfulSyncAt: coverage?.last_successful_sync_at ?? null,
      },
    }
  }

  async findArticle(id: string): Promise<ArticleDetailRecord | null> {
    const row = await statement(
      this.database,
      `SELECT p.*,d.raw_category,d.acquisition_source,d.summary,d.word_count,
      d.created_at_source,d.saved_at,
      (SELECT MIN(x.first_opened_at) FROM readwise_documents x WHERE x.media_item_id=p.media_item_id AND x.first_opened_at IS NOT NULL) first_opened_at,
      (SELECT MAX(x.last_opened_at) FROM readwise_documents x WHERE x.media_item_id=p.media_item_id AND x.last_opened_at IS NOT NULL) last_opened_at,
      d.last_moved_at,d.updated_at_source,p.source_refreshed_at last_observed_at,
      d.reader_url,d.source_url,c.label connection_label,c.coverage,
      (SELECT GROUP_CONCAT(DISTINCT x.document_note) FROM readwise_documents x WHERE x.media_item_id=p.media_item_id AND x.document_note IS NOT NULL) document_note,
      (SELECT GROUP_CONCAT(t.tag_key || char(31) || t.display_name || char(31) || COALESCE(dt.source_type,''),char(30))
       FROM readwise_document_tags dt JOIN readwise_documents x ON x.id=dt.readwise_document_id
       JOIN readwise_tags t ON t.connection_id=x.connection_id AND t.tag_key=dt.tag_key
       WHERE x.media_item_id=p.media_item_id AND dt.upstream_state='active') tags,
      (SELECT GROUP_CONCAT(DISTINCT hc.document_note) FROM readwise_highlight_containers hc
       JOIN readwise_documents x ON x.id=hc.readwise_document_id
       WHERE x.media_item_id=p.media_item_id AND hc.upstream_state='active') highlight_document_note,
      (SELECT COUNT(*) FROM readwise_highlights h JOIN readwise_highlight_containers hc ON hc.id=h.container_id
       JOIN readwise_documents x ON x.id=hc.readwise_document_id
       WHERE x.media_item_id=p.media_item_id AND h.upstream_state='active' AND h.is_discard=0) active_annotations,
      (SELECT COUNT(*) FROM readwise_highlights h JOIN readwise_highlight_containers hc ON hc.id=h.container_id
       JOIN readwise_documents x ON x.id=hc.readwise_document_id
       WHERE x.media_item_id=p.media_item_id AND h.upstream_state='removed') deleted_annotations,
      (SELECT COUNT(*) FROM readwise_highlights h JOIN readwise_highlight_containers hc ON hc.id=h.container_id
       JOIN readwise_documents x ON x.id=hc.readwise_document_id
       WHERE x.media_item_id=p.media_item_id AND h.is_discard=1) discarded_annotations,
      CASE WHEN m.state IS NOT NULL THEN m.state WHEN j.status='failed' THEN 'failed'
        WHEN j.status='pending' THEN 'pending' END content_state,
      m.coverage content_coverage,COALESCE(m.failure_class,j.failure_class) failure_class
      FROM article_library_projection p JOIN readwise_documents d ON d.id=p.readwise_document_id
      JOIN connections c ON c.id=p.connection_id
      LEFT JOIN article_content_manifests m ON m.id=(SELECT cm.id FROM article_content_manifests cm
        JOIN readwise_documents x ON x.id=cm.readwise_document_id WHERE x.media_item_id=p.media_item_id
        ORDER BY CASE cm.state WHEN 'ready' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END,cm.acquired_at DESC LIMIT 1)
      LEFT JOIN article_content_jobs j ON j.idempotency_key=(SELECT cj.idempotency_key FROM article_content_jobs cj
        JOIN readwise_documents x ON x.id=cj.readwise_document_id WHERE x.media_item_id=p.media_item_id
        AND cj.status IN ('pending','failed') ORDER BY cj.updated_at DESC,cj.created_at DESC LIMIT 1)
      WHERE p.media_item_id=? AND (p.in_archive=1 OR p.in_queue=1 OR p.in_feed=1)`,
      [id],
    ).first<ArticleRow & Record<string, string | number | null>>()
    if (row === null) return null
    const relationships = await statement(
      this.database,
      `SELECT document_id,current_location,upstream_state,reader_url FROM readwise_documents
       WHERE media_item_id=? AND subtype IS NOT NULL
       ORDER BY CASE upstream_state WHEN 'active' THEN 0 ELSE 1 END,current_location,document_id`,
      [id],
    ).all<{
      document_id: string
      current_location: string
      upstream_state: string
      reader_url: string | null
    }>()
    const base = collectionRecord(row)
    return {
      ...base,
      sourceCategory: String(row.raw_category),
      currentLocation: String(row.current_location),
      acquisitionSource: row.acquisition_source as string | null,
      summary: row.summary as string | null,
      wordCount: row.word_count as number | null,
      documentNote: row.document_note as string | null,
      highlightDocumentNote: row.highlight_document_note as string | null,
      tags:
        typeof row.tags === 'string' && row.tags.length > 0
          ? row.tags.split(String.fromCharCode(30)).map((entry) => {
              const [key, name, type] = entry.split(String.fromCharCode(31))
              return { key: key ?? '', name: name ?? key ?? '', type: type || null }
            })
          : [],
      dates: {
        createdAt: row.created_at_source as string | null,
        savedAt: row.saved_at as string | null,
        firstOpenedAt: row.first_opened_at as string | null,
        lastOpenedAt: row.last_opened_at as string | null,
        lastMovedAt: row.last_moved_at as string | null,
        updatedAt: row.updated_at_source as string | null,
        observedAt: String(row.last_observed_at),
      },
      annotations: {
        active: Number(row.active_annotations ?? 0),
        deleted: Number(row.deleted_annotations ?? 0),
        discarded: Number(row.discarded_annotations ?? 0),
      },
      content: {
        available: row.content_state === 'ready',
        state: row.content_state as ArticleDetailRecord['content']['state'],
        coverage: row.content_coverage as ArticleDetailRecord['content']['coverage'],
        failureClass: row.failure_class as string | null,
      },
      links: { original: safeHttpUrl(row.source_url), reader: safeHttpUrl(row.reader_url) },
      readerRelationships: relationships.results.map((relationship) => ({
        documentId: relationship.document_id,
        location: relationship.current_location,
        available: relationship.upstream_state === 'active',
        readerUrl: safeHttpUrl(relationship.reader_url),
      })),
      source: {
        connectionLabel: String(row.connection_label),
        coverage: row.coverage as ArticleDetailRecord['source']['coverage'],
        sourceRefreshedAt: String(row.last_observed_at),
      },
    }
  }

  async findArticleTextExcerptTarget(
    mediaItemId: string,
    query: string,
  ): Promise<{ objectKey: string; byteStart: number; byteLength: number } | null> {
    const search = ftsQuery(query)
    if (search === null) return null
    const row = await statement(
      this.database,
      `SELECT m.extracted_object_key,c.byte_start,c.byte_length
       FROM article_content_search s
       JOIN article_content_search_map sm ON sm.rowid=s.rowid
       JOIN article_content_manifests m ON m.id=sm.manifest_id
       JOIN article_content_chunks c ON c.manifest_id=sm.manifest_id AND c.ordinal=sm.chunk_ordinal
       WHERE m.media_item_id=? AND m.state='ready' AND article_content_search MATCH ?
       ORDER BY bm25(article_content_search),sm.chunk_ordinal LIMIT 1`,
      [mediaItemId, search],
    ).first<{ extracted_object_key: string; byte_start: number; byte_length: number }>()
    return row === null
      ? null
      : {
          objectKey: row.extracted_object_key,
          byteStart: row.byte_start,
          byteLength: row.byte_length,
        }
  }

  async listArticleHistory(
    id: string,
    input: { limit: number; cursor?: string },
  ): Promise<{
    data: Array<{
      archiveEntryId: string
      archivedAt: Temporal | null
      sourceRecordedAt: Temporal | null
      admissionReason: 'readwise_archive_state'
      disposition: 'current' | 'retained'
      connection: { id: string; label: string }
    }>
    nextCursor: string | null
  }> {
    const cursor = await decodeDetailCursor(input.cursor, 'history', id, 3)
    const cursorPredicate =
      cursor === null
        ? ''
        : `AND (CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END>? OR
          (CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END=? AND
            (a.consumed_at_value<? OR (a.consumed_at_value IS ? AND a.id>?))))`
    const rows = await statement(
      this.database,
      `SELECT a.*,c.label,
        EXISTS(SELECT 1 FROM readwise_documents occurrence_document
          WHERE occurrence_document.external_identity_id=a.consumed_identity_id
            AND occurrence_document.subtype IS NOT NULL
            AND occurrence_document.upstream_state='active'
            AND occurrence_document.current_location='archive') occurrence_current,
        CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END sort_null_rank
       FROM archive_entries a JOIN connections c ON c.id=a.connection_id
       JOIN article_library_projection p ON p.media_item_id=a.media_item_id
       WHERE a.media_item_id=? AND a.admission_reason='readwise_archive_state'
         AND a.upstream_state='active' ${cursorPredicate}
       ORDER BY sort_null_rank,a.consumed_at_value DESC,a.id LIMIT ?`,
      [
        id,
        ...(cursor === null
          ? []
          : [
              cursor.values[0]!,
              cursor.values[0]!,
              cursor.values[1]!,
              cursor.values[1]!,
              cursor.values[2]!,
            ]),
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    const page = rows.results.slice(0, input.limit)
    const temporal = (
      row: Record<string, string | number | null>,
      prefix: string,
    ): Temporal | null => {
      const value = row[`${prefix}_value`]
      const precision = row[`${prefix}_precision`]
      const basis = row[`${prefix}_basis`]
      return typeof value === 'string' && typeof precision === 'string' && typeof basis === 'string'
        ? { value, precision: precision as TemporalPrecision, basis: basis as TemporalBasis }
        : null
    }
    return {
      data: page.map((row) => ({
        archiveEntryId: String(row.id),
        archivedAt: temporal(row, 'consumed_at'),
        sourceRecordedAt: temporal(row, 'source_recorded_at'),
        admissionReason: 'readwise_archive_state',
        disposition: row.occurrence_current === 1 ? 'current' : 'retained',
        connection: { id: String(row.connection_id), label: String(row.label) },
      })),
      nextCursor:
        rows.results.length > input.limit && page.length > 0
          ? await encodeDetailCursor({
              v: 1,
              kind: 'history',
              parentId: id,
              values: [
                Number(page.at(-1)!.sort_null_rank),
                page.at(-1)!.consumed_at_value ?? null,
                String(page.at(-1)!.id),
              ],
            })
          : null,
    }
  }

  async listArticleHighlights(
    id: string,
    input: { limit: number; cursor?: string },
  ): Promise<{
    data: Array<{
      id: string
      text: string | null
      note: string | null
      favorite: boolean
      highlightedAt: string | null
      location: string | null
      readerUrl: string | null
    }>
    nextCursor: string | null
  }> {
    const cursor = await decodeDetailCursor(input.cursor, 'highlights', id, 4)
    const cursorPredicate =
      cursor === null
        ? ''
        : `AND (CASE WHEN h.location IS NULL THEN 1 ELSE 0 END>? OR
          (CASE WHEN h.location IS NULL THEN 1 ELSE 0 END=? AND
            (COALESCE(h.location,0)>? OR (COALESCE(h.location,0)=? AND
              (COALESCE(h.highlighted_at,'')>? OR (COALESCE(h.highlighted_at,'')=? AND h.highlight_id>?))))))`
    const rows = await statement(
      this.database,
      `SELECT h.*,CASE WHEN h.location IS NULL THEN 1 ELSE 0 END sort_null_rank
       FROM readwise_highlights h JOIN readwise_highlight_containers c ON c.id=h.container_id
       JOIN readwise_documents d ON d.id=c.readwise_document_id
       WHERE d.media_item_id=? AND h.upstream_state='active' AND h.is_discard=0 ${cursorPredicate}
       ORDER BY sort_null_rank,COALESCE(h.location,0),COALESCE(h.highlighted_at,''),h.highlight_id LIMIT ?`,
      [
        id,
        ...(cursor === null
          ? []
          : [
              cursor.values[0]!,
              cursor.values[0]!,
              cursor.values[1]!,
              cursor.values[1]!,
              cursor.values[2]!,
              cursor.values[2]!,
              cursor.values[3]!,
            ]),
        input.limit + 1,
      ],
    ).all<Record<string, string | number | null>>()
    const page = rows.results.slice(0, input.limit)
    return {
      data: page.map((row) => ({
        id: String(row.highlight_id),
        text: row.text as string | null,
        note: row.note as string | null,
        favorite: row.is_favorite === 1,
        highlightedAt: row.highlighted_at as string | null,
        location:
          row.location === null
            ? null
            : row.location_type === 'order' ||
                row.location_type === 'page' ||
                row.location_type === 'time_offset'
              ? `${String(row.location_type).replace('_', ' ')} ${row.location}`
              : null,
        readerUrl: safeHttpUrl(row.reader_url),
      })),
      nextCursor:
        rows.results.length > input.limit && page.length > 0
          ? await encodeDetailCursor({
              v: 1,
              kind: 'highlights',
              parentId: id,
              values: [
                Number(page.at(-1)!.sort_null_rank),
                Number(page.at(-1)!.location ?? 0),
                String(page.at(-1)!.highlighted_at ?? ''),
                Number(page.at(-1)!.highlight_id),
              ],
            })
          : null,
    }
  }
}
