import type { JsonObject } from '@media-tracker/domain'
import {
  matchesQueryFingerprint,
  queryFingerprint as hashQueryFingerprint,
} from './query-fingerprint'
import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

export interface HardcoverContributorProjection {
  id: number
  name: string
  slug: string | null
  roleId: number | null
  roleName: string
  contribution: string | null
  primary: boolean
  position: number
}

export interface HardcoverSeriesProjection {
  id: number
  name: string
  slug: string | null
  booksCount: number | null
  position: number | null
  compilation: boolean
  featured: boolean
}

export interface HardcoverTaxonomyProjection {
  category: string
  value: string
  slug: string
}

export interface HardcoverEditionProjection {
  id: number
  canonicalId: number | null
  title: string | null
  subtitle: string | null
  information: string | null
  readingFormatId: number | null
  readingFormat: string | null
  rawFormat: string | null
  pages: number | null
  audioSeconds: number | null
  releaseDate: string | null
  publisher: string | null
  language: string | null
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  coverUrl: string | null
  coverColor: string | null
  sourceRecordId?: string
  contributors: readonly HardcoverContributorProjection[]
}

export interface HardcoverReadProjection {
  id: number
  archiveEntryId: string | null
  editionId: number | null
  startedAt: string | null
  pausedAt: string | null
  finishedAt: string | null
  finishedAtPrecisionRaw: string | null
  progress: number | null
  progressPages: number | null
  progressSeconds: number | null
}

export interface HardcoverBookProjection {
  connectionId: string
  syncRunId: string
  sourceRecordId: string
  observedAt: string
  sourceUpdatedAt: string | null
  mediaItemId: string
  userBookId: number
  workId: number
  canonicalWorkId: number | null
  currentEditionId: number | null
  statusId: number
  statusLabel: string | null
  dateAdded: string | null
  readCount: number
  personalRating: number | null
  reviewText: string | null
  reviewHasSpoilers: boolean
  reviewedAt: string | null
  title: string
  subtitle: string | null
  description: string | null
  slug: string | null
  pages: number | null
  audioSeconds: number | null
  releaseDate: string | null
  releasePrecision: 'year' | 'month' | 'day' | null
  coverUrl: string | null
  coverColor: string | null
  communityRating: number | null
  communityRatingsCount: number
  usersReadCount: number
  defaultCoverEditionId: number | null
  editions: readonly HardcoverEditionProjection[]
  contributors: readonly HardcoverContributorProjection[]
  series: readonly HardcoverSeriesProjection[]
  taxonomy: readonly HardcoverTaxonomyProjection[]
  reads: readonly HardcoverReadProjection[]
}

export interface BooksListInput {
  collection: 'archive' | 'queue'
  q?: string
  formats: readonly string[]
  series: readonly string[]
  genres: readonly string[]
  finishedMode: 'any' | 'range' | 'unavailable'
  finishedFrom?: string
  finishedTo?: string
  publishedMode: 'any' | 'range' | 'unavailable'
  publishedFrom?: string
  publishedTo?: string
  addedMode: 'any' | 'range' | 'unavailable'
  addedFrom?: string
  addedTo?: string
  ratingMode: 'any' | 'rated' | 'unrated' | 'minimum'
  minRating?: number
  sort?:
    'recent_read' | 'earliest_read' | 'title' | 'author' | 'personal_rating' | 'published' | 'added'
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export interface BookCollectionRecord {
  id: string
  title: string
  subtitle: string | null
  authors: { id: string; name: string }[]
  coverUrl: string | null
  coverColor: string | null
  publicationDate: string | null
  publicationPrecision: 'year' | 'month' | 'day' | null
  primarySeries: string | null
  memberships: { archive: boolean; queue: boolean; currentlyReading: boolean }
  latestReadDate: string | null
  latestReadPrecision: 'year' | 'month' | 'day' | null
  latestReadFormat: string | null
  personalRating: number | null
  addedToHardcoverDate: string | null
  supportedReadCount: number
}

export interface BookFacetRecord {
  value: string
  label: string
  count: number
}

export interface BooksPageRecord {
  data: BookCollectionRecord[]
  nextCursor: string | null
  counts: {
    archive: number
    queue: number
    filteredBooks: number
    supportedReads: number
  }
  facets: {
    formats: BookFacetRecord[]
    series: BookFacetRecord[]
    genres: BookFacetRecord[]
  }
  freshness: { lastSuccessfulSyncAt: string | null; degraded: boolean }
}

export interface BookDetailRecord {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  coverUrl: string | null
  coverColor: string | null
  publicationDate: string | null
  publicationPrecision: 'year' | 'month' | 'day' | null
  pageCount: number | null
  audioSeconds: number | null
  memberships: { archive: boolean; queue: boolean; currentlyReading: boolean }
  personalRating: number | null
  series: Array<{
    id: string
    name: string
    position: number | null
    totalBooks: number | null
    compilation: boolean
  }>
  contributors: Array<{
    role: string
    contributors: Array<{ id: string; name: string }>
  }>
  selectedEdition: {
    id: string
    format: string | null
    information: string | null
    pages: number | null
    audioSeconds: number | null
    publisher: string | null
    releaseDate: string | null
    language: string | null
    identifiers: Array<{ type: 'ISBN-10' | 'ISBN-13' | 'ASIN'; value: string }>
    coverUrl: string | null
  } | null
  community: {
    rating: number | null
    ratingsCount: number
    genres: string[]
    moods: string[]
    pace: string[]
    contentWarnings: string[]
  }
  source: {
    label: 'Hardcover'
    url: string | null
    refreshedAt: string | null
    coverage: 'complete' | 'partial' | 'best_effort'
  }
}

export interface BookHistoryRecord {
  id: string
  kind: 'status' | 'added' | 'progress' | 'rating' | 'review' | 'read'
  label: string
  date: string | null
  datePrecision: 'year' | 'month' | 'day' | 'instant' | null
  detail: string | null
  edition: { id: string; format: string | null; title: string | null } | null
}

interface CursorPayload {
  v: 1
  fingerprint: string
  nullRank: number
  value: string | number | null
  title: string
  id: string
}

function statement(
  database: DatabaseClient,
  query: string,
  values: readonly DatabaseValue[] = [],
): DatabaseStatement {
  return database.prepare(query).bind(...values)
}

function normalizedIdentifier(value: string | null): string | null {
  const normalized = value?.replace(/[\s-]/g, '').trim().toUpperCase() ?? ''
  return normalized.length === 0 ? null : normalized
}

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}

function normalizedFormatSql(alias: string): string {
  return `CASE ${alias}.reading_format_id
    WHEN 1 THEN 'Physical'
    WHEN 2 THEN 'Audiobook'
    WHEN 4 THEN 'Ebook'
    ELSE CASE lower(trim(${alias}.reading_format))
      WHEN 'physical book' THEN 'Physical'
      WHEN 'physical' THEN 'Physical'
      WHEN 'audio book' THEN 'Audiobook'
      WHEN 'audiobook' THEN 'Audiobook'
      WHEN 'ebook' THEN 'Ebook'
      WHEN 'e-book' THEN 'Ebook'
    END
  END`
}

function publicationStartSql(column: string, precisionColumn: string): string {
  return `CASE ${precisionColumn}
    WHEN 'year' THEN ${column} || '-01-01'
    WHEN 'month' THEN ${column} || '-01'
    ELSE substr(${column}, 1, 10)
  END`
}

function publicationEndSql(column: string, precisionColumn: string): string {
  return `CASE ${precisionColumn}
    WHEN 'year' THEN ${column} || '-12-31'
    WHEN 'month' THEN date(${column} || '-01', '+1 month', '-1 day')
    ELSE substr(${column}, 1, 10)
  END`
}

function boundaryStart(value: string): string {
  if (/^\d{4}$/.test(value)) return `${value}-01-01`
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  return value
}

function boundaryEnd(value: string): string {
  if (/^\d{4}$/.test(value)) return `${value}-12-31`
  const month = /^(\d{4})-(\d{2})$/.exec(value)
  if (month === null) return value
  const end = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0))
  return end.toISOString().slice(0, 10)
}

