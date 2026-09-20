import type { DatabaseClient, DatabaseStatement, DatabaseValue } from './database'

export interface LetterboxdMovieSnapshotFilm {
  mediaItemId: string
  filmUri: string
  title: string
  releaseYear: string
  currentRating: number | null
  ratingSourceRecordId: string | null
  likedSourceRecordId: string | null
  watchlistSourceRecordId: string | null
  watchlistAddedOn: string | null
}

export interface LetterboxdMovieSnapshotViewing {
  archiveEntryId: string
  mediaItemId: string
  diaryUri: string | null
  rewatch: boolean
  logUrl: string
  sourceRecordId: string
}

export interface LetterboxdMovieSnapshot {
  connectionId: string
  rawObjectId: string
  snapshotSourceRecordId: string
  observedAt: string
  films: readonly LetterboxdMovieSnapshotFilm[]
  viewings: readonly LetterboxdMovieSnapshotViewing[]
}

export interface MoviesListInput {
  collection: 'archive' | 'queue'
  q?: string
  watchedMode: 'all' | 'range' | 'unknown'
  watchedFrom?: string
  watchedTo?: string
  addedMode: 'all' | 'range' | 'unknown'
  addedFrom?: string
  addedTo?: string
  releaseYearFrom?: string
  releaseYearTo?: string
  releaseYearUnknown: boolean
  ratingMode: 'any' | 'rated' | 'unrated' | 'range'
  ratingMin?: number
  ratingMax?: number
  reviewed: 'any' | 'yes' | 'no'
  archive: 'any' | 'yes' | 'no'
  runtime: 'any' | 'under90' | '90to119' | '120to149' | '150plus'
  runtimeUnknown: boolean
  sort?:
    | 'watchedAt'
    | 'addedAt'
    | 'title'
    | 'releaseYear'
    | 'personalRating'
    | 'watchCount'
    | 'runtime'
    | 'relevance'
  direction?: 'asc' | 'desc'
  limit: number
  cursor?: string
}

export interface MovieCollectionRecord {
  id: string
  displayTitle: string
  importedTitle: string
  releaseYear: string | null
  posterUrl: string | null
  directors: string[]
  runtimeMinutes: number | null
  personal: { currentRating: number | null; liked: boolean; reviewed: boolean }
  archive: {
    active: boolean
    lifetimeWatchCount: number
    matchingWatchCount: number
    latestKnownWatchedOn: string | null
    referenceWatchedOn: string | null
    hasUnknownWatchedDate: boolean
  }
  queue: { active: boolean; addedOn: string | null }
  enrichment: { provider: null; status: 'not_configured'; refreshedAt: null }
}

export interface MoviesPageRecord {
  data: MovieCollectionRecord[]
  nextCursor: string | null
  totalCount: number
  filteredCount: number
  filteredOccurrenceCount: number | null
  overlapCount: number
  membershipCounts: { archiveItems: number; archiveOccurrences: number; queueItems: number }
  facets: {
    watchedUnknown: number
    addedUnknown: number
    releaseYearUnknown: number
    unrated: number
    reviewed: number
    runtimeUnknown: number
    runtimeAvailable: boolean
  }
  sourceFreshness: { lastCompleteExportAt: string | null; lastRssSuccessAt: string | null }
}

export interface MovieDetailRecord extends MovieCollectionRecord {
  overview: null
  originalTitle: null
  originalLanguage: null
  releaseDate: string | null
  tagline: null
  backdropUrl: null
  genres: string[]
  cast: Array<{ name: string; character: string | null }>
  countries: string[]
  tmdbRating: null
  tmdbVoteCount: null
  source: {
    letterboxdUrl: string | null
    tmdbUrl: null
    imdbUrl: null
    connectionLabel: string
    coverage: 'complete' | 'partial' | 'best_effort'
    lastCompleteExportAt: string | null
    lastRssSuccessAt: string | null
    metadataStatus: 'not_configured'
  }
}

export interface MovieHistoryRecord {
  archiveEntryId: string
  watchedAt: { value: string; precision: 'day'; basis: 'source_asserted' } | null
  sourceRecordedAt: {
    value: string
    precision: 'year' | 'month' | 'day' | 'instant'
    basis: 'source_asserted' | 'inferred'
  } | null
  rating: { value: number; minimum: number; maximum: number } | null
  reviewText: string | null
  sourceRewatch: boolean
  matchesFilter: boolean
  letterboxdLogUrl: string | null
  letterboxdFilmUrl: string | null
  connection: { id: string; label: string }
}

interface CursorPayload {
  v: 1
  fingerprint: string
  nullRank: number
  value: string | number | null
  title: string
  id: string
}

interface HistoryCursor {
  nullRank: 0 | 1
  date: string | null
  id: string
}

function statement(
  database: DatabaseClient,
  query: string,
  values: readonly DatabaseValue[] = [],
): DatabaseStatement {
  return database.prepare(query).bind(...values)
}

function normalizedText(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function decodeHtmlEntities(value: string): string {
  let decoded = value
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replaceAll('&apos;', "'")
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
    if (next === decoded) break
    decoded = next
  }
  return decoded
}

