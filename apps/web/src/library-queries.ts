import { infiniteQueryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query'
import {
  BooksResponseSchema,
  MoviesResponseSchema,
  ArticlesResponseSchema,
  PodcastsResponseSchema,
  MusicResponseSchema,
  VideosResponseSchema,
} from '@media-tracker/contracts'

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

export function booksQueryOptions(collection: 'archive' | 'queue', search: BooksRouteSearch = {}) {
  const query = collectionQuerySearch(search)
  const request = {
    collection,
    ...query,
    finishedMode: query.finishedMode ?? 'any',
    publishedMode: query.publishedMode ?? 'any',
    addedMode: query.addedMode ?? 'any',
    ratingMode: query.ratingMode ?? 'any',
    limit: 48,
  } as const
  return infiniteQueryOptions({
    queryKey: ['books', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchBooks({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function moviesQueryOptions(
  collection: 'archive' | 'queue',
  search: MoviesRouteSearch = {},
) {
  const request = { collection, ...movieCollectionQuerySearch(search), limit: 48 }
  return infiniteQueryOptions({
    queryKey: ['movies', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMovies({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function articlesQueryOptions(
  section: 'archive' | 'queue' | 'feed',
  search: ArticlesRouteSearch = {},
) {
  const request = { section, ...articleCollectionQuerySearch(search), limit: 50 }
  return infiniteQueryOptions({
    queryKey: ['articles', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchArticles({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function podcastsQueryOptions(
  view: 'archive' | 'queue' | 'following',
  search: PodcastsRouteSearch = {},
) {
  const request = { view, ...podcastQuerySearch(search), limit: 50 }
  return infiniteQueryOptions({
    queryKey: ['podcasts', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchPodcasts({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function musicQueryOptions(
  view: 'tracks' | 'albums' | 'artists',
  search: MusicRouteSearch = {},
) {
  const request = { view, ...musicQuerySearch(search), limit: 50 }
  return infiniteQueryOptions({
    queryKey: ['music', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchMusic({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function videosQueryOptions(
  view: 'archive' | 'queue' | 'channels',
  search: VideosRouteSearch = {},
) {
  const request = { view, ...videoQuerySearch(search), limit: 50 }
  return infiniteQueryOptions({
    queryKey: ['videos', request],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchVideos({ ...request, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export interface InitialLibraryQuery {
  path: string
  queryKey: QueryKey
  pageSize: number
  parsePage: (value: unknown) => { data: unknown[]; nextCursor: string | null }
  prefetch: (client: QueryClient) => Promise<void>
}

// These are the same options used by the mounted collections, including their page sizes.
export const INITIAL_LIBRARY_QUERIES: InitialLibraryQuery[] = [
  ...(['archive', 'queue'] as const).map((collection) => {
    const options = booksQueryOptions(collection)
    return {
      path: `/library/books/${collection}`,
      queryKey: options.queryKey,
      pageSize: 48,
      parsePage: (value: unknown) => BooksResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue'] as const).map((collection) => {
    const options = moviesQueryOptions(collection)
    return {
      path: `/library/movies/${collection}`,
      queryKey: options.queryKey,
      pageSize: 48,
      parsePage: (value: unknown) => MoviesResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'feed'] as const).map((section) => {
    const options = articlesQueryOptions(section)
    return {
      path: `/library/articles/${section}`,
      queryKey: options.queryKey,
      pageSize: 50,
      parsePage: (value: unknown) => ArticlesResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'following'] as const).map((view) => {
    const options = podcastsQueryOptions(view)
    return {
      path: `/library/podcasts/${view}`,
      queryKey: options.queryKey,
      pageSize: 50,
      parsePage: (value: unknown) => PodcastsResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['tracks', 'albums', 'artists'] as const).map((view) => {
    const options = musicQueryOptions(view)
    return {
      path: `/library/music/${view}`,
      queryKey: options.queryKey,
      pageSize: 50,
      parsePage: (value: unknown) => MusicResponseSchema.parse(value),
      prefetch: (client: QueryClient) => client.prefetchInfiniteQuery({ ...options, retry: false }),
    }
  }),
  ...(['archive', 'queue', 'channels'] as const).map((view) => {
    const options = videosQueryOptions(view)
    return {
      path: `/library/videos/${view}`,
      queryKey: options.queryKey,
      pageSize: 50,
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
