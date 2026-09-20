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
import { SqlBooksRepository, type HardcoverBookProjection } from './books-repository'

const migrationNames = [
  '0001_canonical_ledger.sql',
  '0002_rotating_credentials.sql',
  '0003_books_library.sql',
  '0004_books_review_facts.sql',
  '0005_books_format_projection.sql',
]
const migrationSql = migrationNames.map((name) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'),
)
const migrations = migrationSql.join('\n')

class SqliteStatement implements DatabaseStatement {
  readonly #statement: StatementSync
  #values: readonly DatabaseValue[] = []

  constructor(statement: StatementSync) {
    this.#statement = statement
  }

  bind(...values: readonly DatabaseValue[]): DatabaseStatement {
    this.#values = values
    return this
  }

  async run(): Promise<DatabaseRunResult> {
    this.execute()
    return { success: true }
  }

  async first<Row>(): Promise<Row | null> {
    const row = this.#statement.get(...this.values())
    return (row as Row | undefined) ?? null
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    return { results: this.#statement.all(...this.values()) as Row[], success: true }
  }

  execute(): void {
    this.#statement.run(...this.values())
  }

  private values() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
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

function seedLedger(database: DatabaseSync) {
  database.exec(`
    INSERT INTO connections(id, source, label, status, coverage, created_at, updated_at)
    VALUES ('connection-hardcover', 'hardcover', 'Hardcover', 'connected', 'complete',
      '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z');
    INSERT INTO sync_runs(id, connection_id, kind, status, started_at, finished_at)
    VALUES ('run-1', 'connection-hardcover', 'backfill', 'succeeded',
      '2026-09-20T10:00:00.000Z', '2026-09-20T10:01:00.000Z');
    INSERT INTO raw_objects(
      id, connection_id, sync_run_id, kind, acquisition_key, storage_key, sha256,
      content_type, byte_length, acquired_at, processing_status
    ) VALUES (
      'raw-1', 'connection-hardcover', 'run-1', 'api_page', 'page-1', 'raw/page-1.json',
      '${'a'.repeat(64)}', 'application/json', 100, '2026-09-20T10:00:00.000Z', 'processed'
    );
    INSERT INTO source_records(
      id, raw_object_id, connection_id, record_type, record_path, source_record_key,
      observed_at, parser_version, disposition, upstream_state
    ) VALUES (
      'record-1', 'raw-1', 'connection-hardcover', 'user_book', '$.data.user_books[0]',
      'user_book:1', '2026-09-20T10:00:00.000Z', 'hardcover-user-books@3',
      'normalized', 'active'
    );
    INSERT INTO media_items(id, type, title, created_at, updated_at)
    VALUES ('book-1', 'book', 'The Left Hand of Darkness',
      '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z');
    INSERT INTO archive_entries(
      id, media_item_id, connection_id, source_occurrence_key, admission_reason,
      consumed_at_value, consumed_at_precision, consumed_at_basis, upstream_state,
      created_at, updated_at
    ) VALUES (
      'archive-1', 'book-1', 'connection-hardcover', 'read:10',
      'hardcover_finished_read', '2025-03-04', 'day', 'source_asserted', 'active',
      '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z'
    );
  `)
}

function projection(): HardcoverBookProjection {
  return {
    connectionId: 'connection-hardcover',
    syncRunId: 'run-1',
    sourceRecordId: 'record-1',
    observedAt: '2026-09-20T10:00:00.000Z',
    sourceUpdatedAt: '2026-09-19T10:00:00.000Z',
    mediaItemId: 'book-1',
    userBookId: 1,
    workId: 2,
    canonicalWorkId: null,
    currentEditionId: 3,
    statusId: 2,
    statusLabel: 'Currently Reading',
    dateAdded: '2024-01-02',
    readCount: 1,
    personalRating: 4.5,
    reviewText: 'Synthetic review.',
    reviewHasSpoilers: false,
    reviewedAt: '2026-09-18T12:00:00.000Z',
    title: 'The Left Hand of Darkness',
    subtitle: null,
    description: 'A synthetic description.',
    slug: 'the-left-hand-of-darkness',
    pages: 304,
    audioSeconds: null,
    releaseDate: '1969',
    releasePrecision: 'year',
    coverUrl: 'https://example.invalid/cover.jpg',
    coverColor: '#334455',
    communityRating: 4.2,
    communityRatingsCount: 100,
    usersReadCount: 80,
    defaultCoverEditionId: 3,
    editions: [
      {
        id: 3,
        canonicalId: null,
        title: 'The Left Hand of Darkness',
        subtitle: null,
        information: 'Paperback',
        readingFormatId: 1,
        readingFormat: 'Physical Book',
        rawFormat: 'Paperback',
        pages: 304,
        audioSeconds: null,
        releaseDate: '2010-01-01',
        publisher: 'Synthetic Press',
        language: 'English',
        isbn10: '0441478123',
        isbn13: '9780441478125',
        asin: null,
        coverUrl: 'https://example.invalid/cover.jpg',
        coverColor: '#334455',
        contributors: [],
      },
    ],
    contributors: [
      {
        id: 4,
        name: 'Ursula K. Le Guin',
        slug: 'ursula-k-le-guin',
        roleId: 1,
        roleName: 'Author',
        contribution: null,
        primary: true,
        position: 0,
      },
    ],
    series: [
      {
        id: 5,
        name: 'Hainish Cycle',
        slug: 'hainish-cycle',
        booksCount: 7,
        position: 4,
        compilation: false,
        featured: true,
      },
    ],
    taxonomy: [{ category: 'Genre', value: 'Science Fiction', slug: 'science-fiction' }],
    reads: [
      {
        id: 10,
        archiveEntryId: 'archive-1',
        editionId: 3,
        startedAt: '2025-02-01',
        pausedAt: null,
        finishedAt: '2025-03-04',
        finishedAtPrecisionRaw: null,
        progress: null,
        progressPages: 150,
        progressSeconds: null,
      },
    ],
  }
}

const baseQuery = {
  collection: 'archive' as const,
  formats: [],
  series: [],
  genres: [],
  finishedMode: 'any' as const,
  publishedMode: 'any' as const,
  addedMode: 'any' as const,
  ratingMode: 'any' as const,
  limit: 48,
}

describe('Books projection and repository', () => {
  let database: DatabaseSync
  let repository: SqlBooksRepository

  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    database.exec(migrations)
    seedLedger(database)
    repository = new SqlBooksRepository(new SqliteClient(database))
  })

  afterEach(() => database.close())

  it('upgrades the prior Books schema without replacing existing data', () => {
    const upgrade = new DatabaseSync(':memory:')
    upgrade.exec(migrationSql.slice(0, 3).join('\n'))
    upgrade.exec(`
      INSERT INTO connections(id, source, label, status, coverage, created_at, updated_at)
      VALUES ('upgrade-check', 'hardcover', 'Hardcover', 'connected', 'complete',
        '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')
    `)
    upgrade.exec(migrationSql.slice(3).join('\n'))

    expect(
      upgrade
        .prepare(
          "SELECT name FROM pragma_table_info('hardcover_user_books') WHERE name='reviewed_at'",
        )
        .get(),
    ).toEqual({ name: 'reviewed_at' })
    expect(upgrade.prepare("SELECT id FROM connections WHERE id='upgrade-check'").get()).toEqual({
      id: 'upgrade-check',
    })
    upgrade.close()
  })

  it('builds overlapping Archive and Queue views with searchable source metadata', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })

