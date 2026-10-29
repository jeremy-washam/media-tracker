import { applyTestMigrations, SqliteTestClient as SqliteClient } from './test-support/sqlite'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SqlArticlesRepository,
  type ArticlesListInput,
  type ReaderArticleDocumentProjection,
} from './articles-repository'

const now = '2026-09-20T12:00:00.000Z'
function projection(
  overrides: Partial<ReaderArticleDocumentProjection> = {},
): ReaderArticleDocumentProjection {
  return {
    id: 'readwise-doc-1',
    connectionId: 'readwise-1',
    documentId: 'doc-1',
    mediaItemId: 'article-1',
    externalIdentityId: 'identity-1',
    sourceRecordId: 'source-1',
    snapshotRunId: 'run-1',
    observedAt: now,
    readerUrl: 'https://read.readwise.io/read/doc-1',
    sourceUrl: 'https://example.com/article',
    rawCategory: 'article',
    subtype: 'article',
    currentLocation: 'later',
    title: 'The Example',
    author: 'Ada Author',
    publication: 'Example Journal',
    acquisitionSource: 'example.com',
    summary: 'A summary',
    imageUrl: null,
    documentNote: 'Remember this',
    wordCount: 1000,
    readingTimeRaw: '6 mins',
    readingTimeMinutes: 6,
    listeningTimeRaw: null,
    readingProgress: 0.4,
    progressValid: true,
    publishedAt: { value: '1969', precision: 'year', basis: 'source_asserted' },
    createdAt: now,
    savedAt: now,
    firstOpenedAt: now,
    lastOpenedAt: now,
    lastMovedAt: now,
    updatedAt: now,
    tags: [{ key: 'favorite', name: 'Favorite', type: 'manual', created: '1' }],
    ...overrides,
  }
}

function articleInput(overrides: Partial<ArticlesListInput> = {}): ArticlesListInput {
  return {
    section: 'archive',
    types: [],
    authors: [],
    publications: [],
    publishedUnknown: false,
    readingTimes: [],
    progress: [],
    archivedUnknown: false,
    currentStates: [],
    queueStates: [],
    addedUnknown: false,
    arrivedUnknown: false,
    opened: [],
    history: [],
    limit: 50,
    ...overrides,
  }
}

