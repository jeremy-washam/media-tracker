import {
  ConnectionsResponseSchema,
  HealthResponseSchema,
  LetterboxdImportResponseSchema,
  LetterboxdRssSyncResponseSchema,
  MediaListResponseSchema,
  ReadwiseSyncResponseSchema,
} from '@media-tracker/contracts'

import type {
  ConnectionsResponse,
  HealthResponse,
  LetterboxdImportResponse,
  LetterboxdRssSyncResponse,
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

export const importLetterboxd = async (
  archive: File,
  fetcher: typeof fetch = fetch,
): Promise<LetterboxdImportResponse> => {
  const response = await fetcher('/api/connections/letterboxd/import', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/zip' },
    body: archive,
  })
  if (!response.ok) throw new Error(`Letterboxd import failed with status ${response.status}.`)
  return LetterboxdImportResponseSchema.parse(await response.json())
}

export const syncLetterboxd = async (
  fetcher: typeof fetch = fetch,
): Promise<LetterboxdRssSyncResponse> => {
  const response = await fetcher('/api/connections/letterboxd/sync', {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Letterboxd sync failed with status ${response.status}.`)
  return LetterboxdRssSyncResponseSchema.parse(await response.json())
}
