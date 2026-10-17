import { readFileSync } from 'node:fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from './env'
import { syncReadwiseArchive } from './readwise-sync'
import { SyncBudget } from './sync-budget'

const migration = [
  '0001_canonical_ledger.sql',
  '0006_movies_library.sql',
  '0008_articles_library.sql',
  '0009_article_content_search_map.sql',
  '0010_article_content_jobs.sql',
  '0011_article_current_availability.sql',
  '0012_article_content_reliability.sql',
  '0013_article_content_attempts.sql',
  '0014_podcasts_library.sql',
  '0027_compact_archive_evidence.sql',
  '0028_evidence_view_parent_guard.sql',
  '0029_evidence_insert_only_replay.sql',
]
  .map((name) =>
    readFileSync(
      fileURLToPath(new URL(`../../../packages/db/migrations/${name}`, import.meta.url).href),
      'utf8',
    ),
  )
  .join('\n')
const readerPage = readFileSync(
  fileURLToPath(
    new URL('../../../packages/test-fixtures/readwise/archive-page.json', import.meta.url).href,
  ),
  'utf8',
)

type SqlValue = ArrayBuffer | null | number | string

class D1SqliteStatement {
  readonly #statement: StatementSync
  #values: readonly SqlValue[] = []

  constructor(statement: StatementSync) {
    this.#statement = statement
  }

  bind(...values: readonly SqlValue[]): D1SqliteStatement {
    this.#values = values
    return this
  }

  async first<Row>(): Promise<Row | null> {
    return (this.#statement.get(...this.#nodeValues()) as Row | undefined) ?? null
  }

  async all<Row>(): Promise<{ results: Row[]; success: true }> {
    return { results: this.#statement.all(...this.#nodeValues()) as Row[], success: true }
  }

  async run(): Promise<{ success: true }> {
    this.execute()
    return { success: true }
  }

  execute(): void {
    this.#statement.run(...this.#nodeValues())
  }

  #nodeValues() {
    return this.#values.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    )
  }
}

class D1SqliteDatabase {
  readonly database = new DatabaseSync(':memory:')

  constructor() {
    this.database.exec(migration)
  }

  prepare(query: string): D1SqliteStatement {
    return new D1SqliteStatement(this.database.prepare(query))
  }

  async batch(statements: readonly D1SqliteStatement[]): Promise<readonly { success: true }[]> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) statement.execute()
      this.database.exec('COMMIT')
      return statements.map(() => ({ success: true }))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>()

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<object> {
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.objects.set(key, bytes.slice())
    return {}
  }
}

class MemoryQueue {
  readonly batches: unknown[][] = []

  async sendBatch(messages: unknown[]): Promise<void> {
    this.batches.push(messages)
  }
}

function count(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
    .count
}

