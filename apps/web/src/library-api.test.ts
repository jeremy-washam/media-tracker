import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkLibraryCursorResponse,
  fetchLibrarySummary,
  InvalidLibraryCursorError,
} from './library-api'
import {
  BooksSummarySchema,
  MoviesSummarySchema,
  ArticlesSummarySchema,
  PodcastsSummarySchema,
  MusicSummarySchema,
  VideosSummarySchema,
} from '@media-tracker/contracts'
import { fetchBook, fetchBookHistory, fetchBooks } from './features/books/books-api'
import { fetchMovie, fetchMovieHistory, fetchMovies } from './features/movies/movies-api'
import {
  fetchArticle,
  fetchArticleHighlights,
  fetchArticleHistory,
  fetchArticles,
} from './features/articles/articles-api'
import {
  fetchPodcast,
  fetchPodcastFilterOptions,
  fetchPodcastHistory,
  fetchPodcasts,
} from './features/podcasts/podcasts-api'
import {
  fetchMusic,
  fetchMusicDetail,
  fetchMusicFilterOptions,
  fetchMusicHistory,
} from './features/music/music-api'
import {
  fetchChannelVideos,
  fetchVideo,
  fetchVideoChannel,
  fetchVideoHistory,
  fetchVideos,
} from './features/videos/videos-api'

afterEach(() => vi.unstubAllGlobals())
const signal = new AbortController().signal
const empty = { data: [], nextCursor: null, totalCount: 0 }
const request = { q: 'A & B', limit: 50, cursor: 'cursor/+?=' }
const collections = [
  {
    media: 'books',
    load: () =>
      fetchBooks({ ...request, section: 'archive', genre: ['fiction', 'fantasy'] }, signal),
    listKey: 'genre',
    values: ['fiction,fantasy'],
    summary: {
      counts: { archive: 0, queue: 0, filteredBooks: 0, supportedReads: 0 },
      facets: { formats: [], genres: [], series: [] },
      freshness: { lastSuccessfulSyncAt: null, degraded: false },
    },
  },
  {
    media: 'movies',
    load: () => fetchMovies({ ...request, section: 'archive', releaseYearUnknown: true }, signal),
    listKey: 'releaseYearUnknown',
    values: ['true'],
    summary: {
      totalCount: 0,
      filteredCount: 0,
      filteredOccurrenceCount: 0,
      overlapCount: 0,
      membershipCounts: { archiveItems: 0, archiveOccurrences: 0, queueItems: 0 },
      facets: {
        watchedUnknown: 0,
        addedUnknown: 0,
        releaseYearUnknown: 0,
        unrated: 0,
        reviewed: 0,
        runtimeUnknown: 0,
        runtimeAvailable: false,
      },
      sourceFreshness: { lastCompleteExportAt: null, lastRssSuccessAt: null },
    },
  },
  {
    media: 'articles',
    load: () =>
      fetchArticles(
        { ...request, section: 'archive', author: ['Ada', 'Grace'], publishedUnknown: true },
        signal,
      ),
    listKey: 'author',
    values: ['Ada,Grace'],
    summary: {
      totalCount: 0,
      filteredCount: 0,
      sectionCounts: { archive: 0, queue: 0, feed: 0 },
      occurrenceCount: 0,
      facets: {
        types: [],
        authors: [],
        publications: [],
        readingTimes: [],
        progress: [],
        currentStates: [],
        queueStates: [],
        opened: [],
        history: [],
        publishedUnknown: 0,
        readingTimeUnknown: 0,
        progressUnknown: 0,
        dateUnknown: 0,
      },
      capabilities: { fullTextSearch: true, highlights: true },
      coverage: {
        allLocationsBackfilled: true,
        highlightsBackfilled: true,
        fullTextPolicy: 'archive_queue',
        lastSuccessfulSyncAt: null,
      },
    },
  },
  {
    media: 'podcasts',
    load: () => fetchPodcasts({ ...request, section: 'archive', show: ['one', 'two'] }, signal),
    listKey: 'show',
    values: ['one,two'],
    summary: {
      totalCount: 0,
      filteredCount: 0,
      sectionCounts: { archive: 0, queue: 0, following: 0 },
    },
  },
  {
    media: 'music',
    load: () => fetchMusic({ ...request, section: 'tracks', artist: ['one', 'two'] }, signal),
    listKey: 'artist',
    values: ['one,two'],
    summary: {
      totalCount: 0,
      filteredCount: 0,
      sectionCounts: { tracks: 0, albums: 0, artists: 0 },
    },
  },
  {
    media: 'videos',
    load: () =>
      fetchVideos(
        { ...request, section: 'archive', account: ['one', 'two'], category: ['22', '24'] },
        signal,
      ),
    listKey: 'account',
    values: ['one', 'two'],
    summary: {
      totalCount: 0,
      filteredCount: 0,
      sectionCounts: { archive: 0, queue: 0, channels: 0 },
      occurrenceCount: 0,
      facets: { accounts: [], channels: [], categories: [] },
      coverage: { watchLater: 'unknown', catalog: 'not_configured' },
    },
  },
]

