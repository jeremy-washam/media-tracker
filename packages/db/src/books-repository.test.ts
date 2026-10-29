import { applyTestMigrations, SqliteTestClient as SqliteClient } from './test-support/sqlite'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SqlBooksRepository, type HardcoverBookProjection } from './books-repository'

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
  let client: SqliteClient

  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    applyTestMigrations(database)
    seedLedger(database)
    client = new SqliteClient(database)
    repository = new SqlBooksRepository(client)
  })

  afterEach(() => database.close())

  it('stores running execution progress separately from complete cursors and enforces ownership', async () => {
    database.exec("UPDATE sync_runs SET status='running',finished_at=NULL WHERE id='run-1'")
    const progress = {
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      checkpoint: { afterId: 50 },
      updatedAt: '2026-01-01T00:00:00Z',
    }
    await repository.saveHardcoverSyncProgress(progress)
    expect(await repository.findHardcoverSyncProgress(progress.connectionId)).toEqual(progress)
    await repository.saveHardcoverSyncProgress({ ...progress, checkpoint: { afterId: 100 } })
    expect((await repository.findHardcoverSyncProgress(progress.connectionId))?.checkpoint).toEqual(
      { afterId: 100 },
    )
    expect(await repository.findHardcoverSyncProgress('absent')).toBeNull()
    await expect(
      repository.saveHardcoverSyncProgress({ ...progress, connectionId: 'other' }),
    ).rejects.toThrow('same Hardcover connection')
    expect(() =>
      database.exec(
        "INSERT INTO sync_cursors(id,connection_id,name,checkpoint_json,committed_at,sync_run_id) VALUES('cursor','connection-hardcover','library-books','{}','2026-01-01','run-1')",
      ),
    ).toThrow('completed sync run')
  })

  it('upgrades populated Books facts and backfills formats without changing provenance', async () => {
    const upgrade = new DatabaseSync(':memory:')
    try {
      applyTestMigrations(upgrade, { through: '0003_books_library.sql' })
      seedLedger(upgrade)
      upgrade.exec(`INSERT INTO hardcover_user_books(connection_id,user_book_id,media_item_id,work_id,status_id,personal_rating,review_text,source_record_id,last_seen_run_id,upstream_state,first_observed_at,last_observed_at)
        VALUES('connection-hardcover',1,'book-1',2,2,4.5,'Retained legacy review','record-1','run-1','active','2026-09-20','2026-09-20')`)
      const legacyFacts = upgrade
        .prepare('SELECT personal_rating,review_text,source_record_id FROM hardcover_user_books')
        .get()
      upgrade.exec(
        readFileSync(new URL('../migrations/0004_books_review_facts.sql', import.meta.url), 'utf8'),
      )
      expect(
        upgrade
          .prepare('SELECT personal_rating,review_text,source_record_id FROM hardcover_user_books')
          .get(),
      ).toEqual(legacyFacts)
      expect(
        upgrade.prepare('SELECT reviewed_at FROM hardcover_user_books').get()?.reviewed_at,
      ).toBeNull()
      const oldRepository = new SqlBooksRepository(new SqliteClient(upgrade))
      await oldRepository.upsertHardcoverBooks([projection()])
      await oldRepository.finalizeHardcoverSnapshot({
        connectionId: 'connection-hardcover',
        syncRunId: 'run-1',
        refreshedAt: '2026-09-20T10:01:00.000Z',
      })
      const retained = () => ({
        reads: upgrade.prepare('SELECT * FROM hardcover_user_book_reads').all(),
        userBooks: upgrade.prepare('SELECT * FROM hardcover_user_books').all(),
        evidence: upgrade.prepare('SELECT * FROM source_records').all(),
        archive: upgrade.prepare('SELECT * FROM archive_entries').all(),
      })
      const before = retained()
      upgrade.exec(
        "UPDATE book_library_projection SET latest_read_format='physical book',current_edition_format='physical book',projection_version=1",
      )
      upgrade.exec(
        readFileSync(
          new URL('../migrations/0005_books_format_projection.sql', import.meta.url),
          'utf8',
        ),
      )
      expect(retained()).toEqual(before)
      expect(
        upgrade
          .prepare(
            'SELECT latest_read_format,current_edition_format,projection_version FROM book_library_projection',
          )
          .get(),
      ).toEqual({
        latest_read_format: 'Physical',
        current_edition_format: 'Physical',
        projection_version: 2,
      })
      expect(upgrade.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(upgrade.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
    } finally {
      upgrade.close()
    }
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

  it('keeps details available while a stable relationship moves to a new work ID', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })
    await repository.upsertHardcoverBooks([{ ...projection(), workId: 20 }])
    await expect(repository.findBook('book-1')).resolves.toMatchObject({
      title: 'The Left Hand of Darkness',
    })
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
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
    const legacy = JSON.parse(decodeURIComponent(first.nextCursor!))
    legacy.fingerprint = JSON.stringify({
      collection: 'queue',
      q: '',
      formats: [],
      series: [],
      genres: [],
      finished: ['any', '', ''],
      published: ['any', '', ''],
      added: ['any', '', ''],
      rating: ['any', null],
      sort: 'author',
      direction: 'asc',
    })
    const legacyNext = await repository.listBooks({
      ...baseQuery,
      collection: 'queue',
      sort: 'author',
      limit: 2,
      cursor: encodeURIComponent(JSON.stringify(legacy)),
    })
    expect(legacyNext.data).toEqual(second.data)
  })
  it('rolls back snapshot publication and retirement together, then retries without losing Archive', async () => {
    await repository.upsertHardcoverBooks([projection()])
    const first = {
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    }
    await repository.finalizeHardcoverSnapshot(first)
    database.exec(
      "INSERT INTO sync_runs(id,connection_id,kind,status,started_at) VALUES('run-2','connection-hardcover','reconcile','running','2026-09-21T10:00:00Z')",
    )
    const before = database.prepare('SELECT * FROM book_library_projection').all()
    database.exec(
      "CREATE TRIGGER reject_book_publication BEFORE INSERT ON book_library_projection BEGIN SELECT RAISE(ABORT,'synthetic publication failure'); END",
    )
    const next = { ...first, syncRunId: 'run-2', refreshedAt: '2026-09-21T10:01:00.000Z' }
    await expect(repository.finalizeHardcoverSnapshot(next)).rejects.toThrow(
      'synthetic publication failure',
    )
    expect(database.prepare('SELECT * FROM book_library_projection').all()).toEqual(before)
    expect(
      database.prepare('SELECT upstream_state FROM hardcover_user_books').get()?.upstream_state,
    ).toBe('active')
    database.exec('DROP TRIGGER reject_book_publication')
    await repository.finalizeHardcoverSnapshot(next)
    expect((await repository.listBooks(baseQuery)).data[0]?.memberships).toEqual({
      archive: true,
      queue: false,
      currentlyReading: false,
    })
    expect(database.prepare('SELECT COUNT(*) value FROM source_records').get()?.value).toBe(1)
  })

  it('replays partially committed metadata chunks before publishing a complete snapshot', async () => {
    const book = projection()
    const expanded = {
      ...book,
      contributors: Array.from({ length: 100 }, (_, index) => ({
        ...book.contributors[0]!,
        id: index + 100,
        name: `Synthetic ${index}`,
        position: index,
      })),
    }
    client.failOnBatchCall = client.batchCalls + 2
    await expect(repository.upsertHardcoverBooks([expanded])).rejects.toThrow(
      'synthetic batch failure',
    )
    expect(
      database.prepare('SELECT COUNT(*) value FROM book_library_projection').get()?.value,
    ).toBe(0)
    client.failOnBatchCall = null
    await repository.upsertHardcoverBooks([expanded])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00.000Z',
    })
    expect(
      database.prepare('SELECT COUNT(*) value FROM hardcover_work_contributors').get()?.value,
    ).toBe(100)
    expect((await repository.listBooks(baseQuery)).data).toHaveLength(1)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it.each([
    ['archive', 'recent_read'],
    ['archive', 'earliest_read'],
    ['archive', 'title'],
    ['archive', 'author'],
    ['archive', 'personal_rating'],
    ['archive', 'published'],
    ['queue', 'added'],
    ['queue', 'title'],
    ['queue', 'author'],
    ['queue', 'published'],
  ] as const)(
    'traverses every %s/%s page exactly once across tied and null values',
    async (collection, sort) => {
      for (let index = 0; index < 6; index += 1) {
        const id = `page-${index}`
        database
          .prepare('INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES(?,?,?,?,?)')
          .run(id, 'book', 'Tied', '2026-01-01', '2026-01-01')
        database
          .prepare(
            `INSERT INTO book_library_projection(media_item_id,connection_id,user_book_id,work_id,title,normalized_title,current_status_id,in_queue,in_archive,currently_reading,supported_read_count,source_refreshed_at,latest_read_date,normalized_primary_author,personal_rating,publication_date,queue_added_at)
        VALUES(?,'connection-hardcover',?,?,'Tied','tied',2,1,1,1,1,'2026-01-01',?,?,?,?,?)`,
          )
          .run(
            id,
            index + 10,
            index + 10,
            ...(index < 3
              ? [null, null, null, null, null]
              : ['2026-01-01', 'Tied', 4, '2026-01-01', '2026-01-01']),
          )
      }
      for (const direction of ['asc', 'desc'] as const) {
        const input = { ...baseQuery, collection, sort, direction }
        const expected = (await repository.listBooks(input)).data.map((row) => row.id)
        for (const limit of [1, 2]) {
          const seen: string[] = []
          let cursor: string | undefined
          do {
            const page = await repository.listBooks({
              ...input,
              limit,
              ...(cursor ? { cursor } : {}),
            })
            seen.push(...page.data.map((row) => row.id))
            cursor = page.nextCursor ?? undefined
            expect(seen.length).toBeLessThanOrEqual(expected.length)
          } while (cursor)
          expect(seen).toEqual(expected)
          expect(new Set(seen).size).toBe(6)
        }
      }
    },
  )

  it('keeps cursors bounded when selected genre labels are long', async () => {
    await repository.upsertHardcoverBooks([projection()])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00Z',
    })
    // Repeated selected values are semantically harmless but previously copied
    // their entire query identity into every cursor.
    const input = { ...baseQuery, genres: Array(30).fill('science-fiction'.repeat(20)), limit: 1 }
    const known = await repository.listBooks({ ...input, genres: ['science-fiction'] })
    expect(known.data).toHaveLength(1)
    const other = {
      ...projection(),
      mediaItemId: 'book-2',
      userBookId: 2,
      workId: 4,
      editions: [],
      reads: [],
    }
    database.exec(
      "INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES('book-2','book','Second','2026-01-01','2026-01-01'); INSERT INTO archive_entries(id,media_item_id,connection_id,source_occurrence_key,admission_reason,upstream_state,created_at,updated_at) VALUES('archive-2','book-2','connection-hardcover','second','hardcover_read_status','active','2026-01-01','2026-01-01')",
    )
    await repository.upsertHardcoverBooks([other])
    await repository.finalizeHardcoverSnapshot({
      connectionId: 'connection-hardcover',
      syncRunId: 'run-1',
      refreshedAt: '2026-09-20T10:01:00Z',
    })
    const page = await repository.listBooks({
      ...input,
      genres: [...input.genres, 'science-fiction'],
    })
    expect(page.nextCursor).not.toBeNull()
    expect(page.nextCursor!.length).toBeLessThan(1000)
    await expect(
      repository.listBooks({
        ...input,
        genres: [...input.genres, 'science-fiction'],
        cursor: page.nextCursor!,
      }),
    ).resolves.toMatchObject({ nextCursor: null })
  })
})