function deterministicId(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(':')
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

function fingerprint(input: MoviesListInput, sort: string, direction: string): string {
  return JSON.stringify({ ...input, cursor: undefined, sort, direction })
}

function encodeCursor(cursor: CursorPayload): string {
  return encodeURIComponent(JSON.stringify(cursor))
}

function decodeCursor(value: string | undefined, expected: string): CursorPayload | null {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CursorPayload>
    if (
      parsed.v !== 1 ||
      parsed.fingerprint !== expected ||
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
    throw new TypeError('Invalid Movies pagination cursor')
  }
}

function occurrenceCondition(
  input: MoviesListInput,
  alias: string,
): {
  sql: string
  values: DatabaseValue[]
} {
  if (input.watchedMode === 'unknown')
    return { sql: `${alias}.consumed_at_value IS NULL`, values: [] }
  if (input.watchedMode !== 'range') return { sql: '1=1', values: [] }
  const clauses = [`${alias}.consumed_at_value IS NOT NULL`]
  const values: DatabaseValue[] = []
  if (input.watchedFrom !== undefined) {
    clauses.push(`${alias}.consumed_at_value >= ?`)
    values.push(input.watchedFrom)
  }
  if (input.watchedTo !== undefined) {
    clauses.push(`${alias}.consumed_at_value <= ?`)
    values.push(input.watchedTo)
  }
  return { sql: clauses.join(' AND '), values }
}

function baseSql(input: MoviesListInput): { sql: string; values: DatabaseValue[] } {
  const occurrence = occurrenceCondition(input, 'a')
  const search = input.q === undefined ? null : ftsQuery(input.q)
  const shortSearch = (input.q?.trim().length ?? 0) < 2
  const referenceSql =
    input.watchedMode === 'unknown'
      ? 'NULL'
      : `(SELECT MAX(a.consumed_at_value) FROM archive_entries a
          WHERE a.media_item_id=p.media_item_id AND a.upstream_state='active'
            AND ${occurrence.sql})`
  const matchingCountSql = `(SELECT COUNT(*) FROM archive_entries a
      WHERE a.media_item_id=p.media_item_id AND a.upstream_state='active'
        AND ${occurrence.sql})`
  const searchRankSql =
    search === null || shortSearch
      ? 'NULL'
      : `(SELECT bm25(movie_search) FROM movie_search
          WHERE movie_search MATCH ? AND media_item_id=p.media_item_id LIMIT 1)`
  return {
    sql: `SELECT p.*, ${referenceSql} reference_watched_on,
      ${matchingCountSql} matching_watch_count, ${searchRankSql} search_rank
      FROM movie_library_projection p`,
    values: [
      ...(input.watchedMode === 'unknown' ? [] : occurrence.values),
      ...occurrence.values,
      ...(search === null || shortSearch ? [] : [search]),
    ],
  }
}

function filterSql(input: MoviesListInput): { sql: string; values: DatabaseValue[] } {
  const clauses = [input.collection === 'archive' ? 'b.in_archive=1' : 'b.in_queue=1']
  const values: DatabaseValue[] = []
  if (input.collection === 'archive' && input.watchedMode !== 'all') {
    clauses.push('b.matching_watch_count > 0')
  }
  if (input.collection === 'queue') {
    if (input.addedMode === 'unknown') clauses.push('b.queue_added_on IS NULL')
    if (input.addedMode === 'range') {
      clauses.push('b.queue_added_on IS NOT NULL')
      if (input.addedFrom !== undefined) {
        clauses.push('b.queue_added_on >= ?')
        values.push(input.addedFrom)
      }
      if (input.addedTo !== undefined) {
        clauses.push('b.queue_added_on <= ?')
        values.push(input.addedTo)
      }
    }
  }
  const hasYearRange = input.releaseYearFrom !== undefined || input.releaseYearTo !== undefined
  if (hasYearRange) {
    const range: string[] = ['b.release_year IS NOT NULL']
    if (input.releaseYearFrom !== undefined) {
      range.push('b.release_year >= ?')
      values.push(input.releaseYearFrom)
    }
    if (input.releaseYearTo !== undefined) {
      range.push('b.release_year <= ?')
      values.push(input.releaseYearTo)
    }
    clauses.push(
      input.releaseYearUnknown
        ? `((${range.join(' AND ')}) OR b.release_year IS NULL)`
        : range.join(' AND '),
    )
  } else if (input.releaseYearUnknown) clauses.push('b.release_year IS NULL')
  if (input.ratingMode === 'rated') clauses.push('b.current_rating_value IS NOT NULL')
  if (input.ratingMode === 'unrated') clauses.push('b.current_rating_value IS NULL')
  if (input.ratingMode === 'range') {
    clauses.push('b.current_rating_value IS NOT NULL')
    if (input.ratingMin !== undefined) {
      clauses.push('b.current_rating_value >= ?')
      values.push(input.ratingMin)
    }
    if (input.ratingMax !== undefined) {
      clauses.push('b.current_rating_value <= ?')
      values.push(input.ratingMax)
    }
  }
  if (input.collection === 'archive' && input.reviewed !== 'any') {
    clauses.push(`b.reviewed=${input.reviewed === 'yes' ? 1 : 0}`)
  }
  if (input.collection === 'queue' && input.archive !== 'any') {
    clauses.push(`b.in_archive=${input.archive === 'yes' ? 1 : 0}`)
  }
  if (input.runtime !== 'any') {
    const bucket = {
      under90: 'b.runtime_minutes < 90',
      '90to119': 'b.runtime_minutes BETWEEN 90 AND 119',
      '120to149': 'b.runtime_minutes BETWEEN 120 AND 149',
      '150plus': 'b.runtime_minutes >= 150',
    }[input.runtime]
    clauses.push(
      input.runtimeUnknown
        ? `((${bucket} AND b.runtime_minutes IS NOT NULL) OR b.runtime_minutes IS NULL)`
        : `(${bucket} AND b.runtime_minutes IS NOT NULL)`,
    )
  } else if (input.runtimeUnknown) clauses.push('b.runtime_minutes IS NULL')
  if (input.q !== undefined && input.q.trim() !== '') {
    if (input.q.trim().length < 2) {
      clauses.push('b.normalized_title LIKE ?')
      values.push(`%${normalizedText(input.q)}%`)
    } else clauses.push('b.search_rank IS NOT NULL')
  }
  return { sql: clauses.join(' AND '), values }
}

export class SqlMoviesRepository {
  readonly #database: DatabaseClient

  constructor(database: DatabaseClient) {
    this.#database = database
  }

  async applyLetterboxdSnapshot(input: LetterboxdMovieSnapshot): Promise<void> {
    const imported = new Map<string, string | null>()
    for (const film of input.films) {
      const key = `${normalizedText(film.title)}\u0000${film.releaseYear}`
      imported.set(key, imported.has(key) ? null : film.mediaItemId)
    }
    const legacyCandidates = await this.#database
      .prepare(
        `SELECT m.id, m.title, substr(m.published_at_value,1,4) release_year,
          CASE WHEN EXISTS (SELECT 1 FROM letterboxd_movie_state s
            WHERE s.media_item_id=m.id) THEN 1 ELSE 0 END has_state
         FROM media_items m WHERE m.type='movie';`,
      )
      .all<{ id: string; title: string; release_year: string | null; has_state: number }>()
    const repairs: { source: string; target: string }[] = []
    for (const candidate of legacyCandidates.results) {
      if (candidate.has_state === 1 || candidate.release_year === null) continue
      const target = imported.get(
        `${normalizedText(decodeHtmlEntities(candidate.title))}\u0000${candidate.release_year}`,
      )
      if (target === undefined || target === null || target === candidate.id) continue
      const sameDay = await this.#database
        .prepare(
          `SELECT COUNT(*) count FROM archive_entries source
           WHERE source.media_item_id=? AND source.consumed_at_precision='day'
             AND (SELECT COUNT(*) FROM archive_entries match
               WHERE match.media_item_id=? AND match.connection_id=source.connection_id
                 AND match.consumed_at_value=source.consumed_at_value
                 AND match.consumed_at_precision='day')=1`,
        )
        .bind(candidate.id, target)
        .first<{ count: number }>()
      if ((sameDay?.count ?? 0) > 0) repairs.push({ source: candidate.id, target })
    }
    const statements: DatabaseStatement[] = []
    statements.push(
      statement(
        this.#database,
        `UPDATE letterboxd_movie_state SET current_rating_value=NULL,
          rating_source_record_id=NULL, liked=0, like_source_record_id=NULL,
          last_complete_export_raw_object_id=?, last_observed_at=?
         WHERE connection_id=?`,
        [input.rawObjectId, input.observedAt, input.connectionId],
      ),
      statement(
        this.#database,
        `UPDATE queue_entries SET upstream_state='removed', retired_observed_at=?,
          last_observed_at=?, updated_at=?, projection_version=1
         WHERE connection_id=? AND relationship_type='letterboxd_watchlist'
           AND upstream_state='active'`,
        [input.observedAt, input.observedAt, input.observedAt, input.connectionId],
      ),
    )
    for (const film of input.films) {
      statements.push(
        statement(
          this.#database,
          `INSERT INTO letterboxd_movie_state(
            connection_id, media_item_id, film_uri, imported_title, release_year,
            current_rating_value, rating_source_record_id, liked, like_source_record_id,
            last_complete_export_raw_object_id, first_observed_at, last_observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(connection_id, media_item_id) DO UPDATE SET
            film_uri=excluded.film_uri, imported_title=excluded.imported_title,
            release_year=excluded.release_year,
            current_rating_value=excluded.current_rating_value,
            rating_source_record_id=excluded.rating_source_record_id,
            liked=excluded.liked, like_source_record_id=excluded.like_source_record_id,
            last_complete_export_raw_object_id=excluded.last_complete_export_raw_object_id,
            last_observed_at=excluded.last_observed_at`,
          [
            input.connectionId,
            film.mediaItemId,
            film.filmUri,
            film.title,
            film.releaseYear,
            film.currentRating,
            film.ratingSourceRecordId,
            film.likedSourceRecordId === null ? 0 : 1,
            film.likedSourceRecordId,
            input.rawObjectId,
            input.observedAt,
            input.observedAt,
          ],
        ),
      )
      if (film.watchlistSourceRecordId !== null) {
        const queueId = deterministicId('queue', input.connectionId, film.filmUri)
        statements.push(
          statement(
            this.#database,
            `INSERT INTO queue_entries(
              id, media_item_id, connection_id, source_membership_key, relationship_type,
              added_at_value, added_at_precision, added_at_basis, upstream_state,
              first_observed_at, last_observed_at, retired_observed_at, projection_version,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'letterboxd_watchlist', ?, ?, ?, 'active', ?, ?, NULL, 1, ?, ?)
            ON CONFLICT(connection_id, source_membership_key) DO UPDATE SET
              media_item_id=excluded.media_item_id, relationship_type=excluded.relationship_type,
              added_at_value=excluded.added_at_value,
              added_at_precision=excluded.added_at_precision,
              added_at_basis=excluded.added_at_basis, upstream_state='active',
              last_observed_at=excluded.last_observed_at, retired_observed_at=NULL,
              projection_version=excluded.projection_version, updated_at=excluded.updated_at`,
            [
              queueId,
              film.mediaItemId,
              input.connectionId,
              film.filmUri,
              film.watchlistAddedOn,
              film.watchlistAddedOn === null ? null : 'day',
              film.watchlistAddedOn === null ? null : 'source_asserted',
              input.observedAt,
              input.observedAt,
              input.observedAt,
              input.observedAt,
            ],
          ),
          statement(
            this.#database,
            `INSERT OR IGNORE INTO queue_entry_evidence(
              id, queue_entry_id, source_record_id, role, linked_at
            ) VALUES (?, ?, ?, 'membership', ?)`,
            [
              deterministicId(
                'queue-evidence',
                queueId,
                film.watchlistSourceRecordId,
                'membership',
              ),
              queueId,
              film.watchlistSourceRecordId,
              input.observedAt,
            ],
          ),
        )
        if (film.watchlistAddedOn !== null) {
          statements.push(
            statement(
              this.#database,
              `INSERT OR IGNORE INTO queue_entry_evidence(
                id, queue_entry_id, source_record_id, role, linked_at
              ) VALUES (?, ?, ?, 'added_time', ?)`,
              [
                deterministicId('queue-evidence', queueId, film.watchlistSourceRecordId, 'added'),
                queueId,
                film.watchlistSourceRecordId,
                input.observedAt,
              ],
            ),
          )
        }
      }
    }
    statements.push(
      statement(
        this.#database,
        `INSERT OR IGNORE INTO queue_entry_evidence(
          id, queue_entry_id, source_record_id, role, linked_at
        )
        SELECT 'queue-removal:' || id || ':' || ?, id, ?, 'removal', ?
        FROM queue_entries
        WHERE connection_id=? AND relationship_type='letterboxd_watchlist'
          AND upstream_state='removed' AND retired_observed_at=?`,
        [
          input.snapshotSourceRecordId,
          input.snapshotSourceRecordId,
          input.observedAt,
          input.connectionId,
          input.observedAt,
        ],
      ),
    )
    for (const viewing of input.viewings) {
      statements.push(
        statement(
          this.#database,
          `INSERT INTO letterboxd_movie_viewings(
            archive_entry_id, connection_id, media_item_id, diary_uri, rewatch,
            log_url, source_record_id, projection_version, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(archive_entry_id) DO UPDATE SET
            media_item_id=excluded.media_item_id, diary_uri=excluded.diary_uri,
            rewatch=excluded.rewatch, log_url=excluded.log_url,
            source_record_id=excluded.source_record_id,
            projection_version=excluded.projection_version, updated_at=excluded.updated_at`,
          [
            viewing.archiveEntryId,
            input.connectionId,
            viewing.mediaItemId,
            viewing.diaryUri,
            viewing.rewatch ? 1 : 0,
            viewing.logUrl,
            viewing.sourceRecordId,
            input.observedAt,
          ],
        ),
      )
    }
    for (const repair of repairs) {
      statements.push(
        statement(
          this.#database,
          `INSERT OR IGNORE INTO archive_entry_evidence(
            id, archive_entry_id, source_record_id, role, linked_at
          )
          SELECT 'movie-reconcile:' || target.id || ':' || evidence.source_record_id || ':' || evidence.role,
            target.id, evidence.source_record_id, evidence.role, evidence.linked_at
          FROM archive_entries source
          JOIN archive_entry_evidence evidence ON evidence.archive_entry_id=source.id
          JOIN archive_entries target ON target.media_item_id=?
            AND target.connection_id=source.connection_id
            AND target.consumed_at_value=source.consumed_at_value
            AND target.consumed_at_precision='day'
          WHERE source.media_item_id=? AND source.consumed_at_precision='day'
            AND (SELECT COUNT(*) FROM archive_entries match
              WHERE match.media_item_id=? AND match.connection_id=source.connection_id
                AND match.consumed_at_value=source.consumed_at_value
                AND match.consumed_at_precision='day')=1`,
          [repair.target, repair.source, repair.target],
        ),
        statement(
          this.#database,
          `INSERT OR IGNORE INTO archive_entry_evidence(
            id, archive_entry_id, source_record_id, role, linked_at
          )
          SELECT 'movie-reconcile-removal:' || source.id || ':' || ?, source.id, ?, 'removal', ?
          FROM archive_entries source
          WHERE source.media_item_id=? AND source.consumed_at_precision='day'
            AND (SELECT COUNT(*) FROM archive_entries match
              WHERE match.media_item_id=? AND match.connection_id=source.connection_id
                AND match.consumed_at_value=source.consumed_at_value
                AND match.consumed_at_precision='day')=1`,
          [
            input.snapshotSourceRecordId,
            input.snapshotSourceRecordId,
            input.observedAt,
            repair.source,
            repair.target,
          ],
        ),
        statement(
          this.#database,
          `UPDATE archive_entries SET upstream_state='removed', updated_at=? WHERE id IN (
            SELECT source.id FROM archive_entries source
            WHERE source.media_item_id=? AND source.consumed_at_precision='day'
              AND (SELECT COUNT(*) FROM archive_entries match
                WHERE match.media_item_id=? AND match.connection_id=source.connection_id
                  AND match.consumed_at_value=source.consumed_at_value
                  AND match.consumed_at_precision='day')=1
          )`,
          [input.observedAt, repair.source, repair.target],
        ),
        statement(
          this.#database,
          'UPDATE archive_entries SET consumed_identity_id=NULL WHERE media_item_id=?',
          [repair.source],
        ),
        statement(
          this.#database,
          'UPDATE external_identities SET media_item_id=? WHERE media_item_id=?',
          [repair.target, repair.source],
        ),
        statement(
          this.#database,
          "UPDATE archive_entries SET media_item_id=? WHERE media_item_id=? AND upstream_state='active'",
          [repair.target, repair.source],
        ),
        statement(
          this.#database,
          'UPDATE queue_entries SET media_item_id=? WHERE media_item_id=?',
          [repair.target, repair.source],
        ),
        statement(
          this.#database,
          `UPDATE letterboxd_movie_viewings SET media_item_id=?
           WHERE media_item_id=? AND EXISTS (
             SELECT 1 FROM archive_entries a
             WHERE a.id=letterboxd_movie_viewings.archive_entry_id
               AND a.upstream_state='active'
           )`,
          [repair.target, repair.source],
        ),
      )
    }
    statements.push(
      statement(this.#database, 'DELETE FROM movie_search'),
      statement(this.#database, 'DELETE FROM movie_library_projection'),
      statement(
        this.#database,
        `INSERT INTO movie_library_projection(
          media_item_id, connection_id, film_uri, imported_title, display_title,
          normalized_title, release_year, poster_url, director_names, runtime_minutes,
          current_rating_value, liked, reviewed, in_archive, in_queue, queue_added_on,
          latest_known_watched_on, active_watch_count, has_unknown_watched_date,
          source_refreshed_at, projection_version
        )
        SELECT m.id,
          COALESCE(s.connection_id,
            (SELECT a.connection_id FROM archive_entries a WHERE a.media_item_id=m.id LIMIT 1),
            (SELECT q.connection_id FROM queue_entries q WHERE q.media_item_id=m.id LIMIT 1)),
          COALESCE(s.film_uri, (SELECT e.external_id FROM external_identities e
            WHERE e.media_item_id=m.id AND e.namespace='letterboxd'
              AND e.retired_at IS NULL
            ORDER BY CASE e.external_type WHEN 'film_uri' THEN 0 ELSE 1 END LIMIT 1),
            m.canonical_url),
          COALESCE(s.imported_title, m.title, 'Untitled movie'),
          COALESCE(s.imported_title, m.title, 'Untitled movie'),
          lower(COALESCE(s.imported_title, m.title, 'Untitled movie')),
          COALESCE(s.release_year, substr(m.published_at_value, 1, 4)),
          NULL, NULL, NULL, s.current_rating_value, COALESCE(s.liked, 0),
          CASE WHEN EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active'
              AND a.review_text IS NOT NULL AND trim(a.review_text)<>'') THEN 1 ELSE 0 END,
          CASE WHEN EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active') THEN 1 ELSE 0 END,
          CASE WHEN EXISTS (SELECT 1 FROM queue_entries q
            WHERE q.media_item_id=m.id AND q.upstream_state='active') THEN 1 ELSE 0 END,
          (SELECT MAX(q.added_at_value) FROM queue_entries q
            WHERE q.media_item_id=m.id AND q.upstream_state='active'),
          (SELECT MAX(a.consumed_at_value) FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active'),
          (SELECT COUNT(*) FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active'),
          CASE WHEN EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active'
              AND a.consumed_at_value IS NULL) THEN 1 ELSE 0 END,
          COALESCE(s.last_observed_at, m.updated_at), 1
        FROM media_items m
        LEFT JOIN letterboxd_movie_state s ON s.media_item_id=m.id
        WHERE m.type='movie' AND (
          s.media_item_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM archive_entries a
            WHERE a.media_item_id=m.id AND a.upstream_state='active')
          OR EXISTS (SELECT 1 FROM queue_entries q
            WHERE q.media_item_id=m.id AND q.upstream_state='active')
        )`,
      ),
      statement(
        this.#database,
        `INSERT INTO movie_search(media_item_id, title, reviews)
         SELECT p.media_item_id, p.display_title || ' ' || p.imported_title || ' ' || COALESCE(p.release_year,''),
           COALESCE((SELECT group_concat(a.review_text, ' ') FROM archive_entries a
             WHERE a.media_item_id=p.media_item_id AND a.upstream_state='active'
               AND a.review_text IS NOT NULL), '')
         FROM movie_library_projection p`,
      ),
    )
    const results = await this.#database.batch(statements)
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      throw new Error('Letterboxd movie snapshot projection did not complete successfully')
    }
  }

  async listMovies(input: MoviesListInput): Promise<MoviesPageRecord> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Movies limit must be an integer from 1 through 100')
    }
    let sort =
      input.sort ??
      (input.q?.trim() ? 'relevance' : input.collection === 'archive' ? 'watchedAt' : 'addedAt')
    if (input.collection === 'archive' && input.watchedMode === 'unknown' && sort === 'watchedAt') {
      sort = 'title'
    }
    const defaultDirection =
      sort === 'title' || sort === 'runtime' || sort === 'relevance' ? 'asc' : 'desc'
    const direction = sort === 'relevance' ? 'asc' : (input.direction ?? defaultDirection)
    const base = baseSql(input)
    const filter = filterSql(input)
    const sortColumn = {
      watchedAt: 'b.reference_watched_on',
      addedAt: 'b.queue_added_on',
      title: 'b.normalized_title',
      releaseYear: 'b.release_year',
      personalRating: 'b.current_rating_value',
      watchCount: 'b.active_watch_count',
      runtime: 'b.runtime_minutes',
      relevance: 'b.search_rank',
    }[sort]
    const key = fingerprint(input, sort, direction)
    const cursor = decodeCursor(input.cursor, key)
    const nullRank = `CASE WHEN ${sortColumn} IS NULL OR ${sortColumn}='' THEN 1 ELSE 0 END`
    const comparison = direction === 'asc' ? '>' : '<'
    const cursorSql =
      cursor === null
        ? ''
        : `AND (${nullRank} > ? OR (${nullRank}=? AND (
          (?=1 AND (b.normalized_title > ? OR
            (b.normalized_title=? AND b.media_item_id>?))) OR
          (?=0 AND (${sortColumn} ${comparison} ? OR
            (${sortColumn}=? AND (b.normalized_title > ? OR
              (b.normalized_title=? AND b.media_item_id>?)))))))`
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
      `WITH b AS (${base.sql})
       SELECT b.*, ${nullRank} sort_null_rank, ${sortColumn} sort_value
       FROM b WHERE ${filter.sql} ${cursorSql}
       ORDER BY ${nullRank}, ${sortColumn} ${direction.toUpperCase()},
         b.normalized_title, b.media_item_id LIMIT ?`,
      [...base.values, ...filter.values, ...cursorValues, input.limit + 1],
    ).all<MovieRow>()
    const pageRows = rows.results.slice(0, input.limit)
    const counts = await statement(
      this.#database,
      `WITH b AS (${base.sql}) SELECT COUNT(*) filtered_count,
        COALESCE(SUM(CASE WHEN ?='archive' THEN b.matching_watch_count ELSE 0 END),0) occurrence_count,
        COALESCE(SUM(CASE WHEN b.in_archive=1 AND b.in_queue=1 THEN 1 ELSE 0 END),0) overlap_count
       FROM b WHERE ${filter.sql}`,
      [...base.values, input.collection, ...filter.values],
    ).first<{ filtered_count: number; occurrence_count: number; overlap_count: number }>()
    const totals = await this.#database
      .prepare(
        `SELECT COALESCE(SUM(in_archive),0) archive_items,
          COALESCE(SUM(CASE WHEN in_archive=1 THEN active_watch_count ELSE 0 END),0) archive_occurrences,
          COALESCE(SUM(in_queue),0) queue_items FROM movie_library_projection`,
      )
      .first<{ archive_items: number; archive_occurrences: number; queue_items: number }>()
    const facetRows = await statement(
      this.#database,
      `WITH b AS (${base.sql}) SELECT
        COALESCE(SUM(CASE WHEN b.has_unknown_watched_date=1 THEN 1 ELSE 0 END),0) watched_unknown,
        COALESCE(SUM(CASE WHEN b.queue_added_on IS NULL THEN 1 ELSE 0 END),0) added_unknown,
        COALESCE(SUM(CASE WHEN b.release_year IS NULL THEN 1 ELSE 0 END),0) year_unknown,
        COALESCE(SUM(CASE WHEN b.current_rating_value IS NULL THEN 1 ELSE 0 END),0) unrated,
        COALESCE(SUM(b.reviewed),0) reviewed,
        COALESCE(SUM(CASE WHEN b.runtime_minutes IS NULL THEN 1 ELSE 0 END),0) runtime_unknown,
        COALESCE(MAX(CASE WHEN b.runtime_minutes IS NOT NULL THEN 1 ELSE 0 END),0) runtime_available
       FROM b WHERE ${input.collection === 'archive' ? 'b.in_archive=1' : 'b.in_queue=1'}`,
      base.values,
    ).first<{
      watched_unknown: number
      added_unknown: number
      year_unknown: number
      unrated: number
      reviewed: number
      runtime_unknown: number
      runtime_available: number
    }>()
    const freshness = await this.#database
      .prepare(
        `SELECT
          MAX(CASE WHEN r.kind='export' AND r.processing_status='processed' THEN r.acquired_at END) export_at,
          MAX(CASE WHEN r.kind='rss' AND r.processing_status='processed' THEN r.acquired_at END) rss_at
         FROM raw_objects r JOIN connections c ON c.id=r.connection_id
         WHERE c.source='letterboxd'`,
      )
      .first<{ export_at: string | null; rss_at: string | null }>()
    const last = pageRows.at(-1)
    return {
      data: pageRows.map(movieRow),
      nextCursor:
        rows.results.length > input.limit && last !== undefined
          ? encodeCursor({
              v: 1,
              fingerprint: key,
              nullRank: last.sort_null_rank,
              value: last.sort_value,
              title: last.normalized_title,
              id: last.media_item_id,
            })
          : null,
      totalCount:
        input.collection === 'archive' ? (totals?.archive_items ?? 0) : (totals?.queue_items ?? 0),
      filteredCount: counts?.filtered_count ?? 0,
      filteredOccurrenceCount:
        input.collection === 'archive' ? (counts?.occurrence_count ?? 0) : null,
      overlapCount: counts?.overlap_count ?? 0,
      membershipCounts: {
        archiveItems: totals?.archive_items ?? 0,
        archiveOccurrences: totals?.archive_occurrences ?? 0,
        queueItems: totals?.queue_items ?? 0,
      },
      facets: {
        watchedUnknown: facetRows?.watched_unknown ?? 0,
        addedUnknown: facetRows?.added_unknown ?? 0,
        releaseYearUnknown: facetRows?.year_unknown ?? 0,
        unrated: facetRows?.unrated ?? 0,
        reviewed: facetRows?.reviewed ?? 0,
        runtimeUnknown: facetRows?.runtime_unknown ?? 0,
        runtimeAvailable: facetRows?.runtime_available === 1,
      },
      sourceFreshness: {
        lastCompleteExportAt: freshness?.export_at ?? null,
        lastRssSuccessAt: freshness?.rss_at ?? null,
      },
    }
  }

  async findMovie(id: string): Promise<MovieDetailRecord | null> {
    const row = await statement(
      this.#database,
      `SELECT p.*, p.latest_known_watched_on reference_watched_on,
        p.active_watch_count matching_watch_count, 0 sort_null_rank, NULL sort_value,
        c.label connection_label, c.coverage,
        (SELECT MAX(CASE WHEN r.kind='export' AND r.processing_status='processed' THEN r.acquired_at END)
          FROM raw_objects r WHERE r.connection_id=p.connection_id) export_at,
        (SELECT MAX(CASE WHEN r.kind='rss' AND r.processing_status='processed' THEN r.acquired_at END)
          FROM raw_objects r WHERE r.connection_id=p.connection_id) rss_at
       FROM movie_library_projection p JOIN connections c ON c.id=p.connection_id
       WHERE p.media_item_id=? AND (p.in_archive=1 OR p.in_queue=1)`,
      [id],
    ).first<
      MovieRow & {
        connection_label: string
        coverage: 'complete' | 'partial' | 'best_effort'
        export_at: string | null
        rss_at: string | null
      }
    >()
    if (row === null) return null
    return {
      ...movieRow(row),
      overview: null,
      originalTitle: null,
      originalLanguage: null,
      releaseDate: row.release_year,
      tagline: null,
      backdropUrl: null,
      genres: [],
      cast: [],
      countries: [],
      tmdbRating: null,
      tmdbVoteCount: null,
      source: {
        letterboxdUrl: row.film_uri,
        tmdbUrl: null,
        imdbUrl: null,
        connectionLabel: row.connection_label,
        coverage: row.coverage,
        lastCompleteExportAt: row.export_at,
        lastRssSuccessAt: row.rss_at,
        metadataStatus: 'not_configured',
      },
    }
  }

  async listMovieHistory(
    id: string,
    input: {
      limit: number
      cursor?: string
      watchedMode: 'all' | 'range' | 'unknown'
      watchedFrom?: string
      watchedTo?: string
    },
  ): Promise<{ data: MovieHistoryRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new RangeError('Movie history limit must be an integer from 1 through 100')
    }
    let cursor: HistoryCursor | null = null
    if (input.cursor !== undefined) {
      try {
        const parsed = JSON.parse(decodeURIComponent(input.cursor)) as Partial<HistoryCursor>
        if (
          parsed === null ||
          (parsed.nullRank !== 0 && parsed.nullRank !== 1) ||
          (parsed.date !== null && typeof parsed.date !== 'string') ||
          typeof parsed.id !== 'string'
        )
          throw new Error()
        cursor = parsed as HistoryCursor
      } catch {
        throw new TypeError('Invalid Movie history cursor')
      }
    }
    const match = occurrenceCondition(
      {
        ...input,
        collection: 'archive',
        addedMode: 'all',
        releaseYearUnknown: false,
        ratingMode: 'any',
        reviewed: 'any',
        archive: 'any',
        runtime: 'any',
        runtimeUnknown: false,
        limit: input.limit,
      },
      'a',
    )
    const cursorSql =
      cursor === null
        ? ''
        : `AND ((CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END) > ? OR
          ((CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END)=? AND (
            (?=0 AND (a.consumed_at_value < ? OR
              (a.consumed_at_value=? AND a.id>?))) OR
            (?=1 AND a.id>?))))`
    const cursorValues: DatabaseValue[] =
      cursor === null
        ? []
        : [
            cursor.nullRank,
            cursor.nullRank,
            cursor.nullRank,
            cursor.date ?? '',
            cursor.date ?? '',
            cursor.id,
            cursor.nullRank,
            cursor.id,
          ]
    const rows = await statement(
      this.#database,
      `SELECT a.*, v.rewatch, v.log_url, p.film_uri, c.label,
        CASE WHEN ${match.sql} THEN 1 ELSE 0 END matches_filter,
        CASE WHEN a.consumed_at_value IS NULL THEN 1 ELSE 0 END null_rank
       FROM archive_entries a
       JOIN movie_library_projection p ON p.media_item_id=a.media_item_id
       JOIN connections c ON c.id=a.connection_id
       LEFT JOIN letterboxd_movie_viewings v ON v.archive_entry_id=a.id
       WHERE a.media_item_id=? AND a.upstream_state='active' ${cursorSql}
       ORDER BY null_rank, a.consumed_at_value DESC, a.id LIMIT ?`,
      [...match.values, id, ...cursorValues, input.limit + 1],
    ).all<HistoryRow>()
    const page = rows.results.slice(0, input.limit)
    const last = page.at(-1)
    return {
      data: page.map((row) => ({
        archiveEntryId: row.id,
        watchedAt:
          row.consumed_at_value === null
            ? null
            : {
                value: row.consumed_at_value,
                precision: 'day' as const,
                basis: 'source_asserted' as const,
              },
        sourceRecordedAt:
          row.source_recorded_at_value === null ||
          row.source_recorded_at_precision === null ||
          row.source_recorded_at_basis === null
            ? null
            : {
                value: row.source_recorded_at_value,
                precision: row.source_recorded_at_precision,
                basis: row.source_recorded_at_basis,
              },
        rating:
          row.rating_value === null ||
          row.rating_scale_minimum === null ||
          row.rating_scale_maximum === null
            ? null
            : {
                value: row.rating_value,
                minimum: row.rating_scale_minimum,
                maximum: row.rating_scale_maximum,
              },
        reviewText: row.review_text,
        sourceRewatch: row.rewatch === 1,
        matchesFilter: row.matches_filter === 1,
        letterboxdLogUrl: row.log_url,
        letterboxdFilmUrl: row.film_uri,
        connection: { id: row.connection_id, label: row.label },
      })),
      nextCursor:
        rows.results.length > input.limit && last !== undefined
          ? encodeURIComponent(
              JSON.stringify({
                nullRank: last.null_rank,
                date: last.consumed_at_value,
                id: last.id,
              }),
            )
          : null,
    }
  }
}

