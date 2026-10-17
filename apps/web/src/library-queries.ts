import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import {
  LIBRARY_PAGE_SIZE,
  BooksSummarySchema,
  MoviesSummarySchema,
  ArticlesSummarySchema,
  PodcastsSummarySchema,
  MusicSummarySchema,
  VideosSummarySchema,
  BooksResponseSchema,
  MoviesResponseSchema,
  ArticlesResponseSchema,
  PodcastsResponseSchema,
  MusicResponseSchema,
  VideosResponseSchema,
} from '@media-tracker/contracts'

import { fetchLibrarySummary, InvalidLibraryCursorError } from './library-api'
import { fetchBooks } from './features/books/books-api'
import { collectionQuerySearch, type BooksRouteSearch } from './features/books/books-route-search'
import { fetchMovies } from './features/movies/movies-api'
import {
  movieCollectionQuerySearch,
  type MoviesRouteSearch,
} from './features/movies/movies-route-search'
import { fetchArticles } from './features/articles/articles-api'
import {
  articleCollectionQuerySearch,
  type ArticlesRouteSearch,
} from './features/articles/articles-route-search'
import { fetchPodcasts } from './features/podcasts/podcasts-api'
import {
  podcastQuerySearch,
  type PodcastsRouteSearch,
} from './features/podcasts/podcasts-route-search'
import { fetchMusic } from './features/music/music-api'
import { musicQuerySearch, type MusicRouteSearch } from './features/music/music-route-search'
import { fetchVideos } from './features/videos/videos-api'
import { videoQuerySearch, type VideosRouteSearch } from './features/videos/videos-route-search'

export const LIBRARY_MEDIA = ['books', 'movies', 'articles', 'podcasts', 'music', 'videos'] as const

function automaticallyRefreshCollection(query: {
  state: { data: unknown; isInvalidated: boolean }
}) {
  const data = query.state.data as { pages?: unknown[] } | undefined
  return query.state.isInvalidated || (data?.pages?.length ?? 0) <= 1
}

const collectionRefetchPolicy = {
  retry: (failureCount: number, error: Error) =>
    !(error instanceof InvalidLibraryCursorError) && failureCount < 3,
  refetchOnMount: automaticallyRefreshCollection,
  refetchOnWindowFocus: automaticallyRefreshCollection,
  refetchOnReconnect: automaticallyRefreshCollection,
}

/** Aggregate identity depends only on section/search/filters, never pagination or presentation. */
function summaryFilters(request: object) {
  return Object.fromEntries(
    Object.entries(request).filter(
      ([key]) =>
        ![
          'sort',
          'direction',
          'layout',
          'view',
          'density',
          'item',
          'kind',
          'channelItem',
          'limit',
          'cursor',
        ].includes(key),
    ),
  )
}