async function decodeCursor(
  cursor: string | undefined,
  fingerprint: string,
): Promise<CursorPayload | null> {
  if (cursor === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as Partial<CursorPayload>
    if (
      parsed.v !== 1 ||
      !(await matchesQueryFingerprint(parsed.fingerprint, fingerprint)) ||
      (parsed.nullRank !== 0 && parsed.nullRank !== 1) ||
      (parsed.value !== null &&
        typeof parsed.value !== 'string' &&
        typeof parsed.value !== 'number') ||
      typeof parsed.title !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error()
    }
    return parsed as CursorPayload
  } catch {
    throw new TypeError('Invalid Books pagination cursor')
  }
}

function encodeCursor(cursor: CursorPayload): string {
  return encodeURIComponent(JSON.stringify(cursor))
}

function ftsQuery(value: string): string | null {
  const tokens = value
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["*:^(){}[\]]/g, '').trim())
    .filter(Boolean)
  if (tokens.length === 0) return null
  return tokens
    .map(
      (token, index) => `"${token.replaceAll('"', '""')}"${index === tokens.length - 1 ? '*' : ''}`,
    )
    .join(' AND ')
}

function projectionFingerprint(
  input: BooksListInput,
  sort: string,
  direction: string,
): Record<string, unknown> {
  return {
    collection: input.collection,
    q: input.q?.trim() ?? '',
    formats: [...input.formats].sort(),
    series: [...input.series].sort(),
    genres: [...input.genres].sort(),
    finished: [input.finishedMode, input.finishedFrom ?? '', input.finishedTo ?? ''],
    published: [input.publishedMode, input.publishedFrom ?? '', input.publishedTo ?? ''],
    added: [input.addedMode, input.addedFrom ?? '', input.addedTo ?? ''],
    rating: [input.ratingMode, input.minRating ?? null],
    sort,
    direction,
  }
}

function filterSql(
  input: BooksListInput,
  skipFacet?: 'format' | 'series' | 'genre',
): { sql: string; values: DatabaseValue[] } {
  const clauses = [input.collection === 'archive' ? 'p.in_archive = 1' : 'p.in_queue = 1']
  const values: DatabaseValue[] = []
  const search = input.q === undefined ? null : ftsQuery(input.q)
  if (search !== null) {
    const identifier = normalizedIdentifier(input.q ?? '')
    clauses.push(
      `(p.media_item_id IN (SELECT media_item_id FROM book_search WHERE book_search MATCH ?)
        OR p.media_item_id IN (SELECT media_item_id FROM book_identifiers WHERE normalized_value = ?))`,
    )
    values.push(search, identifier ?? '')
  }

  if (skipFacet !== 'format' && input.formats.length > 0) {
    const column =
      input.collection === 'archive' ? 'p.latest_read_format' : 'p.current_edition_format'
    const known = input.formats.filter((value) => value !== 'unknown')
    const options: string[] = []
    if (known.length > 0) {
      options.push(`lower(${column}) IN (${placeholders(known)})`)
      values.push(...known.map(normalizedText))
    }
    if (input.formats.includes('unknown')) options.push(`(${column} IS NULL OR ${column}='')`)
    clauses.push(`(${options.join(' OR ')})`)
  }

  if (skipFacet !== 'series' && input.series.length > 0) {
    const known = input.series.filter((value) => value !== 'none')
    const options: string[] = []
    if (known.length > 0) {
      options.push(
        `EXISTS (SELECT 1 FROM hardcover_work_series ws
          JOIN hardcover_book_works w ON w.connection_id=ws.connection_id AND w.work_id=ws.work_id
          WHERE ws.connection_id = p.connection_id AND ws.work_id = p.work_id
            AND ((w.upstream_state='active' AND ws.upstream_state='active')
              OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id))
            AND CAST(ws.series_id AS TEXT) IN (${placeholders(known)}))`,
      )
      values.push(...known)
    }
    if (input.series.includes('none')) {
      options.push(
        `NOT EXISTS (SELECT 1 FROM hardcover_work_series ws
          JOIN hardcover_book_works w ON w.connection_id=ws.connection_id AND w.work_id=ws.work_id
          WHERE ws.connection_id = p.connection_id AND ws.work_id = p.work_id
            AND ((w.upstream_state='active' AND ws.upstream_state='active')
              OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id)))`,
      )
    }
    clauses.push(`(${options.join(' OR ')})`)
  }

  if (skipFacet !== 'genre' && input.genres.length > 0) {
    const known = input.genres.filter((value) => value !== 'none')
    const options: string[] = []
    if (known.length > 0) {
      options.push(
        `EXISTS (SELECT 1 FROM hardcover_work_taxonomy wt
          JOIN hardcover_book_works w ON w.connection_id=wt.connection_id AND w.work_id=wt.work_id
          WHERE wt.connection_id = p.connection_id AND wt.work_id = p.work_id
            AND ((w.upstream_state='active' AND wt.upstream_state='active')
              OR (w.upstream_state='removed' AND wt.last_seen_run_id=w.last_seen_run_id))
            AND wt.category = 'Genre'
            AND wt.slug IN (${placeholders(known)}))`,
      )
      values.push(...known)
    }
    if (input.genres.includes('none')) {
      options.push(
        `NOT EXISTS (SELECT 1 FROM hardcover_work_taxonomy wt
          JOIN hardcover_book_works w ON w.connection_id=wt.connection_id AND w.work_id=wt.work_id
          WHERE wt.connection_id = p.connection_id AND wt.work_id = p.work_id
            AND ((w.upstream_state='active' AND wt.upstream_state='active')
              OR (w.upstream_state='removed' AND wt.last_seen_run_id=w.last_seen_run_id))
            AND wt.category = 'Genre')`,
      )
    }
    clauses.push(`(${options.join(' OR ')})`)
  }

  const addDateFilter = (
    column: string,
    mode: 'any' | 'range' | 'unavailable',
    from: string | undefined,
    to: string | undefined,
  ) => {
    if (mode === 'unavailable') clauses.push(`${column} IS NULL`)
    if (mode === 'range') {
      clauses.push(`${column} IS NOT NULL`)
      if (from !== undefined) {
        clauses.push(`${column} >= ?`)
        values.push(from)
      }
      if (to !== undefined) {
        clauses.push(`${column} <= ?`)
        values.push(to)
      }
    }
  }
  const addPublicationDateFilter = () => {
    if (input.publishedMode === 'unavailable') clauses.push('p.publication_date IS NULL')
    if (input.publishedMode !== 'range') return
    clauses.push('p.publication_date IS NOT NULL')
    if (input.publishedFrom !== undefined) {
      clauses.push(`${publicationEndSql('p.publication_date', 'p.publication_precision')} >= ?`)
      values.push(boundaryStart(input.publishedFrom))
    }
    if (input.publishedTo !== undefined) {
      clauses.push(`${publicationStartSql('p.publication_date', 'p.publication_precision')} <= ?`)
      values.push(boundaryEnd(input.publishedTo))
    }
  }
  if (input.collection === 'archive') {
    addDateFilter('p.latest_read_date', input.finishedMode, input.finishedFrom, input.finishedTo)
    if (input.ratingMode === 'rated') clauses.push('p.personal_rating IS NOT NULL')
    if (input.ratingMode === 'unrated') clauses.push('p.personal_rating IS NULL')
    if (input.ratingMode === 'minimum') {
      clauses.push('p.personal_rating >= ?')
      values.push(input.minRating ?? 0)
    }
  } else {
    addDateFilter('p.queue_added_at', input.addedMode, input.addedFrom, input.addedTo)
  }
  addPublicationDateFilter()
  return { sql: clauses.join(' AND '), values }
}

function readJsonArray<T>(value: string | null): T[] {
  if (value === null) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export interface HardcoverSyncProgress {
  readonly connectionId: string
  readonly syncRunId: string
  readonly checkpoint: JsonObject
  readonly updatedAt: string
}

export class SqlBooksRepository {
  readonly #database: DatabaseClient

  constructor(database: DatabaseClient) {
    this.#database = database
  }

  async findHardcoverSyncProgress(connectionId: string): Promise<HardcoverSyncProgress | null> {
    const row = await statement(
      this.#database,
      'SELECT sync_run_id,checkpoint_json,updated_at FROM hardcover_sync_progress WHERE connection_id=?',
      [connectionId],
    ).first<{ sync_run_id: string; checkpoint_json: string; updated_at: string }>()
    return row === null
      ? null
      : {
          connectionId,
          syncRunId: row.sync_run_id,
          checkpoint: JSON.parse(row.checkpoint_json) as JsonObject,
          updatedAt: row.updated_at,
        }
  }

  async saveHardcoverSyncProgress(progress: HardcoverSyncProgress): Promise<void> {
    await statement(
      this.#database,
      `INSERT INTO hardcover_sync_progress(connection_id,sync_run_id,checkpoint_json,updated_at)
      VALUES(?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET
        sync_run_id=excluded.sync_run_id,checkpoint_json=excluded.checkpoint_json,updated_at=excluded.updated_at`,
      [
        progress.connectionId,
        progress.syncRunId,
        JSON.stringify(progress.checkpoint),
        progress.updatedAt,
      ],
    ).run()
  }

  async findHardcoverRelationship(connectionId: string, userBookId: number) {
    return statement(
      this.#database,
      'SELECT media_item_id, work_id FROM hardcover_user_books WHERE connection_id=? AND user_book_id=?',
      [connectionId, userBookId],
    ).first<{ media_item_id: string; work_id: number }>()
  }

  async upsertHardcoverBooks(books: readonly HardcoverBookProjection[]): Promise<void> {
    const statements: DatabaseStatement[] = []
    for (const book of books) {
      const common = [
        book.sourceRecordId,
        book.syncRunId,
        book.observedAt,
        book.observedAt,
      ] as const
      statements.push(
        // The stable user-book relationship can outlive an upstream work ID.
        // This is a rebuildable projection; old source records and identities remain.
        statement(
          this.#database,
          `UPDATE hardcover_book_works SET work_id=?
           WHERE connection_id=? AND media_item_id=? AND work_id<>?
           AND EXISTS (SELECT 1 FROM hardcover_user_books
             WHERE connection_id=? AND user_book_id=? AND media_item_id=?)`,
          [
            book.workId,
            book.connectionId,
            book.mediaItemId,
            book.workId,
            book.connectionId,
            book.userBookId,
            book.mediaItemId,
          ],
        ),
        statement(
          this.#database,
          `UPDATE book_library_projection SET work_id=?
           WHERE connection_id=? AND media_item_id=? AND user_book_id=? AND work_id<>?`,
          [book.workId, book.connectionId, book.mediaItemId, book.userBookId, book.workId],
        ),
        statement(
          this.#database,
          `INSERT INTO hardcover_book_works (
            connection_id, work_id, media_item_id, canonical_work_id, title, subtitle,
            description, slug, pages, audio_seconds, release_date, release_precision,
            cover_url, cover_color, community_rating, community_ratings_count,
            users_read_count, default_cover_edition_id, source_record_id, source_updated_at,
            last_seen_run_id, upstream_state, first_observed_at, last_observed_at, retired_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
          ON CONFLICT(connection_id, work_id) DO UPDATE SET
            media_item_id=excluded.media_item_id,
            canonical_work_id=COALESCE(excluded.canonical_work_id, hardcover_book_works.canonical_work_id),
            title=excluded.title,
            subtitle=excluded.subtitle,
            description=excluded.description,
            slug=excluded.slug,
            pages=excluded.pages,
            audio_seconds=excluded.audio_seconds,
            release_date=excluded.release_date,
            release_precision=excluded.release_precision,
            cover_url=excluded.cover_url,
            cover_color=excluded.cover_color,
            community_rating=excluded.community_rating,
            community_ratings_count=excluded.community_ratings_count,
            users_read_count=excluded.users_read_count,
            default_cover_edition_id=excluded.default_cover_edition_id,
            source_record_id=excluded.source_record_id,
            source_updated_at=excluded.source_updated_at,
            last_seen_run_id=excluded.last_seen_run_id,
            upstream_state='active',
            last_observed_at=excluded.last_observed_at,
            retired_at=NULL`,
          [
            book.connectionId,
            book.workId,
            book.mediaItemId,
            book.canonicalWorkId,
            book.title,
            book.subtitle,
            book.description,
            book.slug,
            book.pages,
            book.audioSeconds,
            book.releaseDate,
            book.releasePrecision,
            book.coverUrl,
            book.coverColor,
            book.communityRating,
            book.communityRatingsCount,
            book.usersReadCount,
            book.defaultCoverEditionId,
            book.sourceRecordId,
            book.sourceUpdatedAt,
            book.syncRunId,
            book.observedAt,
            book.observedAt,
          ],
        ),
        statement(
          this.#database,
          `INSERT INTO hardcover_user_books (
            connection_id, user_book_id, media_item_id, work_id, current_edition_id,
            status_id, status_label, date_added, read_count, personal_rating, review_text,
            review_has_spoilers, reviewed_at, source_updated_at, source_record_id, last_seen_run_id,
            upstream_state, first_observed_at, last_observed_at, retired_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
          ON CONFLICT(connection_id, user_book_id) DO UPDATE SET
            media_item_id=excluded.media_item_id,
            work_id=excluded.work_id,
            current_edition_id=excluded.current_edition_id,
            status_id=excluded.status_id,
            status_label=excluded.status_label,
            date_added=excluded.date_added,
            read_count=excluded.read_count,
            personal_rating=excluded.personal_rating,
            review_text=excluded.review_text,
            review_has_spoilers=excluded.review_has_spoilers,
            reviewed_at=excluded.reviewed_at,
            source_updated_at=excluded.source_updated_at,
            source_record_id=excluded.source_record_id,
            last_seen_run_id=excluded.last_seen_run_id,
            upstream_state='active',
            last_observed_at=excluded.last_observed_at,
            retired_at=NULL`,
          [
            book.connectionId,
            book.userBookId,
            book.mediaItemId,
            book.workId,
            book.currentEditionId,
            book.statusId,
            book.statusLabel,
            book.dateAdded,
            book.readCount,
            book.personalRating,
            book.reviewText,
            book.reviewHasSpoilers ? 1 : 0,
            book.reviewedAt,
            book.sourceUpdatedAt,
            ...common,
          ],
        ),
      )
      for (const edition of book.editions) {
        statements.push(
          statement(
            this.#database,
            `INSERT INTO hardcover_book_editions (
              connection_id, edition_id, media_item_id, work_id, canonical_edition_id,
              title, subtitle, edition_information, reading_format_id, reading_format,
              raw_format, pages, audio_seconds, release_date, publisher, language,
              isbn_10, isbn_13, asin, cover_url, cover_color, source_record_id,
              last_seen_run_id, upstream_state, first_observed_at, last_observed_at, retired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(connection_id, edition_id) DO UPDATE SET
              media_item_id=excluded.media_item_id,
              work_id=excluded.work_id,
              canonical_edition_id=COALESCE(excluded.canonical_edition_id, hardcover_book_editions.canonical_edition_id),
              title=excluded.title,
              subtitle=excluded.subtitle,
              edition_information=excluded.edition_information,
              reading_format_id=excluded.reading_format_id,
              reading_format=excluded.reading_format,
              raw_format=excluded.raw_format,
              pages=excluded.pages,
              audio_seconds=excluded.audio_seconds,
              release_date=excluded.release_date,
              publisher=excluded.publisher,
              language=excluded.language,
              isbn_10=excluded.isbn_10,
              isbn_13=excluded.isbn_13,
              asin=excluded.asin,
              cover_url=excluded.cover_url,
              cover_color=excluded.cover_color,
              source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id,
              upstream_state='active',
              last_observed_at=excluded.last_observed_at,
              retired_at=NULL`,
            [
              book.connectionId,
              edition.id,
              book.mediaItemId,
              book.workId,
              edition.canonicalId,
              edition.title,
              edition.subtitle,
              edition.information,
              edition.readingFormatId,
              edition.readingFormat,
              edition.rawFormat,
              edition.pages,
              edition.audioSeconds,
              edition.releaseDate,
              edition.publisher,
              edition.language,
              normalizedIdentifier(edition.isbn10),
              normalizedIdentifier(edition.isbn13),
              normalizedIdentifier(edition.asin),
              edition.coverUrl,
              edition.coverColor,
              edition.sourceRecordId ?? book.sourceRecordId,
              book.syncRunId,
              book.observedAt,
              book.observedAt,
            ],
          ),
        )
        for (const contributor of edition.contributors) {
          statements.push(
            statement(
              this.#database,
              `INSERT INTO hardcover_contributors (
                connection_id, contributor_id, name, slug, source_record_id, last_seen_run_id,
                upstream_state, first_observed_at, last_observed_at, retired_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
              ON CONFLICT(connection_id, contributor_id) DO UPDATE SET
                name=excluded.name, slug=excluded.slug, source_record_id=excluded.source_record_id,
                last_seen_run_id=excluded.last_seen_run_id, upstream_state='active',
                last_observed_at=excluded.last_observed_at, retired_at=NULL`,
              [
                book.connectionId,
                contributor.id,
                contributor.name,
                contributor.slug,
                edition.sourceRecordId ?? book.sourceRecordId,
                book.syncRunId,
                book.observedAt,
                book.observedAt,
              ],
            ),
            statement(
              this.#database,
              `INSERT INTO hardcover_edition_contributors (
                connection_id, edition_id, contributor_id, role_id, role_name, contribution,
                is_primary, position, source_record_id, last_seen_run_id, upstream_state
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
              ON CONFLICT(connection_id, edition_id, contributor_id, role_name) DO UPDATE SET
                role_id=excluded.role_id, contribution=excluded.contribution,
                is_primary=excluded.is_primary, position=excluded.position,
                source_record_id=excluded.source_record_id,
                last_seen_run_id=excluded.last_seen_run_id, upstream_state='active'`,
              [
                book.connectionId,
                edition.id,
                contributor.id,
                contributor.roleId,
                contributor.roleName,
                contributor.contribution,
                contributor.primary ? 1 : 0,
                contributor.position,
                edition.sourceRecordId ?? book.sourceRecordId,
                book.syncRunId,
              ],
            ),
          )
        }
      }
      for (const contributor of book.contributors) {
        statements.push(
          statement(
            this.#database,
            `INSERT INTO hardcover_contributors (
              connection_id, contributor_id, name, slug, source_record_id, last_seen_run_id,
              upstream_state, first_observed_at, last_observed_at, retired_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(connection_id, contributor_id) DO UPDATE SET
              name=excluded.name, slug=excluded.slug, source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active',
              last_observed_at=excluded.last_observed_at, retired_at=NULL`,
            [
              book.connectionId,
              contributor.id,
              contributor.name,
              contributor.slug,
              book.sourceRecordId,
              book.syncRunId,
              book.observedAt,
              book.observedAt,
            ],
          ),
          statement(
            this.#database,
            `INSERT INTO hardcover_work_contributors (
              connection_id, work_id, contributor_id, role_id, role_name, contribution,
              is_primary, position, source_record_id, last_seen_run_id, upstream_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(connection_id, work_id, contributor_id, role_name) DO UPDATE SET
              role_id=excluded.role_id, contribution=excluded.contribution,
              is_primary=excluded.is_primary, position=excluded.position,
              source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active'`,
            [
              book.connectionId,
              book.workId,
              contributor.id,
              contributor.roleId,
              contributor.roleName,
              contributor.contribution,
              contributor.primary ? 1 : 0,
              contributor.position,
              book.sourceRecordId,
              book.syncRunId,
            ],
          ),
        )
      }
      for (const series of book.series) {
        statements.push(
          statement(
            this.#database,
            `INSERT INTO hardcover_series (
              connection_id, series_id, name, slug, books_count, source_record_id,
              last_seen_run_id, upstream_state, first_observed_at, last_observed_at, retired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(connection_id, series_id) DO UPDATE SET
              name=excluded.name, slug=excluded.slug, books_count=excluded.books_count,
              source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active',
              last_observed_at=excluded.last_observed_at, retired_at=NULL`,
            [
              book.connectionId,
              series.id,
              series.name,
              series.slug,
              series.booksCount,
              book.sourceRecordId,
              book.syncRunId,
              book.observedAt,
              book.observedAt,
            ],
          ),
          statement(
            this.#database,
            `INSERT INTO hardcover_work_series (
              connection_id, work_id, series_id, position, compilation, featured,
              source_record_id, last_seen_run_id, upstream_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(connection_id, work_id, series_id) DO UPDATE SET
              position=excluded.position, compilation=excluded.compilation,
              featured=excluded.featured, source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active'`,
            [
              book.connectionId,
              book.workId,
              series.id,
              series.position,
              series.compilation ? 1 : 0,
              series.featured ? 1 : 0,
              book.sourceRecordId,
              book.syncRunId,
            ],
          ),
        )
      }
      for (const term of book.taxonomy) {
        statements.push(
          statement(
            this.#database,
            `INSERT INTO hardcover_work_taxonomy (
              connection_id, work_id, category, value, slug, source_record_id,
              last_seen_run_id, upstream_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(connection_id, work_id, category, slug) DO UPDATE SET
              value=excluded.value, source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active'`,
            [
              book.connectionId,
              book.workId,
              term.category,
              term.value,
              term.slug,
              book.sourceRecordId,
              book.syncRunId,
            ],
          ),
        )
      }
      for (const read of book.reads) {
        statements.push(
          statement(
            this.#database,
            `INSERT INTO hardcover_user_book_reads (
              connection_id, read_id, user_book_id, media_item_id, archive_entry_id,
              edition_id, started_at, paused_at, finished_at, finished_at_precision_raw,
              progress, progress_pages, progress_seconds, source_record_id, last_seen_run_id,
              upstream_state, first_observed_at, last_observed_at, retired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
            ON CONFLICT(connection_id, read_id) DO UPDATE SET
              user_book_id=excluded.user_book_id, media_item_id=excluded.media_item_id,
              archive_entry_id=excluded.archive_entry_id, edition_id=excluded.edition_id,
              started_at=excluded.started_at, paused_at=excluded.paused_at,
              finished_at=excluded.finished_at,
              finished_at_precision_raw=excluded.finished_at_precision_raw,
              progress=excluded.progress, progress_pages=excluded.progress_pages,
              progress_seconds=excluded.progress_seconds,
              source_record_id=excluded.source_record_id,
              last_seen_run_id=excluded.last_seen_run_id, upstream_state='active',
              last_observed_at=excluded.last_observed_at, retired_at=NULL`,
            [
              book.connectionId,
              read.id,
              book.userBookId,
              book.mediaItemId,
              read.archiveEntryId,
              read.editionId,
              read.startedAt,
              read.pausedAt,
              read.finishedAt,
              read.finishedAtPrecisionRaw,
              read.progress,
              read.progressPages,
              read.progressSeconds,
              book.sourceRecordId,
              book.syncRunId,
              book.observedAt,
              book.observedAt,
            ],
          ),
        )
      }
    }
    await this.#runChunked(statements)
  }

  async finalizeHardcoverSnapshot(input: {
    connectionId: string
    syncRunId: string
    refreshedAt: string
  }): Promise<void> {
    const retireValues: DatabaseValue[] = [input.refreshedAt, input.connectionId, input.syncRunId]
    const statements = [
      ...[
        'hardcover_user_books',
        'hardcover_book_works',
        'hardcover_book_editions',
        'hardcover_contributors',
        'hardcover_user_book_reads',
      ].map((table) =>
        statement(
          this.#database,
          `UPDATE ${table} SET upstream_state='removed', retired_at=?
           WHERE connection_id=? AND upstream_state='active' AND last_seen_run_id<>?`,
          retireValues,
        ),
      ),
      ...[
        'hardcover_work_contributors',
        'hardcover_edition_contributors',
        'hardcover_work_series',
        'hardcover_work_taxonomy',
      ].map((table) =>
        statement(
          this.#database,
          `UPDATE ${table} SET upstream_state='removed'
             WHERE connection_id=? AND upstream_state='active' AND last_seen_run_id<>?`,
          [input.connectionId, input.syncRunId],
        ),
      ),
      statement(this.#database, 'DELETE FROM book_library_projection WHERE connection_id=?', [
        input.connectionId,
      ]),
      statement(
        this.#database,
        `INSERT INTO book_library_projection (
          media_item_id, connection_id, user_book_id, work_id, title, normalized_title,
          subtitle, primary_author_name, normalized_primary_author, cover_url, cover_color,
          publication_date, publication_precision, primary_series_name, current_status_id,
          queue_added_at, in_queue, in_archive, currently_reading, personal_rating,
          latest_read_id, latest_read_date, latest_read_precision, latest_read_format,
          current_edition_format, supported_read_count, source_refreshed_at, projection_version
        )
        SELECT
          w.media_item_id, w.connection_id, ub.user_book_id, w.work_id, w.title,
          lower(trim(w.title)), w.subtitle,
          (SELECT c.name FROM hardcover_work_contributors wc
            JOIN hardcover_contributors c ON c.connection_id=wc.connection_id
              AND c.contributor_id=wc.contributor_id
            WHERE wc.connection_id=w.connection_id AND wc.work_id=w.work_id
              AND ((w.upstream_state='active' AND wc.upstream_state='active'
                    AND c.upstream_state='active')
                OR (w.upstream_state='removed' AND wc.last_seen_run_id=w.last_seen_run_id
                    AND c.last_seen_run_id=w.last_seen_run_id))
              AND (lower(wc.role_name)='author' OR wc.is_primary=1)
            ORDER BY wc.is_primary DESC, wc.position, c.name LIMIT 1),
          lower(COALESCE((SELECT c.name FROM hardcover_work_contributors wc
            JOIN hardcover_contributors c ON c.connection_id=wc.connection_id
              AND c.contributor_id=wc.contributor_id
            WHERE wc.connection_id=w.connection_id AND wc.work_id=w.work_id
              AND ((w.upstream_state='active' AND wc.upstream_state='active'
                    AND c.upstream_state='active')
                OR (w.upstream_state='removed' AND wc.last_seen_run_id=w.last_seen_run_id
                    AND c.last_seen_run_id=w.last_seen_run_id))
              AND (lower(wc.role_name)='author' OR wc.is_primary=1)
            ORDER BY wc.is_primary DESC, wc.position, c.name LIMIT 1), '')),
          w.cover_url, w.cover_color, w.release_date, w.release_precision,
          (SELECT s.name FROM hardcover_work_series ws
            JOIN hardcover_series s ON s.connection_id=ws.connection_id AND s.series_id=ws.series_id
            WHERE ws.connection_id=w.connection_id AND ws.work_id=w.work_id
              AND ((w.upstream_state='active' AND ws.upstream_state='active'
                    AND s.upstream_state='active')
                OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id
                    AND s.last_seen_run_id=w.last_seen_run_id))
            ORDER BY ws.featured DESC, ws.position, s.name LIMIT 1),
          ub.status_id, ub.date_added,
          CASE WHEN w.upstream_state='active' AND ub.upstream_state='active'
            AND ub.status_id IN (1,2) THEN 1 ELSE 0 END,
          CASE WHEN EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=w.media_item_id AND a.connection_id=w.connection_id
              AND a.upstream_state='active') THEN 1 ELSE 0 END,
          CASE WHEN w.upstream_state='active' AND ub.upstream_state='active'
            AND ub.status_id=2 THEN 1 ELSE 0 END,
          ub.personal_rating,
          (SELECT r.read_id FROM archive_entries a
            LEFT JOIN hardcover_user_book_reads r ON r.archive_entry_id=a.id
            WHERE a.connection_id=w.connection_id AND a.media_item_id=w.media_item_id
              AND a.upstream_state='active'
            ORDER BY CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END,
              a.consumed_at_value DESC, a.id DESC LIMIT 1),
          (SELECT a.consumed_at_value FROM archive_entries a
            WHERE a.connection_id=w.connection_id AND a.media_item_id=w.media_item_id
              AND a.upstream_state='active'
            ORDER BY CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END,
              a.consumed_at_value DESC, a.id DESC LIMIT 1),
          (SELECT a.consumed_at_precision FROM archive_entries a
            WHERE a.connection_id=w.connection_id AND a.media_item_id=w.media_item_id
              AND a.upstream_state='active'
            ORDER BY CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END,
              a.consumed_at_value DESC, a.id DESC LIMIT 1),
          (SELECT ${normalizedFormatSql('e')}
            FROM archive_entries a
            LEFT JOIN hardcover_user_book_reads r ON r.archive_entry_id=a.id
            LEFT JOIN hardcover_book_editions e ON e.connection_id=r.connection_id
              AND e.edition_id=r.edition_id
            WHERE a.connection_id=w.connection_id AND a.media_item_id=w.media_item_id
              AND a.upstream_state='active'
            ORDER BY CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END,
              a.consumed_at_value DESC, a.id DESC LIMIT 1),
          (SELECT ${normalizedFormatSql('e')}
            FROM hardcover_book_editions e
            WHERE e.connection_id=ub.connection_id AND e.edition_id=ub.current_edition_id
            LIMIT 1),
          (SELECT COUNT(*) FROM archive_entries a
            WHERE a.media_item_id=w.media_item_id AND a.connection_id=w.connection_id
              AND a.upstream_state='active'),
          ?, 2
        FROM hardcover_book_works w
        JOIN hardcover_user_books ub ON ub.connection_id=w.connection_id AND ub.work_id=w.work_id
        WHERE w.connection_id=? AND (
          (w.upstream_state='active' AND ub.upstream_state='active')
          OR EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=w.media_item_id AND a.connection_id=w.connection_id
              AND a.upstream_state='active')
        )`,
        [input.refreshedAt, input.connectionId],
      ),
      statement(
        this.#database,
        `DELETE FROM book_identifiers WHERE media_item_id IN (
          SELECT media_item_id FROM hardcover_book_works WHERE connection_id=?)`,
        [input.connectionId],
      ),
      statement(
        this.#database,
        `INSERT OR IGNORE INTO book_identifiers(media_item_id, type, normalized_value, display_value)
         SELECT media_item_id, kind, value, value FROM (
           SELECT media_item_id, 'isbn_10' kind, isbn_10 value FROM hardcover_book_editions
             WHERE connection_id=? AND isbn_10 IS NOT NULL
               AND media_item_id IN (SELECT media_item_id FROM book_library_projection)
           UNION ALL
           SELECT media_item_id, 'isbn_13', isbn_13 FROM hardcover_book_editions
             WHERE connection_id=? AND isbn_13 IS NOT NULL
               AND media_item_id IN (SELECT media_item_id FROM book_library_projection)
           UNION ALL
           SELECT media_item_id, 'asin', asin FROM hardcover_book_editions
             WHERE connection_id=? AND asin IS NOT NULL
               AND media_item_id IN (SELECT media_item_id FROM book_library_projection)
         )`,
        [input.connectionId, input.connectionId, input.connectionId],
      ),
      statement(
        this.#database,
        `DELETE FROM book_search WHERE media_item_id IN (
          SELECT media_item_id FROM hardcover_book_works WHERE connection_id=?)`,
        [input.connectionId],
      ),
      statement(
        this.#database,
        `INSERT INTO book_search(media_item_id, title, subtitle, contributors, series, identifiers)
         SELECT p.media_item_id, p.title, COALESCE(p.subtitle, ''),
           COALESCE((SELECT group_concat(name, ' ') FROM (
             SELECT c.name FROM hardcover_work_contributors wc
             JOIN hardcover_contributors c ON c.connection_id=wc.connection_id
               AND c.contributor_id=wc.contributor_id
             JOIN hardcover_book_works w ON w.connection_id=wc.connection_id
               AND w.work_id=wc.work_id
             WHERE wc.connection_id=p.connection_id AND wc.work_id=p.work_id
               AND ((w.upstream_state='active' AND wc.upstream_state='active'
                     AND c.upstream_state='active')
                 OR (w.upstream_state='removed' AND wc.last_seen_run_id=w.last_seen_run_id
                     AND c.last_seen_run_id=w.last_seen_run_id))
             UNION
             SELECT c.name FROM hardcover_book_editions e
             JOIN hardcover_edition_contributors ec ON ec.connection_id=e.connection_id
               AND ec.edition_id=e.edition_id
             JOIN hardcover_contributors c ON c.connection_id=ec.connection_id
               AND c.contributor_id=ec.contributor_id
             WHERE e.media_item_id=p.media_item_id
           )), ''),
           COALESCE((SELECT group_concat(s.name, ' ') FROM hardcover_work_series ws
             JOIN hardcover_series s ON s.connection_id=ws.connection_id AND s.series_id=ws.series_id
             JOIN hardcover_book_works w ON w.connection_id=ws.connection_id
               AND w.work_id=ws.work_id
             WHERE ws.connection_id=p.connection_id AND ws.work_id=p.work_id
               AND ((w.upstream_state='active' AND ws.upstream_state='active'
                     AND s.upstream_state='active')
                 OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id
                     AND s.last_seen_run_id=w.last_seen_run_id))), ''),
           COALESCE((SELECT group_concat(i.normalized_value, ' ') FROM book_identifiers i
             WHERE i.media_item_id=p.media_item_id), '')
         FROM book_library_projection p WHERE p.connection_id=?`,
        [input.connectionId],
      ),
    ]
    const results = await this.#database.batch(statements)
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      throw new Error('Hardcover snapshot finalization did not complete successfully')
    }
  }

  async listBooks(input: BooksListInput): Promise<BooksPageRecord> {
    const [page, summary] = await Promise.all([
      this.listBookItems(input),
      this.summarizeBooks(input),
    ])
    return { ...page, ...summary }
  }

  async listBookItems(
    input: BooksListInput,
  ): Promise<Pick<BooksPageRecord, 'data' | 'nextCursor'>> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Books limit must be an integer from 1 through 100')
    }
    const sort = input.sort ?? (input.collection === 'archive' ? 'recent_read' : ('added' as const))
    const defaultDirection =
      sort === 'title' || sort === 'author' || sort === 'earliest_read' ? 'asc' : 'desc'
    const direction = input.direction ?? defaultDirection
    const sortColumn = {
      recent_read: 'p.latest_read_date',
      earliest_read: 'p.latest_read_date',
      title: 'p.normalized_title',
      author: 'p.normalized_primary_author',
      personal_rating: 'p.personal_rating',
      published: 'p.publication_date',
      added: 'p.queue_added_at',
    }[sort]
    const fingerprint = await hashQueryFingerprint(projectionFingerprint(input, sort, direction))
    const cursor = await decodeCursor(input.cursor, fingerprint)
    const filter = filterSql(input)
    const nullRank = `CASE WHEN ${sortColumn} IS NULL OR ${sortColumn}='' THEN 1 ELSE 0 END`
    const comparison = direction === 'asc' ? '>' : '<'
    const cursorSql =
      cursor === null
        ? ''
        : `AND (
          ${nullRank} > ? OR
          (${nullRank} = ? AND (
            (? = 1 AND (
              p.normalized_title > ? OR
              (p.normalized_title = ? AND p.media_item_id > ?)
            )) OR
            (? = 0 AND (
              ${sortColumn} ${comparison} ? OR
              (${sortColumn} = ? AND (
                p.normalized_title > ? OR
                (p.normalized_title = ? AND p.media_item_id > ?)
              ))
            ))
          ))
        )`
    const cursorValues: DatabaseValue[] =
      cursor === null
        ? []
        : [
            cursor.nullRank,
            cursor.nullRank,
            cursor.nullRank,
            cursor.title,
            cursor.title,
            cursor.id,
            cursor.nullRank,
            cursor.value ?? '',
            cursor.value ?? '',
            cursor.title,
            cursor.title,
            cursor.id,
          ]
    const rows = await statement(
      this.#database,
      `SELECT p.*,
        ${nullRank} sort_null_rank,
        ${sortColumn} sort_value,
        COALESCE((SELECT json_group_array(json_object('id', CAST(contributor_id AS TEXT), 'name', name))
          FROM (
            SELECT c.contributor_id, c.name FROM hardcover_work_contributors wc
            JOIN hardcover_contributors c ON c.connection_id=wc.connection_id
              AND c.contributor_id=wc.contributor_id
            JOIN hardcover_book_works w ON w.connection_id=wc.connection_id
              AND w.work_id=wc.work_id
            WHERE wc.connection_id=p.connection_id AND wc.work_id=p.work_id
              AND ((w.upstream_state='active' AND wc.upstream_state='active'
                    AND c.upstream_state='active')
                OR (w.upstream_state='removed' AND wc.last_seen_run_id=w.last_seen_run_id
                    AND c.last_seen_run_id=w.last_seen_run_id))
              AND (lower(wc.role_name)='author' OR wc.is_primary=1)
            ORDER BY wc.is_primary DESC, wc.position, c.name
          )), '[]') authors_json
       FROM book_library_projection p
       WHERE ${filter.sql} ${cursorSql}
       ORDER BY ${nullRank} ASC, ${sortColumn} ${direction.toUpperCase()},
         p.normalized_title ASC, p.media_item_id ASC
       LIMIT ?`,
      [...filter.values, ...cursorValues, input.limit + 1],
    ).all<{
      media_item_id: string
      title: string
      subtitle: string | null
      cover_url: string | null
      cover_color: string | null
      publication_date: string | null
      publication_precision: 'year' | 'month' | 'day' | null
      primary_series_name: string | null
      in_archive: number
      in_queue: number
      currently_reading: number
      latest_read_date: string | null
      latest_read_precision: 'year' | 'month' | 'day' | null
      latest_read_format: string | null
      personal_rating: number | null
      queue_added_at: string | null
      supported_read_count: number
      normalized_title: string
      sort_null_rank: number
      sort_value: string | number | null
      authors_json: string
    }>()
    const pageRows = rows.results.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      data: pageRows.map((row) => ({
        id: row.media_item_id,
        title: row.title,
        subtitle: row.subtitle,
        authors: readJsonArray<{ id: string; name: string }>(row.authors_json),
        coverUrl: row.cover_url,
        coverColor: row.cover_color,
        publicationDate: row.publication_date,
        publicationPrecision: row.publication_precision,
        primarySeries: row.primary_series_name,
        memberships: {
          archive: row.in_archive === 1,
          queue: row.in_queue === 1,
          currentlyReading: row.currently_reading === 1,
        },
        latestReadDate: row.latest_read_date,
        latestReadPrecision: row.latest_read_precision,
        latestReadFormat: row.latest_read_format,
        personalRating: row.personal_rating,
        addedToHardcoverDate: row.queue_added_at,
        supportedReadCount: row.supported_read_count,
      })),
      nextCursor:
        rows.results.length > input.limit && last !== undefined
          ? encodeCursor({
              v: 1,
              fingerprint,
              nullRank: last.sort_null_rank,
              value: last.sort_value,
              title: last.normalized_title,
              id: last.media_item_id,
            })
          : null,
    }
  }

  async summarizeBooks(
    input: BooksListInput,
  ): Promise<Omit<BooksPageRecord, 'data' | 'nextCursor'>> {
    const filter = filterSql(input)
    const countsRow = await statement(
      this.#database,
      `SELECT COUNT(*) filtered_books, COALESCE(SUM(p.supported_read_count),0) supported_reads
       FROM book_library_projection p WHERE ${filter.sql}`,
      filter.values,
    ).first<{ filtered_books: number; supported_reads: number }>()
    const totals = await this.#database
      .prepare(
        `SELECT COALESCE(SUM(in_archive),0) archive, COALESCE(SUM(in_queue),0) queue
         FROM book_library_projection`,
      )
      .first<{ archive: number; queue: number }>()
    const facets = await this.#facets(input)
    const freshness = await this.#database
      .prepare(
        `SELECT MAX(s.finished_at) last_successful_sync_at,
          MAX(CASE WHEN c.status='degraded' THEN 1 ELSE 0 END) degraded
         FROM connections c LEFT JOIN sync_runs s ON s.connection_id=c.id AND s.status='succeeded'
         WHERE c.source='hardcover'`,
      )
      .first<{ last_successful_sync_at: string | null; degraded: number | null }>()
    return {
      counts: {
        archive: totals?.archive ?? 0,
        queue: totals?.queue ?? 0,
        filteredBooks: countsRow?.filtered_books ?? 0,
        supportedReads: input.collection === 'archive' ? (countsRow?.supported_reads ?? 0) : 0,
      },
      facets,
      freshness: {
        lastSuccessfulSyncAt: freshness?.last_successful_sync_at ?? null,
        degraded: freshness?.degraded === 1,
      },
    }
  }

  async findBook(id: string): Promise<BookDetailRecord | null> {
    const row = await statement(
      this.#database,
      `SELECT p.*, w.description, w.pages, w.audio_seconds, w.community_rating,
        w.community_ratings_count, w.slug, c.coverage,
        (SELECT MAX(s.finished_at) FROM sync_runs s
          WHERE s.connection_id=p.connection_id AND s.status='succeeded') refreshed_at
       FROM book_library_projection p
       JOIN hardcover_book_works w ON w.connection_id=p.connection_id AND w.work_id=p.work_id
       JOIN connections c ON c.id=p.connection_id
       WHERE p.media_item_id=?`,
      [id],
    ).first<{
      media_item_id: string
      connection_id: string
      work_id: number
      title: string
      subtitle: string | null
      description: string | null
      cover_url: string | null
      cover_color: string | null
      publication_date: string | null
      publication_precision: 'year' | 'month' | 'day' | null
      pages: number | null
      audio_seconds: number | null
      in_archive: number
      in_queue: number
      currently_reading: number
      personal_rating: number | null
      community_rating: number | null
      community_ratings_count: number
      current_status_id: number
      slug: string | null
      coverage: 'complete' | 'partial' | 'best_effort'
      refreshed_at: string | null
    }>()
    if (row === null) return null
    const seriesRows = await statement(
      this.#database,
      `SELECT s.series_id, s.name, ws.position, s.books_count, ws.compilation
       FROM hardcover_work_series ws JOIN hardcover_series s
         ON s.connection_id=ws.connection_id AND s.series_id=ws.series_id
       JOIN hardcover_book_works w ON w.connection_id=ws.connection_id AND w.work_id=ws.work_id
       WHERE ws.connection_id=? AND ws.work_id=?
         AND ((w.upstream_state='active' AND ws.upstream_state='active'
               AND s.upstream_state='active')
           OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id
               AND s.last_seen_run_id=w.last_seen_run_id))
       ORDER BY ws.featured DESC, ws.position, s.name`,
      [row.connection_id, row.work_id],
    ).all<{
      series_id: number
      name: string
      position: number | null
      books_count: number | null
      compilation: number
    }>()
    const contributorRows = await statement(
      this.#database,
      `SELECT wc.role_name, c.contributor_id, c.name
       FROM hardcover_work_contributors wc JOIN hardcover_contributors c
         ON c.connection_id=wc.connection_id AND c.contributor_id=wc.contributor_id
       JOIN hardcover_book_works w ON w.connection_id=wc.connection_id AND w.work_id=wc.work_id
       WHERE wc.connection_id=? AND wc.work_id=? AND wc.upstream_state='active'
         AND c.upstream_state='active' AND w.upstream_state='active'
       UNION ALL
       SELECT wc.role_name, c.contributor_id, c.name
       FROM hardcover_work_contributors wc JOIN hardcover_contributors c
         ON c.connection_id=wc.connection_id AND c.contributor_id=wc.contributor_id
       JOIN hardcover_book_works w ON w.connection_id=wc.connection_id AND w.work_id=wc.work_id
       WHERE wc.connection_id=? AND wc.work_id=? AND w.upstream_state='removed'
         AND wc.last_seen_run_id=w.last_seen_run_id AND c.last_seen_run_id=w.last_seen_run_id
       UNION ALL
       SELECT ec.role_name || ' (selected edition)', c.contributor_id, c.name
       FROM hardcover_user_books ub
       JOIN hardcover_edition_contributors ec ON ec.connection_id=ub.connection_id
         AND ec.edition_id=ub.current_edition_id
       JOIN hardcover_contributors c ON c.connection_id=ec.connection_id
         AND c.contributor_id=ec.contributor_id
       WHERE ub.connection_id=? AND ub.media_item_id=?
         AND ((ub.upstream_state='active' AND ec.upstream_state='active'
               AND c.upstream_state='active')
           OR (ub.upstream_state='removed' AND ec.last_seen_run_id=ub.last_seen_run_id
               AND c.last_seen_run_id=ub.last_seen_run_id))
         AND NOT EXISTS (
           SELECT 1 FROM hardcover_work_contributors wc
           WHERE wc.connection_id=ub.connection_id AND wc.work_id=ub.work_id
             AND wc.contributor_id=ec.contributor_id AND wc.role_name=ec.role_name
         )
       ORDER BY role_name, name`,
      [row.connection_id, row.work_id, row.connection_id, row.work_id, row.connection_id, id],
    ).all<{ role_name: string; contributor_id: number; name: string }>()
    const edition = await statement(
      this.#database,
      `SELECT e.*, ${normalizedFormatSql('e')} normalized_format
       FROM hardcover_user_books ub LEFT JOIN hardcover_book_editions e
         ON e.connection_id=ub.connection_id AND e.edition_id=ub.current_edition_id
       WHERE ub.connection_id=? AND ub.media_item_id=?`,
      [row.connection_id, id],
    ).first<{
      edition_id: number | null
      reading_format: string | null
      raw_format: string | null
      normalized_format: string | null
      edition_information: string | null
      pages: number | null
      audio_seconds: number | null
      publisher: string | null
      release_date: string | null
      language: string | null
      isbn_10: string | null
      isbn_13: string | null
      asin: string | null
      cover_url: string | null
    }>()
    const taxonomy = await statement(
      this.#database,
      `SELECT wt.category, wt.value FROM hardcover_work_taxonomy wt
       JOIN hardcover_book_works w ON w.connection_id=wt.connection_id AND w.work_id=wt.work_id
       WHERE wt.connection_id=? AND wt.work_id=?
         AND ((w.upstream_state='active' AND wt.upstream_state='active')
           OR (w.upstream_state='removed' AND wt.last_seen_run_id=w.last_seen_run_id))
       ORDER BY category, value`,
      [row.connection_id, row.work_id],
    ).all<{ category: string; value: string }>()
    const grouped = new Map<string, Array<{ id: string; name: string }>>()
    for (const contributor of contributorRows.results) {
      const values = grouped.get(contributor.role_name) ?? []
      values.push({ id: String(contributor.contributor_id), name: contributor.name })
      grouped.set(contributor.role_name, values)
    }
    const valuesFor = (category: string) =>
      taxonomy.results.filter((term) => term.category === category).map((term) => term.value)
    const identifiers: Array<{ type: 'ISBN-10' | 'ISBN-13' | 'ASIN'; value: string }> = []
    if (edition?.isbn_10) identifiers.push({ type: 'ISBN-10', value: edition.isbn_10 })
    if (edition?.isbn_13) identifiers.push({ type: 'ISBN-13', value: edition.isbn_13 })
    if (edition?.asin) identifiers.push({ type: 'ASIN', value: edition.asin })
    return {
      id: row.media_item_id,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      coverUrl: row.cover_url,
      coverColor: row.cover_color,
      publicationDate: row.publication_date,
      publicationPrecision: row.publication_precision,
      pageCount: row.pages,
      audioSeconds: row.audio_seconds,
      memberships: {
        archive: row.in_archive === 1,
        queue: row.in_queue === 1,
        currentlyReading: row.currently_reading === 1,
      },
      personalRating: row.personal_rating,
      series: seriesRows.results.map((series) => ({
        id: String(series.series_id),
        name: series.name,
        position: series.position,
        totalBooks: series.books_count,
        compilation: series.compilation === 1,
      })),
      contributors: [...grouped].map(([role, contributors]) => ({ role, contributors })),
      selectedEdition:
        edition === null || edition.edition_id === null
          ? null
          : {
              id: String(edition.edition_id),
              format: edition.normalized_format,
              information: edition.edition_information,
              pages: edition.pages,
              audioSeconds: edition.audio_seconds,
              publisher: edition.publisher,
              releaseDate: edition.release_date,
              language: edition.language,
              identifiers,
              coverUrl: edition.cover_url,
            },
      community: {
        rating: row.community_rating,
        ratingsCount: row.community_ratings_count,
        genres: valuesFor('Genre'),
        moods: valuesFor('Mood'),
        pace: valuesFor('Pace'),
        contentWarnings: valuesFor('Content Warning'),
      },
      source: {
        label: 'Hardcover',
        url: row.slug === null ? null : `https://hardcover.app/books/${row.slug}`,
        refreshedAt: row.refreshed_at,
        coverage: row.coverage,
      },
    }
  }

  async listBookHistory(
    id: string,
    input: { limit: number; cursor?: string },
  ): Promise<{ data: BookHistoryRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Book history limit must be an integer from 1 through 100')
    }
    let cursor: { date: string; id: string } | null = null
    if (input.cursor !== undefined) {
      try {
        const parsed = JSON.parse(decodeURIComponent(input.cursor)) as {
          date?: unknown
          id?: unknown
        }
        if (typeof parsed.date !== 'string' || typeof parsed.id !== 'string') throw new Error()
        cursor = { date: parsed.date, id: parsed.id }
      } catch {
        throw new TypeError('Invalid Book history cursor')
      }
    }
    const [userBooks, reads, fallbackReads] = await Promise.all([
      statement(
        this.#database,
        `SELECT user_book_id, status_id, status_label, date_added, reviewed_at,
          upstream_state,
          personal_rating, review_text
         FROM hardcover_user_books WHERE media_item_id=?`,
        [id],
      ).all<{
        user_book_id: number
        status_id: number
        status_label: string | null
        date_added: string | null
        reviewed_at: string | null
        upstream_state: 'active' | 'removed' | 'unknown'
        personal_rating: number | null
        review_text: string | null
      }>(),
      statement(
        this.#database,
        `SELECT r.read_id, r.started_at, r.finished_at, r.progress, r.progress_pages,
          r.progress_seconds, e.edition_id,
          ${normalizedFormatSql('e')} edition_format,
          e.title edition_title
         FROM hardcover_user_book_reads r
         LEFT JOIN hardcover_book_editions e ON e.connection_id=r.connection_id
           AND e.edition_id=r.edition_id
         WHERE r.media_item_id=?`,
        [id],
      ).all<{
        read_id: number
        started_at: string | null
        finished_at: string | null
        progress: number | null
        progress_pages: number | null
        progress_seconds: number | null
        edition_id: number | null
        edition_format: string | null
        edition_title: string | null
      }>(),
      statement(
        this.#database,
        `SELECT a.id, a.consumed_at_value, a.consumed_at_precision
         FROM archive_entries a
         WHERE a.media_item_id=? AND a.upstream_state='active'
           AND NOT EXISTS (
             SELECT 1 FROM hardcover_user_book_reads r
             WHERE r.archive_entry_id=a.id
           )`,
        [id],
      ).all<{
        id: string
        consumed_at_value: string | null
        consumed_at_precision: string | null
      }>(),
    ])
    const events: BookHistoryRecord[] = []
    for (const row of userBooks.results) {
      const key = String(row.user_book_id)
      if (row.date_added !== null) {
        events.push({
          id: `added:${key}`,
          kind: 'added',
          label: 'Added to Hardcover',
          date: row.date_added,
          datePrecision: 'day',
          detail: null,
          edition: null,
        })
      }
      events.push({
        id: `status:${key}`,
        kind: 'status',
        label: `${row.upstream_state === 'active' ? '' : 'Last observed status: '}${
          row.status_label ??
          (row.status_id === 1
            ? 'Want to Read'
            : row.status_id === 2
              ? 'Currently Reading'
              : 'Read')
        }`,
        date: null,
        datePrecision: null,
        detail: null,
        edition: null,
      })
      if (row.personal_rating !== null) {
        events.push({
          id: `rating:${key}`,
          kind: 'rating',
          label: 'Rated',
          date: null,
          datePrecision: null,
          detail: `${row.personal_rating}/5`,
          edition: null,
        })
      }
      if (row.review_text !== null && row.review_text.trim() !== '') {
        events.push({
          id: `review:${key}`,
          kind: 'review',
          label: 'Reviewed',
          date: row.reviewed_at,
          datePrecision: row.reviewed_at === null ? null : 'instant',
          detail: row.review_text,
          edition: null,
        })
      }
    }
    for (const row of reads.results) {
      const edition =
        row.edition_id === null
          ? null
          : {
              id: String(row.edition_id),
              format: row.edition_format,
              title: row.edition_title,
            }
      if (row.finished_at !== null) {
        events.push({
          id: `read:${row.read_id}`,
          kind: 'read',
          label: 'Read',
          date: row.finished_at,
          datePrecision: 'day',
          detail: null,
          edition,
        })
      }
      if (row.progress !== null || row.progress_pages !== null || row.progress_seconds !== null) {
        events.push({
          id: `progress:${row.read_id}`,
          kind: 'progress',
          label: 'Reading progress',
          date: null,
          datePrecision: null,
          detail:
            row.progress_pages !== null
              ? `${row.progress_pages} pages`
              : row.progress_seconds !== null
                ? `${row.progress_seconds} seconds`
                : `${row.progress}%`,
          edition,
        })
      }
    }
    for (const row of fallbackReads.results) {
      const precision = ['year', 'month', 'day', 'instant'].includes(
        row.consumed_at_precision ?? '',
      )
        ? (row.consumed_at_precision as BookHistoryRecord['datePrecision'])
        : null
      events.push({
        id: `read:${row.id}`,
        kind: 'read',
        label: 'Read',
        date: row.consumed_at_value,
        datePrecision: precision,
        detail: row.consumed_at_value === null ? 'Date unavailable' : null,
        edition: null,
      })
    }
    const candidates = events
      .sort((left, right) => {
        const dateOrder = (right.date ?? '').localeCompare(left.date ?? '')
        return dateOrder === 0 ? right.id.localeCompare(left.id) : dateOrder
      })
      .filter(
        (entry) =>
          cursor === null ||
          (entry.date ?? '') < cursor.date ||
          ((entry.date ?? '') === cursor.date && entry.id < cursor.id),
      )
      .slice(0, input.limit + 1)
    const page = candidates.slice(0, input.limit)
    const last = page.at(-1)
    return {
      data: page,
      nextCursor:
        candidates.length > input.limit && last !== undefined
          ? encodeURIComponent(JSON.stringify({ date: last.date ?? '', id: last.id }))
          : null,
    }
  }

  async #facets(input: BooksListInput): Promise<BooksPageRecord['facets']> {
    const formatFilter = filterSql(input, 'format')
    const formatColumn =
      input.collection === 'archive' ? 'p.latest_read_format' : 'p.current_edition_format'
    const formats = await statement(
      this.#database,
      `SELECT COALESCE(lower(trim(${formatColumn})), 'unknown') value,
        COALESCE(MIN(trim(${formatColumn})), 'Edition unknown') label, COUNT(*) count
       FROM book_library_projection p WHERE ${formatFilter.sql}
       GROUP BY value ORDER BY CASE WHEN value='unknown' THEN 1 ELSE 0 END, label`,
      formatFilter.values,
    ).all<BookFacetRecord>()
    const seriesFilter = filterSql(input, 'series')
    const series = await statement(
      this.#database,
      `SELECT CAST(s.series_id AS TEXT) value, s.name label, COUNT(DISTINCT p.media_item_id) count
       FROM book_library_projection p
       JOIN hardcover_work_series ws ON ws.connection_id=p.connection_id AND ws.work_id=p.work_id
       JOIN hardcover_book_works w ON w.connection_id=ws.connection_id AND w.work_id=ws.work_id
       JOIN hardcover_series s ON s.connection_id=ws.connection_id AND s.series_id=ws.series_id
       WHERE ${seriesFilter.sql}
         AND ((w.upstream_state='active' AND ws.upstream_state='active'
               AND s.upstream_state='active')
           OR (w.upstream_state='removed' AND ws.last_seen_run_id=w.last_seen_run_id
               AND s.last_seen_run_id=w.last_seen_run_id))
       GROUP BY s.series_id, s.name ORDER BY s.name`,
      seriesFilter.values,
    ).all<BookFacetRecord>()
    const genreFilter = filterSql(input, 'genre')
    const genres = await statement(
      this.#database,
      `SELECT wt.slug value, MIN(wt.value) label, COUNT(DISTINCT p.media_item_id) count
       FROM book_library_projection p
       JOIN hardcover_work_taxonomy wt ON wt.connection_id=p.connection_id
         AND wt.work_id=p.work_id AND wt.category='Genre'
       JOIN hardcover_book_works w ON w.connection_id=wt.connection_id AND w.work_id=wt.work_id
       WHERE ${genreFilter.sql}
         AND ((w.upstream_state='active' AND wt.upstream_state='active')
           OR (w.upstream_state='removed' AND wt.last_seen_run_id=w.last_seen_run_id))
       GROUP BY wt.slug ORDER BY label`,
      genreFilter.values,
    ).all<BookFacetRecord>()
    return {
      formats: [...formats.results],
      series: [...series.results],
      genres: [...genres.results],
    }
  }

  async #runChunked(statements: readonly DatabaseStatement[]): Promise<void> {
    for (let start = 0; start < statements.length; start += 75) {
      const chunk = statements.slice(start, start + 75)
      const results = await this.#database.batch(chunk)
      if (results.length !== chunk.length || results.some((result) => !result.success)) {
        throw new Error('Books projection batch did not complete successfully')
      }
    }
  }
}
