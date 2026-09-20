import {
  MovieDetailSchema,
  MovieHistoryResponseSchema,
  MoviesResponseSchema,
  type MovieDetail,
  type MovieHistoryResponse,
  type MoviesResponse,
} from '@media-tracker/contracts'

import type { MoviesRouteSearch } from './movies-route-search'

export interface MoviesRequest extends MoviesRouteSearch {
  collection: 'archive' | 'queue'
  cursor?: string | undefined
  limit: number
}

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : undefined
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status}).`)
  }
  return body
}

function query(request: object): URLSearchParams {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value))
  }
  return search
}

export async function fetchMovies(
  request: MoviesRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<MoviesResponse> {
  const response = await fetcher(`/api/library/movies?${query(request)}`, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  return MoviesResponseSchema.parse(await json(response))
}

export async function fetchMovie(
  mediaItemId: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<MovieDetail> {
  const response = await fetcher(`/api/library/movies/${encodeURIComponent(mediaItemId)}`, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  return MovieDetailSchema.parse(await json(response))
}

export async function fetchMovieHistory(
  mediaItemId: string,
  filters: Pick<MoviesRouteSearch, 'watched' | 'watchedFrom' | 'watchedTo'>,
  cursor?: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<MovieHistoryResponse> {
  const search = query({ limit: 25, ...filters, cursor })
  const response = await fetcher(
    `/api/library/movies/${encodeURIComponent(mediaItemId)}/history?${search}`,
    { headers: { accept: 'application/json' }, ...(signal === undefined ? {} : { signal }) },
  )
  return MovieHistoryResponseSchema.parse(await json(response))
}