export function booksQueryOptions(collection: 'archive' | 'queue', search: BooksRouteSearch = {}) {
  const query = collectionQuerySearch(search)
  const request = {
    section: collection,
    ...query,
    finishedMode: query.finishedMode ?? 'any',
    publishedMode: query.publishedMode ?? 'any',
    addedMode: query.addedMode ?? 'any',
    ratingMode: query.ratingMode ?? 'any',
    limit: LIBRARY_PAGE_SIZE,
  } as const
  return infiniteQueryOptions({
    queryKey: ['books', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchBooks({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function moviesQueryOptions(
  collection: 'archive' | 'queue',
  search: MoviesRouteSearch = {},
) {
  const request = {
    section: collection,
    ...movieCollectionQuerySearch(search),
    limit: LIBRARY_PAGE_SIZE,
  }
  return infiniteQueryOptions({
    queryKey: ['movies', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMovies({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function articlesQueryOptions(
  section: 'archive' | 'queue' | 'feed',
  search: ArticlesRouteSearch = {},
) {
  const request = { section, ...articleCollectionQuerySearch(search), limit: LIBRARY_PAGE_SIZE }
  return infiniteQueryOptions({
    queryKey: ['articles', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchArticles({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function podcastsQueryOptions(
  view: 'archive' | 'queue' | 'following',
  search: PodcastsRouteSearch = {},
) {
  const request = { section: view, ...podcastQuerySearch(search), limit: LIBRARY_PAGE_SIZE }
  return infiniteQueryOptions({
    queryKey: ['podcasts', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchPodcasts({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function musicQueryOptions(
  view: 'tracks' | 'albums' | 'artists',
  search: MusicRouteSearch = {},
) {
  const request = { section: view, ...musicQuerySearch(search), limit: LIBRARY_PAGE_SIZE }
  return infiniteQueryOptions({
    queryKey: ['music', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMusic({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function videosQueryOptions(
  view: 'archive' | 'queue' | 'channels',
  search: VideosRouteSearch = {},
) {
  const request = { section: view, ...videoQuerySearch(search), limit: LIBRARY_PAGE_SIZE }
  return infiniteQueryOptions({
    queryKey: ['videos', request] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchVideos({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...collectionRefetchPolicy,
  })
}

export function booksSummaryQueryOptions(
  section: 'archive' | 'queue',
  search: BooksRouteSearch = {},
) {
  const filters = summaryFilters(booksQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['books-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('books', filters, BooksSummarySchema.parse, signal),
  })
}

export function moviesSummaryQueryOptions(
  section: 'archive' | 'queue',
  search: MoviesRouteSearch = {},
) {
  const filters = summaryFilters(moviesQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['movies-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('movies', filters, MoviesSummarySchema.parse, signal),
  })
}

export function articlesSummaryQueryOptions(
  section: 'archive' | 'queue' | 'feed',
  search: ArticlesRouteSearch = {},
) {
  const filters = summaryFilters(articlesQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['articles-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('articles', filters, ArticlesSummarySchema.parse, signal),
  })
}

export function podcastsSummaryQueryOptions(
  section: 'archive' | 'queue' | 'following',
  search: PodcastsRouteSearch = {},
) {
  const filters = summaryFilters(podcastsQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['podcasts-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('podcasts', filters, PodcastsSummarySchema.parse, signal),
  })
}

export function musicSummaryQueryOptions(
  section: 'tracks' | 'albums' | 'artists',
  search: MusicRouteSearch = {},
) {
  const filters = summaryFilters(musicQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['music-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('music', filters, MusicSummarySchema.parse, signal),
  })
}

export function videosSummaryQueryOptions(
  section: 'archive' | 'queue' | 'channels',
  search: VideosRouteSearch = {},
) {
  const filters = summaryFilters(videosQueryOptions(section, search).queryKey[1]!)
  return queryOptions({
    queryKey: ['videos-summary', filters],
    queryFn: ({ signal }) =>
      fetchLibrarySummary('videos', filters, VideosSummarySchema.parse, signal),
  })
}

export interface InitialLibraryQuery {
  path: string
  queryKey: QueryKey
  pageSize: number
  summary: {
    queryKey: QueryKey
    parse: (value: unknown) => unknown
    prefetch: (client: QueryClient) => Promise<void>
  }
  parsePage: (value: unknown) => { data: unknown[]; nextCursor: string | null }
  prefetch: (client: QueryClient) => Promise<void>
}

// These are the same options used by the mounted collections, including their page sizes.
export const INITIAL_LIBRARY_QUERIES: InitialLibraryQuery[] = [
  ...(['archive', 'queue'] as const).map((collection) => {
    const options = booksQueryOptions(collection)
    const summary = booksSummaryQueryOptions(collection)
    return {
      path: `/library/books/${collection}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => BooksSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => BooksResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue'] as const).map((collection) => {
    const options = moviesQueryOptions(collection)
    const summary = moviesSummaryQueryOptions(collection)
    return {
      path: `/library/movies/${collection}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => MoviesSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => MoviesResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'feed'] as const).map((section) => {
    const options = articlesQueryOptions(section)
    const summary = articlesSummaryQueryOptions(section)
    return {
      path: `/library/articles/${section}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => ArticlesSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => ArticlesResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'following'] as const).map((view) => {
    const options = podcastsQueryOptions(view)
    const summary = podcastsSummaryQueryOptions(view)
    return {
      path: `/library/podcasts/${view}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => PodcastsSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => PodcastsResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['tracks', 'albums', 'artists'] as const).map((view) => {
    const options = musicQueryOptions(view)
    const summary = musicSummaryQueryOptions(view)
    return {
      path: `/library/music/${view}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => MusicSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => MusicResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'channels'] as const).map((view) => {
    const options = videosQueryOptions(view)
    const summary = videosSummaryQueryOptions(view)
    return {
      path: `/library/videos/${view}`,
      queryKey: options.queryKey,
      pageSize: LIBRARY_PAGE_SIZE,
      summary: {
        queryKey: summary.queryKey,
        parse: (value: unknown) => VideosSummarySchema.parse(value),
        prefetch: (client: QueryClient) => client.prefetchQuery({ ...summary, retry: false }),
      },
      parsePage: (value: unknown) => VideosResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
]

const libraryQueryFamilies = new Set<string>([
  ...LIBRARY_MEDIA,
  'book',
  'movie',
  'article',
  'podcast',
  'video',
])

export async function invalidateLibraryQueries(client: QueryClient) {
  const filters = {
    predicate: (query: { queryKey: QueryKey }) =>
      libraryQueryFamilies.has(String(query.queryKey[0]).split('-')[0]!),
  }
  // Reads started before an import completed must not repopulate the cache afterward.
  await client.cancelQueries(filters)
  return client.invalidateQueries(filters)
}
