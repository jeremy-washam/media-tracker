import { InfiniteQueryObserver, QueryObserver, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAppQueryClient,
  LIBRARY_CACHE_KEY,
  LIBRARY_STALE_TIME,
  persistLibraryCache,
  startInitialPrefetch,
  type PrefetchTask,
} from './library-cache'
import {
  booksQueryOptions,
  INITIAL_LIBRARY_QUERIES,
  invalidateLibraryQueries,
} from './library-queries'

const page = {
  data: [],
  nextCursor: 'next-page',
  counts: { archive: 0, queue: 0, filteredBooks: 0, supportedReads: 0 },
  facets: { formats: [], genres: [], series: [] },
  freshness: { lastSuccessfulSyncAt: null, degraded: false },
}
class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const clients: QueryClient[] = []
const cleanups: (() => void)[] = []
function client(storage?: MemoryStorage) {
  const value = createAppQueryClient(storage)
  clients.push(value)
  return value
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T12:00:00Z'))
})
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop())
  clients.splice(0).forEach((value) => value.clear())
  vi.useRealTimers()
})

describe('Library initial page cache', () => {
  it('restores only the default first page with its original timestamp and cursor', async () => {
    const storage = new MemoryStorage()
    const original = client()
    cleanups.push(persistLibraryCache(original, storage))
    const options = booksQueryOptions('archive')
    const fetchedAt = Date.now()
    original.setQueryData(options.queryKey, {
      pages: [page, { ...page, nextCursor: null }],
      pageParams: [undefined, 'next-page'],
    })
    original.setQueryData(booksQueryOptions('archive', { q: 'private-search' }).queryKey, {
      pages: [page],
      pageParams: [undefined],
    })
    original.setQueryData(['book', 'detail-one'], { notes: 'detail text' })
    original.setQueryData(['connections'], { data: [] })
    await vi.advanceTimersByTimeAsync(200)
    expect(JSON.parse(storage.getItem(LIBRARY_CACHE_KEY)!).entries).toHaveLength(1)
    vi.setSystemTime(fetchedAt + 6 * 60_000)
    const restored = client(storage)
    expect(restored.getQueryData(options.queryKey)).toEqual({
      pages: [page],
      pageParams: [undefined],
    })
    expect(restored.getQueryState(options.queryKey)?.dataUpdatedAt).toBe(fetchedAt)
    expect(
      restored
        .getQueryCache()
        .find({ queryKey: options.queryKey })
        ?.isStaleByTime(LIBRARY_STALE_TIME),
    ).toBe(false)
    expect(restored.getQueryData(['book', 'detail-one'])).toBeUndefined()
    expect(restored.getQueryData(['connections'])).toBeUndefined()
    expect(
      restored.defaultQueryOptions({ queryKey: options.queryKey }).gcTime,
    ).toBeGreaterThanOrEqual(LIBRARY_STALE_TIME)
  })

  it('keeps old fetch times for background refresh and expires snapshots after a day', () => {
    const storage = new MemoryStorage()
    const fetchedAt = Date.now()
    storage.setItem(
      LIBRARY_CACHE_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ path: '/library/books/archive', page, updatedAt: fetchedAt }],
      }),
    )
    vi.setSystemTime(fetchedAt + 11 * 60_000)
    const stale = client(storage)
    expect(
      stale
        .getQueryCache()
        .find({ queryKey: booksQueryOptions('archive').queryKey })
        ?.isStaleByTime(LIBRARY_STALE_TIME),
    ).toBe(true)
    vi.setSystemTime(fetchedAt + 24 * 60 * 60_000)
    expect(client(storage).getQueryCache().getAll()).toHaveLength(0)
  })

  it('discards malformed, incompatible and unknown entries without breaking startup', () => {
    for (const raw of [
      '{broken',
      JSON.stringify({ version: 9, entries: [] }),
      JSON.stringify({
        version: 1,
        entries: [
          { path: '/library/books/archive', updatedAt: Date.now(), page: { data: [] } },
          { path: '/library/books/unknown', updatedAt: Date.now(), page },
          { path: '/library/books/queue', updatedAt: Date.now() + 1000, page },
        ],
      }),
    ]) {
      const storage = new MemoryStorage()
      storage.setItem(LIBRARY_CACHE_KEY, raw)
      expect(client(storage).getQueryCache().getAll()).toHaveLength(0)
    }
    const blocked = {
      getItem: () => {
        throw new Error('Blocked')
      },
      setItem: () => {
        throw new Error('Full')
      },
      removeItem: () => {
        throw new Error('Blocked')
      },
    }
    const value = createAppQueryClient(blocked)
    clients.push(value)
    const stop = persistLibraryCache(value, blocked)
    value.setQueryData(booksQueryOptions('archive').queryKey, {
      pages: [page],
      pageParams: [undefined],
    })
    expect(stop).not.toThrow()
  })

  it('removes invalidated pages from disk immediately after imports and syncs', async () => {
    const storage = new MemoryStorage()
    const value = client()
    cleanups.push(persistLibraryCache(value, storage))
    value.setQueryData(booksQueryOptions('archive').queryKey, {
      pages: [page],
      pageParams: [undefined],
    })
    await vi.advanceTimersByTimeAsync(200)
    value.setQueryData(['book', 'detail-one'], { title: 'Previous metadata' })
    value.setQueryData(['music-filter-options', { view: 'tracks' }], { data: [] })
    await invalidateLibraryQueries(value)
    expect(value.getQueryState(['book', 'detail-one'])?.isInvalidated).toBe(true)
    expect(value.getQueryState(['music-filter-options', { view: 'tracks' }])?.isInvalidated).toBe(
      true,
    )
    expect(client(storage).getQueryData(booksQueryOptions('archive').queryKey)).toBeUndefined()
    expect(value.getQueryState(booksQueryOptions('archive').queryKey)?.isInvalidated).toBe(true)
  })
})

