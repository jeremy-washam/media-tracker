import {
  VideoChannelDetailSchema,
  VideoChannelLibraryResponseSchema,
  VideoDetailSchema,
  VideoHistoryResponseSchema,
  VideosResponseSchema,
  type VideoChannelDetail,
  type VideoChannelLibraryResponse,
  type VideoDetail,
  type VideoHistoryResponse,
  type VideosResponse,
} from '@media-tracker/contracts'
import type { VideosRouteSearch } from './videos-route-search'

async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return value
}

function query(value: object) {
  const result = new URLSearchParams()
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === '') continue
    if (Array.isArray(item)) for (const entry of item) result.append(key, String(entry))
    else result.set(key, String(item))
  }
  return result
}

export function fetchVideos(
  request: VideosRouteSearch & { view: string; limit: number; cursor?: string },
  signal?: AbortSignal,
): Promise<VideosResponse> {
  return fetch(`/api/library/videos?${query(request)}`, signal ? { signal } : undefined)
    .then(body)
    .then((value) => VideosResponseSchema.parse(value))
}

export function fetchVideo(id: string, signal?: AbortSignal): Promise<VideoDetail> {
  return fetch(`/api/library/videos/${encodeURIComponent(id)}`, signal ? { signal } : undefined)
    .then(body)
    .then((value) => VideoDetailSchema.parse(value))
}

export function fetchVideoHistory(
  id: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<VideoHistoryResponse> {
  return fetch(
    `/api/library/videos/${encodeURIComponent(id)}/history?${query({ limit: 25, cursor })}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => VideoHistoryResponseSchema.parse(value))
}

export function fetchVideoChannel(id: string, signal?: AbortSignal): Promise<VideoChannelDetail> {
  return fetch(
    `/api/library/video-channels/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => VideoChannelDetailSchema.parse(value))
}

export function fetchChannelVideos(
  id: string,
  membership: 'archive' | 'queue',
  cursor?: string,
  signal?: AbortSignal,
): Promise<VideoChannelLibraryResponse> {
  return fetch(
    `/api/library/video-channels/${encodeURIComponent(id)}/videos?${query({ membership, limit: 25, cursor })}`,
    signal ? { signal } : undefined,
  )
    .then(body)
    .then((value) => VideoChannelLibraryResponseSchema.parse(value))
}
