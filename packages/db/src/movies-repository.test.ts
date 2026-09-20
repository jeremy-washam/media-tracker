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
import { SqlMoviesRepository, type LetterboxdMovieSnapshotFilm } from './movies-repository'

const migrations = [
  '0001_canonical_ledger.sql',
  '0006_movies_library.sql',
  '0007_movies_nullable_source_link.sql',
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

  it('repairs RSS movies created from nested HTML entities when the export identifies them', async () => {
    database.exec(`
      INSERT INTO media_items(id,type,title,canonical_url,published_at_value,published_at_precision,
        published_at_basis,created_at,updated_at) VALUES
        ('movie-escaped','movie','First Movie &amp; More',NULL,'2001','year','source_asserted','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,
        connection_id,canonical_url,first_observed_source_record_id,last_observed_source_record_id)
      VALUES ('tmdb-escaped','movie-escaped','tmdb','movie_id','123','global',NULL,NULL,'diary-1','diary-1');
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,
        source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,
        consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES ('archive-escaped','movie-escaped','letterboxd-1','tmdb-escaped','rss:escaped',
        'letterboxd_diary_entry','2025-01-01','day','source_asserted','active','${now}','${now}');
      INSERT INTO archive_entry_evidence(id,archive_entry_id,source_record_id,role,linked_at)
      VALUES ('escaped-evidence','archive-escaped','diary-1','admission','${now}');
      INSERT INTO letterboxd_movie_viewings(archive_entry_id,connection_id,media_item_id,diary_uri,
        rewatch,log_url,source_record_id,projection_version,updated_at)
      VALUES ('archive-escaped','letterboxd-1','movie-escaped',NULL,0,NULL,'diary-1',1,'${now}');
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
          "SELECT count(*) count FROM archive_entry_evidence WHERE archive_entry_id='archive-2' AND source_record_id='diary-1' AND role='admission'",
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
        'letterboxd_diary_entry','2026-01-01','day','source_asserted','active','${now}','${now}');
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
})