describe('SqlArticlesRepository', () => {
  let database: DatabaseSync, repository: SqlArticlesRepository
  beforeEach(() => {
    database = new DatabaseSync(':memory:')
    applyTestMigrations(database)
    database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at) VALUES('readwise-1','readwise','Reader','connected','partial','${now}','${now}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at) VALUES('run-1','readwise-1','backfill','running','${now}',NULL);
      INSERT INTO raw_objects(id,connection_id,sync_run_id,kind,acquisition_key,storage_key,sha256,content_type,byte_length,acquired_at,processing_status) VALUES('raw-1','readwise-1','run-1','api_page','page','raw/page.json','${'a'.repeat(64)}','application/json',1,'${now}','processed');
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,observed_at,parser_version,disposition,upstream_state) VALUES
        ('source-1','raw-1','readwise-1','reader_document','$.results[0]','reader-document:doc-1','${now}','readwise-documents@3','normalized','active'),
        ('source-2','raw-1','readwise-1','reader_document','$.results[1]','reader-document:doc-1','${now}','readwise-documents@3','normalized','active'),
        ('snapshot-1','raw-1','readwise-1','reader_documents_snapshot','$snapshot','snapshot','${now}','readwise-documents@3','normalized','active');
      INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES('article-1','article','The Example','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,connection_id,first_observed_source_record_id,last_observed_source_record_id) VALUES('identity-1','article-1','readwise','document_id','doc-1','connection','readwise-1','source-1','source-1');
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,source_occurrence_key,admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at) VALUES('archive-1','article-1','readwise-1','identity-1','reader-document:doc-1','readwise_archive_state','2025-01-01','day','inferred','removed','${now}','${now}');
    `)
    repository = new SqlArticlesRepository(new SqliteClient(database))
  })
  afterEach(() => database.close())

  it('retains Archive history while current Queue and Feed state changes', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    expect(
      database.prepare("SELECT upstream_state FROM archive_entries WHERE id='archive-1'").get(),
    ).toEqual({ upstream_state: 'active' })
    expect(
      database
        .prepare(
          "SELECT in_archive,in_queue,in_feed FROM article_library_projection WHERE media_item_id='article-1'",
        )
        .get(),
    ).toEqual({ in_archive: 1, in_queue: 1, in_feed: 0 })

    await repository.applyDocumentsPage([
      projection({ sourceRecordId: 'source-2', snapshotRunId: null, currentLocation: 'feed' }),
    ])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    expect(
      database
        .prepare(
          "SELECT in_archive,in_queue,in_feed FROM article_library_projection WHERE media_item_id='article-1'",
        )
        .get(),
    ).toEqual({ in_archive: 1, in_queue: 0, in_feed: 1 })
    expect(database.prepare('SELECT upstream_state FROM queue_entries').get()).toEqual({
      upstream_state: 'removed',
    })
  })

  it('matches a year-precision publication against dates inside that year', async () => {
    await repository.applyDocumentsPage([projection()])
    expect(
      database.prepare('SELECT reading_time_parser_version FROM readwise_documents').get(),
    ).toEqual({
      reading_time_parser_version: 2,
    })
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const page = await repository.listArticles({
      section: 'queue',
      types: [],
      authors: [],
      publications: [],
      publishedFrom: '1969-06-01',
      publishedTo: '1969-06-30',
      publishedUnknown: false,
      readingTimes: [],
      progress: [],
      archivedUnknown: false,
      currentStates: [],
      queueStates: [],
      addedUnknown: false,
      arrivedUnknown: false,
      opened: [],
      history: [],
      limit: 50,
    })
    expect(page.data.map((item) => item.id)).toEqual(['article-1'])
  })

  it('includes the full end date and reports the latest matching Archive occurrence', async () => {
    await repository.applyDocumentsPage([projection()])
    database.exec(`
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES
        ('archive-2','article-1','readwise-1','identity-1','reader-document:doc-1:second',
          'readwise_archive_state','2026-09-20T23:59:59.000Z','instant','source_asserted','active','${now}','${now}'),
        ('archive-3','article-1','readwise-1','identity-1','reader-document:doc-1:third',
          'readwise_archive_state','2026-09-21T01:00:00.000Z','instant','source_asserted','active','${now}','${now}');
    `)
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })

    const page = await repository.listArticles(
      articleInput({ archivedFrom: '2026-09-20', archivedTo: '2026-09-20' }),
    )
    expect(page.data).toHaveLength(1)
    expect(page.data[0]?.archive.latestAt).toBe('2026-09-20T23:59:59.000Z')
    expect(page.occurrenceCount).toBe(1)
  })

  it('honors descending sorts and aggregates multiple Reader identities', async () => {
    database.exec(`
      INSERT INTO source_records(id,raw_object_id,connection_id,record_type,record_path,source_record_key,
        observed_at,parser_version,disposition,upstream_state)
      VALUES('source-3','raw-1','readwise-1','reader_document','$.results[2]','reader-document:doc-2',
        '${now}','readwise-documents@4','normalized','active');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,connection_id,
        first_observed_source_record_id,last_observed_source_record_id)
      VALUES('identity-2','article-1','readwise','document_id','doc-2','connection','readwise-1','source-3','source-3');
    `)
    await repository.applyDocumentsPage([
      projection({ title: 'Alpha', currentLocation: 'later' }),
      projection({
        id: 'readwise-doc-2',
        documentId: 'doc-2',
        externalIdentityId: 'identity-2',
        sourceRecordId: 'source-3',
        title: 'Zeta',
        currentLocation: 'feed',
        tags: [],
      }),
    ])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@4',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const row = database
      .prepare(
        "SELECT in_queue,in_feed,current_available FROM article_library_projection WHERE media_item_id='article-1'",
      )
      .get()
    expect(row).toEqual({ in_queue: 1, in_feed: 1, current_available: 1 })
    const feedState = await repository.listArticles(
      articleInput({ section: 'archive', currentStates: ['feed'] }),
    )
    expect(feedState.data.map((item) => item.id)).toEqual(['article-1'])
    expect(feedState.facets.currentStates.find((item) => item.value === 'feed')?.count).toBe(1)

    database.exec(`
      INSERT INTO media_items(id,type,title,created_at,updated_at) VALUES('article-2','article','Zeta','${now}','${now}');
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,connection_id,
        first_observed_source_record_id,last_observed_source_record_id)
      VALUES('identity-3','article-2','readwise','document_id','doc-3','connection','readwise-1','source-3','source-3');
    `)
    await repository.applyDocumentsPage([
      projection({
        id: 'readwise-doc-3',
        documentId: 'doc-3',
        mediaItemId: 'article-2',
        externalIdentityId: 'identity-3',
        sourceRecordId: 'source-3',
        title: 'Zeta',
        currentLocation: 'shortlist',
        tags: [],
      }),
    ])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const page = await repository.listArticles(
      articleInput({ section: 'queue', sort: 'title', direction: 'desc' }),
    )
    expect(page.data.map((item) => item.title)).toEqual(['Zeta', 'Alpha'])
    const byState = await repository.listArticles(
      articleInput({ section: 'queue', sort: 'queueState', direction: 'asc' }),
    )
    expect(byState.data.map((item) => item.queue.state)).toEqual(['shortlist', 'later'])

    const firstPage = await repository.listArticles(
      articleInput({ section: 'queue', sort: 'title', direction: 'desc', limit: 1 }),
    )
    expect(firstPage.nextCursor).not.toBeNull()
    await expect(
      repository.listArticles(
        articleInput({
          section: 'queue',
          sort: 'title',
          direction: 'desc',
          limit: 1,
          cursor: `${firstPage.nextCursor}x`,
        }),
      ),
    ).rejects.toThrow('Invalid Articles pagination cursor')
    database.exec(
      "UPDATE readwise_projection_state SET content_index_version=content_index_version+1 WHERE connection_id='readwise-1'",
    )
    await expect(
      repository.listArticles(
        articleInput({
          section: 'queue',
          sort: 'title',
          direction: 'desc',
          limit: 1,
          cursor: firstPage.nextCursor!,
        }),
      ),
    ).rejects.toThrow('Invalid Articles pagination cursor')
  })

  it('removes stale Article and Queue projections when a document changes category', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.retireArticleDocuments([
      {
        connectionId: 'readwise-1',
        documentId: 'doc-1',
        rawCategory: 'book',
        currentLocation: 'later',
        sourceRecordId: 'source-2',
        snapshotRunId: 'run-1',
        observedAt: now,
      },
    ])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    expect(database.prepare('SELECT COUNT(*) count FROM article_library_projection').get()).toEqual(
      {
        count: 0,
      },
    )
    expect(database.prepare('SELECT upstream_state FROM queue_entries').get()).toEqual({
      upstream_state: 'removed',
    })
  })

  it('returns every Reader identity and scopes Archive disposition to its identity', async () => {
    database.exec(`
      INSERT INTO external_identities(id,media_item_id,namespace,external_type,external_id,scope,connection_id,
        first_observed_source_record_id,last_observed_source_record_id)
      VALUES
        ('identity-2','article-1','readwise','document_id','doc-2','connection','readwise-1','source-2','source-2'),
        ('identity-3','article-1','readwise','document_id','doc-3','connection','readwise-1','source-2','source-2');
      INSERT INTO archive_entries(id,media_item_id,connection_id,consumed_identity_id,source_occurrence_key,
        admission_reason,consumed_at_value,consumed_at_precision,consumed_at_basis,upstream_state,created_at,updated_at)
      VALUES
        ('archive-2','article-1','readwise-1','identity-2','reader-document:doc-2',
          'readwise_archive_state','2025-02-01','day','inferred','active','${now}','${now}'),
        ('archive-3','article-1','readwise-1','identity-3','reader-document:doc-3',
          'readwise_archive_state','2025-03-01','day','inferred','active','${now}','${now}');
    `)
    await repository.applyDocumentsPage([
      projection({ currentLocation: 'archive' }),
      projection({
        id: 'readwise-doc-2',
        documentId: 'doc-2',
        externalIdentityId: 'identity-2',
        sourceRecordId: 'source-2',
        currentLocation: 'later',
        tags: [],
      }),
      projection({
        id: 'readwise-doc-3',
        documentId: 'doc-3',
        externalIdentityId: 'identity-3',
        sourceRecordId: 'source-2',
        currentLocation: 'archive',
        tags: [],
      }),
    ])
    database.exec(
      "UPDATE readwise_documents SET upstream_state='unknown' WHERE document_id='doc-3'",
    )
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })

    const detail = await repository.findArticle('article-1')
    expect(detail?.readerRelationships).toEqual([
      expect.objectContaining({ documentId: 'doc-1', location: 'archive', available: true }),
      expect.objectContaining({ documentId: 'doc-2', location: 'later', available: true }),
      expect.objectContaining({ documentId: 'doc-3', location: 'archive', available: false }),
    ])
    const history = await repository.listArticleHistory('article-1', { limit: 25 })
    expect(
      Object.fromEntries(history.data.map((entry) => [entry.archiveEntryId, entry.disposition])),
    ).toEqual({
      'archive-1': 'current',
      'archive-2': 'retained',
      'archive-3': 'retained',
    })
  })

  it('combines repeated reading-time, progress, and current-state values with OR', async () => {
    await repository.applyDocumentsPage([
      projection({ readingTimeMinutes: 15, readingTimeRaw: '15 mins' }),
    ])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const page = await repository.listArticles({
      section: 'archive',
      types: [],
      authors: [],
      publications: [],
      publishedUnknown: false,
      readingTimes: ['under5', '5to15'],
      progress: ['notOpened', 'inProgress'],
      archivedUnknown: false,
      currentStates: ['feed', 'later'],
      queueStates: [],
      addedUnknown: false,
      arrivedUnknown: false,
      opened: [],
      history: [],
      limit: 50,
    })
    expect(page.data.map((item) => item.id)).toEqual(['article-1'])
  })

  it('exposes a retained Archive item as unavailable after a complete snapshot omission', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    database.exec(
      `INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at) VALUES('run-2','readwise-1','reconcile','running','${now}',NULL)`,
    )
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-2',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-2',
      rebuiltAt: now,
    })
    const page = await repository.listArticles({
      section: 'archive',
      types: [],
      authors: [],
      publications: [],
      publishedUnknown: false,
      readingTimes: [],
      progress: [],
      archivedUnknown: false,
      currentStates: ['unknown'],
      queueStates: [],
      addedUnknown: false,
      arrivedUnknown: false,
      opened: [],
      history: [],
      limit: 50,
    })
    expect(page.data.map((item) => item.id)).toEqual(['article-1'])
  })

  it('returns detail tags and retained history without fabricating activity rows', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    expect((await repository.findArticle('article-1'))?.tags).toEqual([
      { key: 'favorite', name: 'Favorite', type: 'manual' },
    ])
    const history = await repository.listArticleHistory('article-1', { limit: 25 })
    expect(history.data).toHaveLength(1)
    expect(history.data[0]?.disposition).toBe('retained')
  })

  it('stores deletion evidence without exposing deleted or discarded highlight text', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.applyHighlightContainers([
      {
        id: 'container-1',
        connectionId: 'readwise-1',
        userBookId: 41,
        externalId: 'doc-1',
        source: 'reader',
        title: 'The Example',
        author: 'Ada Author',
        category: 'articles',
        sourceUrl: 'https://example.com/article',
        documentNote: null,
        deleted: false,
        sourceUpdatedAt: now,
        sourceRecordId: 'source-1',
        observedAt: now,
        highlights: [
          {
            id: 'highlight-1',
            highlightId: 1,
            deleted: false,
            text: 'Visible highlight',
            note: 'Visible note',
            location: 2,
            endLocation: 3,
            locationType: 'order',
            color: 'yellow',
            favorite: true,
            discard: false,
            highlightedAt: now,
            createdAt: now,
            updatedAt: now,
            readerUrl: 'https://readwise.io/open/1',
          },
          {
            id: 'highlight-2',
            highlightId: 2,
            deleted: true,
            text: 'Deleted highlight',
            note: null,
            location: null,
            endLocation: null,
            locationType: null,
            color: null,
            favorite: false,
            discard: false,
            highlightedAt: null,
            createdAt: now,
            updatedAt: now,
            readerUrl: null,
          },
          {
            id: 'highlight-3',
            highlightId: 3,
            deleted: false,
            text: 'Discarded highlight',
            note: null,
            location: null,
            endLocation: null,
            locationType: null,
            color: null,
            favorite: false,
            discard: true,
            highlightedAt: null,
            createdAt: now,
            updatedAt: now,
            readerUrl: null,
          },
        ],
      },
    ])
    await repository.finalizeHighlightsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      completedAt: now,
      parserVersion: 'readwise-highlights@1',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })

    expect(await repository.listArticleHighlights('article-1', { limit: 20 })).toMatchObject({
      data: [{ id: '1', text: 'Visible highlight', note: 'Visible note' }],
      nextCursor: null,
    })
    expect(
      database
        .prepare('SELECT highlight_id,text,note,upstream_state,is_discard FROM readwise_highlights')
        .all(),
    ).toEqual([
      {
        highlight_id: 1,
        text: 'Visible highlight',
        note: 'Visible note',
        upstream_state: 'active',
        is_discard: 0,
      },
      { highlight_id: 2, text: null, note: null, upstream_state: 'removed', is_discard: 0 },
      { highlight_id: 3, text: null, note: null, upstream_state: 'active', is_discard: 1 },
    ])
  })

  it('reserves current Archive and Queue content once', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })

    expect(await repository.reserveContentTargets('readwise-1', 'reservation-1', now)).toEqual([
      {
        connectionId: 'readwise-1',
        documentId: 'doc-1',
        readwiseDocumentId: 'readwise-doc-1',
        mediaItemId: 'article-1',
        sourceUpdatedAt: now,
      },
    ])
    expect(await repository.reserveContentTargets('readwise-1', 'reservation-2', now)).toEqual([])
  })

  it('re-reserves transiently failed or stale content jobs but not permanent failures', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@4',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const [target] = await repository.reserveContentTargets('readwise-1', 'run-1', now)
    expect(target).toBeDefined()
    const key = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    database.exec(
      "UPDATE sync_runs SET status='failed',finished_at='2026-09-20T12:01:00.000Z' WHERE id='run-1'",
    )
    expect(await repository.reserveContentTargets('readwise-1', 'reservation-retry', now)).toEqual([
      target,
    ])
    await repository.failContentJob(key, now, 'ReadwiseApiError')
    expect(await repository.reserveContentTargets('readwise-1', 'reservation-2', now)).toEqual([
      target,
    ])
    await repository.failContentJob(key, now, 'content_unavailable')
    expect(
      await repository.reserveContentTargets(
        'readwise-1',
        'reservation-3',
        '2026-09-20T12:31:00.000Z',
      ),
    ).toEqual([])

    await repository.failContentJob(key, now, 'ReadwiseApiError')
    await repository.startContentJob(key, now)
    expect(
      await repository.reserveContentTargets(
        'readwise-1',
        'reservation-4',
        '2026-09-20T12:31:00.000Z',
      ),
    ).toEqual([target])
  })

  it('honors durable article not-before deadlines in reservation and duplicate delivery', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.reserveContentTargets('readwise-1', 'first', now, 1)
    const key = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    expect(await repository.startContentJob(key, now)).toBe(1)
    await repository.deferContentJob(key, now, '2026-09-22T12:00:00.000Z')
    expect(await repository.startContentJob(key, '2026-09-21T12:00:00.000Z')).toBeNull()
    expect(
      await repository.reserveContentTargets('readwise-1', 'early', '2026-09-21T12:00:00.000Z', 1),
    ).toEqual([])
    expect(
      await repository.reserveContentTargets('readwise-1', 'due', '2026-09-22T12:00:00.000Z', 1),
    ).toHaveLength(1)
    expect(await repository.startContentJob(key, '2026-09-22T12:00:00.000Z')).toBe(2)
    await repository.completeContentJob(key, '2026-09-22T12:01:00.000Z')
    expect(await repository.startContentJob(key, '2026-09-23T12:00:00.000Z')).toBeNull()
  })

  it('stops acquisition retries per source version and admits a newer version', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.reserveContentTargets('readwise-1', 'first', now, 1)
    const key = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    for (let attempt = 0; attempt < 3; attempt++) {
      await repository.startContentJob(key, now)
      await repository.failContentJob(key, now, 'transient_failure')
    }
    expect(
      await repository.reserveContentTargets(
        'readwise-1',
        'exhausted',
        '2026-09-21T12:00:00.000Z',
        1,
      ),
    ).toEqual([])
    expect(await repository.startContentJob(key, now)).toBeNull()
    await repository.applyDocumentsPage([projection({ updatedAt: '2026-09-21T12:00:00.000Z' })])
    expect(
      await repository.reserveContentTargets(
        'readwise-1',
        'new-version',
        '2026-09-21T12:00:00.000Z',
        1,
      ),
    ).toEqual([expect.objectContaining({ sourceUpdatedAt: '2026-09-21T12:00:00.000Z' })])
    expect(database.prepare('SELECT COUNT(*) count FROM article_content_jobs').get()).toEqual({
      count: 2,
    })
  })

  it.each([0, 101, 1.5])(
    'rejects invalid content reservation size %s before writing',
    async (limit) => {
      await expect(
        repository.reserveContentTargets('readwise-1', 'invalid', now, limit),
      ).rejects.toThrow('reservation limit')
      expect(database.prepare('SELECT COUNT(*) count FROM article_content_jobs').get()).toEqual({
        count: 0,
      })
    },
  )

  it('indexes selectively acquired content without making it authoritative', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@3',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.applyContent({
      connectionId: 'readwise-1',
      documentId: 'doc-1',
      readwiseDocumentId: 'readwise-doc-1',
      mediaItemId: 'article-1',
      sourceUpdatedAt: now,
      manifestId: 'manifest-1',
      rawObjectKey: 'content/raw.html',
      rawSha256: 'a'.repeat(64),
      extractedObjectKey: 'content/text.txt',
      extractedSha256: 'b'.repeat(64),
      acquiredAt: now,
      processedAt: now,
      coverage: 'full',
      chunks: [
        {
          ordinal: 0,
          byteStart: 0,
          byteLength: 24,
          sha256: 'c'.repeat(64),
          text: 'unmistakable hidden phrase',
        },
      ],
    })
    expect(database.prepare('SELECT state FROM article_content_manifests').get()).toEqual({
      state: 'ready',
    })
    expect(
      database
        .prepare(
          'SELECT rowid FROM article_content_search WHERE article_content_search MATCH \'"unmistakable"* AND "hidden"*\'',
        )
        .all(),
    ).toHaveLength(1)
    expect(
      database
        .prepare(
          'SELECT cm.media_item_id FROM article_content_search cs JOIN article_content_search_map sm ON sm.rowid=cs.rowid JOIN article_content_manifests cm ON cm.id=sm.manifest_id WHERE cm.state=\'ready\' AND article_content_search MATCH \'"unmistakable"* AND "hidden"*\'',
        )
        .all(),
    ).toEqual([{ media_item_id: 'article-1' }])
    const page = await repository.listArticles({
      section: 'queue',
      q: 'unmistakable hidden',
      types: [],
      authors: [],
      publications: [],
      publishedUnknown: false,
      readingTimes: [],
      progress: [],
      archivedUnknown: false,
      currentStates: [],
      queueStates: [],
      addedUnknown: false,
      arrivedUnknown: false,
      opened: [],
      history: [],
      limit: 50,
    })
    expect(page.data.map((item) => item.id)).toEqual(['article-1'])
    expect(page.capabilities.fullTextSearch).toBe(true)
    expect(page.data[0]?.searchExcerpt).toEqual({ source: 'text', text: null })
  })

  it('keeps staged multi-batch content hidden until the final atomic promotion', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@4',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.reserveContentTargets('readwise-1', 'reservation-1', now)
    const idempotencyKey = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    await repository.beginContent({
      connectionId: 'readwise-1',
      documentId: 'doc-1',
      readwiseDocumentId: 'readwise-doc-1',
      mediaItemId: 'article-1',
      sourceUpdatedAt: now,
      manifestId: 'manifest-staged',
      rawObjectKey: 'content/raw.html',
      rawSha256: 'a'.repeat(64),
      extractedObjectKey: 'content/text.txt',
      extractedSha256: 'b'.repeat(64),
      acquiredAt: now,
      processedAt: now,
      coverage: 'full',
    })
    const contentChunks = Array.from({ length: 13 }, (_, ordinal) => ({
      ordinal,
      byteStart: ordinal * 10,
      byteLength: 9,
      sha256: String(ordinal).padStart(64, '0'),
      text: `chunk ${ordinal}`,
    }))
    await repository.applyContentChunkBatch('manifest-staged', contentChunks.slice(0, 12))
    expect(await repository.hasContentChunkRange('manifest-staged', 13)).toBe(false)
    await repository.failContentJob(idempotencyKey, now, 'synthetic_indexing_failure')
    expect(await repository.findContentManifest('manifest-staged')).toMatchObject({
      state: 'failed',
    })
    await repository.resumeContentManifest('manifest-staged')
    expect(await repository.findContentManifest('manifest-staged')).toMatchObject({
      state: 'pending',
    })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) value FROM article_content_chunks WHERE manifest_id='manifest-staged'",
        )
        .get()?.value,
    ).toBe(12)

    expect(
      database
        .prepare("SELECT state FROM article_content_manifests WHERE id='manifest-staged'")
        .get(),
    ).toEqual({
      state: 'pending',
    })
    expect(database.prepare('SELECT COUNT(*) count FROM article_content_search').get()).toEqual({
      count: 12,
    })
    await repository.applyContentChunkBatch('manifest-staged', contentChunks.slice(12))
    expect(await repository.hasContentChunkRange('manifest-staged', 13)).toBe(true)
    database.exec(
      "INSERT INTO article_content_search(article_content_search,rowid,content) SELECT 'delete',rowid,'chunk 0' FROM article_content_search_map WHERE manifest_id='manifest-staged' AND chunk_ordinal=0",
    )
    expect(await repository.hasContentChunkRange('manifest-staged', 13)).toBe(false)
    await repository.applyContentChunkBatch('manifest-staged', contentChunks.slice(0, 1))
    expect(await repository.hasContentChunkRange('manifest-staged', 13)).toBe(true)
    expect(
      database
        .prepare("SELECT state FROM article_content_manifests WHERE id='manifest-staged'")
        .get(),
    ).toEqual({
      state: 'pending',
    })
    await repository.finalizeContent('manifest-staged', idempotencyKey, now)
    expect(
      database
        .prepare(
          "SELECT m.state,j.status,s.content_index_version FROM article_content_manifests m JOIN article_content_jobs j ON j.idempotency_key=? JOIN readwise_projection_state s ON s.connection_id='readwise-1' WHERE m.id='manifest-staged'",
        )
        .get(idempotencyKey),
    ).toEqual({ state: 'ready', status: 'completed', content_index_version: 2 })
  })

  it('exposes an exhausted indexing failure instead of a permanently pending manifest', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@4',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.reserveContentTargets('readwise-1', 'reservation-1', now)
    const idempotencyKey = `readwise-content:readwise-1:doc-1:${now}:a1:e1`
    await repository.beginContent({
      connectionId: 'readwise-1',
      documentId: 'doc-1',
      readwiseDocumentId: 'readwise-doc-1',
      mediaItemId: 'article-1',
      sourceUpdatedAt: now,
      manifestId: 'manifest-failed',
      rawObjectKey: 'content/raw.html',
      rawSha256: 'a'.repeat(64),
      extractedObjectKey: 'content/missing.txt',
      extractedSha256: 'b'.repeat(64),
      acquiredAt: now,
      processedAt: now,
      coverage: 'full',
    })
    await repository.failContentJob(idempotencyKey, now, 'R2ObjectMissing')
    expect((await repository.findArticle('article-1'))?.content).toEqual({
      available: false,
      state: 'failed',
      coverage: 'full',
      failureClass: 'R2ObjectMissing',
    })
  })

  it('does not reacquire a null-updated document after raw evidence and indexing complete', async () => {
    await repository.applyDocumentsPage([projection({ updatedAt: null })])
    await repository.finalizeDocumentsSnapshot({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      snapshotSourceRecordId: 'snapshot-1',
      completedAt: now,
      parserVersion: 'readwise-documents@4',
    })
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    await repository.reserveContentTargets('readwise-1', 'reservation-1', now)
    const idempotencyKey = 'readwise-content:readwise-1:doc-1:unknown:a1:e1'
    await repository.recordContentRawAcquisition({
      id: `${idempotencyKey}:attempt:1`,
      idempotencyKey,
      attemptNumber: 1,
      connectionId: 'readwise-1',
      readwiseDocumentId: 'readwise-doc-1',
      storageKey: 'raw/response.json',
      sha256: 'a'.repeat(64),
      contentType: 'application/json',
      byteLength: 2,
      acquiredAt: now,
      status: 'processed',
    })
    await repository.beginContent({
      connectionId: 'readwise-1',
      documentId: 'doc-1',
      readwiseDocumentId: 'readwise-doc-1',
      mediaItemId: 'article-1',
      sourceUpdatedAt: null,
      manifestId: 'manifest-null-date',
      rawObjectKey: 'content/raw.html',
      rawSha256: 'b'.repeat(64),
      extractedObjectKey: 'content/text.txt',
      extractedSha256: 'c'.repeat(64),
      acquiredAt: now,
      processedAt: now,
      coverage: 'full',
    })
    await repository.finalizeContent('manifest-null-date', idempotencyKey, now)
    expect(
      await repository.reserveContentTargets(
        'readwise-1',
        'reservation-2',
        '2026-09-20T13:00:00.000Z',
      ),
    ).toEqual([])
  })
  it('does not let old indexing completion displace content for the latest source version', async () => {
    await repository.applyDocumentsPage([projection()])
    await repository.rebuildProjection({
      connectionId: 'readwise-1',
      syncRunId: 'run-1',
      rebuiltAt: now,
    })
    const base = {
      connectionId: 'readwise-1',
      documentId: 'doc-1',
      readwiseDocumentId: 'readwise-doc-1',
      mediaItemId: 'article-1',
      rawObjectKey: 'raw',
      rawSha256: 'a'.repeat(64),
      extractedObjectKey: 'text',
      extractedSha256: 'b'.repeat(64),
      acquiredAt: now,
      processedAt: now,
      coverage: 'full' as const,
    }
    await repository.beginContent({ ...base, manifestId: 'old-content', sourceUpdatedAt: now })
    const latest = '2026-09-21T00:00:00.000Z'
    await repository.applyDocumentsPage([projection({ updatedAt: latest, observedAt: latest })])
    await repository.beginContent({ ...base, manifestId: 'new-content', sourceUpdatedAt: latest })
    await repository.finalizeContent('new-content', '__test__', latest)
    await repository.finalizeContent('old-content', '__test__', latest)
    expect(
      database.prepare('SELECT id,state FROM article_content_manifests ORDER BY id').all(),
    ).toEqual([
      { id: 'new-content', state: 'ready' },
      { id: 'old-content', state: 'expired' },
    ])
    expect(
      database.prepare('SELECT content_available FROM article_library_projection').get()
        ?.content_available,
    ).toBe(1)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