const parseSummary: Record<string, (value: unknown) => unknown> = {
  books: (value) => BooksSummarySchema.parse(value),
  movies: (value) => MoviesSummarySchema.parse(value),
  articles: (value) => ArticlesSummarySchema.parse(value),
  podcasts: (value) => PodcastsSummarySchema.parse(value),
  music: (value) => MusicSummarySchema.parse(value),
  videos: (value) => VideosSummarySchema.parse(value),
}

describe('Library collection API boundaries', () => {
  for (const { media, load, summary, listKey, values } of collections) {
    it(`${media} encodes filters/cursors and forwards cancellation while validating the response`, async () => {
      const fetcher = vi.fn(async () => Response.json({ data: [], nextCursor: null }))
      vi.stubGlobal('fetch', fetcher)
      await expect(load()).resolves.toMatchObject({ data: [], nextCursor: null })
      const [path, options] = fetcher.mock.calls[0]! as unknown as [string, RequestInit]
      const url = new URL(path, 'http://localhost')
      expect(url.pathname).toBe(`/api/library/${media}`)
      expect(url.searchParams.get('section')).toBe(media === 'music' ? 'tracks' : 'archive')
      expect(url.searchParams.has('view')).toBe(false)
      expect(url.searchParams.has('collection')).toBe(false)
      expect(url.searchParams.get('q')).toBe(request.q)
      expect(url.searchParams.get('cursor')).toBe(request.cursor)
      expect(url.searchParams.getAll(listKey)).toEqual(values)
      expect(options.signal).toBe(signal)
    })

    it(`${media} reads and validates its summary independently from collection pages`, async () => {
      const fetcher = vi.fn(async () => Response.json(summary))
      vi.stubGlobal('fetch', fetcher)
      const filters = { section: media === 'music' ? 'tracks' : 'archive', q: request.q }
      const result = await fetchLibrarySummary(media, filters, parseSummary[media]!, signal)
      expect(result).toEqual(summary)
      expect(result).not.toHaveProperty('data')
      const [input, options] = fetcher.mock.calls[0]! as unknown as [string, RequestInit]
      const url = new URL(input, 'http://localhost')
      expect(url.pathname).toBe(`/api/library/${media}/summary`)
      expect(Object.fromEntries(url.searchParams)).toEqual(filters)
      expect(options.signal).toBe(signal)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ data: [], nextCursor: null })),
      )
      await expect(
        fetchLibrarySummary(media, filters, parseSummary[media]!, signal),
      ).rejects.toThrow()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({}, { status: 503 })),
      )
      await expect(
        fetchLibrarySummary(media, filters, parseSummary[media]!, signal),
      ).rejects.toThrow('Library summary request failed (503).')
    })

    it(`${media} rejects malformed success, JSON errors, non-JSON failures, and aborted requests`, async () => {
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)
      fetcher.mockResolvedValueOnce(Response.json({ data: [] }))
      await expect(load()).rejects.toThrow()
      fetcher.mockResolvedValueOnce(
        Response.json({ error: { message: 'Synthetic failure' } }, { status: 500 }),
      )
      await expect(load()).rejects.toThrow(/Synthetic failure|Request failed \(500\)/)
      fetcher.mockResolvedValueOnce(new Response('<html>Unavailable</html>', { status: 502 }))
      await expect(load()).rejects.toThrow()
      const abort = new DOMException('Aborted', 'AbortError')
      fetcher.mockRejectedValueOnce(abort)
      await expect(load()).rejects.toBe(abort)
    })
  }
})

