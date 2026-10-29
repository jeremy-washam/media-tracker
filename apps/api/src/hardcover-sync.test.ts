import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { syncHardcover } from './hardcover-sync'
import { TestBucket, TestDatabase } from './testing/storage'
import type { Bindings } from './env'

let database: TestDatabase
let bindings: Bindings
function book(id: number) {
  return {
    id,
    book_id: id + 10000,
    edition_id: id + 20000,
    status_id: 3,
    read_count: 1,
    rating: 4,
    review: null,
    updated_at: '2026-01-01T00:00:00Z',
    book: { id: id + 10000, title: `Synthetic book ${id}` },
    edition: { id: id + 20000 },
    user_book_reads: [],
  }
}
function provider(rows: ReturnType<typeof book>[]) {
  const requested: number[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string
        variables: { afterId: number; limit: number }
      }
      if (body.query.includes('MediaTrackerMe')) return Response.json({ data: { me: [{ id: 1 }] } })
      requested.push(body.variables.afterId)
      return Response.json({
        data: {
          user_books: rows
            .filter((row) => row.id > body.variables.afterId)
            .slice(0, body.variables.limit),
        },
      })
    }),
  )
  return requested
}
function fullCursor() {
  return database.sqlite
    .prepare("SELECT checkpoint_json FROM sync_cursors WHERE name='library-books'")
    .get()
}
beforeEach(() => {
  database = new TestDatabase()
  bindings = {
    DB: database,
    RAW_BUCKET: new TestBucket(),
    HARDCOVER_TOKEN: 'synthetic',
  } as unknown as Bindings
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  database.sqlite.close()
})

it('resumes the same snapshot by committed page and retires missing rows only after completion', async () => {
  provider([book(900)])
  await syncHardcover(bindings)
  const previous = fullCursor()
  const offsets = provider(Array.from({ length: 51 }, (_, i) => book(i + 1)))
  const first = await syncHardcover(bindings, { maxPages: 1 })
  expect(first).toMatchObject({ continuation: true, pages: 1, books: 50 })
  expect(fullCursor()).toEqual(previous)
  expect(
    database.sqlite
      .prepare('SELECT upstream_state FROM hardcover_user_books WHERE user_book_id=900')
      .get(),
  ).toEqual({ upstream_state: 'active' })
  // No queue callback is required to recover: another scheduler invocation reads the checkpoint.
  const second = await syncHardcover(bindings, { maxPages: 1 })
  expect(second.syncRunId).toBe(first.syncRunId)
  expect(second).toMatchObject({ pages: 2, books: 51, archiveEntries: 51 })
  expect(second.continuation).toBeUndefined()
  expect(offsets).toEqual([0, 50])
  expect(
    database.sqlite
      .prepare('SELECT upstream_state FROM hardcover_user_books WHERE user_book_id=900')
      .get(),
  ).toEqual({ upstream_state: 'removed' })
  expect(
    database.sqlite
      .prepare('SELECT status,raw_object_count,source_record_count FROM sync_runs WHERE id=?')
      .get(second.syncRunId),
  ).toEqual({ status: 'succeeded', raw_object_count: 2, source_record_count: 51 })
  expect(
    database.sqlite
      .prepare(
        'SELECT COUNT(*) n FROM archive_entries WHERE media_item_id IN (SELECT media_item_id FROM hardcover_user_books WHERE user_book_id<>900)',
      )
      .get(),
  ).toEqual({ n: 51 })
  expect(database.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('replays a page after a checkpoint failure without losing evidence or duplicating canonical entries', async () => {
  const offsets = provider([book(1)])
  database.failWhen = (query, values) =>
    query.includes('INSERT INTO hardcover_sync_progress') &&
    String(values.find((value) => typeof value === 'string' && value.startsWith('{'))).includes(
      '"pages":1',
    )
  await expect(syncHardcover(bindings, { maxPages: 1 })).rejects.toThrow(
    'Synthetic database interruption',
  )
  expect(fullCursor()).toBeUndefined()
  database.failWhen = null
  const recovered = await syncHardcover(bindings, { maxPages: 1 })
  expect(offsets).toEqual([0, 0])
  expect(recovered).toMatchObject({ books: 1, sourceRecords: 2 })
  expect(database.sqlite.prepare('SELECT COUNT(*) n FROM archive_entries').get()).toEqual({ n: 1 })
  expect(
    database.sqlite.prepare('SELECT raw_object_count,source_record_count FROM sync_runs').get(),
  ).toEqual({ raw_object_count: 2, source_record_count: 2 })
  expect(
    database.sqlite.prepare('SELECT COUNT(DISTINCT acquisition_key) n FROM raw_objects').get(),
  ).toEqual({ n: 2 })
  expect(database.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('retries finalization without refetching pages after the complete scan checkpoint commits', async () => {
  const offsets = provider([book(1)])
  database.failNext = /UPDATE hardcover_user_books SET upstream_state='removed'/
  await expect(syncHardcover(bindings, { maxPages: 1 })).rejects.toThrow(
    'Synthetic database interruption',
  )
  expect(fullCursor()).toBeUndefined()
  const recovered = await syncHardcover(bindings, { maxPages: 1 })
  expect(offsets).toEqual([0])
  expect(recovered).toMatchObject({ books: 1, sourceRecords: 1 })
})

it('starts a new snapshot after completion even if the progress completion marker was interrupted', async () => {
  provider([book(1)])
  const first = await syncHardcover(bindings)
  database.sqlite.exec(
    "UPDATE hardcover_sync_progress SET checkpoint_json=json_set(checkpoint_json,'$.complete',json('false'))",
  )
  const second = await syncHardcover(bindings)
  expect(second.syncRunId).not.toBe(first.syncRunId)
  expect(second).toMatchObject({ mode: 'reconcile', books: 1 })
})

it('rejects non-advancing provider pages before committing snapshot completion', async () => {
  vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string }
    return Response.json({
      data: body.query.includes('MediaTrackerMe')
        ? { me: [{ id: 1 }] }
        : { user_books: [book(2), book(1)] },
    })
  })
  await expect(syncHardcover(bindings, { maxPages: 1 })).rejects.toThrow('non-advancing')
  expect(fullCursor()).toBeUndefined()
  expect(database.sqlite.prepare('SELECT COUNT(*) n FROM raw_objects').get()).toEqual({ n: 1 })
})

it('keeps private GraphQL error details out of persistent activity and logs', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ errors: [{ message: 'private-title private-token' }] }),
  )
  await expect(syncHardcover(bindings)).rejects.toThrow('GraphQL returned errors')
  expect(database.sqlite.prepare('SELECT error_message FROM sync_runs').get()).toEqual({
    error_message: 'Hardcover GraphQL query failure. The previous complete snapshot is retained.',
  })
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-')
})

it('keeps a committed snapshot successful when its convenience completion marker fails', async () => {
  provider([book(1)])
  database.failWhen = (query, values) =>
    query.includes('INSERT INTO hardcover_sync_progress') &&
    values.some((value) => typeof value === 'string' && value.includes('"complete":true'))
  const completed = await syncHardcover(bindings)
  expect(
    database.sqlite.prepare('SELECT status FROM sync_runs WHERE id=?').get(completed.syncRunId),
  ).toEqual({ status: 'succeeded' })
  database.failWhen = null
  const next = await syncHardcover(bindings)
  expect(next.syncRunId).not.toBe(completed.syncRunId)
})
