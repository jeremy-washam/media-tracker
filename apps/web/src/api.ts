import {
  ConnectionsResponseSchema,
  HealthResponseSchema,
  MediaListResponseSchema,
  ReadwiseSyncResponseSchema,
} from '@media-tracker/contracts'

import type {
  ConnectionsResponse,
  HealthResponse,
  MediaListResponse,
  ReadwiseSyncResponse,
} from '@media-tracker/contracts'

const getJson = async (path: string, fetcher: typeof fetch): Promise<unknown> => {
  const response = await fetcher(path, {
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}.`)
  }

  return response.json()
}

export const fetchHealth = async (fetcher: typeof fetch = fetch): Promise<HealthResponse> => {
  return HealthResponseSchema.parse(await getJson('/api/health', fetcher))
}

export const fetchConnections = async (
  fetcher: typeof fetch = fetch,
): Promise<ConnectionsResponse> => {
  return ConnectionsResponseSchema.parse(await getJson('/api/connections', fetcher))
}

export const fetchMedia = async (fetcher: typeof fetch = fetch): Promise<MediaListResponse> => {
  return MediaListResponseSchema.parse(await getJson('/api/media', fetcher))
}

export const syncReadwise = async (
  fetcher: typeof fetch = fetch,
): Promise<ReadwiseSyncResponse> => {
  const response = await fetcher('/api/connections/readwise/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Readwise sync failed with status ${response.status}.`)
  return ReadwiseSyncResponseSchema.parse(await response.json())
}