describe('Inspector and facet API paths', () => {
  const id = 'item /?#'
  const encoded = encodeURIComponent(id)
  const details: [string, () => Promise<unknown>][] = [
    [`/api/library/books/${encoded}`, () => fetchBook(id, signal)],
    [`/api/library/movies/${encoded}`, () => fetchMovie(id, signal)],
    [`/api/library/articles/${encoded}`, () => fetchArticle(id, signal)],
    [`/api/library/podcasts/episodes/${encoded}`, () => fetchPodcast(id, 'episode', signal)],
    [`/api/library/podcasts/shows/${encoded}`, () => fetchPodcast(id, 'show', signal)],
    ...(['tracks', 'albums', 'artists'] as const).map((view): [string, () => Promise<unknown>] => [
      `/api/library/music/${view}/${encoded}`,
      () => fetchMusicDetail(id, view, signal),
    ]),
    [`/api/library/videos/${encoded}`, () => fetchVideo(id, signal)],
    [`/api/library/video-channels/${encoded}`, () => fetchVideoChannel(id, signal)],
  ]
  for (const [path, load] of details) {
    it(`escapes IDs, forwards cancellation, and rejects an invalid detail at ${path}`, async () => {
      const fetcher = vi.fn(async () => Response.json({ id }))
      vi.stubGlobal('fetch', fetcher)
      await expect(load()).rejects.toThrow()
      expect(fetcher).toHaveBeenCalledWith(path, expect.objectContaining({ signal }))
    })
  }
  const cursor = 'page /?&='
  const pages: [string, () => Promise<unknown>, Record<string, string>][] = [
    [
      `/api/library/books/${encoded}/history`,
      () => fetchBookHistory(id, cursor, signal),
      { limit: '20' },
    ],
    [
      `/api/library/movies/${encoded}/history`,
      () => fetchMovieHistory(id, { watched: 'range', watchedFrom: '2026-01-01' }, cursor, signal),
      { limit: '25', watched: 'range', watchedFrom: '2026-01-01' },
    ],
    [
      `/api/library/articles/${encoded}/history`,
      () => fetchArticleHistory(id, cursor, signal),
      { limit: '25' },
    ],
    [
      `/api/library/articles/${encoded}/highlights`,
      () => fetchArticleHighlights(id, cursor, signal),
      { limit: '20' },
    ],
    [
      `/api/library/podcasts/episodes/${encoded}/history`,
      () => fetchPodcastHistory(id, cursor, signal),
      { limit: '25' },
    ],
    ...(['tracks', 'albums', 'artists'] as const).map(
      (view): [string, () => Promise<unknown>, Record<string, string>] => [
        `/api/library/music/${view}/${encoded}/history`,
        () => fetchMusicHistory(id, view, cursor, signal),
        { limit: '25' },
      ],
    ),
    [
      `/api/library/videos/${encoded}/history`,
      () => fetchVideoHistory(id, cursor, signal),
      { limit: '25' },
    ],
    [
      `/api/library/video-channels/${encoded}/videos`,
      () => fetchChannelVideos(id, 'queue', cursor, signal),
      { limit: '25', section: 'queue' },
    ],
  ]
  for (const [path, load, params] of pages) {
    it(`preserves the bounded cursor and query semantics at ${path}`, async () => {
      const fetcher = vi.fn(async () => Response.json(empty))
      vi.stubGlobal('fetch', fetcher)
      await expect(load()).resolves.toMatchObject({ data: [], nextCursor: null })
      const [input, options] = fetcher.mock.calls[0]! as unknown as [string, RequestInit]
      const url = new URL(input, 'http://localhost')
      expect(url.pathname).toBe(path)
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ ...params, cursor })
      expect(options.signal).toBe(signal)
    })
  }
  it('forwards self-excluding facet filters, search, and option pagination', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [], nextCursor: null }))
    vi.stubGlobal('fetch', fetcher)
    await fetchPodcastFilterOptions(
      {
        section: 'archive',
        facet: 'show',
        following: 'following',
        optionQ: 'Ada & Grace',
        optionLimit: 30,
        optionCursor: cursor,
      },
      signal,
    )
    await fetchMusicFilterOptions(
      {
        section: 'tracks',
        facet: 'artist',
        album: ['album-one'],
        optionQ: 'Ada & Grace',
        optionLimit: 30,
        optionCursor: cursor,
      },
      signal,
    )
    const urls = fetcher.mock.calls.map(
      (call) => new URL((call as unknown as [string])[0], 'http://localhost'),
    )
    expect(urls[0]!.pathname).toBe('/api/library/podcasts/filter-options')
    expect(urls[1]!.pathname).toBe('/api/library/music/filter-options')
    for (const url of urls)
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        optionQ: 'Ada & Grace',
        optionCursor: cursor,
        optionLimit: '30',
      })
    expect(urls[0]!.searchParams.get('following')).toBe('following')
    expect(urls[1]!.searchParams.get('album')).toBe('album-one')
  })
})

it('recognizes invalid/stale pagination without treating other failures as cursor errors', () => {
  for (const message of [
    'Videos pagination cursor is stale',
    'Invalid Article pagination cursor',
    'Invalid Movies pagination cursor',
  ]) {
    expect(() => checkLibraryCursorResponse(400, { error: { message } })).toThrow(
      InvalidLibraryCursorError,
    )
  }
  for (const body of [null, {}, { error: 'bad' }, { error: { message: 'Invalid filter' } }])
    expect(() => checkLibraryCursorResponse(400, body)).not.toThrow()
  expect(() =>
    checkLibraryCursorResponse(503, { error: { message: 'pagination cursor' } }),
  ).not.toThrow()
})
