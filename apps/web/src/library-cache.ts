import { QueryClient, hashKey, type InfiniteData, type QueryKey } from '@tanstack/react-query'

import { fetchConnections, fetchSyncRuns } from './api'
import { INITIAL_LIBRARY_QUERIES } from './library-queries'

export const LIBRARY_STALE_TIME = 10 * 60_000
export const LIBRARY_CACHE_KEY = 'media-tracker:library-initial-pages:v1'
const MAX_CACHE_AGE = 24 * 60 * 60_000
const MAX_CACHE_LENGTH = 2_000_000
type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function browserCacheStorage(): CacheStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function createAppQueryClient(storage?: CacheStorage) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: LIBRARY_STALE_TIME, gcTime: 30 * 60_000 },
    },
  })
  client.setQueryDefaults(['connections'], { staleTime: 5000 })
  client.setQueryDefaults(['sync-runs'], { staleTime: 5000 })
  client.setQueryDefaults(['health'], { staleTime: 30_000 })
  restoreLibraryCache(client, storage)
  return client
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function restoreLibraryCache(client: QueryClient, storage?: CacheStorage) {
  if (!storage) return
  try {
    const raw = storage.getItem(LIBRARY_CACHE_KEY)
    if (!raw) return
    if (raw.length > MAX_CACHE_LENGTH) throw new Error('Oversized Library cache')
    const saved: unknown = JSON.parse(raw)
    if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.entries)) {
      throw new Error('Unsupported Library cache')
    }
    const now = Date.now()
    for (const entry of saved.entries.slice(0, INITIAL_LIBRARY_QUERIES.length)) {
      if (!record(entry) || typeof entry.path !== 'string' || typeof entry.updatedAt !== 'number')
        continue
      const definition = INITIAL_LIBRARY_QUERIES.find((query) => query.path === entry.path)
      const age = now - entry.updatedAt
      if (!definition || !Number.isFinite(age) || age < 0 || age >= MAX_CACHE_AGE) continue
      try {
        const page = definition.parsePage(entry.page)
        if (page.data.length > definition.pageSize) continue
        client.setQueryData(
          definition.queryKey,
          { pages: [page], pageParams: [undefined] },
          { updatedAt: entry.updatedAt },
        )
      } catch {
        // An outdated or malformed response is fetched normally when its tab is opened.
      }
    }
  } catch {
    try {
      storage.removeItem(LIBRARY_CACHE_KEY)
    } catch {
      /* Storage may be disabled. */
    }
  }
}

export function persistLibraryCache(client: QueryClient, storage?: CacheStorage) {
  if (!storage) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    timer = undefined
    const now = Date.now()
    const entries = INITIAL_LIBRARY_QUERIES.flatMap((definition) => {
      const query = client.getQueryCache().find({ queryKey: definition.queryKey, exact: true })
      if (!query || query.state.isInvalidated || now - query.state.dataUpdatedAt >= MAX_CACHE_AGE)
        return []
      const data = query.state.data as InfiniteData<unknown> | undefined
      const page = data?.pages[0]
      if (!page) return []
      return [{ path: definition.path, updatedAt: query.state.dataUpdatedAt, page }]
    })
    try {
      const value = JSON.stringify({ version: 1, entries })
      if (value.length <= MAX_CACHE_LENGTH) storage.setItem(LIBRARY_CACHE_KEY, value)
      else storage.removeItem(LIBRARY_CACHE_KEY)
    } catch {
      // Browsing still works when storage is full or unavailable.
    }
  }
  const hashes = new Set(INITIAL_LIBRARY_QUERIES.map((query) => hashKey(query.queryKey)))
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (!hashes.has(event.query.queryHash)) return
    if (event.type === 'updated' && event.action.type === 'invalidate') {
      if (timer) clearTimeout(timer)
      save()
    } else if (
      event.type === 'removed' ||
      (event.type === 'updated' && event.action.type === 'success')
    ) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(save, 200)
    }
  })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', save)
  return () => {
    unsubscribe()
    if (timer) clearTimeout(timer)
    save()
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', save)
  }
}

export interface PrefetchTask {
  queryKey: QueryKey
  prefetch: (client: QueryClient) => Promise<void>
}

const initialPrefetchTasks: PrefetchTask[] = [
  ...INITIAL_LIBRARY_QUERIES,
  {
    queryKey: ['connections'],
    prefetch: (client) =>
      client.prefetchQuery({
        queryKey: ['connections'],
        queryFn: () => fetchConnections(),
        retry: false,
      }),
  },
  {
    queryKey: ['sync-runs'],
    prefetch: (client) =>
      client.prefetchInfiniteQuery({
        queryKey: ['sync-runs'],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) => fetchSyncRuns(pageParam),
        getNextPageParam: (page: Awaited<ReturnType<typeof fetchSyncRuns>>) =>
          page.nextCursor ?? undefined,
        retry: false,
      }),
  },
]

/** Start only after the current collection has loaded; stop launching work during foreground reads. */
export function startInitialPrefetch(
  client: QueryClient,
  getPath: () => string,
  tasks = initialPrefetchTasks,
) {
  const remaining = [...tasks]
  let running = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const wake = () => {
    if (!stopped && !timer) timer = setTimeout(pump, 0)
  }
  const pump = () => {
    timer = undefined
    if (stopped || running >= 2 || remaining.length === 0) return
    if (
      typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || !navigator.onLine)
    )
      return
    const path = getPath()
    const queries = client.getQueryCache().getAll()
    const active = queries.filter((query) => query.isActive())
    const primary = active.filter((query) => {
      if (path === '/connections')
        return ['connections', 'sync-runs'].includes(String(query.queryKey[0]))
      const [, library, media, section] = path.split('/')
      const request = query.queryKey[1]
      return (
        library === 'library' &&
        query.queryKey[0] === media &&
        record(request) &&
        (request.collection ?? request.section ?? request.view) === section
      )
    })
    if (primary.length === 0 || primary.some((query) => query.state.status !== 'success')) return
    if (
      active.some(
        (query) => query.queryKey[0] !== 'health' && query.state.fetchStatus === 'fetching',
      )
    )
      return
    while (running < 2 && remaining.length > 0) {
      const task = remaining.shift()!
      const query = client.getQueryCache().find({ queryKey: task.queryKey, exact: true })
      const staleTime = client.defaultQueryOptions({ queryKey: task.queryKey }).staleTime
      if (
        query?.isActive() ||
        (query &&
          !query.isStaleByTime(typeof staleTime === 'number' ? staleTime : LIBRARY_STALE_TIME))
      )
        continue
      // An existing request is already doing this work; TanStack also deduplicates any race.
      if (query?.state.fetchStatus === 'fetching') continue
      running++
      void Promise.resolve()
        .then(() => task.prefetch(client))
        .catch(() => {})
        .finally(() => {
          running--
          wake()
        })
    }
  }
  const unsubscribe = client.getQueryCache().subscribe(wake)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
  }
  wake()
  return () => {
    stopped = true
    unsubscribe()
    if (timer) clearTimeout(timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }
}
