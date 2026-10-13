import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

import { connectionId } from '@media-tracker/domain'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  DatabaseAllResult,
  DatabaseClient,
  DatabaseRunResult,
  DatabaseStatement,
  DatabaseValue,
} from './database'
import {
  SqlMoviesRepository,
  type LetterboxdMovieSnapshotFilm,
  type TmdbMovieProfileProjection,
} from './movies-repository'
import { SqlCanonicalLedgerRepository } from './repository'

const migrationSql = [
  '0001_canonical_ledger.sql',
  '0006_movies_library.sql',
  '0007_movies_nullable_source_link.sql',
  '0016_videos_takeout_library.sql',
  '0017_videos_snapshot_safety.sql',
  '0018_videos_snapshot_head_backfill.sql',
  '0019_provider_catalog_caches.sql',
  '0020_tmdb_match_evidence.sql',
  '0027_compact_archive_evidence.sql',
  '0028_evidence_view_parent_guard.sql',
  '0029_evidence_insert_only_replay.sql',
].map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
const migrations = migrationSql.join('\n')

class SqliteStatement implements DatabaseStatement {
  #values: readonly DatabaseValue[] = []
  constructor(private readonly statement: StatementSync) {}
  bind(...values: readonly DatabaseValue[]) {
    this.#values = values
    return this
  }
  values() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
  execute() {
    this.statement.run(...this.values())
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
  prepare(query: string): DatabaseStatement {
    return new SqliteStatement(this.database.prepare(query))
  }
  async batch(statements: readonly DatabaseStatement[]): Promise<readonly DatabaseRunResult[]> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const item of statements) (item as SqliteStatement).execute()
      this.database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

const now = '2026-09-20T12:00:00.000Z'

it('upgrades existing TMDB match rows while adding separate TV identities', () => {
  const upgrade = new DatabaseSync(':memory:')
  try {
    upgrade.exec(migrationSql.slice(0, -1).join('\n'))
    upgrade.exec(`
      INSERT INTO media_items(id,type,title,created_at,updated_at)
      VALUES ('movie-old','movie','Old movie','${now}','${now}'),
             ('movie-tv','movie','TV record','${now}','${now}');
      INSERT INTO tmdb_movie_matches(media_item_id,tmdb_movie_id,match_status,
        match_method,candidate_count,matcher_version,last_attempted_at,matched_at,updated_at)
      VALUES ('movie-old',101,'matched','exact_title_year',1,
        'tmdb-conservative@1','${now}','${now}','${now}');
    `)
    upgrade.exec(migrationSql.at(-1)!)
    expect(
      upgrade
        .prepare(
          "SELECT tmdb_movie_id,match_method FROM tmdb_movie_matches WHERE media_item_id='movie-old'",
        )
        .get(),
    ).toEqual({ tmdb_movie_id: 101, match_method: 'exact_title_year' })
    upgrade.exec(`
      INSERT INTO tmdb_movie_matches(media_item_id,tmdb_tv_id,match_status,
        match_method,candidate_count,matcher_version,last_attempted_at,matched_at,updated_at)
      VALUES ('movie-tv',61617,'matched','exact_tv_title_year',1,
        'tmdb-evidence@2','${now}','${now}','${now}');
    `)
    expect(upgrade.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    upgrade.close()
  }
})

function listInput(overrides: Partial<Parameters<SqlMoviesRepository['listMovies']>[0]> = {}) {
  return {
    collection: 'archive' as const,
    watchedMode: 'all' as const,
    addedMode: 'all' as const,
    releaseYearUnknown: false,
    ratingMode: 'any' as const,
    reviewed: 'any' as const,
    archive: 'any' as const,
    runtime: 'any' as const,
    runtimeUnknown: false,
    limit: 48,
    ...overrides,
  }
}

describe('SqlMoviesRepository', () => {
  let database: DatabaseSync
  let repository: SqlMoviesRepository

  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(migrations)
    database.exec(`
      INSERT INTO connections(id, source, label, status, coverage, created_at, updated_at)
      VALUES ('letterboxd-1','letterboxd','Letterboxd','connected','complete','${now}','${now}');
      INSERT INTO sync_runs(id, connection_id, kind, status, started_at, finished_at)
      VALUES ('run-1','letterboxd-1','import','succeeded','${now}','${now}');
      INSERT INTO raw_objects(id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
        sha256, content_type, byte_length, acquired_at, processing_status, last_parser_version)
      VALUES ('raw-1','letterboxd-1','run-1','export','export-1','raw/export.zip',
        '${'a'.repeat(64)}','application/zip',100,'${now}','processed','letterboxd-export@3');
      INSERT INTO source_records(id, raw_object_id, connection_id, record_type, record_path,
        source_record_key, source_recorded_at_value, source_recorded_at_precision,
        source_recorded_at_basis, observed_at, parser_version, disposition, upstream_state)
      VALUES
        ('snapshot-1','raw-1','letterboxd-1','export_snapshot','$snapshot','snapshot',NULL,NULL,NULL,'${now}','letterboxd-export@3','normalized','active'),
        ('watched-1','raw-1','letterboxd-1','watched_film','watched.csv#row=2','film-1','2024-01-02','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('diary-1','raw-1','letterboxd-1','diary_entry','diary.csv#row=2','diary-1','2024-01-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('diary-2','raw-1','letterboxd-1','diary_entry','diary.csv#row=3','diary-2','2025-01-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('rating-1','raw-1','letterboxd-1','film_rating','ratings.csv#row=2','film-1','2025-01-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('like-1','raw-1','letterboxd-1','film_like','likes/films.csv#row=2','film-1','2025-01-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('queue-1','raw-1','letterboxd-1','watchlist_film','watchlist.csv#row=2','film-1','2023-01-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active'),
        ('queue-2','raw-1','letterboxd-1','watchlist_film','watchlist.csv#row=3','film-2','2025-02-03','day','source_asserted','${now}','letterboxd-export@3','normalized','active');
      INSERT INTO media_items(id,type,title,canonical_url,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-1','movie','First Movie','https://boxd.it/film-1','2001','year','source_asserted','${now}','${now}'),
        ('movie-2','movie','Queue Movie','https://boxd.it/film-2','2020','year','source_asserted','${now}','${now}');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        rating_value,rating_scale_minimum,rating_scale_maximum,review_text,upstream_state,
        created_at,updated_at) VALUES
        ('archive-1','movie-1','letterboxd-1','diary:1','letterboxd_diary_entry','2024-01-01','day','source_asserted',3.5,0.5,5,NULL,'active','${now}','${now}'),
        ('archive-2','movie-1','letterboxd-1','diary:2','letterboxd_diary_entry','2025-01-01','day','source_asserted',4,0.5,5,'Excellent.','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at) VALUES
        ('archive-1-admission','archive-1','diary-1','admission','${now}'),
        ('archive-2-admission','archive-2','diary-2','admission','${now}');
    `)
    repository = new SqlMoviesRepository(new SqliteClient(database))
  })

  afterEach(() => database.close())

  async function applyFullSnapshot(
    films: LetterboxdMovieSnapshotFilm[] = [
      {
        mediaItemId: 'movie-1',
        filmUri: 'https://boxd.it/film-1',
        title: 'First Movie',
        releaseYear: '2001',
        currentRating: 4.5,
        ratingSourceRecordId: 'rating-1',
        likedSourceRecordId: 'like-1',
        watchlistSourceRecordId: 'queue-1',
        watchlistAddedOn: '2023-01-03',
      },
      {
        mediaItemId: 'movie-2',
        filmUri: 'https://boxd.it/film-2',
        title: 'Queue Movie',
        releaseYear: '2020',
        currentRating: null,
        ratingSourceRecordId: null,
        likedSourceRecordId: null,
        watchlistSourceRecordId: 'queue-2',
        watchlistAddedOn: '2025-02-03',
      },
    ],
  ) {
    await repository.applyLetterboxdSnapshot({
      connectionId: 'letterboxd-1',
      rawObjectId: 'raw-1',
      snapshotSourceRecordId: 'snapshot-1',
      observedAt: now,
      films,
      viewings: [
        {
          archiveEntryId: 'archive-1',
          mediaItemId: 'movie-1',
          diaryUri: 'https://boxd.it/diary-1',
          rewatch: false,
          logUrl: 'https://boxd.it/diary-1',
          sourceRecordId: 'diary-1',
        },
        {
          archiveEntryId: 'archive-2',
          mediaItemId: 'movie-1',
          diaryUri: 'https://boxd.it/diary-2',
          rewatch: true,
          logUrl: 'https://boxd.it/diary-2',
          sourceRecordId: 'diary-2',
        },
      ],
    })
  }

  it('keeps Archive and Queue independent and admits queue-only movies', async () => {
    await applyFullSnapshot()
    const archive = await repository.listMovies(listInput())
    const queue = await repository.listMovies(listInput({ collection: 'queue' }))
    expect(archive.data).toHaveLength(1)
    expect(archive.data[0]).toMatchObject({
      id: 'movie-1',
      personal: { currentRating: 4.5, liked: true, reviewed: true },
      archive: { lifetimeWatchCount: 2 },
      queue: { active: true },
    })
    expect(queue.data.map((movie) => movie.id)).toEqual(['movie-2', 'movie-1'])
    expect(await repository.findMovie('movie-2')).toMatchObject({
      id: 'movie-2',
      archive: { active: false },
    })
    expect(await repository.findMovie('movie-1')).toMatchObject({
      personal: { reviewed: true, reviewedOccurrenceCount: 1 },
    })
  })

  it('retires absent Queue state and clears personal state without erasing Archive', async () => {
    await applyFullSnapshot()
    await applyFullSnapshot([
      {
        mediaItemId: 'movie-1',
        filmUri: 'https://boxd.it/film-1',
        title: 'First Movie',
        releaseYear: '2001',
        currentRating: null,
        ratingSourceRecordId: null,
        likedSourceRecordId: null,
        watchlistSourceRecordId: null,
        watchlistAddedOn: null,
      },
    ])
    const movie = await repository.findMovie('movie-1')
    expect(movie).toMatchObject({
      personal: { currentRating: null, liked: false },
      archive: { active: true, lifetimeWatchCount: 2 },
      queue: { active: false },
    })
    expect(
      database
        .prepare("SELECT upstream_state FROM queue_entries WHERE media_item_id='movie-1'")
        .get(),
    ).toEqual({ upstream_state: 'removed' })
    expect(
      database
        .prepare("SELECT count(*) count FROM queue_entry_evidence WHERE role='removal'")
        .get(),
    ).toEqual({ count: 2 })
  })

  it('uses the latest matching occurrence while retaining complete History', async () => {
    await applyFullSnapshot()
    const page = await repository.listMovies(
      listInput({
        watchedMode: 'range',
        watchedFrom: '2024-01-01',
        watchedTo: '2024-12-31',
      }),
    )
    expect(page.data[0]?.archive).toMatchObject({
      referenceWatchedOn: '2024-01-01',
      matchingWatchCount: 1,
      lifetimeWatchCount: 2,
    })
    expect(page.filteredOccurrenceCount).toBe(1)
    const history = await repository.listMovieHistory('movie-1', {
      limit: 25,
      watchedMode: 'range',
      watchedFrom: '2024-01-01',
      watchedTo: '2024-12-31',
    })
    expect(history.data).toHaveLength(2)
    expect(history.data.map((entry) => entry.matchesFilter)).toEqual([false, true])
    expect(history.data[0]).toMatchObject({
      sourceRewatch: true,
      rating: { value: 4 },
      reviewText: 'Excellent.',
    })
  })

  it('binds cursors to the normalized query', async () => {
    await applyFullSnapshot()
    const first = await repository.listMovies(listInput({ collection: 'queue', limit: 1 }))
    expect(first.nextCursor).not.toBeNull()
    await expect(
      repository.listMovies(
        listInput({ collection: 'queue', q: 'Movie', cursor: first.nextCursor! }),
      ),
    ).rejects.toThrow('Invalid Movies pagination cursor')
  })

  it('loads subsequent Movie pages across dated and null sort boundaries', async () => {
    await applyFullSnapshot()
    database.exec(`
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,upstream_state,created_at,updated_at)
      VALUES('archive-queue','movie-2','letterboxd-1','watched:queue',
        'letterboxd_watched_state','active','${now}','${now}');
    `)
    await repository.rebuild(now)
    for (const collection of ['archive', 'queue'] as const) {
      for (const sort of [
        collection === 'archive' ? 'watchedAt' : 'addedAt',
        'title',
        'personalRating',
      ] as const) {
        for (const direction of ['asc', 'desc'] as const) {
          const query = listInput({ collection, sort, direction })
          const full = await repository.listMovies(query)
          const first = await repository.listMovies({ ...query, limit: 1 })
          expect(first.nextCursor).not.toBeNull()
          const second = await repository.listMovies({
            ...query,
            limit: 1,
            cursor: first.nextCursor!,
          })
          expect([...first.data, ...second.data].map((item) => item.id)).toEqual(
            full.data.map((item) => item.id),
          )
          expect(second.nextCursor).toBeNull()
        }
      }
    }
  })

  it('repairs RSS movies created from nested HTML entities when the export identifies them', async () => {
    database.exec(`
      INSERT INTO raw_objects(id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
        sha256, content_type, byte_length, acquired_at, processing_status, last_parser_version)
      VALUES ('raw-rss','letterboxd-1','run-1','rss','rss-1','raw/rss.xml',
        '${'b'.repeat(64)}','application/rss+xml',100,'${now}','processed','letterboxd-rss@3');
      INSERT INTO source_records(id, raw_object_id, connection_id, record_type, record_path,
        source_record_key, source_recorded_at_value, source_recorded_at_precision,
        source_recorded_at_basis, observed_at, parser_version, disposition, upstream_state)
      VALUES ('rss-escaped','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[0]',
        'letterboxd-watch-escaped','${now}','instant','source_asserted','${now}',
        'letterboxd-rss@3','normalized','active');
      INSERT INTO media_items(id,type,title,canonical_url,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-escaped','movie','First Movie &amp; More',NULL,'2001','year','source_asserted','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,
        connection_id,canonical_url,first_observed_source_record_id,last_observed_source_record_id)
      VALUES ('tmdb-escaped','movie-escaped','tmdb','movie_id','123','global',NULL,NULL,'rss-escaped','rss-escaped');
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,
        source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,
        consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES ('archive-escaped','movie-escaped','letterboxd-1','tmdb-escaped','rss:escaped',
        'letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at)
      VALUES ('escaped-evidence','archive-escaped','rss-escaped','admission','${now}');
      INSERT INTO letterboxd_movie_viewings(archive_entry_id,connection_id,media_item_id,diary_uri,
        rewatch,log_url,source_record_id,projection_version,updated_at)
      VALUES ('archive-escaped','letterboxd-1','movie-escaped',NULL,0,NULL,'rss-escaped',1,'${now}');
    `)

    await applyFullSnapshot([
      {
        mediaItemId: 'movie-1',
        filmUri: 'https://boxd.it/film-1',
        title: 'First Movie & More',
        releaseYear: '2001',
        currentRating: 4.5,
        ratingSourceRecordId: 'rating-1',
        likedSourceRecordId: 'like-1',
        watchlistSourceRecordId: 'queue-1',
        watchlistAddedOn: '2023-01-03',
      },
    ])

    const archive = await repository.listMovies(listInput())
    expect(archive.data).toHaveLength(1)
    expect(archive.data[0]).toMatchObject({
      id: 'movie-1',
      displayTitle: 'First Movie & More',
      archive: { lifetimeWatchCount: 2 },
    })
    expect(
      database
        .prepare("SELECT media_item_id FROM external_identities WHERE id='tmdb-escaped'")
        .get(),
    ).toEqual({ media_item_id: 'movie-1' })
    expect(
      database
        .prepare("SELECT upstream_state FROM archive_entries WHERE id='archive-escaped'")
        .get(),
    ).toEqual({ upstream_state: 'removed' })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM archive_entry_evidence WHERE archive_entry_id='archive-2' AND source_record_id='rss-escaped' AND role='admission'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM archive_entry_evidence WHERE archive_entry_id='archive-escaped' AND role='removal'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM movie_library_projection WHERE media_item_id='movie-escaped'",
        )
        .get(),
    ).toEqual({ count: 0 })
  })

  it('does not merge an exact title/year collision without matching viewing evidence', async () => {
    database.exec(`
      INSERT INTO media_items(id,type,title,canonical_url,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-collision','movie','First Movie',NULL,'2001','year','source_asserted','${now}','${now}');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        upstream_state,created_at,updated_at)
      VALUES ('archive-collision','movie-collision','letterboxd-1','rss:collision',
        'letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at)
      VALUES ('collision-evidence','archive-collision','diary-1','admission','${now}');
    `)

    await applyFullSnapshot()

    expect(
      database
        .prepare("SELECT count(*) count FROM archive_entries WHERE media_item_id='movie-collision'")
        .get(),
    ).toEqual({ count: 1 })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM movie_library_projection WHERE media_item_id='movie-collision'",
        )
        .get(),
    ).toEqual({ count: 1 })
  })

  it('does not repair cross-connection, removed, or multiply supported legacy items', async () => {
    database.exec(`
      INSERT INTO connections(id, source, label, status, coverage, created_at, updated_at)
      VALUES ('letterboxd-2','letterboxd','Other Letterboxd','connected','partial','${now}','${now}');
      INSERT INTO sync_runs(id, connection_id, kind, status, started_at, finished_at)
      VALUES ('run-2','letterboxd-2','reconcile','succeeded','${now}','${now}');
      INSERT INTO raw_objects(id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
        sha256, content_type, byte_length, acquired_at, processing_status, last_parser_version)
      VALUES
        ('raw-rss','letterboxd-1','run-1','rss','rss-1','raw/rss.xml',
          '${'b'.repeat(64)}','application/rss+xml',100,'${now}','processed','letterboxd-rss@3'),
        ('raw-rss-2','letterboxd-2','run-2','rss','rss-2','raw/rss-2.xml',
          '${'c'.repeat(64)}','application/rss+xml',100,'${now}','processed','letterboxd-rss@3');
      INSERT INTO source_records(id, raw_object_id, connection_id, record_type, record_path,
        source_record_key, observed_at, parser_version, disposition, upstream_state)
      VALUES
        ('rss-cross','raw-rss-2','letterboxd-2','rss_movie_entry','$.rss.channel.item[0]','cross','${now}','letterboxd-rss@3','normalized','active'),
        ('rss-multiple','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[1]','multiple','${now}','letterboxd-rss@3','normalized','active'),
        ('rss-removed','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[2]','removed','${now}','letterboxd-rss@3','normalized','active');
      INSERT INTO media_items(id,type,title,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-cross','movie','First Movie','2001','year','source_asserted','${now}','${now}'),
        ('movie-multiple','movie','First Movie','2001','year','source_asserted','${now}','${now}'),
        ('movie-removed','movie','First Movie','2001','year','source_asserted','${now}','${now}');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        upstream_state,created_at,updated_at) VALUES
        ('archive-cross','movie-cross','letterboxd-2','rss:cross','letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}'),
        ('archive-multiple-a','movie-multiple','letterboxd-1','rss:multiple-a','letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}'),
        ('archive-multiple-b','movie-multiple','letterboxd-1','rss:multiple-b','letterboxd_diary_entry','2025-02-01','day','source_asserted','active','${now}','${now}'),
        ('archive-removed','movie-removed','letterboxd-1','rss:removed','letterboxd_diary_entry','2025-01-01','day','source_asserted','removed','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at) VALUES
        ('e-cross','archive-cross','rss-cross','admission','${now}'),
        ('e-multiple-a','archive-multiple-a','rss-multiple','admission','${now}'),
        ('e-multiple-b','archive-multiple-b','rss-multiple','admission','${now}'),
        ('e-removed','archive-removed','rss-removed','admission','${now}');
    `)

    await applyFullSnapshot()

    for (const id of [
      'archive-cross',
      'archive-multiple-a',
      'archive-multiple-b',
      'archive-removed',
    ]) {
      expect(
        database.prepare('SELECT upstream_state FROM archive_entries WHERE id=?').get(id),
      ).toEqual({
        upstream_state: id === 'archive-removed' ? 'removed' : 'active',
      })
    }
  })

  it('does not repair when the target has multiple active same-day occurrences', async () => {
    database.exec(`
      INSERT INTO raw_objects(id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
        sha256, content_type, byte_length, acquired_at, processing_status, last_parser_version)
      VALUES ('raw-rss','letterboxd-1','run-1','rss','rss-1','raw/rss.xml',
        '${'b'.repeat(64)}','application/rss+xml',100,'${now}','processed','letterboxd-rss@3');
      INSERT INTO source_records(id, raw_object_id, connection_id, record_type, record_path,
        source_record_key, observed_at, parser_version, disposition, upstream_state)
      VALUES ('rss-duplicate','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[0]',
        'duplicate','${now}','letterboxd-rss@3','normalized','active');
      INSERT INTO media_items(id,type,title,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at)
      VALUES ('movie-duplicate','movie','First Movie','2001','year','source_asserted','${now}','${now}');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        upstream_state,created_at,updated_at) VALUES
        ('archive-duplicate','movie-duplicate','letterboxd-1','rss:duplicate','letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}'),
        ('archive-target-extra','movie-1','letterboxd-1','diary:extra','letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at)
      VALUES ('e-duplicate','archive-duplicate','rss-duplicate','admission','${now}');
    `)

    await applyFullSnapshot()
    expect(
      database
        .prepare("SELECT upstream_state FROM archive_entries WHERE id='archive-duplicate'")
        .get(),
    ).toEqual({ upstream_state: 'active' })
  })

  it('does not repair two RSS-only occurrences without a Diary row in the current export', async () => {
    database.exec(`
      INSERT INTO raw_objects(id, connection_id, sync_run_id, kind, acquisition_key, storage_key,
        sha256, content_type, byte_length, acquired_at, processing_status, last_parser_version)
      VALUES ('raw-rss','letterboxd-1','run-1','rss','rss-1','raw/rss.xml',
        '${'b'.repeat(64)}','application/rss+xml',100,'${now}','processed','letterboxd-rss@3');
      INSERT INTO source_records(id, raw_object_id, connection_id, record_type, record_path,
        source_record_key, observed_at, parser_version, disposition, upstream_state)
      VALUES
        ('rss-source','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[0]',
          'source','${now}','letterboxd-rss@3','normalized','active'),
        ('rss-target','raw-rss','letterboxd-1','rss_movie_entry','$.rss.channel.item[1]',
          'target','${now}','letterboxd-rss@3','normalized','active');
      INSERT INTO media_items(id,type,title,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-rss-source','movie','RSS Twins','2001','year','source_asserted','${now}','${now}'),
        ('movie-rss-target','movie','RSS Twins','2001','year','source_asserted','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,
        connection_id,first_observed_source_record_id,last_observed_source_record_id)
      VALUES ('tmdb-rss-source','movie-rss-source','tmdb','movie_id','456','global',NULL,
        'rss-source','rss-source');
      INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
        upstream_state,created_at,updated_at) VALUES
        ('archive-rss-source','movie-rss-source','letterboxd-1','rss:source',
          'letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}'),
        ('archive-rss-target','movie-rss-target','letterboxd-1','rss:target',
          'letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at) VALUES
        ('e-rss-source','archive-rss-source','rss-source','admission','${now}'),
        ('e-rss-target','archive-rss-target','rss-target','admission','${now}');
    `)

    await applyFullSnapshot([
      {
        mediaItemId: 'movie-rss-target',
        filmUri: 'https://boxd.it/rss-twins',
        title: 'RSS Twins',
        releaseYear: '2001',
        currentRating: null,
        ratingSourceRecordId: null,
        likedSourceRecordId: null,
        watchlistSourceRecordId: 'queue-1',
        watchlistAddedOn: '2023-01-03',
      },
    ])

    expect(
      database
        .prepare("SELECT upstream_state FROM archive_entries WHERE id='archive-rss-source'")
        .get(),
    ).toEqual({ upstream_state: 'active' })
    expect(
      database
        .prepare("SELECT media_item_id FROM external_identities WHERE id='tmdb-rss-source'")
        .get(),
    ).toEqual({ media_item_id: 'movie-rss-source' })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM archive_entry_evidence WHERE archive_entry_id='archive-rss-source' AND role='removal'",
        )
        .get(),
    ).toEqual({ count: 0 })
  })

  async function addRssCollision(input: {
    title: string
    year: string
    target: string
    watchedOn: string
    tmdbId: number
    matchedOnRss: boolean
  }) {
    database
      .prepare(
        `INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,
         storage_key,sha256,content_type,byte_length,acquired_at,processing_status,
         last_parser_version) VALUES('raw-rss','letterboxd-1','run-1','rss','rss-collision',
         'raw/rss-collision.xml',?,'application/rss+xml',100,?,'processed','letterboxd-rss@3')`,
      )
      .run('b'.repeat(64), now)
    database
      .prepare(
        `INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,
         source_record_key,observed_at,parser_version,disposition,upstream_state)
       VALUES('rss-collision','raw-rss','letterboxd-1','rss_movie_entry','$.item[0]',
         'rss-collision',?,'letterboxd-rss@3','normalized','active')`,
      )
      .run(now)
    database
      .prepare(
        `INSERT INTO media_items(id,type,title,published_at_value,published_at_precision,
         published_at_basis,created_at,updated_at)
       VALUES('rss-movie','movie',? ,?,'year','source_asserted',?,?)`,
      )
      .run(input.title, input.year, now, now)
    database
      .prepare(
        `INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,
         scope,first_observed_source_record_id,last_observed_source_record_id)
       VALUES('rss-tmdb','rss-movie','tmdb','movie_id',?,'global',
         'rss-collision','rss-collision')`,
      )
      .run(String(input.tmdbId))
    database
      .prepare(
        `INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,
         admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,
         upstream_state,created_at,updated_at)
       VALUES('rss-archive','rss-movie','letterboxd-1','rss:collision',
         'letterboxd_diary_entry',?,'day','source_asserted','active',?,?)`,
      )
      .run(input.watchedOn, now, now)
    database
      .prepare(
        `INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at)
       VALUES('rss-evidence','rss-archive','rss-collision','admission',?)`,
      )
      .run(now)
    await repository.rebuild(now)
    const matched = input.matchedOnRss ? 'rss-movie' : input.target
    const collision = input.matchedOnRss ? input.target : 'rss-movie'
    database
      .prepare(
        `INSERT INTO tmdb_movie_matches(media_item_id,tmdb_movie_id,match_status,match_method,
         candidate_count,matcher_version,last_attempted_at,matched_at,updated_at)
       VALUES(?,?,'matched','exact_tmdb_id',1,'tmdb-conservative@1',?,?,?)`,
      )
      .run(matched, input.tmdbId, now, now, now)
    database
      .prepare(
        `INSERT INTO tmdb_movie_matches(media_item_id,match_status,candidate_count,
         matcher_version,last_attempted_at,safe_error_code,updated_at)
       VALUES(?,'ambiguous',1,'tmdb-conservative@1',?,
         'tmdb_identity_collision',?)`,
      )
      .run(collision, now, now)
  }

  it('joins an RSS watch to a queue-only export film after a TMDB identity collision', async () => {
    await applyFullSnapshot()
    await addRssCollision({
      title: 'Queue Movie',
      year: '2020',
      target: 'movie-2',
      watchedOn: '2025-03-04',
      tmdbId: 501,
      matchedOnRss: true,
    })
    expect(await repository.reconcileTmdbIdentityCollisions(now)).toBe(1)
    await repository.rebuild(now)
    expect(await repository.reconcileTmdbIdentityCollisions(now)).toBe(0)
    expect(
      database.prepare("SELECT media_item_id FROM archive_entries WHERE id='rss-archive'").get(),
    ).toEqual({ media_item_id: 'movie-2' })
    expect(
      database.prepare("SELECT media_item_id FROM external_identities WHERE id='rss-tmdb'").get(),
    ).toEqual({ media_item_id: 'movie-2' })
    expect(
      database
        .prepare('SELECT media_item_id FROM tmdb_movie_matches WHERE tmdb_movie_id=501')
        .get(),
    ).toEqual({ media_item_id: 'movie-2' })
    expect((await repository.listMovies(listInput())).data.map((movie) => movie.id)).toContain(
      'movie-2',
    )
  })

  it('retires a duplicate RSS watch but preserves its evidence and replay target', async () => {
    await applyFullSnapshot()
    await addRssCollision({
      title: 'First Movie',
      year: '2001',
      target: 'movie-1',
      watchedOn: '2025-01-01',
      tmdbId: 502,
      matchedOnRss: false,
    })
    expect(await repository.reconcileTmdbIdentityCollisions(now)).toBe(1)
    await repository.rebuild(now)
    expect(
      database.prepare("SELECT upstream_state FROM archive_entries WHERE id='rss-archive'").get(),
    ).toEqual({ upstream_state: 'removed' })
    expect(
      database
        .prepare(
          "SELECT count(*) count FROM archive_entry_evidence WHERE archive_entry_id='archive-2' AND source_record_id='rss-collision'",
        )
        .get(),
    ).toEqual({ count: 1 })
    const ledger = new SqlCanonicalLedgerRepository(new SqliteClient(database))
    expect(
      await ledger.findArchiveOccurrence(connectionId('letterboxd-1'), 'rss:collision'),
    ).toMatchObject({ id: 'archive-2', sourceOccurrenceKey: 'diary:2' })
    expect((await repository.listMovies(listInput())).data).toHaveLength(1)
    expect((await repository.listMovies(listInput())).data[0]?.archive.lifetimeWatchCount).toBe(2)
  })

  it('treats SQL LIKE metacharacters literally in one-character searches', async () => {
    await applyFullSnapshot()
    for (const [title, query] of [
      ['percent %', '%'],
      ['underscore _', '_'],
      ['slash \\', '\\'],
    ] as const) {
      database
        .prepare(
          "UPDATE movie_library_projection SET normalized_title=? WHERE media_item_id='movie-2'",
        )
        .run(title)
      const page = await repository.listMovies(listInput({ collection: 'queue', q: query }))
      expect(page.data.map((item) => item.id)).toEqual(['movie-2'])
    }
  })

  it('projects a conservative TMDB match into collection and detail metadata', async () => {
    await applyFullSnapshot()
    const matchedMovie: TmdbMovieProfileProjection = {
      mediaItemId: 'movie-1',
      tmdbMovieId: 101,
      matchStatus: 'matched',
      matchMethod: 'exact_title_year',
      candidateCount: 1,
      matcherVersion: 'tmdb-conservative@1',
      attemptedAt: now,
      safeErrorCode: null,
      profile: {
        currentTitle: 'First Movie Restored',
        originalTitle: 'First Movie',
        originalLanguage: 'en',
        overview: 'A restored synopsis.',
        releaseDate: '2001-03-04',
        runtimeMinutes: 111,
        posterPath: '/poster.jpg',
        backdropPath: '/backdrop.jpg',
        tagline: 'A tagline',
        imdbId: 'tt0000101',
        status: 'Released',
        voteAverage: 7.5,
        voteCount: 100,
        fetchedAt: now,
        checkedAt: now,
        expiresAt: '2026-10-20T12:00:00.000Z',
        etag: null,
        genres: [{ id: 1, name: 'Drama' }],
        directors: [{ creditId: 'director-1', personId: 1, name: 'Director One' }],
        cast: [{ creditId: 'cast-1', personId: 2, name: 'Actor One', character: 'Lead' }],
        countries: [{ code: 'US', name: 'United States of America' }],
        alternativeTitles: [{ countryCode: 'US', title: 'First Alternate' }],
      },
    }
    await repository.applyTmdbCatalogBatch({
      at: now,
      configuration: {
        secureBaseUrl: 'https://image.tmdb.org/t/p/',
        posterBaseUrl: 'https://image.tmdb.org/t/p/w500',
        backdropBaseUrl: 'https://image.tmdb.org/t/p/w1280',
        posterSizes: ['w500'],
        backdropSizes: ['w1280'],
        fetchedAt: now,
        expiresAt: '2026-10-20T12:00:00.000Z',
        etag: null,
      },
      movies: [matchedMovie],
    })
    await repository.rebuild(now)
    expect(await repository.findMovie('movie-1')).toMatchObject({
      displayTitle: 'First Movie Restored',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      directors: ['Director One'],
      overview: 'A restored synopsis.',
      genres: ['Drama'],
      source: { tmdbUrl: 'https://www.themoviedb.org/movie/101', metadataStatus: 'matched' },
    })
    expect(await repository.needsTmdbConfigurationRefresh(now)).toBe(false)
    expect(await repository.needsTmdbConfigurationRefresh('2026-11-01T00:00:00.000Z')).toBe(true)

    await repository.applyTmdbCatalogBatch({
      at: now,
      movies: [{ ...matchedMovie, mediaItemId: 'movie-2' }],
    })
    expect(
      database
        .prepare(
          `SELECT tmdb_movie_id,match_status,match_method,safe_error_code
           FROM tmdb_movie_matches WHERE media_item_id='movie-2'`,
        )
        .get(),
    ).toEqual({
      tmdb_movie_id: null,
      match_status: 'ambiguous',
      match_method: null,
      safe_error_code: 'tmdb_identity_collision',
    })
  })

  it('projects a TMDB TV profile without colliding with movie IDs or changing source year', async () => {
    await applyFullSnapshot()
    await repository.applyTmdbCatalogBatch({
      at: now,
      movies: [
        {
          mediaItemId: 'movie-2',
          tmdbMovieId: null,
          tmdbTvId: 61617,
          matchStatus: 'matched',
          matchMethod: 'exact_tv_title_year',
          candidateCount: 1,
          matcherVersion: 'tmdb-evidence@2',
          attemptedAt: now,
          safeErrorCode: null,
          profile: null,
          tvProfile: {
            currentTitle: 'Over the Garden Wall',
            originalTitle: 'Over the Garden Wall',
            originalLanguage: 'en',
            overview: 'A miniseries.',
            firstAirDate: '2014-11-03',
            posterPath: '/tv.jpg',
            backdropPath: null,
            tagline: null,
            status: 'Ended',
            voteAverage: 8.6,
            voteCount: 1822,
            creatorNames: ['Creator One'],
            genres: ['Animation'],
            cast: [{ name: 'Actor One', character: 'Wirt' }],
            countries: ['United States'],
            fetchedAt: now,
            checkedAt: now,
            expiresAt: '2026-10-20T12:00:00.000Z',
            etag: null,
          },
        },
      ],
    })
    await repository.rebuild(now)
    const queue = await repository.listMovies(listInput({ collection: 'queue' }))
    expect(queue.data.find((movie) => movie.id === 'movie-2')).toMatchObject({
      displayTitle: 'Over the Garden Wall',
      releaseYear: '2020',
      directors: ['Creator One'],
      enrichment: { status: 'matched', mediaType: 'tv' },
    })
    expect(await repository.findMovie('movie-2')).toMatchObject({
      overview: 'A miniseries.',
      genres: ['Animation'],
      cast: [{ name: 'Actor One', character: 'Wirt' }],
      source: { tmdbUrl: 'https://www.themoviedb.org/tv/61617' },
    })
  })
})
