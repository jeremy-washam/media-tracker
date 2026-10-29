import {
  matchesQueryFingerprint,
  queryFingerprint as hashQueryFingerprint,
} from './query-fingerprint'
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
  logUrl: string | null
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
  enrichment: {
    provider: 'tmdb' | null
    mediaType: 'movie' | 'tv' | null
    status: 'not_configured' | 'pending' | 'matched' | 'unmatched' | 'ambiguous' | 'error'
    refreshedAt: string | null
  }
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
  personal: MovieCollectionRecord['personal'] & { reviewedOccurrenceCount: number }
  overview: string | null
  originalTitle: string | null
  originalLanguage: string | null
  releaseDate: string | null
  tagline: string | null
  backdropUrl: string | null
  genres: string[]
  cast: Array<{ name: string; character: string | null }>
  countries: string[]
  tmdbRating: number | null
  tmdbVoteCount: number | null
  source: {
    letterboxdUrl: string | null
    tmdbUrl: string | null
    imdbUrl: string | null
    connectionLabel: string
    coverage: 'complete' | 'partial' | 'best_effort'
    lastCompleteExportAt: string | null
    lastRssSuccessAt: string | null
    metadataStatus: MovieCollectionRecord['enrichment']['status']
  }
}

export interface TmdbEnrichmentCandidate {
  mediaItemId: string
  importedTitle: string
  releaseYear: string | null
  exactTmdbMovieId: number | null
  matchedTmdbTvId: number | null
  exactImdbId: string | null
}

export interface TmdbConfigurationProjection {
  secureBaseUrl: string
  posterBaseUrl: string
  backdropBaseUrl: string
  posterSizes: readonly string[]
  backdropSizes: readonly string[]
  fetchedAt: string
  expiresAt: string
  etag: string | null
}