describe('Readwise Archive sync', () => {
  let database: D1SqliteDatabase
  let bucket: MemoryBucket
  let queue: MemoryQueue

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'))
    database = new D1SqliteDatabase()
    bucket = new MemoryBucket()
    queue = new MemoryQueue()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        return Response.json(
          url.pathname === '/api/v2/export/'
            ? { count: 0, nextPageCursor: null, results: [] }
            : JSON.parse(readerPage),
          { headers: { 'content-type': 'application/json' } },
        )
      }),
    )
  })

  afterEach(() => {
    database.database.close()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('syncs metadata with content acquisition paused', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
      ARTICLE_CONTENT_ENABLED: 'false',
    } as unknown as Bindings
    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({
      pages: 1,
      archiveItems: 5,
    })
    expect(queue.batches).toHaveLength(0)
    expect(count(database.database, 'article_content_jobs')).toBe(0)
    expect(count(database.database, 'sync_cursors')).toBe(1)
  })

  it('keeps raw evidence and the prior cursor when a snapshot exceeds its budget', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
      SYNC_BUDGET: new SyncBudget({ requests: 1, bytes: 100_000, pages: 0, records: 1 }),
    } as unknown as Bindings
    await expect(syncReadwiseArchive(bindings)).rejects.toThrow('page or record allowance')
    expect(bucket.objects.size).toBe(1)
    expect(count(database.database, 'raw_objects')).toBe(1)
    expect(count(database.database, 'sync_cursors')).toBe(0)
    expect(count(database.database, 'article_library_projection')).toBe(0)
    expect(database.database.prepare('SELECT status FROM sync_runs').get()).toMatchObject({
      status: 'failed',
    })
    expect(queue.batches).toHaveLength(0)
  })

  it('stores raw evidence and exposes eligible Archive media idempotently', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
    } as unknown as Bindings

    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({
      pages: 1,
      sourceRecords: 8,
      archiveItems: 5,
    })
    vi.setSystemTime(new Date('2026-09-12T13:00:00.000Z'))
    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({
      pages: 1,
      sourceRecords: 7,
      archiveItems: 5,
    })

    expect(bucket.objects.size).toBe(2)
    expect(count(database.database, 'raw_objects')).toBe(4)
    expect(count(database.database, 'source_records')).toBe(15)
    expect(count(database.database, 'media_items')).toBe(6)
    expect(count(database.database, 'external_identities')).toBe(6)
    expect(count(database.database, 'archive_entries')).toBe(5)
    expect(count(database.database, 'archive_entry_evidence')).toBe(10)
    expect(count(database.database, 'queue_entries')).toBe(1)
    expect(count(database.database, 'sync_cursors')).toBe(1)
    expect(queue.batches).toHaveLength(2)
    expect(queue.batches[0]).toHaveLength(4)
    expect(queue.batches[1]).toHaveLength(4)

    const fetchMock = vi.mocked(fetch)
    const initialUrl = new URL(String(fetchMock.mock.calls[0]![0]))
    const highlightUrl = new URL(String(fetchMock.mock.calls[1]![0]))
    const reconciliationUrl = new URL(String(fetchMock.mock.calls[2]![0]))
    expect(initialUrl.searchParams.has('location')).toBe(false)
    expect(initialUrl.searchParams.has('updatedAfter')).toBe(false)
    expect(highlightUrl.pathname).toBe('/api/v2/export/')
    expect(highlightUrl.searchParams.get('includeDeleted')).toBe('true')
    expect(reconciliationUrl.searchParams.has('location')).toBe(false)
    expect(reconciliationUrl.searchParams.get('updatedAfter')).toBe('2026-09-12T11:55:00.000Z')

    expect(
      database.database
        .prepare('SELECT count(*) AS count FROM source_records WHERE disposition = ?')
        .get('ignored'),
    ).toEqual({ count: 2 })
    expect(
      database.database
        .prepare('SELECT consumed_at_basis FROM archive_entries GROUP BY consumed_at_basis')
        .all(),
    ).toEqual([{ consumed_at_basis: 'inferred' }])
  })

  it('retains Archive history when an incremental page observes the item in Queue', async () => {
    const archived = {
      id: 'reader-moved-1',
      url: 'https://read.readwise.io/read/reader-moved-1',
      source_url: 'https://example.test/moved',
      title: 'Moved document',
      author: 'Example Author',
      category: 'article',
      location: 'archive',
      updated_at: '2026-09-12T11:00:00.000Z',
      last_moved_at: '2026-09-12T10:00:00.000Z',
    }
    const later = {
      ...archived,
      location: 'later',
      updated_at: '2026-09-12T12:30:00.000Z',
      last_moved_at: '2026-09-12T12:30:00.000Z',
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ count: 1, nextPageCursor: null, results: [archived] }))
      .mockResolvedValueOnce(Response.json({ count: 0, nextPageCursor: null, results: [] }))
      .mockResolvedValueOnce(Response.json({ count: 1, nextPageCursor: null, results: [later] }))
      .mockResolvedValueOnce(Response.json({ count: 0, nextPageCursor: null, results: [] }))

    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
    } as unknown as Bindings

    await syncReadwiseArchive(bindings)
    vi.setSystemTime(new Date('2026-09-12T13:00:00.000Z'))
    await syncReadwiseArchive(bindings)

    expect(
      database.database
        .prepare('SELECT upstream_state FROM archive_entries WHERE source_occurrence_key = ?')
        .get('reader-document:reader-moved-1'),
    ).toEqual({ upstream_state: 'active' })
    expect(
      database.database
        .prepare(
          `SELECT role, count(*) AS count
           FROM archive_entry_evidence
           GROUP BY role
           ORDER BY role`,
        )
        .all(),
    ).toEqual([{ role: 'admission', count: 1 }])
    expect(
      database.database.prepare('SELECT upstream_state,relationship_type FROM queue_entries').get(),
    ).toEqual({ upstream_state: 'active', relationship_type: 'readwise_later' })
  })

  it('forces a complete replay when the document parser version changes', async () => {
    const now = '2026-09-12T12:00:00.000Z'
    database.database.exec(`
      INSERT INTO connections(id,source,label,status,coverage,created_at,updated_at)
        VALUES('readwise-1','readwise','Reader','connected','partial','${now}','${now}');
      INSERT INTO sync_runs(id,connection_id,kind,status,started_at,finished_at)
        VALUES('old-run','readwise-1','backfill','succeeded','${now}','${now}');
      INSERT INTO readwise_projection_state(connection_id,documents_snapshot_run_id,
        documents_snapshot_completed_at,documents_parser_version,incremental_watermark,
        full_text_policy,content_acquisition_version,content_index_version,projection_version)
        VALUES('readwise-1','old-run','${now}','readwise-documents@3','${now}','archive_queue',1,1,0);
    `)
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
    } as unknown as Bindings

    await expect(syncReadwiseArchive(bindings)).resolves.toMatchObject({ sourceRecords: 8 })
    const firstUrl = new URL(String(vi.mocked(fetch).mock.calls[0]![0]))
    expect(firstUrl.searchParams.has('updatedAfter')).toBe(false)
    expect(
      database.database
        .prepare(
          "SELECT documents_parser_version FROM readwise_projection_state WHERE connection_id='readwise-1'",
        )
        .get(),
    ).toEqual({ documents_parser_version: 'readwise-documents@5' })
  })

  it('does not advance the durable watermark when a later page fails', async () => {
    const bindings = {
      DB: database,
      RAW_BUCKET: bucket,
      READWISE_TOKEN: 'synthetic-token',
      SYNC_QUEUE: queue,
    } as unknown as Bindings
    await syncReadwiseArchive(bindings)
    const checkpointBefore = database.database
      .prepare('SELECT checkpoint_json FROM sync_cursors WHERE name = ?')
      .get('reader-documents')

    vi.setSystemTime(new Date('2026-09-12T13:00:00.000Z'))
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          count: 0,
          nextPageCursor: 'second-page',
          results: [],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(syncReadwiseArchive(bindings)).rejects.toMatchObject({
      name: 'ReadwiseApiError',
    })

    expect(
      database.database
        .prepare('SELECT checkpoint_json FROM sync_cursors WHERE name = ?')
        .get('reader-documents'),
    ).toEqual(checkpointBefore)
  })
})