    const archive = await repository.listBooks({ ...baseQuery, q: 'Ursula' })
    expect(archive.counts).toEqual({
      archive: 1,
      queue: 1,
      filteredBooks: 1,
      supportedReads: 1,
    })
    expect(archive.data[0]).toMatchObject({
      title: 'The Left Hand of Darkness',
      memberships: { archive: true, queue: true, currentlyReading: true },
      latestReadDate: '2025-03-04',
      latestReadFormat: 'Physical',
    })
    expect(archive.facets.genres).toEqual([
      { value: 'science-fiction', label: 'Science Fiction', count: 1 },
    ])

    const queue = await repository.listBooks({
      ...baseQuery,
      collection: 'queue',
      formats: ['physical'],
    })
    expect(queue.data).toHaveLength(1)
    expect(queue.counts.supportedReads).toBe(0)
  })

  it('returns structured detail and personal History separately', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })

    await expect(repository.findBook('book-1')).resolves.toMatchObject({
      title: 'The Left Hand of Darkness',
      personalRating: 4.5,
      selectedEdition: { format: 'Physical', publisher: 'Synthetic Press' },
      community: { genres: ['Science Fiction'] },
    })
    const history = await repository.listBookHistory('book-1', { limit: 20 })
    expect(history.data.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['read', 'status', 'added', 'rating', 'review']),
    )
    expect(history.data.find((event) => event.kind === 'status')).toMatchObject({
      date: null,
      datePrecision: null,
    })
    expect(history.data.find((event) => event.kind === 'rating')).toMatchObject({
      date: null,
      datePrecision: null,
    })
    expect(history.data.find((event) => event.kind === 'review')).toMatchObject({
      date: '2026-09-18T12:00:00.000Z',
      datePrecision: 'instant',
    })
    expect(history.data.find((event) => event.kind === 'progress')).toMatchObject({
      date: null,
      datePrecision: null,
      detail: '150 pages',
    })
    expect(history.data.find((event) => event.kind === 'read')?.edition?.format).toBe('Physical')
  })

  it('preserves Archive browsing, detail, search, and History after upstream removal', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })
    database.exec(`
      INSERT INTO sync_runs(id, connection_id, kind, status, started_at, finished_at)
      VALUES ('run-2', 'connection-hardcover', 'reconcile', 'succeeded',
        '2026-09-21T10:00:00.000Z', '2026-09-21T10:01:00.000Z');
    `)

    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-2',
      refreshedAt: '2026-09-21T10:01:00.000Z',
    })

    const archive = await repository.listBooks({ ...baseQuery, q: 'Ursula', formats: ['physical'] })
    expect(archive.counts).toMatchObject({ archive: 1, queue: 0, filteredBooks: 1 })
    expect(archive.data[0]).toMatchObject({
      title: 'The Left Hand of Darkness',
      authors: [{ name: 'Ursula K. Le Guin' }],
      memberships: { archive: true, queue: false, currentlyReading: false },
      latestReadFormat: 'Physical',
    })
    await expect(repository.findBook('book-1')).resolves.toMatchObject({
      title: 'The Left Hand of Darkness',
      memberships: { archive: true, queue: false },
      selectedEdition: { format: 'Physical' },
      community: { genres: ['Science Fiction'] },
    })
    await expect(repository.listBookHistory('book-1', { limit: 20 })).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ kind: 'read', date: '2025-03-04' }),
        expect.objectContaining({ kind: 'rating', date: null }),
      ]),
    })
  })

  it('matches publication ranges against the full interval implied by date precision', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })

    const year = await repository.listBooks({
      ...baseQuery,
      publishedMode: 'range',
      publishedFrom: '1969-01-01',
      publishedTo: '1969-12-31',
    })
    expect(year.data).toHaveLength(1)

    database.exec(
      "UPDATE book_library_projection SET publication_date='1969-02', publication_precision='month' WHERE media_item_id='book-1'",
    )
    const endOfMonth = await repository.listBooks({
      ...baseQuery,
      publishedMode: 'range',
      publishedFrom: '1969-02-28',
      publishedTo: '1969-02-28',
    })
    expect(endOfMonth.data).toHaveLength(1)
    const nextMonth = await repository.listBooks({
      ...baseQuery,
      publishedMode: 'range',
      publishedFrom: '1969-03-01',
    })
    expect(nextMonth.data).toHaveLength(0)
  })

  it('paginates deterministically through consecutive unknown sort values', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })
    database.exec(`
      INSERT INTO media_items(id, type, title, created_at, updated_at) VALUES
        ('book-2', 'book', 'Alpha Unknown', '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z'),
        ('book-3', 'book', 'Beta Unknown', '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z');
      INSERT INTO book_library_projection(
        media_item_id, connection_id, user_book_id, work_id, title, normalized_title,
        current_status_id, in_queue, in_archive, currently_reading,
        supported_read_count, source_refreshed_at
      ) VALUES
        ('book-2', 'connection-hardcover', 2, 20, 'Alpha Unknown', 'alpha unknown',
          1, 1, 0, 0, 0, '2026-09-20T10:01:00.000Z'),
        ('book-3', 'connection-hardcover', 3, 30, 'Beta Unknown', 'beta unknown',
          1, 1, 0, 0, 0, '2026-09-20T10:01:00.000Z');
    `)

    const first = await repository.listBooks({
      ...baseQuery,
      collection: 'queue',
      sort: 'author',
      limit: 2,
    })
    expect(first.data.map((item) => item.title)).toEqual([
      'The Left Hand of Darkness',
      'Alpha Unknown',
    ])
    expect(first.nextCursor).not.toBeNull()

    const second = await repository.listBooks({
      ...baseQuery,
      collection: 'queue',
      sort: 'author',
      limit: 2,
      cursor: first.nextCursor!,
    })
    expect(second.data.map((item) => item.title)).toEqual(['Beta Unknown'])
  })
})
