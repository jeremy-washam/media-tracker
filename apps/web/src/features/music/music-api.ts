import {
  MusicDetailSchema,
  MusicFilterOptionsResponseSchema,
  MusicHistoryResponseSchema,
  MusicResponseSchema,
  type MusicDetail,
  type MusicFilterOptionsResponse,
  type MusicHistoryResponse,
  type MusicResponse,
} from '@media-tracker/contracts'
import type { MusicRouteSearch } from './music-route-search'

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

export function fetchMusic(
  request: MusicRouteSearch & { view: string; limit: number; cursor?: string },
  signal?: AbortSignal,
): Promise<MusicResponse> {
  return fetch(`/api/library/music?${query(request)}`, signal ? { signal } : undefined)
    .then(body)
    .then((value) => MusicResponseSchema.parse(value))
}
export function fetchMusicFilterOptions(
  request: MusicRouteSearch & {
    view: 'tracks' | 'albums'
    facet: 'artist' | 'album'
    optionQ?: string
    optionLimit: number
    optionCursor?: string
  },
  signal?: AbortSignal,
): Promise<MusicFilterOptionsResponse> {
  return fetch(
    `/api/library/music/filter-options?${query(request)}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => MusicFilterOptionsResponseSchema.parse(value))
}
export function fetchMusicDetail(
  id: string,
  view: 'tracks' | 'albums' | 'artists',
  signal?: AbortSignal,
): Promise<MusicDetail> {
  return fetch(
    `/api/library/music/${view}/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => MusicDetailSchema.parse(value))
}
export function fetchMusicHistory(
  id: string,
  view: 'tracks' | 'albums' | 'artists',
  cursor?: string,
  signal?: AbortSignal,
): Promise<MusicHistoryResponse> {
  return fetch(
    `/api/library/music/${view}/${encodeURIComponent(id)}/history?${query({ limit: 25, cursor })}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => MusicHistoryResponseSchema.parse(value))
}