describe('Library background prefetch', () => {
  it('waits for foreground content, limits concurrency to two, and pauses for new foreground work', async () => {
    const value = client()
    const first = deferred<typeof page>()
    const primary = new InfiniteQueryObserver(value, {
      ...booksQueryOptions('archive'),
      queryFn: () => first.promise,
    })
    cleanups.push(primary.subscribe(() => {}))
    const pending = Array.from({ length: 4 }, () => deferred<void>())
    const calls: number[] = []
    const tasks: PrefetchTask[] = pending.map((task, index) => ({
      queryKey: ['test-background', index],
      prefetch: () => {
        calls.push(index)
        return task.promise
      },
    }))
    cleanups.push(startInitialPrefetch(value, () => '/library/books/archive', tasks))
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([])
    first.resolve(page)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([0, 1])
    const next = deferred<string>()
    const foreground = new QueryObserver(value, {
      queryKey: ['book', 'selected'],
      queryFn: () => next.promise,
    })
    cleanups.push(foreground.subscribe(() => {}))
    pending[0]!.resolve()
    pending[1]!.resolve()
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([0, 1])
    next.resolve('detail')
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual([0, 1, 2, 3])
    pending[2]!.resolve()
    pending[3]!.resolve()
    await vi.advanceTimersByTimeAsync(1)
  })

  it('reuses fresh default pages across tabs and retries a failed prefetch on navigation', async () => {
    const value = client()
    const options = booksQueryOptions('queue')
    const failed = vi.fn(() => Promise.reject(new Error('Temporary failure')))
    await value.prefetchInfiniteQuery({ ...options, queryFn: failed, retry: false })
    const load = vi.fn(async () => page)
    const active = new InfiniteQueryObserver(value, { ...options, queryFn: load })
    const stop = active.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(1)
    expect(active.getCurrentResult().isSuccess).toBe(true)
    stop()
    vi.setSystemTime(Date.now() + 6 * 60_000)
    const revisited = new InfiniteQueryObserver(value, { ...options, queryFn: load })
    cleanups.push(revisited.subscribe(() => {}))
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await revisited.refetch()
    expect(load).toHaveBeenCalledTimes(2)
    expect(failed).toHaveBeenCalledTimes(1)
  })

  it('covers every section once using the production collection page sizes', () => {
    expect(new Set(INITIAL_LIBRARY_QUERIES.map((query) => query.path)).size).toBe(16)
    expect(
      INITIAL_LIBRARY_QUERIES.filter(
        (query) => query.path.includes('/books/') || query.path.includes('/movies/'),
      ).every((query) => query.pageSize === 48),
    ).toBe(true)
    expect(
      INITIAL_LIBRARY_QUERIES.filter(
        (query) => !query.path.includes('/books/') && !query.path.includes('/movies/'),
      ).every((query) => query.pageSize === 50),
    ).toBe(true)
  })
})
