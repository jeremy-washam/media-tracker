import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiErrorSchema,
  BooksResponseSchema,
  BooksSummarySchema,
  ConnectionsResponseSchema,
  HealthResponseSchema,
  MediaListResponseSchema,
  MoviesResponseSchema,
  MoviesSummarySchema,
} from '@media-tracker/contracts'

import app from './app'
import type { Bindings } from './env'

const emptyStatement = {
  bind() {
    return this
  },
  async first() {
    return null
  },
  async all() {
    return { results: [], success: true }
  },
  async run() {
    return { success: true }
  },
}

const testBindings = {
  DB: {
    prepare: () => ({ ...emptyStatement }),
    async batch(statements: unknown[]) {
      return statements.map(() => ({ success: true }))
    },
  },
} as unknown as Bindings

describe('API', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a contract-valid health response and request ID', async () => {
    const response = await app.request('/api/health', {
      headers: { 'x-request-id': 'test-request' },
    })
    const payload = HealthResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('test-request')
    expect(payload.requestId).toBe('test-request')
  })

  it('returns the standard error contract for unknown API routes', async () => {
    const response = await app.request('/api/unknown')
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
  })

  it('returns all planned source connection placeholders', async () => {
    const response = await app.request('/api/connections', undefined, testBindings)
    const payload = ConnectionsResponseSchema.parse(await response.json())

    expect(payload.data.map(({ source }) => source)).toEqual([
      'readwise',
      'hardcover',
      'letterboxd',
      'spotify',
      'youtube',
    ])
  })

  it('returns media from the database contract', async () => {
    const response = await app.request('/api/media', undefined, testBindings)
    const payload = MediaListResponseSchema.parse(await response.json())

    expect(payload).toEqual({
      data: [],
      nextCursor: null,
      totalCount: 0,
      filteredCount: 0,
      counts: { article: 0, book: 0, movie: 0, podcast_episode: 0, song: 0, video: 0 },
    })
  })

  it('returns an empty Books collection through its media-specific contract', async () => {
    const response = await app.request(
      '/api/library/books?section=archive',
      undefined,
      testBindings,
    )
    const payload = BooksResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(payload).toEqual({ data: [], nextCursor: null })
    const summary = await app.request(
      '/api/library/books/summary?section=archive',
      undefined,
      testBindings,
    )
    expect(BooksSummarySchema.parse(await summary.json())).toMatchObject({
      counts: { archive: 0, queue: 0, filteredBooks: 0, supportedReads: 0 },
      facets: { formats: [], series: [], genres: [] },
    })
  })

  it('returns an empty Movies collection through its media-specific contract', async () => {
    const response = await app.request(
      '/api/library/movies?section=archive',
      undefined,
      testBindings,
    )
    const payload = MoviesResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(payload).toEqual({ data: [], nextCursor: null })
    const summary = await app.request(
      '/api/library/movies/summary?section=archive',
      undefined,
      testBindings,
    )
    expect(MoviesSummarySchema.parse(await summary.json())).toMatchObject({
      totalCount: 0,
      filteredCount: 0,
      filteredOccurrenceCount: 0,
      overlapCount: 0,
      membershipCounts: { archiveItems: 0, archiveOccurrences: 0, queueItems: 0 },
    })
  })

  it('rejects collection-incompatible Movies sorts before querying storage', async () => {
    const response = await app.request(
      '/api/library/movies?section=queue&sort=watchedAt',
      undefined,
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('BAD_REQUEST')
  })

  it.each([
    ['books', 'archive'],
    ['movies', 'queue'],
    ['articles', 'feed'],
    ['podcasts', 'following'],
    ['music', 'artists'],
    ['videos', 'channels'],
  ])('separates %s items and summaries using section', async (media, section) => {
    const items = await app.request(
      `/api/library/${media}?section=${section}`,
      undefined,
      testBindings,
    )
    expect(items.status).toBe(200)
    expect(await items.json()).toEqual({ data: [], nextCursor: null })
    const summary = await app.request(
      `/api/library/${media}/summary?section=${section}`,
      undefined,
      testBindings,
    )
    expect(summary.status).toBe(200)
    const body = (await summary.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('data')
    expect(body).not.toHaveProperty('nextCursor')
    expect(body).toHaveProperty(media === 'books' ? 'counts' : 'filteredCount')
  })

  it('does not run Movies aggregate queries for an item page', async () => {
    const prepare = vi.spyOn(testBindings.DB, 'prepare')
    const response = await app.request(
      '/api/library/movies?section=archive&limit=50',
      undefined,
      testBindings,
    )
    expect(response.status).toBe(200)
    expect(prepare).toHaveBeenCalledTimes(1)
    prepare.mockClear()
    const summary = await app.request(
      '/api/library/movies/summary?section=archive',
      undefined,
      testBindings,
    )
    expect(summary.status).toBe(200)
    expect(prepare).toHaveBeenCalledTimes(4)
    expect(prepare.mock.calls.every(([sql]) => !sql.includes('sort_null_rank'))).toBe(true)
  })

  it.each(['sort=title', 'limit=50', 'cursor=anything', 'layout=list'])(
    'rejects non-filter summary parameters: %s',
    async (parameter) => {
      const response = await app.request(
        `/api/library/movies/summary?section=archive&${parameter}`,
        undefined,
        testBindings,
      )
      expect(response.status).toBe(400)
    },
  )

  it('explains when Readwise has not been configured', async () => {
    const response = await app.request(
      '/api/connections/readwise/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('explains when Letterboxd RSS has not been configured', async () => {
    const response = await app.request(
      '/api/connections/letterboxd/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('explains when Hardcover has not been configured', async () => {
    const response = await app.request(
      '/api/connections/hardcover/sync',
      { method: 'POST' },
      testBindings,
    )
    const payload = ApiErrorSchema.parse(await response.json())

    expect(response.status).toBe(503)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('does not start provider catalog jobs without backend credentials', async () => {
    for (const provider of ['tmdb', 'youtube', 'spotify']) {
      const response = await app.request(
        `/api/catalogs/${provider}/sync`,
        { method: 'POST' },
        testBindings,
      )
      const payload = ApiErrorSchema.parse(await response.json())
      expect(response.status).toBe(503)
      expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
    }
  })

  it('generates an OpenAPI document for the scaffold routes', async () => {
    const response = await app.request('/api/openapi.json')
    const document = (await response.json()) as { paths?: Record<string, unknown> }

    expect(document.paths).toHaveProperty('/api/health')
    expect(document.paths).toHaveProperty('/api/media')
    expect(document.paths).toHaveProperty('/api/library/books')
    expect(document.paths).toHaveProperty('/api/library/books/{mediaItemId}')
    expect(document.paths).toHaveProperty('/api/library/books/{mediaItemId}/history')
    expect(document.paths).toHaveProperty('/api/library/movies')
    expect(document.paths).toHaveProperty('/api/catalogs/tmdb/sync')
    expect(document.paths).toHaveProperty('/api/catalogs/spotify/sync')
    expect(document.paths).toHaveProperty('/api/catalogs/spotify/jobs/{jobId}')
    expect(document.paths).toHaveProperty('/api/catalogs/youtube/sync')
    expect(document.paths).toHaveProperty('/api/library/movies/{mediaItemId}')
    expect(document.paths).toHaveProperty('/api/library/movies/{mediaItemId}/history')
    expect(document.paths).toHaveProperty('/api/library/podcasts')
    expect(document.paths).toHaveProperty('/api/library/podcasts/filter-options')
    expect(document.paths).toHaveProperty('/api/library/podcasts/{kind}/{id}')
    expect(document.paths).toHaveProperty('/api/library/podcasts/episodes/{id}/history')
    expect(document.paths).toHaveProperty('/api/library/music')
    expect(document.paths).toHaveProperty('/api/library/music/filter-options')
    expect(document.paths).toHaveProperty('/api/library/music/{kind}/{id}')
    expect(document.paths).toHaveProperty('/api/library/music/{kind}/{id}/history')
    expect(document.paths).toHaveProperty('/api/connections')
    expect(document.paths).toHaveProperty('/api/connections/readwise/sync')
    expect(document.paths).toHaveProperty('/api/connections/hardcover/sync')
    expect(document.paths).toHaveProperty('/api/connections/letterboxd/import')
    expect(document.paths).toHaveProperty('/api/connections/letterboxd/sync')
    expect(document.paths).toHaveProperty('/api/sync-runs')
  })
})