interface MovieRow {
  media_item_id: string
  film_uri: string | null
  imported_title: string
  display_title: string
  normalized_title: string
  release_year: string | null
  poster_url: string | null
  director_names: string | null
  runtime_minutes: number | null
  current_rating_value: number | null
  liked: number
  reviewed: number
  in_archive: number
  in_queue: number
  queue_added_on: string | null
  latest_known_watched_on: string | null
  reference_watched_on: string | null
  active_watch_count: number
  matching_watch_count: number
  has_unknown_watched_date: number
  sort_null_rank: number
  sort_value: string | number | null
}

function movieRow(row: MovieRow): MovieCollectionRecord {
  return {
    id: row.media_item_id,
    displayTitle: row.display_title,
    importedTitle: row.imported_title,
    releaseYear: row.release_year,
    posterUrl: row.poster_url,
    directors: row.director_names?.split('|').filter(Boolean) ?? [],
    runtimeMinutes: row.runtime_minutes,
    personal: {
      currentRating: row.current_rating_value,
      liked: row.liked === 1,
      reviewed: row.reviewed === 1,
    },
    archive: {
      active: row.in_archive === 1,
      lifetimeWatchCount: row.active_watch_count,
      matchingWatchCount: row.matching_watch_count,
      latestKnownWatchedOn: row.latest_known_watched_on,
      referenceWatchedOn: row.reference_watched_on,
      hasUnknownWatchedDate: row.has_unknown_watched_date === 1,
    },
    queue: { active: row.in_queue === 1, addedOn: row.queue_added_on },
    enrichment: { provider: null, status: 'not_configured', refreshedAt: null },
  }
}

interface HistoryRow {
  id: string
  connection_id: string
  consumed_at_value: string | null
  consumed_at_precision: 'year' | 'month' | 'day' | 'instant' | null
  consumed_at_basis: 'source_asserted' | 'inferred' | null
  source_recorded_at_value: string | null
  source_recorded_at_precision: 'year' | 'month' | 'day' | 'instant' | null
  source_recorded_at_basis: 'source_asserted' | 'inferred' | null
  rating_value: number | null
  rating_scale_minimum: number | null
  rating_scale_maximum: number | null
  review_text: string | null
  rewatch: number | null
  log_url: string | null
  film_uri: string | null
  label: string
  matches_filter: number
  null_rank: number
}