export interface TmdbMovieProfileProjection {
  mediaItemId: string
  tmdbMovieId: number | null
  tmdbTvId?: number | null
  matchStatus: 'matched' | 'unmatched' | 'ambiguous' | 'error'
  matchMethod:
    | 'exact_tmdb_id'
    | 'exact_imdb_id'
    | 'exact_title_year'
    | 'verified_release_year'
    | 'dominant_title_year_votes'
    | 'exact_tv_title_year'
    | null
  candidateCount: number
  matcherVersion: string
  attemptedAt: string
  safeErrorCode: string | null
  profile: null | {
    currentTitle: string
    originalTitle: string
    originalLanguage: string | null
    overview: string | null
    releaseDate: string | null
    runtimeMinutes: number | null
    posterPath: string | null
    backdropPath: string | null
    tagline: string | null
    imdbId: string | null
    status: string | null
    voteAverage: number | null
    voteCount: number | null
    fetchedAt: string
    checkedAt: string
    expiresAt: string
    etag: string | null
    genres: readonly { id: number; name: string }[]
    directors: readonly { creditId: string; personId: number; name: string }[]
    cast: readonly {
      creditId: string
      personId: number
      name: string
      character: string | null
    }[]
    countries: readonly { code: string; name: string }[]
    alternativeTitles: readonly { countryCode: string; title: string }[]
  }
  tvProfile?: null | {
    currentTitle: string
    originalTitle: string
    originalLanguage: string | null
    overview: string | null
    firstAirDate: string | null
    posterPath: string | null
    backdropPath: string | null
    tagline: string | null
    status: string | null
    voteAverage: number | null
    voteCount: number
    creatorNames: readonly string[]
    genres: readonly string[]
    cast: readonly { name: string; character: string | null }[]
    countries: readonly string[]
    fetchedAt: string
    checkedAt: string
    expiresAt: string
    etag: string | null
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

function escapedLikePattern(value: string): string {
  return `%${normalizedText(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
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

function fingerprint(
  input: MoviesListInput,
  sort: string,
  direction: string,
): Record<string, unknown> {
  return { ...input, cursor: undefined, sort, direction }
}

function encodeCursor(cursor: CursorPayload): string {
  return encodeURIComponent(JSON.stringify(cursor))
}

async function decodeCursor(
  value: string | undefined,
  expected: string,
): Promise<CursorPayload | null> {
  if (value === undefined) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<CursorPayload>
    if (
      parsed.v !== 1 ||
      !(await matchesQueryFingerprint(parsed.fingerprint, expected)) ||
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
      clauses.push("b.normalized_title LIKE ? ESCAPE '\\'")
      values.push(escapedLikePattern(input.q))
    } else clauses.push('b.search_rank IS NOT NULL')
  }
  return { sql: clauses.join(' AND '), values }
}

function movieProjectionStatements(database: DatabaseClient, at: string): DatabaseStatement[] {
  return [
    statement(database, 'DELETE FROM movie_search'),
    statement(database, 'DELETE FROM movie_library_projection'),
    statement(
      database,
      `INSERT INTO movie_library_projection(
        media_item_id, connection_id, film_uri, imported_title, display_title,
        normalized_title, release_year, poster_url, director_names, runtime_minutes,
        current_rating_value, liked, reviewed, in_archive, in_queue, queue_added_on,
        latest_known_watched_on, active_watch_count, has_unknown_watched_date,
        source_refreshed_at, projection_version, tmdb_movie_id, enrichment_status,
        enrichment_refreshed_at, catalog_expires_at, tmdb_tv_id
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
        COALESCE(tp.current_title,tv.current_title,s.imported_title,m.title,'Untitled movie'),
        lower(COALESCE(tp.current_title,tv.current_title,s.imported_title,m.title,'Untitled movie')),
        COALESCE(s.release_year,substr(tp.release_date,1,4),substr(tv.first_air_date,1,4),substr(m.published_at_value,1,4)),
        CASE WHEN COALESCE(tp.poster_path,tv.poster_path) IS NOT NULL
          THEN tc.poster_base_url||COALESCE(tp.poster_path,tv.poster_path) END,
        COALESCE((SELECT group_concat(name,'|') FROM (SELECT name FROM tmdb_movie_credits credit
          WHERE credit.tmdb_movie_id=tp.tmdb_movie_id AND credit.credit_kind='director'
          ORDER BY credit.position)),
          (SELECT group_concat(value,'|') FROM json_each(tv.creator_names_json))),
        tp.runtime_minutes, s.current_rating_value, COALESCE(s.liked, 0),
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
        COALESCE(tp.fetched_at,tv.fetched_at,s.last_observed_at,m.updated_at), 2,
        tm.tmdb_movie_id,
        CASE WHEN tm.media_item_id IS NULL THEN 'not_configured'
          WHEN tm.match_status='matched' AND tp.tmdb_movie_id IS NULL
            AND tv.tmdb_tv_id IS NULL THEN 'pending'
          ELSE tm.match_status END,
        COALESCE(tp.fetched_at,tv.fetched_at),COALESCE(tp.expires_at,tv.expires_at),tm.tmdb_tv_id
      FROM media_items m
      LEFT JOIN letterboxd_movie_state s ON s.media_item_id=m.id
      LEFT JOIN tmdb_movie_matches tm ON tm.media_item_id=m.id
      LEFT JOIN tmdb_movie_profiles tp ON tp.tmdb_movie_id=tm.tmdb_movie_id AND tp.expires_at>?
      LEFT JOIN tmdb_tv_profiles tv ON tv.tmdb_tv_id=tm.tmdb_tv_id AND tv.expires_at>?
      LEFT JOIN tmdb_configuration tc ON tc.singleton_id=1 AND tc.expires_at>?
      WHERE m.type='movie' AND (
        s.media_item_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM archive_entries a
          WHERE a.media_item_id=m.id AND a.upstream_state='active')
        OR EXISTS (SELECT 1 FROM queue_entries q
          WHERE q.media_item_id=m.id AND q.upstream_state='active')
      )`,
      [at, at, at],
    ),
    statement(
      database,
      `INSERT INTO movie_search(media_item_id, title, reviews)
       SELECT p.media_item_id, trim(p.display_title || ' ' || p.imported_title || ' ' || COALESCE(p.release_year,'') || ' ' ||
         COALESCE((SELECT group_concat(title,' ') FROM tmdb_movie_alternative_titles alt
           WHERE alt.tmdb_movie_id=p.tmdb_movie_id AND p.catalog_expires_at IS NOT NULL),'') || ' ' ||
         COALESCE((SELECT group_concat(name,' ') FROM tmdb_movie_credits credit
           WHERE credit.tmdb_movie_id=p.tmdb_movie_id AND p.catalog_expires_at IS NOT NULL),'') || ' ' ||
         COALESCE((SELECT group_concat(name,' ') FROM tmdb_movie_genres genre
           WHERE genre.tmdb_movie_id=p.tmdb_movie_id AND p.catalog_expires_at IS NOT NULL),'') || ' ' ||
         COALESCE((SELECT group_concat(value,' ') FROM tmdb_tv_profiles tv, json_each(tv.creator_names_json)
           WHERE tv.tmdb_tv_id=p.tmdb_tv_id AND p.catalog_expires_at IS NOT NULL),'') || ' ' ||
         COALESCE((SELECT group_concat(value,' ') FROM tmdb_tv_profiles tv, json_each(tv.genres_json)
           WHERE tv.tmdb_tv_id=p.tmdb_tv_id AND p.catalog_expires_at IS NOT NULL),'')),
         COALESCE((SELECT group_concat(a.review_text, ' ') FROM archive_entries a
           WHERE a.media_item_id=p.media_item_id AND a.upstream_state='active'
             AND a.review_text IS NOT NULL), '')
       FROM movie_library_projection p`,
    ),
  ]
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
    const repairs: {
      source: string
      target: string
      sourceEntry: string
      targetEntry: string
    }[] = []
    for (const candidate of legacyCandidates.results) {
      if (candidate.has_state === 1 || candidate.release_year === null) continue
      const target = imported.get(
        `${normalizedText(decodeHtmlEntities(candidate.title))}\u0000${candidate.release_year}`,
      )
      if (target === undefined || target === null || target === candidate.id) continue
      const witnesses = await this.#database
        .prepare(
          `SELECT source.id source_entry, target.id target_entry
           FROM archive_entries source
           JOIN archive_entry_evidence evidence
             ON evidence.archive_entry_id=source.id AND evidence.role='admission'
           JOIN source_records record ON record.id=evidence.source_record_id
           JOIN archive_entries target
             ON target.media_item_id=? AND target.connection_id=?
            AND target.upstream_state='active'
            AND target.consumed_at_value=source.consumed_at_value
            AND target.consumed_at_precision='day'
           WHERE source.media_item_id=? AND source.connection_id=?
             AND source.upstream_state='active'
             AND source.source_occurrence_key LIKE 'rss:%'
             AND source.consumed_at_precision='day'
             AND record.connection_id=? AND record.record_type='rss_movie_entry'
             AND record.parser_version LIKE 'letterboxd-rss@%'
             AND EXISTS (
               SELECT 1 FROM archive_entry_evidence target_evidence
               JOIN source_records target_record
                 ON target_record.id=target_evidence.source_record_id
               WHERE target_evidence.archive_entry_id=target.id
                 AND target_record.raw_object_id=?
                 AND target_record.record_type='diary_entry'
             )
             AND (SELECT COUNT(*) FROM archive_entries source_count
               WHERE source_count.media_item_id=source.media_item_id)=1
             AND (SELECT COUNT(*) FROM archive_entries target_count
               WHERE target_count.media_item_id=target.media_item_id
                 AND target_count.connection_id=target.connection_id
                 AND target_count.upstream_state='active'
                 AND target_count.consumed_at_value=target.consumed_at_value
                 AND target_count.consumed_at_precision='day')=1
           GROUP BY source.id, target.id
           LIMIT 2`,
        )
        .bind(
          target,
          input.connectionId,
          candidate.id,
          input.connectionId,
          input.connectionId,
          input.rawObjectId,
        )
        .all<{ source_entry: string; target_entry: string }>()
      if (witnesses.results.length === 1) {
        repairs.push({
          source: candidate.id,
          target,
          sourceEntry: witnesses.results[0]!.source_entry,
          targetEntry: witnesses.results[0]!.target_entry,
        })
      }
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
          SELECT 'movie-reconcile:' || ? || ':' || evidence.source_record_id || ':' || evidence.role,
            ?, evidence.source_record_id, evidence.role, evidence.linked_at
          FROM archive_entry_evidence evidence WHERE evidence.archive_entry_id=?`,
          [repair.targetEntry, repair.targetEntry, repair.sourceEntry],
        ),
        statement(
          this.#database,
          `INSERT OR IGNORE INTO archive_entry_evidence(
            id, archive_entry_id, source_record_id, role, linked_at
          )
          SELECT 'movie-reconcile-removal:' || ? || ':' || ?, ?, ?, 'removal', ?`,
          [
            repair.sourceEntry,
            input.snapshotSourceRecordId,
            repair.sourceEntry,
            input.snapshotSourceRecordId,
            input.observedAt,
          ],
        ),
        statement(
          this.#database,
          `UPDATE archive_entries SET consumed_identity_id=NULL, upstream_state='removed',
            updated_at=? WHERE id=?`,
          [input.observedAt, repair.sourceEntry],
        ),
        statement(
          this.#database,
          'UPDATE external_identities SET media_item_id=? WHERE media_item_id=?',
          [repair.target, repair.source],
        ),
      )
    }
    statements.push(...movieProjectionStatements(this.#database, input.observedAt))
    const results = await this.#database.batch(statements)
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      throw new Error('Letterboxd movie snapshot projection did not complete successfully')
    }
  }

  async refreshLetterboxdActivityProjection(input: {
    connectionId: string
    observedAt: string
    viewings: readonly LetterboxdMovieSnapshotViewing[]
  }): Promise<void> {
    const statements = input.viewings.map((viewing) =>
      statement(
        this.#database,
        `INSERT INTO letterboxd_movie_viewings(
          archive_entry_id, connection_id, media_item_id, diary_uri, rewatch,
          log_url, source_record_id, projection_version, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(archive_entry_id) DO UPDATE SET
          media_item_id=excluded.media_item_id,
          diary_uri=COALESCE(excluded.diary_uri, letterboxd_movie_viewings.diary_uri),
          rewatch=excluded.rewatch,
          log_url=COALESCE(excluded.log_url, letterboxd_movie_viewings.log_url),
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
    statements.push(...movieProjectionStatements(this.#database, input.observedAt))
    const results = await this.#database.batch(statements)
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      throw new Error('Letterboxd activity projection did not complete successfully')
    }
  }

  async listTmdbEnrichmentCandidates(input: {
    afterMediaItemId?: string
    retryBefore: string
    matcherVersion: string
    at: string
    limit: number
  }): Promise<TmdbEnrichmentCandidate[]> {
    const rows = await statement(
      this.#database,
      `SELECT p.media_item_id,p.imported_title,p.release_year,
         (SELECT CAST(e.external_id AS INTEGER) FROM external_identities e
          WHERE e.media_item_id=p.media_item_id AND e.namespace='tmdb'
            AND e.external_type='movie_id' AND e.scope='global' AND e.retired_at IS NULL
          ORDER BY e.id LIMIT 1) exact_tmdb_movie_id,
         (SELECT e.external_id FROM external_identities e
          WHERE e.media_item_id=p.media_item_id AND e.namespace='imdb'
            AND e.scope='global' AND e.retired_at IS NULL ORDER BY e.id LIMIT 1) exact_imdb_id,
         match.tmdb_tv_id matched_tmdb_tv_id
       FROM movie_library_projection p
       LEFT JOIN tmdb_movie_matches match ON match.media_item_id=p.media_item_id
       LEFT JOIN tmdb_movie_profiles profile ON profile.tmdb_movie_id=match.tmdb_movie_id
       LEFT JOIN tmdb_tv_profiles tv_profile ON tv_profile.tmdb_tv_id=match.tmdb_tv_id
       WHERE (p.in_archive=1 OR p.in_queue=1) AND p.media_item_id>?
         AND (match.media_item_id IS NULL OR match.match_status IN ('pending','error')
           OR (match.match_status IN ('unmatched','ambiguous') AND match.last_attempted_at<=?)
           OR (match.match_status IN ('unmatched','ambiguous') AND match.matcher_version<>?)
           OR (match.match_status='matched' AND (
             (match.tmdb_movie_id IS NOT NULL AND
               (profile.tmdb_movie_id IS NULL OR profile.expires_at<=?)) OR
             (match.tmdb_tv_id IS NOT NULL AND
               (tv_profile.tmdb_tv_id IS NULL OR tv_profile.expires_at<=?))))
           OR EXISTS(SELECT 1 FROM external_identities exact_identity
             WHERE exact_identity.media_item_id=p.media_item_id
               AND exact_identity.namespace='tmdb' AND exact_identity.external_type='movie_id'
               AND exact_identity.scope='global' AND exact_identity.retired_at IS NULL
               AND (match.tmdb_movie_id IS NULL OR CAST(exact_identity.external_id AS INTEGER)<>match.tmdb_movie_id)))
       ORDER BY p.media_item_id LIMIT ?`,
      [
        input.afterMediaItemId ?? '',
        input.retryBefore,
        input.matcherVersion,
        input.at,
        input.at,
        input.limit,
      ],
    ).all<{
      media_item_id: string
      imported_title: string
      release_year: string | null
      exact_tmdb_movie_id: number | null
      exact_imdb_id: string | null
      matched_tmdb_tv_id: number | null
    }>()
    return rows.results.map((row) => ({
      mediaItemId: row.media_item_id,
      importedTitle: row.imported_title,
      releaseYear: row.release_year,
      exactTmdbMovieId: row.exact_tmdb_movie_id,
      exactImdbId: row.exact_imdb_id,
      matchedTmdbTvId: row.matched_tmdb_tv_id,
    }))
  }

  async needsTmdbConfigurationRefresh(at: string): Promise<boolean> {
    const row = await statement(
      this.#database,
      'SELECT EXISTS(SELECT 1 FROM tmdb_configuration WHERE expires_at>?) current',
      [at],
    ).first<{ current: number }>()
    return row?.current !== 1
  }

  async applyTmdbCatalogBatch(input: {
    at: string
    configuration?: TmdbConfigurationProjection
    movies: readonly TmdbMovieProfileProjection[]
  }): Promise<void> {
    if (input.configuration !== undefined) await this.saveTmdbConfiguration(input.configuration)
    for (const movie of input.movies) await this.saveTmdbMovie(movie)
  }

  async rebuild(at: string): Promise<void> {
    await this.#database.batch(movieProjectionStatements(this.#database, at))
  }

  /** Reconcile the same Letterboxd film imported under its short export URL and RSS URL. */
  async reconcileTmdbIdentityCollisions(at: string): Promise<number> {
    const collisions = await statement(
      this.#database,
      `SELECT collision.media_item_id collision_id, other.media_item_id other_id,
         matched.tmdb_movie_id tmdb_movie_id
       FROM tmdb_movie_matches collision_match
       JOIN movie_library_projection collision
         ON collision.media_item_id=collision_match.media_item_id
       JOIN movie_library_projection other
         ON other.normalized_title=collision.normalized_title
        AND other.release_year=collision.release_year
        AND other.media_item_id<>collision.media_item_id
       JOIN tmdb_movie_matches matched
         ON matched.media_item_id=other.media_item_id
        AND matched.match_status='matched' AND matched.tmdb_movie_id IS NOT NULL
       WHERE collision_match.safe_error_code='tmdb_identity_collision'`,
      [],
    ).all<{ collision_id: string; other_id: string; tmdb_movie_id: number }>()
    const collisionCounts = new Map<string, number>()
    const counterpartCounts = new Map<string, number>()
    for (const collision of collisions.results) {
      collisionCounts.set(
        collision.collision_id,
        (collisionCounts.get(collision.collision_id) ?? 0) + 1,
      )
      counterpartCounts.set(
        collision.other_id,
        (counterpartCounts.get(collision.other_id) ?? 0) + 1,
      )
    }
    let repaired = 0
    for (const collision of collisions.results) {
      if (
        collisionCounts.get(collision.collision_id) !== 1 ||
        counterpartCounts.get(collision.other_id) !== 1
      )
        continue
      const pair = await statement(
        this.#database,
        `SELECT m.id,
           EXISTS(SELECT 1 FROM letterboxd_movie_state s WHERE s.media_item_id=m.id)
             has_export_state,
           EXISTS(SELECT 1 FROM external_identities e
             WHERE e.media_item_id=m.id AND e.namespace='tmdb'
               AND e.external_type='movie_id' AND e.external_id=?
               AND e.retired_at IS NULL) has_exact_tmdb
         FROM media_items m WHERE m.id IN (?,?)`,
        [String(collision.tmdb_movie_id), collision.collision_id, collision.other_id],
      ).all<{ id: string; has_export_state: number; has_exact_tmdb: number }>()
      if (pair.results.length !== 2) continue
      const exportFilm = pair.results.find((row) => row.has_export_state === 1)
      const rssFilm = pair.results.find((row) => row.has_export_state === 0)
      if (
        exportFilm === undefined ||
        rssFilm === undefined ||
        rssFilm.has_exact_tmdb !== 1 ||
        pair.results.filter((row) => row.has_export_state === 1).length !== 1
      )
        continue
      const sourceEntries = await statement(
        this.#database,
        `SELECT id,connection_id,consumed_at_value,consumed_at_precision,upstream_state
         FROM archive_entries WHERE media_item_id=?`,
        [rssFilm.id],
      ).all<{
        id: string
        connection_id: string
        consumed_at_value: string | null
        consumed_at_precision: string | null
        upstream_state: string
      }>()
      if (
        sourceEntries.results.length !== 1 ||
        sourceEntries.results[0]?.upstream_state !== 'active'
      )
        continue
      const source = sourceEntries.results[0]!
      const safeSource = await statement(
        this.#database,
        `SELECT EXISTS(SELECT 1 FROM archive_entries a
           JOIN archive_entry_evidence evidence ON evidence.archive_entry_id=a.id
           JOIN source_records record ON record.id=evidence.source_record_id
           WHERE a.id=? AND a.source_occurrence_key LIKE 'rss:%'
             AND record.record_type='rss_movie_entry') is_rss,
          EXISTS(SELECT 1 FROM queue_entries q
           WHERE q.media_item_id=?) has_queue`,
        [source.id, rssFilm.id],
      ).first<{ is_rss: number; has_queue: number }>()
      if (safeSource?.is_rss !== 1 || safeSource.has_queue !== 0) continue
      const targetEntries = await statement(
        this.#database,
        `SELECT id FROM archive_entries
         WHERE media_item_id=? AND connection_id=? AND upstream_state='active'
           AND consumed_at_value IS ? AND consumed_at_precision IS ?`,
        [
          exportFilm.id,
          source.connection_id,
          source.consumed_at_value,
          source.consumed_at_precision,
        ],
      ).all<{ id: string }>()
      if (targetEntries.results.length > 1) continue
      const targetEntry = targetEntries.results[0]?.id
      const matchedOnRss = collision.other_id === rssFilm.id
      const writes: DatabaseStatement[] = []
      if (targetEntry !== undefined) {
        writes.push(
          statement(
            this.#database,
            `INSERT OR IGNORE INTO archive_entry_evidence(
               id,archive_entry_id,source_record_id,role,linked_at)
             SELECT 'movie-tmdb-reconcile:' || ? || ':' || source_record_id || ':' || role,
               ?,source_record_id,role,linked_at
             FROM archive_entry_evidence WHERE archive_entry_id=?`,
            [targetEntry, targetEntry, source.id],
          ),
          statement(
            this.#database,
            `UPDATE archive_entries SET consumed_identity_id=NULL,
               upstream_state='removed',updated_at=? WHERE id=?`,
            [at, source.id],
          ),
        )
      } else {
        writes.push(
          statement(
            this.#database,
            `UPDATE archive_entries SET consumed_identity_id=NULL,
               media_item_id=?,updated_at=? WHERE id=?`,
            [exportFilm.id, at, source.id],
          ),
        )
      }
      writes.push(
        statement(
          this.#database,
          'UPDATE letterboxd_movie_viewings SET media_item_id=? WHERE archive_entry_id=?',
          [exportFilm.id, source.id],
        ),
        statement(
          this.#database,
          'UPDATE external_identities SET media_item_id=? WHERE media_item_id=?',
          [exportFilm.id, rssFilm.id],
        ),
        statement(this.#database, 'DELETE FROM tmdb_movie_matches WHERE media_item_id=?', [
          matchedOnRss ? exportFilm.id : rssFilm.id,
        ]),
      )
      if (matchedOnRss) {
        writes.push(
          statement(
            this.#database,
            'UPDATE tmdb_movie_matches SET media_item_id=?,updated_at=? WHERE media_item_id=?',
            [exportFilm.id, at, rssFilm.id],
          ),
        )
      }
      const results = await this.#database.batch(writes)
      if (results.length !== writes.length || results.some((result) => !result.success)) {
        throw new Error('TMDB identity reconciliation did not complete successfully')
      }
      repaired += 1
    }
    return repaired
  }

  private async saveTmdbConfiguration(configuration: TmdbConfigurationProjection): Promise<void> {
    await statement(
      this.#database,
      `INSERT INTO tmdb_configuration(singleton_id,secure_base_url,poster_base_url,
         backdrop_base_url,poster_sizes_json,backdrop_sizes_json,fetched_at,expires_at,etag)
       VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(singleton_id) DO UPDATE SET
         secure_base_url=excluded.secure_base_url,poster_base_url=excluded.poster_base_url,
         backdrop_base_url=excluded.backdrop_base_url,poster_sizes_json=excluded.poster_sizes_json,
         backdrop_sizes_json=excluded.backdrop_sizes_json,fetched_at=excluded.fetched_at,
         expires_at=excluded.expires_at,etag=excluded.etag`,
      [
        configuration.secureBaseUrl,
        configuration.posterBaseUrl,
        configuration.backdropBaseUrl,
        JSON.stringify(configuration.posterSizes),
        JSON.stringify(configuration.backdropSizes),
        configuration.fetchedAt,
        configuration.expiresAt,
        configuration.etag,
      ],
    ).run()
  }

  private async saveTmdbMovie(movie: TmdbMovieProfileProjection): Promise<void> {
    const conflictingMatch =
      movie.tmdbMovieId === null
        ? null
        : await statement(
            this.#database,
            `SELECT media_item_id FROM tmdb_movie_matches
             WHERE tmdb_movie_id=? AND media_item_id<>? LIMIT 1`,
            [movie.tmdbMovieId, movie.mediaItemId],
          ).first<{ media_item_id: string }>()
    const conflictingTvMatch =
      movie.tmdbTvId == null
        ? null
        : await statement(
            this.#database,
            `SELECT media_item_id FROM tmdb_movie_matches
             WHERE tmdb_tv_id=? AND media_item_id<>? LIMIT 1`,
            [movie.tmdbTvId, movie.mediaItemId],
          ).first<{ media_item_id: string }>()
    const resolvedMovie: TmdbMovieProfileProjection =
      conflictingMatch === null && conflictingTvMatch === null
        ? movie
        : {
            ...movie,
            tmdbMovieId: null,
            tmdbTvId: null,
            matchStatus: 'ambiguous',
            matchMethod: null,
            safeErrorCode:
              conflictingTvMatch === null
                ? 'tmdb_identity_collision'
                : 'tmdb_tv_identity_collision',
            profile: null,
            tvProfile: null,
          }
    const writes: DatabaseStatement[] = [
      statement(
        this.#database,
        `INSERT INTO tmdb_movie_matches(media_item_id,tmdb_movie_id,tmdb_tv_id,match_status,match_method,
           candidate_count,matcher_version,last_attempted_at,matched_at,safe_error_code,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(media_item_id) DO UPDATE SET
           tmdb_movie_id=excluded.tmdb_movie_id,tmdb_tv_id=excluded.tmdb_tv_id,
           match_status=excluded.match_status,
           match_method=excluded.match_method,candidate_count=excluded.candidate_count,
           matcher_version=excluded.matcher_version,last_attempted_at=excluded.last_attempted_at,
           matched_at=excluded.matched_at,safe_error_code=excluded.safe_error_code,
           updated_at=excluded.updated_at`,
        [
          resolvedMovie.mediaItemId,
          resolvedMovie.tmdbMovieId,
          resolvedMovie.tmdbTvId ?? null,
          resolvedMovie.matchStatus,
          resolvedMovie.matchMethod,
          resolvedMovie.candidateCount,
          resolvedMovie.matcherVersion,
          resolvedMovie.attemptedAt,
          resolvedMovie.matchStatus === 'matched' ? resolvedMovie.attemptedAt : null,
          resolvedMovie.safeErrorCode,
          resolvedMovie.attemptedAt,
        ],
      ),
    ]
    const tv = resolvedMovie.tvProfile
    if (tv != null && resolvedMovie.tmdbTvId != null) {
      writes.push(
        statement(
          this.#database,
          `INSERT INTO tmdb_tv_profiles(
             tmdb_tv_id,current_title,original_title,original_language,overview,
             first_air_date,poster_path,backdrop_path,tagline,status,vote_average,
             vote_count,creator_names_json,genres_json,cast_json,countries_json,
             fetched_at,checked_at,expires_at,etag)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(tmdb_tv_id) DO UPDATE SET
             current_title=excluded.current_title,original_title=excluded.original_title,
             original_language=excluded.original_language,overview=excluded.overview,
             first_air_date=excluded.first_air_date,poster_path=excluded.poster_path,
             backdrop_path=excluded.backdrop_path,tagline=excluded.tagline,
             status=excluded.status,vote_average=excluded.vote_average,
             vote_count=excluded.vote_count,creator_names_json=excluded.creator_names_json,
             genres_json=excluded.genres_json,cast_json=excluded.cast_json,
             countries_json=excluded.countries_json,fetched_at=excluded.fetched_at,
             checked_at=excluded.checked_at,expires_at=excluded.expires_at,etag=excluded.etag`,
          [
            resolvedMovie.tmdbTvId,
            tv.currentTitle,
            tv.originalTitle,
            tv.originalLanguage,
            tv.overview,
            tv.firstAirDate,
            tv.posterPath,
            tv.backdropPath,
            tv.tagline,
            tv.status,
            tv.voteAverage,
            tv.voteCount,
            JSON.stringify(tv.creatorNames),
            JSON.stringify(tv.genres),
            JSON.stringify(tv.cast),
            JSON.stringify(tv.countries),
            tv.fetchedAt,
            tv.checkedAt,
            tv.expiresAt,
            tv.etag,
          ],
        ),
      )
    }
    const profile = resolvedMovie.profile
    if (profile !== null && resolvedMovie.tmdbMovieId !== null) {
      writes.push(
        statement(
          this.#database,
          `INSERT INTO tmdb_movie_profiles(tmdb_movie_id,current_title,original_title,
             original_language,overview,release_date,runtime_minutes,poster_path,backdrop_path,
             tagline,imdb_id,status,vote_average,vote_count,fetched_at,checked_at,expires_at,etag)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tmdb_movie_id) DO UPDATE SET
             current_title=excluded.current_title,original_title=excluded.original_title,
             original_language=excluded.original_language,overview=excluded.overview,
             release_date=excluded.release_date,runtime_minutes=excluded.runtime_minutes,
             poster_path=excluded.poster_path,backdrop_path=excluded.backdrop_path,
             tagline=excluded.tagline,imdb_id=excluded.imdb_id,status=excluded.status,
             vote_average=excluded.vote_average,vote_count=excluded.vote_count,
             fetched_at=excluded.fetched_at,checked_at=excluded.checked_at,
             expires_at=excluded.expires_at,etag=excluded.etag`,
          [
            resolvedMovie.tmdbMovieId,
            profile.currentTitle,
            profile.originalTitle,
            profile.originalLanguage,
            profile.overview,
            profile.releaseDate,
            profile.runtimeMinutes,
            profile.posterPath,
            profile.backdropPath,
            profile.tagline,
            profile.imdbId,
            profile.status,
            profile.voteAverage,
            profile.voteCount,
            profile.fetchedAt,
            profile.checkedAt,
            profile.expiresAt,
            profile.etag,
          ],
        ),
        statement(this.#database, 'DELETE FROM tmdb_movie_genres WHERE tmdb_movie_id=?', [
          resolvedMovie.tmdbMovieId,
        ]),
        statement(this.#database, 'DELETE FROM tmdb_movie_credits WHERE tmdb_movie_id=?', [
          resolvedMovie.tmdbMovieId,
        ]),
        statement(this.#database, 'DELETE FROM tmdb_movie_countries WHERE tmdb_movie_id=?', [
          resolvedMovie.tmdbMovieId,
        ]),
        statement(
          this.#database,
          'DELETE FROM tmdb_movie_alternative_titles WHERE tmdb_movie_id=?',
          [resolvedMovie.tmdbMovieId],
        ),
      )
      profile.genres.forEach((genre, position) =>
        writes.push(
          statement(
            this.#database,
            'INSERT INTO tmdb_movie_genres(tmdb_movie_id,genre_id,name,position) VALUES(?,?,?,?)',
            [resolvedMovie.tmdbMovieId, genre.id, genre.name, position],
          ),
        ),
      )
      profile.directors.forEach((credit, position) =>
        writes.push(
          statement(
            this.#database,
            `INSERT INTO tmdb_movie_credits(tmdb_movie_id,credit_id,person_id,name,credit_kind,character_name,position) VALUES(?,?,?,?,'director',NULL,?)`,
            [resolvedMovie.tmdbMovieId, credit.creditId, credit.personId, credit.name, position],
          ),
        ),
      )
      profile.cast
        .slice(0, 20)
        .forEach((credit, position) =>
          writes.push(
            statement(
              this.#database,
              `INSERT INTO tmdb_movie_credits(tmdb_movie_id,credit_id,person_id,name,credit_kind,character_name,position) VALUES(?,?,?,?,'cast',?,?)`,
              [
                resolvedMovie.tmdbMovieId,
                credit.creditId,
                credit.personId,
                credit.name,
                credit.character,
                position,
              ],
            ),
          ),
        )
      profile.countries.forEach((country, position) =>
        writes.push(
          statement(
            this.#database,
            'INSERT INTO tmdb_movie_countries(tmdb_movie_id,country_code,name,position) VALUES(?,?,?,?)',
            [resolvedMovie.tmdbMovieId, country.code, country.name, position],
          ),
        ),
      )
      profile.alternativeTitles.forEach((title, position) =>
        writes.push(
          statement(
            this.#database,
            'INSERT INTO tmdb_movie_alternative_titles(tmdb_movie_id,country_code,title,position) VALUES(?,?,?,?)',
            [resolvedMovie.tmdbMovieId, title.countryCode, title.title, position],
          ),
        ),
      )
    }
    await this.#database.batch(writes)
  }

  async listMovies(input: MoviesListInput): Promise<MoviesPageRecord> {
    const [page, summary] = await Promise.all([
      this.listMovieItems(input),
      this.summarizeMovies(input),
    ])
    return { ...page, ...summary }
  }

  async listMovieItems(
    input: MoviesListInput,
  ): Promise<Pick<MoviesPageRecord, 'data' | 'nextCursor'>> {
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
    const key = await hashQueryFingerprint(fingerprint(input, sort, direction))
    const cursor = await decodeCursor(input.cursor, key)
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
              (b.normalized_title=? AND b.media_item_id>?))))))))`
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
    }
  }

  async summarizeMovies(
    input: MoviesListInput,
  ): Promise<Omit<MoviesPageRecord, 'data' | 'nextCursor'>> {
    const base = baseSql(input)
    const filter = filterSql(input)
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
    return {
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
    const at = new Date().toISOString()
    const row = await statement(
      this.#database,
      `SELECT p.*, p.latest_known_watched_on reference_watched_on,
        p.active_watch_count matching_watch_count, 0 sort_null_rank, NULL sort_value,
        c.label connection_label, c.coverage,
        (SELECT COUNT(*) FROM archive_entries a
          WHERE a.media_item_id=p.media_item_id AND a.upstream_state='active'
            AND a.review_text IS NOT NULL AND trim(a.review_text)<>'') reviewed_count,
        (SELECT MAX(CASE WHEN r.kind='export' AND r.processing_status='processed' THEN r.acquired_at END)
          FROM raw_objects r WHERE r.connection_id=p.connection_id) export_at,
        (SELECT MAX(CASE WHEN r.kind='rss' AND r.processing_status='processed' THEN r.acquired_at END)
          FROM raw_objects r WHERE r.connection_id=p.connection_id) rss_at,
        COALESCE(tp.overview,tv.overview) tmdb_overview,
        COALESCE(tp.original_title,tv.original_title) tmdb_original_title,
        COALESCE(tp.original_language,tv.original_language) tmdb_original_language,
        COALESCE(tp.release_date,tv.first_air_date) tmdb_release_date,
        COALESCE(tp.tagline,tv.tagline) tmdb_tagline,
        CASE WHEN COALESCE(tp.backdrop_path,tv.backdrop_path) IS NOT NULL
          THEN tc.backdrop_base_url||COALESCE(tp.backdrop_path,tv.backdrop_path) END tmdb_backdrop_url,
        COALESCE(tp.vote_average,tv.vote_average) tmdb_rating,
        COALESCE(tp.vote_count,tv.vote_count) tmdb_vote_count,
        tp.imdb_id tmdb_imdb_id,
        tv.genres_json tv_genres_json,tv.cast_json tv_cast_json,
        tv.countries_json tv_countries_json
       FROM movie_library_projection p JOIN connections c ON c.id=p.connection_id
       LEFT JOIN tmdb_movie_profiles tp ON tp.tmdb_movie_id=p.tmdb_movie_id AND tp.expires_at>?
       LEFT JOIN tmdb_tv_profiles tv ON tv.tmdb_tv_id=p.tmdb_tv_id AND tv.expires_at>?
       LEFT JOIN tmdb_configuration tc ON tc.singleton_id=1 AND tc.expires_at>?
       WHERE p.media_item_id=? AND (p.in_archive=1 OR p.in_queue=1)`,
      [at, at, at, id],
    ).first<
      MovieRow & {
        connection_label: string
        coverage: 'complete' | 'partial' | 'best_effort'
        export_at: string | null
        rss_at: string | null
        reviewed_count: number
        tmdb_overview: string | null
        tmdb_original_title: string | null
        tmdb_original_language: string | null
        tmdb_release_date: string | null
        tmdb_tagline: string | null
        tmdb_backdrop_url: string | null
        tmdb_rating: number | null
        tmdb_vote_count: number | null
        tmdb_imdb_id: string | null
        tv_genres_json: string | null
        tv_cast_json: string | null
        tv_countries_json: string | null
      }
    >()
    if (row === null) return null
    const genres =
      row.tmdb_movie_id === null
        ? { results: [] as { name: string }[] }
        : await statement(
            this.#database,
            'SELECT name FROM tmdb_movie_genres WHERE tmdb_movie_id=? ORDER BY position',
            [row.tmdb_movie_id],
          ).all<{ name: string }>()
    const cast =
      row.tmdb_movie_id === null
        ? { results: [] as { name: string; character_name: string | null }[] }
        : await statement(
            this.#database,
            `SELECT name,character_name FROM tmdb_movie_credits
             WHERE tmdb_movie_id=? AND credit_kind='cast' ORDER BY position LIMIT 5`,
            [row.tmdb_movie_id],
          ).all<{ name: string; character_name: string | null }>()
    const countries =
      row.tmdb_movie_id === null
        ? { results: [] as { name: string }[] }
        : await statement(
            this.#database,
            'SELECT name FROM tmdb_movie_countries WHERE tmdb_movie_id=? ORDER BY position',
            [row.tmdb_movie_id],
          ).all<{ name: string }>()
    return {
      ...movieRow(row),
      personal: {
        ...movieRow(row).personal,
        reviewedOccurrenceCount: row.reviewed_count,
      },
      overview: row.tmdb_overview,
      originalTitle: row.tmdb_original_title,
      originalLanguage: row.tmdb_original_language,
      releaseDate: row.tmdb_release_date ?? row.release_year,
      tagline: row.tmdb_tagline,
      backdropUrl: row.tmdb_backdrop_url,
      genres:
        row.tv_genres_json === null
          ? genres.results.map((value) => value.name)
          : (JSON.parse(row.tv_genres_json) as string[]),
      cast:
        row.tv_cast_json === null
          ? cast.results.map((value) => ({ name: value.name, character: value.character_name }))
          : (JSON.parse(row.tv_cast_json) as Array<{ name: string; character: string | null }>),
      countries:
        row.tv_countries_json === null
          ? countries.results.map((value) => value.name)
          : (JSON.parse(row.tv_countries_json) as string[]),
      tmdbRating: row.tmdb_rating,
      tmdbVoteCount: row.tmdb_vote_count,
      source: {
        letterboxdUrl: row.film_uri,
        tmdbUrl:
          row.tmdb_movie_id !== null
            ? `https://www.themoviedb.org/movie/${row.tmdb_movie_id}`
            : row.tmdb_tv_id !== null
              ? `https://www.themoviedb.org/tv/${row.tmdb_tv_id}`
              : null,
        imdbUrl:
          row.tmdb_imdb_id === null ? null : `https://www.imdb.com/title/${row.tmdb_imdb_id}/`,
        connectionLabel: row.connection_label,
        coverage: row.coverage,
        lastCompleteExportAt: row.export_at,
        lastRssSuccessAt: row.rss_at,
        metadataStatus: row.enrichment_status,
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
      `SELECT a.*, v.rewatch,
        CASE WHEN v.diary_uri IS NOT NULL THEN v.log_url END log_url,
        p.film_uri, c.label,
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
  tmdb_movie_id: number | null
  tmdb_tv_id: number | null
  enrichment_status: MovieCollectionRecord['enrichment']['status']
  enrichment_refreshed_at: string | null
  catalog_expires_at: string | null
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
    enrichment: {
      provider: row.enrichment_status === 'not_configured' ? null : 'tmdb',
      mediaType: row.tmdb_tv_id !== null ? 'tv' : row.tmdb_movie_id !== null ? 'movie' : null,
      status: row.enrichment_status,
      refreshedAt: row.enrichment_refreshed_at,
    },
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
