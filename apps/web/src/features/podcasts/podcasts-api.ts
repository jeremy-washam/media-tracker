import {
  PodcastDetailSchema,
  PodcastHistoryResponseSchema,
  PodcastsResponseSchema,
  type PodcastDetail,
  type PodcastHistoryResponse,
  type PodcastsResponse,
} from '@media-tracker/contracts'
import type { PodcastsRouteSearch } from './podcasts-route-search'

async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return value
}

function query(value: object) {
  const result = new URLSearchParams()
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && item !== '') result.set(key, String(item))
  return result
}

export function fetchPodcasts(
  request: PodcastsRouteSearch & { view: string; limit: number; cursor?: string },
  signal?: AbortSignal,
): Promise<PodcastsResponse> {
  return fetch(`/api/library/podcasts?${query(request)}`, signal ? { signal } : undefined)
    .then(body)
    .then((value) => PodcastsResponseSchema.parse(value))
}

export function fetchPodcast(
  id: string,
  kind: 'episode' | 'show',
  signal?: AbortSignal,
): Promise<PodcastDetail> {
  return fetch(
    `/api/library/podcasts/${kind === 'show' ? 'shows' : 'episodes'}/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => PodcastDetailSchema.parse(value))
}

export function fetchPodcastHistory(
  id: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<PodcastHistoryResponse> {
  return fetch(
    `/api/library/podcasts/episodes/${encodeURIComponent(id)}/history?${query({ limit: 25, cursor })}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => PodcastHistoryResponseSchema.parse(value))
}
